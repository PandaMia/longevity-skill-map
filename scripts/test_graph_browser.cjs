const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { launch, instrument, ready, frames, nodePoint, search, root } = require('./browser_helpers.cjs');
const screenshots = join(root, 'artifacts'); mkdirSync(screenshots, { recursive: true });
async function checkContentAtEveryScale(page) {
  for (const scale of [.025, .1, .3, .55, 1]) {
    const camera = await page.evaluate(() => testRenderer.getCamera());
    const rect = await page.locator('#graph').boundingBox();
    await page.locator('#graph').dispatchEvent('wheel', { ctrlKey: true,
      deltaY: -Math.log(scale / camera.scale) / .01,
      clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 });
    await frames(page);
    const metrics = await page.evaluate(() => testRenderer.getMetrics());
    assert(metrics.visibleNodes > 0, `visible cards at scale ${scale}`);
    assert.equal(metrics.visibleLabelNodes, metrics.visibleNodes, `every visible card has title and metadata at scale ${scale}`);
    assert(metrics.visibleBaseEdgeTiles > 0, `background edges must be drawn at scale ${scale}`);
  }
}
(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await instrument(page); await ready(page);
    assert.equal(await page.locator('#graph').getAttribute('data-renderer'), 'webgl');
    assert.equal(await page.locator('#graph svg, #graph foreignObject').count(), 0);
    const idle = await page.evaluate(() => testRenderer.getMetrics().frames);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => testRenderer.getMetrics().frames), idle, 'idle map must not render');
    console.log('PASS WebGL startup; no SVG nodes; no idle render loop');
    await checkContentAtEveryScale(page);
    console.log('PASS titles, metadata and background edges at every scale');

    await search(page, 'Introduction to longevity');
    const intro = await page.locator('#detail-id').textContent();
    const nodeId = await page.evaluate(() => testView.nodes.find(node => node.title === 'Introduction to longevity').id);
    const toggle = await nodePoint(page, nodeId, true);
    await page.mouse.click(toggle.x, toggle.y); await frames(page);
    assert(await page.evaluate(id => testView.containers.some(box => box.id === id), nodeId));
    assert.equal(await page.locator('#detail-id').textContent(), intro, 'expand toggle must not dismiss the detail panel');
    await page.screenshot({ path: join(screenshots, 'graph-expanded-light.png') });
    console.log('PASS search, canvas hit testing, container expansion');

    await search(page, 'flow_gating');
    await page.locator('#zoom-out').click();
    await page.locator('#graph').dispatchEvent('wheel', { deltaX: 37, deltaY: 53, deltaMode: 0 }); await frames(page);
    const beforeLock = await nodePoint(page, 'flow_gating');
    await page.getByRole('button', { name: 'Lock learning path', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('path-panel').hidden);
    await frames(page);
    const afterLock = await nodePoint(page, 'flow_gating');
    assert(Math.abs(beforeLock.x - afterLock.x) < .01 && Math.abs(beforeLock.y - afterLock.y) < .01 && beforeLock.scale === afterLock.scale,
      'initial path lock must preserve zoom and the selected node screen position');
    await page.locator('#zoom-in').click(); await frames(page);
    let point = await nodePoint(page, 'flow_gating');
    await page.locator('#mastery-depth').selectOption('apply');
    await page.waitForFunction(() => testOptions.path?.depth === 'apply'); await frames(page);
    let next = await nodePoint(page, 'flow_gating');
    assert(Math.abs(point.x - next.x) < .01 && Math.abs(point.y - next.y) < .01 && point.scale === next.scale, 'changing depth must preserve camera anchor');
    assert(!await page.evaluate(() => testView.nodes.some(node => node.id === 'cell_sorting')));
    point = next;
    await page.locator('#reset-path').click(); await frames(page);
    next = await nodePoint(page, 'flow_gating');
    assert(Math.abs(point.x - next.x) < .01 && Math.abs(point.y - next.y) < .01 && point.scale === next.scale, 'reset must preserve camera anchor');
    assert.equal(await page.locator('#details').isVisible(), true);
    console.log('PASS locked path, depth filtering, reset and camera preservation');

    const camera = await page.evaluate(() => testRenderer.getCamera());
    await page.locator('#graph').dispatchEvent('wheel', { deltaX: 37, deltaY: 53, deltaMode: 0 }); await frames(page);
    let after = await page.evaluate(() => testRenderer.getCamera());
    assert.equal(after.tx, camera.tx - 37); assert.equal(after.ty, camera.ty - 53); assert.equal(after.scale, camera.scale);
    const rect = await page.locator('#graph').boundingBox(), px = 600, py = 350;
    const wx = (px - after.tx) / after.scale, wy = (py - after.ty) / after.scale;
    await page.locator('#graph').dispatchEvent('wheel', { clientX: rect.x + px, clientY: rect.y + py, ctrlKey: true, deltaY: -20 }); await frames(page);
    after = await page.evaluate(() => testRenderer.getCamera());
    assert(Math.abs((px - after.tx) / after.scale - wx) < .001); assert(Math.abs((py - after.ty) / after.scale - wy) < .001);
    await page.setViewportSize({ width: 1280, height: 800 }); await frames(page);
    assert.deepEqual(await page.evaluate(() => testRenderer.getCamera()), after, 'resize must preserve camera');
    const background = await page.evaluate(() => {
      const rect = document.getElementById('graph').getBoundingClientRect();
      for (let y = rect.top + 50; y < rect.bottom - 150; y += 40) for (let x = 50; x < 700; x += 40)
        if (!testRenderer.hitTest(x, y)) return { x, y };
    });
    assert(background);
    const beforeDrag = await page.evaluate(() => testRenderer.getCamera());
    await page.mouse.move(background.x, background.y); await page.mouse.down();
    await page.mouse.move(background.x + 70, background.y + 90, { steps: 8 }); await page.mouse.up(); await frames(page);
    const afterDrag = await page.evaluate(() => testRenderer.getCamera());
    assert(Math.abs(afterDrag.tx - beforeDrag.tx - 70) < .01 && Math.abs(afterDrag.ty - beforeDrag.ty - 90) < .01);
    assert(await page.locator('#details').isVisible(), 'drag must not behave like a background click');
    console.log('PASS wheel pan, drag, anchored pinch zoom, resize');

    await page.locator('#graph').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('detail-title').textContent !== 'Loading…');
    assert(await page.locator('#graph-keyboard-node').getAttribute('aria-posinset') === '2');
    await page.emulateMedia({ colorScheme: 'dark' }); await frames(page);
    await page.screenshot({ path: join(screenshots, 'graph-dark.png') });
    console.log('PASS keyboard navigation and theme change');
    const contextRestored = await page.evaluate(async () => {
      const canvas = document.querySelector('#graph canvas'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      const restored = new Promise(resolve => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
      extension.loseContext(); setTimeout(() => extension.restoreContext(), 100); await restored;
      return true;
    });
    assert(contextRestored); await frames(page);
    await page.locator('#fit').click(); await frames(page);
    await page.screenshot({ path: join(screenshots, 'graph-overview.png') });
    const overview = await page.evaluate(() => testRenderer.getMetrics());
    assert.equal(overview.visibleLabelNodes, overview.visibleNodes);
    assert(overview.visibleBaseEdgeTiles > 0);
    console.log('PASS GPU context recovery and overview content');
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
  const fallback = await launch({ args: ['--disable-webgl'] });
  try {
    const page = await fallback.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await instrument(page); await ready(page);
    assert.equal(await page.locator('#graph').getAttribute('data-renderer'), 'canvas2d');
    await checkContentAtEveryScale(page);
    await search(page, 'Introduction to longevity');
    await page.getByRole('button', { name: 'Expand components', exact: true }).click(); await frames(page);
    assert(await page.evaluate(() => testView.containers.length > 0));
    await page.screenshot({ path: join(screenshots, 'graph-fallback.png') });
    assert.deepEqual(errors, []); console.log('PASS Canvas2D fallback: content at every scale, search and expansion');
  } finally { await fallback.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
