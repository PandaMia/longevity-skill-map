const test = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('../static/graph-touch.js');
function fixture(initial = { tx: -120, ty: 47, scale: .8 }) {
  let camera = { ...initial };
  const controller = createController({ getCamera: () => camera, onTransform: value => { camera = value; } });
  return { controller, get camera() { return camera; } };
}
function near(actual, expected) { assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test('pinch uses the two-dimensional distance and moving midpoint', () => {
  const f = fixture(), c = f.controller, start = f.camera;
  c.down(1, { x: 100, y: 200 }); c.down(2, { x: 220, y: 360 });
  const anchor = { x: (160 - start.tx) / start.scale, y: (280 - start.ty) / start.scale };
  c.move(1, { x: 80, y: 180 }); c.move(2, { x: 260, y: 420 });
  near(f.camera.scale, start.scale * 1.5);
  near((170 - f.camera.tx) / f.camera.scale, anchor.x);
  near((300 - f.camera.ty) / f.camera.scale, anchor.y);
  assert.equal(c.up(2, { x: 260, y: 420 }), null);
  assert.equal(c.up(1, { x: 80, y: 180 }), null, 'a pinch must never become a tap');
});

test('lifting one finger rebases one-finger dragging without a jump', () => {
  const f = fixture(), c = f.controller;
  c.down(1, { x: 100, y: 200 }); c.move(1, { x: 115, y: 230 });
  c.down(2, { x: 215, y: 230 });
  const before = f.camera;
  c.move(2, { x: 315, y: 230 });
  near(f.camera.scale, before.scale * 2);
  const pinched = f.camera;
  c.up(2, { x: 315, y: 230 });
  near(f.camera.tx, pinched.tx); near(f.camera.ty, pinched.ty);
  c.move(1, { x: 135, y: 245 });
  near(f.camera.tx, pinched.tx + 20); near(f.camera.ty, pinched.ty + 15);
  near(f.camera.scale, pinched.scale);
  c.up(1, { x: 135, y: 245 }); assert.equal(c.active, false);
});

test('one-finger tap tolerates small movement, while dragging cancels tap', () => {
  const f = fixture(), c = f.controller, before = f.camera;
  c.down(1, { x: 60, y: 100 }); c.move(1, { x: 62, y: 101 });
  assert.deepEqual(f.camera, before);
  assert.deepEqual(c.up(1, { x: 62, y: 101 }), { start: { x: 60, y: 100 }, end: { x: 62, y: 101 } });
  c.down(2, { x: 60, y: 100 }); c.move(2, { x: 75, y: 125 });
  assert.equal(c.up(2, { x: 75, y: 125 }), null);
  near(f.camera.scale, before.scale);
});

test('cancel and unknown pointers never change the camera or activate a node', () => {
  const f = fixture(), c = f.controller;
  c.down(1, { x: 60, y: 100 }); const before = f.camera;
  assert.equal(c.up(1, { x: 0, y: 0 }, true), null);
  assert.deepEqual(f.camera, before);
  c.move(99, { x: 999, y: 999 }); assert.deepEqual(f.camera, before);
  c.down(1, { x: 0, y: 0 }); c.down(2, { x: 100, y: 100 }); c.cancel();
  assert.equal(c.active, false); assert.equal(c.up(2, { x: 300, y: 300 }), null);
});

test('zoom limits preserve the midpoint anchor and coincident fingers stay finite', () => {
  for (const distance of [.001, 100000]) {
    const f = fixture(), c = f.controller;
    c.down(1, { x: 0, y: 0 }); c.down(2, { x: 100, y: 0 });
    const anchor = (50 - f.camera.tx) / f.camera.scale;
    c.move(2, { x: distance, y: 0 });
    assert.equal(f.camera.scale, distance < 1 ? .025 : 2.8);
    near((distance / 2 - f.camera.tx) / f.camera.scale, anchor);
  }
  const f = fixture(), c = f.controller;
  c.down(1, { x: 10, y: 10 }); c.down(2, { x: 10, y: 10 });
  c.move(2, { x: 20, y: 20 }); c.move(2, { x: 30, y: 30 });
  assert(Object.values(f.camera).every(Number.isFinite));
});

test('extra fingers do not change the active pair or produce drift', () => {
  const f = fixture(), c = f.controller;
  c.down(1, { x: 100, y: 100 }); c.down(2, { x: 200, y: 100 });
  const before = f.camera;
  c.down(3, { x: 300, y: 300 }); c.move(3, { x: 400, y: 400 });
  near(f.camera.tx, before.tx); near(f.camera.ty, before.ty); near(f.camera.scale, before.scale);
  c.up(3, { x: 400, y: 400 });
  for (let i = 0; i < 100; i++) {
    c.move(1, { x: 90, y: 100 }); c.move(2, { x: 210, y: 100 });
    c.move(1, { x: 100, y: 100 }); c.move(2, { x: 200, y: 100 });
  }
  near(f.camera.tx, before.tx); near(f.camera.ty, before.ty); near(f.camera.scale, before.scale);
});
