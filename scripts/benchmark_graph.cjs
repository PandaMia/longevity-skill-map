// Reproducible renderer comparison. Requires the Python app at GRAPH_URL.
// npm run benchmark -- --compare HEAD also serves SVG assets from that revision.
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createView } = require('../static/graph-view.js');
const { launch, instrument, ready, frames, url, root, baselineAsset } = require('./browser_helpers.cjs');
const args = process.argv.slice(2), compare = args.includes('--compare') ? args[args.indexOf('--compare') + 1] : null;
const samples = Number(process.env.BENCH_FRAMES || 180);
const extended = args.includes('--extended');
function multiply(graph, factor) {
  if (factor === 1) return graph;
  const original = createView(graph, new Set(graph.nodes.filter(n => n.children.length).map(n => n.id)), null);
  const columns = Math.ceil(Math.sqrt(factor));
  const nodes = [], edges = [], lanes = [], containers = [];
  for (let copy = 0; copy < factor; copy++) {
    const dx = (copy % columns) * original.bounds.width, dy = Math.floor(copy / columns) * original.bounds.height;
    const id = value => `${value}_${copy}`;
    nodes.push(...original.nodes.map(n => ({ ...n, id: id(n.id), x: n.x + dx, y: n.y + dy, parent_id: null, children: [] })));
    edges.push(...original.edges.map(e => ({ ...e, from: id(e.from), to: id(e.to), indices: [edges.length] })));
    // One lane per row keeps backgrounds from overlapping adjacent copies.
    if (copy % columns === 0) lanes.push(...original.lanes.map(l => ({ ...l, id: id(l.id), y: l.y + dy })));
  }
  edges.forEach((edge, index) => { edge.indices = [index]; });
  return { ...graph, nodes, edges, lanes, containers, benchmarkFixture: true,
    bounds: { min_x: 0, min_y: 0, width: original.bounds.width * columns, height: original.bounds.height * Math.ceil(factor / columns) } };
}
async function run(browser, graph, label, baseline) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await instrument(page);
  if (baseline) {
    await page.route(`${url}/`, route => route.fulfill({ contentType: 'text/html', body: baselineAsset(baseline, 'static/index.html') }));
    await page.route('**/static/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript', body: baselineAsset(baseline, path) });
    });
  }
  await page.route('**/static/graph-view.js*', async route => {
    const source = baseline ? baselineAsset(baseline, 'static/graph-view.js') : require('node:fs').readFileSync(join(root, 'static/graph-view.js'), 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: source + '\n{const project=GraphView.createView;GraphView.createView=(g,...args)=>g.benchmarkFixture?g:project(g,...args);}' });
  });
  await page.route('**/api/graph/query', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(graph) }));
  const loadStarted = performance.now(); await ready(page); const loadMs = performance.now() - loadStarted;
  const result = await page.evaluate(async ({ samples, baseline, extended }) => {
    const surface = document.getElementById('graph'), rect = surface.getBoundingClientRect();
    const readCamera = () => {
      if (!baseline) return testRenderer.getCamera();
      const [, tx, ty, scale] = document.getElementById('viewport').getAttribute('transform').match(/translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/);
      return { tx: +tx, ty: +ty, scale: +scale };
    };
    // Both implementations use the same camera: scale 1, pan near the first
    // copy's center. This compares a useful reading view, not tiny fit-to-world.
    let camera = readCamera();
    surface.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -Math.log(1 / camera.scale) / .01, clientX: 600, clientY: 400 }));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    camera = readCamera();
    surface.dispatchEvent(new WheelEvent('wheel', { deltaX: camera.tx + 1400, deltaY: camera.ty + 3400 }));
    for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame);
    const timings = [], cpu = [];
    let previous = performance.now();
    for (let i = 0; i < samples; i++) {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: i < samples / 2 ? 12 : -12, deltaX: i < samples / 2 ? 5 : -5, clientX: rect.width / 2, clientY: rect.height / 2 }));
      await new Promise(requestAnimationFrame);
      const now = performance.now(); timings.push(now - previous); previous = now;
      if (!baseline) cpu.push(testRenderer.getMetrics().lastRenderMs);
    }
    const extra = {};
    if (extended) {
      for (const phase of ['zoom', 'overview']) {
        if (phase === 'overview') { document.getElementById('fit').click(); for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame); }
        const durations = []; let last = performance.now();
        for (let i = 0; i < samples; i++) {
          surface.dispatchEvent(new WheelEvent('wheel', phase === 'zoom'
            ? { ctrlKey: true, deltaY: i < samples / 2 ? 3 : -3, clientX: 600, clientY: 400 }
            : { deltaY: i < samples / 2 ? 2 : -2 }));
          await new Promise(requestAnimationFrame); const now = performance.now(); durations.push(now - last); last = now;
        }
        durations.sort((a, b) => a - b);
        extra[phase] = { medianMs: durations[Math.floor(samples * .5)], p95Ms: durations[Math.floor(samples * .95)], maxMs: durations.at(-1), metrics: !baseline ? testRenderer.getMetrics() : undefined };
      }
    }
    timings.sort((a, b) => a - b); cpu.sort((a, b) => a - b);
    return { ...extra, domElements: document.querySelectorAll('*').length, frameMedianMs: timings[Math.floor(samples * .5)],
      frameP95Ms: timings[Math.floor(samples * .95)], frameMaxMs: timings.at(-1),
      renderCpuP95Ms: cpu[Math.floor(samples * .95)], metrics: !baseline ? testRenderer.getMetrics() : undefined,
      userAgent: navigator.userAgent };
  }, { samples, baseline: Boolean(baseline), extended });
  if (errors.length) throw new Error(errors.join('\n'));
  await page.close();
  return { label, renderer: baseline ? `SVG (${baseline})` : 'PixiJS WebGL', nodes: graph.nodes.length, edges: graph.edges.length, loadMs, ...result };
}
(async () => {
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  const response = await fetch(`${url}/api/graph`); if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const graph = await response.json(), browser = await launch(); const results = [];
  try {
    for (const factor of [1, 10, 50]) {
      const fixture = multiply(graph, factor);
      for (const baseline of compare ? [compare, null] : [null]) {
        const result = await run(browser, fixture, factor === 1 ? 'Current collapsed map' : `${factor} copies of expanded map`, baseline);
        results.push(result); console.log(JSON.stringify(result));
        writeFileSync(join(root, 'artifacts', extended ? 'graph-benchmark-extended.json' : 'graph-benchmark.json'), JSON.stringify({ viewport: '1440x960', deviceScaleFactor: 2, samples, results }, null, 2));
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
