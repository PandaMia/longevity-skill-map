const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { launch, instrument, ready, frames, nodePoint, root, gesture } = require('./browser_helpers.cjs');
const output = join(root, 'artifacts'); mkdirSync(output, { recursive: true });
const near = (a, b, label = '') => assert(Math.abs(a - b) < .001, `${label}: ${a} != ${b}`);
const camera = page => page.evaluate(() => testRenderer.getCamera());
(async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await instrument(page); await ready(page);
    const cdp = await context.newCDPSession(page);
    const touch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 3, radiusY: 3, force: 1 })) });
      await frames(page);
    };
    for (const [width, height] of [[320, 700], [390, 844], [430, 932], [844, 390]]) {
      await page.setViewportSize({ width, height }); await frames(page);
      const search = await page.locator('#node-search').boundingBox(), toolbar = await page.locator('.toolbar').boundingBox();
      assert(search.width >= width - 26, `full-width search at ${width}`);
      assert(search.y + search.height <= toolbar.y, 'search and controls must occupy separate rows');
      assert(toolbar.x >= 0 && toolbar.x + toolbar.width <= width);
      if (width <= 760) assert.equal(await page.locator('#node-search').evaluate(el => getComputedStyle(el).fontSize), '16px');
    }
    await page.setViewportSize({ width: 390, height: 844 }); await frames(page);
    await page.screenshot({ path: join(output, 'mobile-search-row.png') });
    console.log('PASS phone search row at 320/390/430 px and landscape');
    let before = await camera(page);
    const rect = await page.locator('#graph').boundingBox();
    const a = [1, 110, rect.y + 210], b = [2, 250, rect.y + 330];
    const anchor = { x: (180 - rect.x - before.tx) / before.scale, y: (270 - before.ty) / before.scale };
    await touch('touchStart', [a, b]);
    let first = [1, 80, rect.y + 190], second = [2, 300, rect.y + 350];
    await touch('touchMove', [first, second]);
    let after = await camera(page);
    near(after.scale, before.scale * Math.hypot(220, 160) / Math.hypot(140, 120), 'diagonal pinch scale');
    near((190 - rect.x - after.tx) / after.scale, anchor.x, 'midpoint x');
    near((270 - after.ty) / after.scale, anchor.y, 'midpoint y');
    // Safari's legacy gesture events or a synthesized wheel must not zoom twice.
    await gesture(page, 'gesturestart', { scale: 1, clientX: 0, clientY: 0 });
    await gesture(page, 'gesturechange', { scale: 3, clientX: 0, clientY: 0 });
    await page.locator('#graph').dispatchEvent('wheel', { ctrlKey: true, deltaY: -100, clientX: 0, clientY: 0 }); await frames(page);
    assert.deepEqual(await camera(page), after);
    first = [1, 95, rect.y + 205]; second = [2, 315, rect.y + 365];
    await touch('touchMove', [first, second]);
    let translated = await camera(page);
    near(translated.scale, after.scale); near(translated.tx, after.tx + 15); near(translated.ty, after.ty + 15);
    console.log('PASS pinch around moving midpoint; duplicate native zoom ignored');

    // Chrome accepts the released contact here, leaving the other finger down.
    await touch('touchEnd', [second]);
    let lifted = await camera(page); near(lifted.tx, translated.tx); near(lifted.ty, translated.ty); near(lifted.scale, translated.scale);
    first = [1, first[1] + 17, first[2] + 23];
    await touch('touchMove', [first]); after = await camera(page);
    near(after.tx, lifted.tx + 17); near(after.ty, lifted.ty + 23); near(after.scale, lifted.scale);
    await touch('touchEnd', []);
    assert(await page.locator('#details').isHidden(), 'pinching must not select a node');
    await page.waitForTimeout(550);
    await gesture(page, 'gesturechange', { scale: 4, clientX: 0, clientY: 0 });
    await gesture(page, 'gestureend', { scale: 4 }); await frames(page);
    const ended = await camera(page); near(ended.tx, after.tx); near(ended.ty, after.ty); near(ended.scale, after.scale);
    console.log('PASS lifting a finger continues pan without a jump or a ghost tap');

    await touch('touchStart', [[1, 120, rect.y + 190], [2, 260, rect.y + 300]]);
    before = await camera(page); await touch('touchCancel', []);
    assert.deepEqual(await camera(page), before);
    assert(!(await page.locator('#graph').evaluate(el => el.classList.contains('is-panning'))));
    // Position a known node using UI navigation, then touch directly on its card.
    await page.locator('#node-search').fill('Introduction to longevity');
    await page.locator('.search-result').first().tap();
    await page.waitForFunction(() => document.getElementById('detail-title').textContent === 'Introduction to longevity');
    await page.locator('#close-details').tap(); await frames(page);
    const id = await page.evaluate(() => testView.nodes.find(n => n.title === 'Introduction to longevity').id);
    let point = await nodePoint(page, id); before = await camera(page);
    await touch('touchStart', [[1, point.x, point.y], [2, point.x + 100, point.y + 60]]);
    await touch('touchMove', [[1, point.x - 10, point.y - 10], [2, point.x + 125, point.y + 75]]);
    assert((await camera(page)).scale > before.scale, 'pinch must also start on a card');
    await touch('touchEnd', []);
    assert(await page.locator('#details').isHidden());
    point = await nodePoint(page, id);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(() => document.getElementById('detail-title').textContent === 'Introduction to longevity' && !document.getElementById('details').hidden);
    console.log('PASS cancellation, pinch starting on a card and a subsequent single tap');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
