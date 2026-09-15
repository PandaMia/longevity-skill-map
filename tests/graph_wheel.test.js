const test = require('node:test');
const assert = require('node:assert/strict');
const { createRouter } = require('../static/graph-wheel.js');
function fixture(pixelRatio = 1) {
  let clock = 0;
  const router = createRouter({ now: () => clock, getPixelRatio: () => pixelRatio });
  return { router, next(event, elapsed = 16, preference = 'auto') { clock += elapsed; return router.route({ deltaMode: 0, deltaX: 0, deltaY: 0, ...event }, preference); } };
}

test('trackpad scroll pans on both axes, including purely vertical and horizontal motion', () => {
  const f = fixture();
  for (const event of [{deltaY: 3}, {deltaY: 14.5}, {deltaX: 8, deltaY: -22}, {deltaX: -60}]) assert.equal(f.next(event), 'pan');
});

test('a trackpad gesture retains panning across fast motion and inertia', () => {
  const f = fixture();
  for (const deltaY of [2, 15, 38, 80, 130, 200, 160, 100, 40, 9, .5]) assert.equal(f.next({deltaY}), 'pan');
  assert.equal(f.next({deltaY: 100, wheelDeltaY: -120}, 400), 'zoom', 'subsequent mouse wheel switches back');
});

test('classic mouse notches, fractional mouse deltas and line/page units zoom', () => {
  for (const event of [{deltaY: 100, wheelDeltaY: -120}, {deltaY: 12, wheelDeltaY: -120},
    {deltaY: 100.5, wheelDeltaY: -120}, {deltaY: 100.5}, {deltaMode: 1, deltaY: 3}, {deltaMode: 2, deltaY: 1}, {deltaY: 100}]) {
    assert.equal(fixture().next(event), 'zoom');
  }
});

test('precise browser deltas identify a fast initial trackpad scroll', () => {
  const f = fixture();
  assert.equal(f.next({deltaY: 91, wheelDeltaY: -273}), 'pan');
  assert.equal(f.next({deltaY: 120, wheelDeltaY: -360}), 'pan', 'notch-shaped deltas within a precise gesture must not cause zoom');
  assert.equal(f.next({deltaY: 100, wheelDeltaY: -120}), 'zoom', 'explicit wheel notch can switch devices without waiting');
});

test('pinch always zooms and Shift pans regardless of the saved device preference', () => {
  const f = fixture();
  for (const preference of ['auto', 'mouse', 'trackpad']) {
    assert.equal(f.next({ctrlKey: true, deltaY: -5}, 16, preference), 'pinch');
    assert.equal(f.next({shiftKey: true, deltaY: 100}, 16, preference), 'pan');
  }
});

test('manual selection resolves indistinguishable devices and reset clears history', () => {
  const f = fixture();
  const ambiguous = { deltaY: 12 };
  assert.equal(f.next(ambiguous, 16, 'mouse'), 'zoom');
  assert.equal(f.next(ambiguous, 16, 'trackpad'), 'pan');
  assert.equal(f.next({deltaY: 100}, 16, 'trackpad'), 'pan');
  assert.equal(f.next(ambiguous), 'pan');
  f.router.reset();
  assert.equal(f.next({deltaY: 100}), 'zoom');
});

test('modifier actions and empty events do not poison automatic detection', () => {
  const f = fixture();
  assert.equal(f.next({deltaY: 100}), 'zoom');
  assert.equal(f.next({ctrlKey: true, deltaY: -1}), 'pinch');
  assert.equal(f.next({shiftKey: true, deltaY: 1}), 'pan');
  assert.equal(f.next({}), 'none');
  assert.equal(f.next({deltaY: 5}), 'zoom', 'same mouse burst keeps its device');
  assert.equal(f.next({deltaX: 25}, 400, 'mouse'), 'none');
});

test('high-DPI/page-zoom mouse notches override a preceding trackpad burst', () => {
  for (const ratio of [.8, 1.25, 1.5, 2, 3]) {
    const f = fixture(ratio);
    assert.equal(f.next({deltaY: 5}), 'pan');
    assert.equal(f.next({deltaY: -100 / ratio, wheelDeltaY: 120 / ratio}), 'zoom');
  }
});
