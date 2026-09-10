const assert = require('node:assert/strict');
const test = require('node:test');
const { createRenderer } = require('../static/graph-interactions.js');

function fixture(extraEdges = 0) {
  const writes = [];
  const element = (id, initial = []) => {
    const classes = new Set(initial);
    return { classes, classList: {
      add(name) { writes.push([id, 'add', name]); classes.add(name); },
      remove(name) { writes.push([id, 'remove', name]); classes.delete(name); }
    } };
  };
  const nodes = new Map(['a', 'b', 'c'].map(id => [id, element(id)]));
  nodes.get('c').classes.add('is-dimmed');
  const ab = element('ab'), bc = element('bc');
  const edges = [
    { element: ab, edge: { from: 'a', to: 'b' } },
    { element: bc, edge: { from: 'b', to: 'c' } }
  ];
  for (let i = 0; i < extraEdges; i++) {
    const id = `unrelated-${i}`;
    nodes.set(id, element(id));
    edges.push({ element: element(`edge-${i}`), edge: { from: id, to: `other-${i}` } });
  }
  let frameId = 0;
  const frames = new Map(), transforms = [];
  const renderer = createRenderer({
    onTransform: value => transforms.push(value),
    requestFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelFrame: id => frames.delete(id)
  });
  renderer.setGraph(nodes, edges);
  function paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); }
  return { renderer, nodes, edges, ab, bc, writes, frames, transforms, paint };
}

test('hover never changes graph-wide dimming or locked-path styling', () => {
  const f = fixture();
  f.nodes.get('a').classes.add('is-path');
  f.renderer.setHover('a'); f.paint();
  assert(f.nodes.get('a').classes.has('is-hovered'));
  assert(f.nodes.get('a').classes.has('is-path'));
  assert(f.nodes.get('c').classes.has('is-dimmed'));
  assert.deepEqual(f.writes, [['a', 'add', 'is-hovered'], ['ab', 'add', 'is-hovered']]);
});

test('leave and enter in one frame do not flash through the unhighlighted state', () => {
  const f = fixture();
  f.renderer.setHover('a'); f.paint(); f.writes.length = 0;
  f.renderer.setHover(null); f.renderer.setHover('b');
  assert.equal(f.frames.size, 1);
  assert(f.ab.classes.has('is-hovered'));
  f.paint();
  assert(f.ab.classes.has('is-hovered'));
  assert(!f.writes.some(([id]) => id === 'ab'), 'shared edge must not be removed and re-added');
  assert(f.bc.classes.has('is-hovered'));
});

test('hover mutation count depends on local degree rather than graph size', () => {
  const small = fixture(), large = fixture(10000);
  for (const f of [small, large]) { f.renderer.setHover('b'); f.paint(); }
  assert.deepEqual(large.writes, small.writes);
  assert.equal(large.writes.length, 3);
  large.writes.length = 0;
  large.renderer.setHover('b');
  assert.equal(large.frames.size, 0, 'repeated hover should do no work');
});

test('a burst of pan and zoom input paints only the final camera state', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.renderer.setTransform(i, i * 2, 1 + i / 100);
  f.renderer.setHover('a');
  assert.equal(f.frames.size, 1);
  assert.equal(f.transforms.length, 0);
  f.paint();
  assert.deepEqual(f.transforms, [{ tx: 99, ty: 198, scale: 1.99 }]);
  assert(f.nodes.get('a').classes.has('is-hovered'));
  f.renderer.setTransform(99, 198, 1.99);
  assert.equal(f.frames.size, 0);
});

test('rebuilding containers discards a queued hover for the previous view', () => {
  const f = fixture();
  f.renderer.setHover('a'); f.paint();
  f.renderer.setHover('b');
  f.renderer.setGraph(new Map(), []); f.paint();
  assert(!f.nodes.get('a').classes.has('is-hovered'));
  assert(!f.nodes.get('b').classes.has('is-hovered'));
  assert(!f.ab.classes.has('is-hovered'));
});

test('disposing cancels outstanding animation work', () => {
  const f = fixture();
  f.renderer.setTransform(1, 2, 3); f.renderer.dispose(); f.paint();
  assert.equal(f.transforms.length, 0);
});

test('resize and camera bursts share one paint and do not start an idle loop', () => {
  const frames = new Map(); let id = 0, paints = 0;
  const renderer = createRenderer({ onTransform() {}, onPaint() { paints++; },
    requestFrame(callback) { frames.set(++id, callback); return id; }, cancelFrame(id) { frames.delete(id); } });
  for (let i = 0; i < 100; i++) { renderer.invalidate(); renderer.setTransform(i, i, 1); }
  assert.equal(frames.size, 1);
  const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
  assert.equal(paints, 1); assert.equal(frames.size, 0);
});
