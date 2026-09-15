const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { launch, instrument, ready, frames, nodePoint, search, root, gesture } = require('./browser_helpers.cjs');
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
async function preserveScale(page, label, action) {
  const before = await page.evaluate(() => testRenderer.getCamera().scale);
  await action(); await frames(page);
  assert.equal(await page.evaluate(() => testRenderer.getCamera().scale), before, label);
}
async function setScale(page, scale) {
  const camera = await page.evaluate(() => testRenderer.getCamera());
  const rect = await page.locator('#graph').boundingBox();
  await page.locator('#graph').dispatchEvent('wheel', { ctrlKey: true,
    deltaY: -Math.log(scale / camera.scale) / .01,
    clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 });
  await frames(page);
}
async function detailsReady(page) {
  await page.waitForFunction(() => document.getElementById('detail-title').textContent !== 'Loading…');
}
async function checkInfoPanel(page) {
  const button = page.locator('#info-toggle'), panel = page.locator('#info-panel');
  assert(await button.isVisible()); assert(await panel.isHidden());
  assert(await button.evaluate(element => element.classList.contains('is-new')), 'first visit draws attention to Info');
  const before = await page.evaluate(() => testRenderer.getCamera());
  await button.click();
  assert(await panel.isVisible()); assert.equal(await button.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'close-info');
  assert(!(await button.evaluate(element => element.classList.contains('is-new'))));
  assert.equal(await page.evaluate(() => localStorage.getItem('longevity-map-info-seen-v1')), '1');
  const text = await panel.innerText();
  for (const phrase of ['Find a skill', 'Open containers', 'Lock learning path', 'different subject area']) assert(text.includes(phrase));
  assert(text.trim().split(/\s+/).length < 130, 'Info should remain a compact introduction');
  await page.screenshot({ path: join(screenshots, 'info-light.png') });
  await page.locator('#legend-toggle').click();
  assert(await panel.isHidden()); assert(await page.locator('#legend-panel').isVisible());
  await button.click();
  assert(await page.locator('#legend-panel').isHidden());
  await page.keyboard.press('Escape');
  assert(await panel.isHidden()); assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'info-toggle');
  assert.deepEqual(await page.evaluate(() => testRenderer.getCamera()), before, 'help panels must not change the camera');
  await page.emulateMedia({ colorScheme: 'dark' }); await button.click(); await frames(page);
  await page.screenshot({ path: join(screenshots, 'info-dark.png') });
  await page.locator('#close-info').click();
  for (const width of [1100, 900, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    const bounds = await button.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `Info stays in the toolbar at width ${width}`);
    for (const selector of ['#node-search', '#mastery-depth', '#legend-toggle', '#zoom-out']) {
      const box = await page.locator(selector).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width, `${selector} fits at width ${width}`);
    }
    await button.click();
    const box = await panel.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 700, 'compact Info stays within the screen');
    if (width === 390) await page.screenshot({ path: join(screenshots, 'info-mobile.png') });
    await page.locator('#close-info').click();
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'light' }); await frames(page);
  console.log('PASS compact Info, first-visit marker, Legend switching, Escape, focus and responsive toolbar');
}
async function checkScrollPreference(page) {
  const device = page.locator('#scroll-device');
  const change = async value => {
    await page.locator('#info-toggle').click();
    await device.selectOption(value);
    await page.locator('#close-info').click();
  };
  await change('mouse');
  let before = await page.evaluate(() => testRenderer.getCamera());
  await page.locator('#graph').dispatchEvent('wheel', { deltaY: 3, clientX: 450, clientY: 400 }); await frames(page);
  let after = await page.evaluate(() => testRenderer.getCamera());
  assert(after.scale < before.scale, 'manual Mouse makes even ambiguous smooth-wheel deltas zoom');
  await change('trackpad'); before = after;
  await page.locator('#graph').dispatchEvent('wheel', { deltaX: 11, deltaY: 100, clientX: 450, clientY: 400 }); await frames(page);
  after = await page.evaluate(() => testRenderer.getCamera());
  assert.equal(after.scale, before.scale); assert.equal(after.tx, before.tx - 11); assert.equal(after.ty, before.ty - 100);
  before = after;
  await page.locator('#graph').dispatchEvent('wheel', { ctrlKey: true, deltaY: -10, clientX: 450, clientY: 400 }); await frames(page);
  assert((await page.evaluate(() => testRenderer.getCamera())).scale > before.scale, 'pinch still works with a device override');
  await page.reload(); await page.waitForFunction(() => window.testRenderer && document.getElementById('loading').hidden); await frames(page);
  assert.equal(await device.inputValue(), 'trackpad', 'scroll device preference persists across reloads');
  await change('auto');
  console.log('PASS optional device selection and persistence');
}
async function checkCursors(page) {
  const toolbarCursor = await page.locator('#fit').evaluate(element => getComputedStyle(element).cursor);
  assert.equal(toolbarCursor, 'pointer');
  const cursors = await page.locator('#graph').evaluate(element => {
    const previous = element.className, canvas = element.querySelector('canvas'), result = {};
    for (const [name, classes] of [['background', ''], ['dragging', 'is-panning'], ['node', 'is-over-node'], ['zooming', 'is-over-node is-navigating']]) {
      element.className = classes;
      result[name] = [getComputedStyle(element).cursor, getComputedStyle(canvas).cursor];
    }
    element.className = previous; return result;
  });
  for (const [name, [outer, canvas]] of Object.entries(cursors)) {
    assert.equal(outer, toolbarCursor, `${name} cursor must match the toolbar's native hand`);
    assert.equal(canvas, toolbarCursor, 'Pixi canvas must inherit the same native hand');
  }
}
async function checkActionZoom(page) {
  for (const scale of [.55, 1.7]) {
    await setScale(page, scale);
    await preserveScale(page, 'search keeps zoom', () => search(page, 'Introduction to longevity'));
    // A previous test may have left the container open.
    const collapse = page.getByRole('button', { name: 'Collapse components', exact: true });
    if (await collapse.count()) await preserveScale(page, 'panel collapse keeps zoom', () => collapse.click());
    const id = await page.evaluate(() => testView.nodes.find(n => n.title === 'Introduction to longevity').id);
    const before = await nodePoint(page, id);
    const toggle = await nodePoint(page, id, true);
    await preserveScale(page, 'canvas expand keeps zoom', () => page.mouse.click(toggle.x, toggle.y));
    const after = await nodePoint(page, id);
    assert(Math.abs(before.x - after.x) < .01 && Math.abs(before.y - after.y) < .01, 'container header stays anchored');
    await preserveScale(page, 'panel collapse keeps zoom', () => page.getByRole('button', { name: 'Collapse components', exact: true }).click());
    await preserveScale(page, 'panel expand keeps zoom', () => page.getByRole('button', { name: 'Expand components', exact: true }).click());
    await preserveScale(page, 'component navigation keeps zoom', async () => { await page.locator('.component-link').first().click(); await detailsReady(page); });
    await preserveScale(page, 'related skill navigation keeps zoom', async () => { await page.locator('.relation:not([disabled])').first().click(); await detailsReady(page); });
    await preserveScale(page, 'keyboard focus and navigation keep zoom', async () => {
      await page.locator('#graph').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await detailsReady(page);
    });
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
    await checkInfoPanel(page);
    await checkCursors(page);
    await page.reload(); await page.waitForFunction(() => window.testRenderer && document.getElementById('loading').hidden); await frames(page);
    assert(!(await page.locator('#info-toggle').evaluate(element => element.classList.contains('is-new'))), 'Info remembers that its introduction was opened');
    await checkCursors(page);
    const idle = await page.evaluate(() => testRenderer.getMetrics().frames);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => testRenderer.getMetrics().frames), idle, 'idle map must not render');
    console.log('PASS WebGL startup; no SVG nodes; no idle render loop');
    await checkContentAtEveryScale(page);
    console.log('PASS titles, metadata and background edges at every scale');
    await checkActionZoom(page);
    console.log('PASS containers, search, components, relations and keyboard preserve zoom at 55% and 170%');
    await setScale(page, 1);
    await search(page, 'Introduction to longevity');
    const collapseIntro = page.getByRole('button', { name: 'Collapse components', exact: true });
    if (await collapseIntro.count()) await collapseIntro.click();

    await search(page, 'Introduction to longevity');
    const intro = await page.locator('#detail-id').textContent();
    const introCamera = await page.evaluate(() => testRenderer.getCamera());
    await page.locator('#info-toggle').click(); await page.keyboard.press('Escape');
    assert(await page.locator('#details').isVisible()); assert.equal(await page.locator('#detail-id').textContent(), intro);
    assert.deepEqual(await page.evaluate(() => testRenderer.getCamera()), introCamera, 'closing Info must preserve the selected skill and camera');
    const nodeId = await page.evaluate(() => testView.nodes.find(node => node.title === 'Introduction to longevity').id);
    const toggle = await nodePoint(page, nodeId, true);
    await page.mouse.click(toggle.x, toggle.y); await frames(page);
    assert(await page.evaluate(id => testView.containers.some(box => box.id === id), nodeId));
    assert.equal(await page.locator('#detail-id').textContent(), intro, 'expand toggle must not dismiss the detail panel');
    await page.screenshot({ path: join(screenshots, 'graph-expanded-light.png') });
    console.log('PASS search, canvas hit testing, container expansion');

    await search(page, 'flow_gating');
    await page.locator('#zoom-out').click();
    await page.locator('#graph').dispatchEvent('wheel', { shiftKey: true, deltaX: 37, deltaY: 53, deltaMode: 0 }); await frames(page);
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
    await page.locator('#path-steps-disclosure').evaluate(element => { element.open = true; });
    await preserveScale(page, 'path step navigation keeps zoom', async () => {
      await page.locator('.path-step').first().click(); await detailsReady(page);
    });
    await preserveScale(page, 'search in a locked path keeps zoom', () => search(page, 'flow_gating'));
    point = await nodePoint(page, 'flow_gating');
    await page.locator('#reset-path').click(); await frames(page);
    next = await nodePoint(page, 'flow_gating');
    assert(Math.abs(point.x - next.x) < .01 && Math.abs(point.y - next.y) < .01 && point.scale === next.scale, 'reset must preserve camera anchor');
    assert.equal(await page.locator('#details').isVisible(), true);
    console.log('PASS locked path, depth filtering, reset and camera preservation');

    const camera = await page.evaluate(() => testRenderer.getCamera());
    await page.locator('#graph').dispatchEvent('wheel', { shiftKey: true, deltaX: 37, deltaY: 53, deltaMode: 0 }); await frames(page);
    let after = await page.evaluate(() => testRenderer.getCamera());
    assert.equal(after.tx, camera.tx - 37); assert.equal(after.ty, camera.ty - 53); assert.equal(after.scale, camera.scale);
    const rect = await page.locator('#graph').boundingBox(), px = 600, py = 350;
    await page.mouse.move(rect.x + px, rect.y + py);
    const beforeWheel = after;
    const wheelAnchor = { x: (px - beforeWheel.tx) / beforeWheel.scale, y: (py - beforeWheel.ty) / beforeWheel.scale };
    await page.mouse.wheel(0, -100); await frames(page, 3);
    let wheelCamera = await page.evaluate(() => testRenderer.getCamera());
    assert(wheelCamera.scale > beforeWheel.scale, 'ordinary wheel up must zoom in');
    assert(Math.abs((px - wheelCamera.tx) / wheelCamera.scale - wheelAnchor.x) < .001);
    assert(Math.abs((py - wheelCamera.ty) / wheelCamera.scale - wheelAnchor.y) < .001);
    await page.mouse.wheel(0, 100); await frames(page, 3);
    after = await page.evaluate(() => testRenderer.getCamera());
    assert(Math.abs(after.scale - beforeWheel.scale) < 1e-10, 'wheel down must reverse the zoom');
    for (const [deltaMode, deltaY] of [[0, 48], [1, 3], [2, 48 / rect.height]]) {
      const previous = after;
      await page.locator('#graph').dispatchEvent('wheel', { deltaMode, deltaY, clientX: rect.x + px, clientY: rect.y + py }); await frames(page);
      after = await page.evaluate(() => testRenderer.getCamera());
      assert(Math.abs(after.scale / previous.scale - Math.exp(-48 * .002)) < 1e-10, 'pixel, line and page wheel units must agree');
    }
    await page.locator('#graph').dispatchEvent('wheel', { deltaX: 100, deltaY: 0, clientX: rect.x + px, clientY: rect.y + py }); await frames(page);
    let scrolled = await page.evaluate(() => testRenderer.getCamera());
    assert.equal(scrolled.tx, after.tx - 100); assert.equal(scrolled.ty, after.ty); assert.equal(scrolled.scale, after.scale);
    after = scrolled;
    for (const [deltaX, deltaY] of [[0, 6], [0, 18], [0, 100], [0, 160], [35, 60], [50, 0], [0, 5], [0, .5]]) {
      await page.locator('#graph').evaluate((element, { deltaX, deltaY, px, py }) => {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX, deltaY, clientX: px, clientY: py });
        Object.defineProperty(event, 'wheelDeltaY', { value: -3 * deltaY });
        element.dispatchEvent(event);
      }, { deltaX, deltaY, px: rect.x + px, py: rect.y + py });
      await frames(page);
      scrolled = await page.evaluate(() => testRenderer.getCamera());
      assert.equal(scrolled.scale, after.scale, 'trackpad scroll and inertia must not change scale');
      assert(Math.abs(scrolled.tx - (after.tx - deltaX)) < .001 && Math.abs(scrolled.ty - (after.ty - deltaY)) < .001);
      after = scrolled;
    }
    const beforeMouseSwitch = after;
    await page.evaluate(() => { window.lastWheelSample = null; document.addEventListener('wheel', e => {
      window.lastWheelSample = { x: e.deltaX, y: e.deltaY, mode: e.deltaMode, legacy: e.wheelDeltaY, ctrl: e.ctrlKey, shift: e.shiftKey, target: e.target.tagName };
    }, { once: true, capture: true }); });
    await page.mouse.wheel(0, -100); await frames(page, 3);
    after = await page.evaluate(() => testRenderer.getCamera());
    assert(after.scale > beforeMouseSwitch.scale, `switching from trackpad to a mouse notch restores zoom: ${JSON.stringify({beforeMouseSwitch, after, input: await page.evaluate(() => window.lastWheelSample)})}`);
    const beforePinchScale = after.scale;
    const wx = (px - after.tx) / after.scale, wy = (py - after.ty) / after.scale;
    await page.locator('#graph').dispatchEvent('wheel', { clientX: rect.x + px, clientY: rect.y + py, ctrlKey: true, deltaY: -20 }); await frames(page);
    after = await page.evaluate(() => testRenderer.getCamera());
    assert(after.scale > beforePinchScale, 'trackpad pinch must zoom');
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
    const beforeGesture = await page.evaluate(() => testRenderer.getCamera());
    const gestureRect = await page.locator('#graph').boundingBox();
    await gesture(page, 'gesturestart', { scale: 1, clientX: gestureRect.x + 400, clientY: gestureRect.y + 300 });
    await gesture(page, 'gesturechange', { scale: 1.1, clientX: gestureRect.x + 400, clientY: gestureRect.y + 300 });
    await gesture(page, 'gestureend', { scale: 1.1 }); await frames(page);
    const afterGesture = await page.evaluate(() => testRenderer.getCamera());
    assert(Math.abs(afterGesture.scale / beforeGesture.scale - 1.1) < 1e-10, 'desktop Safari trackpad pinch remains enabled');
    console.log('PASS mouse-wheel zoom, trackpad scroll/inertia, device switching, pinch, drag and resize');

    await page.locator('#graph').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('detail-title').textContent !== 'Loading…');
    assert(await page.locator('#graph-keyboard-node').getAttribute('aria-posinset') === '2');
    await page.emulateMedia({ colorScheme: 'dark' }); await frames(page);
    await checkCursors(page);
    console.log('PASS native toolbar cursor on the graph after reload, pan/hover/zoom state changes and dark theme');
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
    await checkScrollPreference(page);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
  const fallback = await launch({ args: ['--disable-webgl'] });
  try {
    const page = await fallback.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await instrument(page); await ready(page);
    assert.equal(await page.locator('#graph').getAttribute('data-renderer'), 'canvas2d');
    await checkCursors(page);
    await checkContentAtEveryScale(page);
    await checkActionZoom(page);
    await search(page, 'Introduction to longevity');
    const collapseIntro = page.getByRole('button', { name: 'Collapse components', exact: true });
    if (await collapseIntro.count()) await collapseIntro.click();
    await page.getByRole('button', { name: 'Expand components', exact: true }).click(); await frames(page);
    assert(await page.evaluate(() => testView.containers.length > 0));
    await page.screenshot({ path: join(screenshots, 'graph-fallback.png') });
    assert.deepEqual(errors, []); console.log('PASS Canvas2D fallback: content at every scale, search and expansion');
  } finally { await fallback.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
