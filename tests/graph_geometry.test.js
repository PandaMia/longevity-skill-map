const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = import('../static/graph-geometry.mjs');
const node = (id, x, y, children = []) => ({ id, x, y, width: 224, height: 88, children });

test('spatial picking respects pan, zoom, card bounds and container buttons', async () => {
  const { nodeIndex, hitTest } = await geometry;
  const index = nodeIndex([node('a', 500, 400, ['b']), node('b', 800, 400)]);
  const camera = { tx: -200, ty: 10, scale: .5 };
  assert.deepEqual(hitTest(index, camera, 50, 210), { id: 'a', toggle: false });
  assert.deepEqual(hitTest(index, camera, 92, 210), { id: 'a', toggle: true });
  assert.equal(hitTest(index, camera, 50, 233), null);
  assert.equal(hitTest(index, camera, 5000, 5000), null);
});

test('cross-screen edges are retained when both endpoints are outside the viewport', async () => {
  const { buildEdgeTiles, viewportBounds } = await geometry;
  const a = node('a', -10000, 0), b = node('b', 10000, 0);
  const tiles = buildEdgeTiles([{ from: 'a', to: 'b', type: 'prerequisite' }], new Map([['a', a], ['b', b]]));
  const visible = tiles.search(viewportBounds({ tx: 0, ty: 0, scale: 1 }, 1000, 600));
  assert(visible.length > 0);
  assert(visible.some(tile => tile.segments.some(s => s.x1 <= 500 && s.x2 >= 500)));
  assert(visible.length < tiles.all().length / 2, 'culling should exclude distant portions of a long edge');
});

test('curve subdivision preserves endpoints, direction arrows and dash continuity', async () => {
  const { edgePoints, buildEdgeTiles } = await geometry;
  const a = node('a', 1200, -800), b = node('b', -1200, 4800);
  const points = edgePoints(a, b);
  assert.deepEqual(points[0], { x: 1312, y: -800 });
  assert.deepEqual(points.at(-1), { x: -1312, y: 4800 });
  const tiles = buildEdgeTiles([{ from: 'a', to: 'b', type: 'recommended_before' }], new Map([['a', a], ['b', b]]));
  const segments = tiles.all().flatMap(tile => tile.segments).sort((a, b) => a.distance - b.distance);
  assert.equal(segments.filter(s => s.arrow).length, 1);
  assert(segments.at(-1).arrow);
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1], b = segments[i];
    assert(Math.abs(a.distance + Math.hypot(a.x2 - a.x1, a.y2 - a.y1) - b.distance) < .00001);
    assert.deepEqual(b.pattern, [12, 7]);
  }
});

test('selection preserves task-depth semantics and container shell availability', async () => {
  const { highlightState } = await geometry;
  const nodes = ['a', 'b', 'c', 'shell'].map(id => node(id, 0, 0));
  const edges = [{ from: 'a', to: 'b', indices: [0] }, { from: 'a', to: 'c', indices: [1] }];
  const graph = { edges: [{ min_depth: 'understand' }, { min_depth: 'apply' }] }, view = { nodes, edges };
  let state = highlightState(graph, view, 'a', null, 'understand');
  assert.deepEqual([...state.related], [edges[0]]); assert(state.nodes.get('c').dimmed);
  state = highlightState(graph, view, 'a', null, 'apply');
  assert.equal(state.related.size, 2); assert(!state.nodes.get('c').dimmed);
  const path = { node_ids: ['a', 'b'], edge_indices: [0], container_ids: ['shell'], target_id: 'b' };
  state = highlightState(graph, view, 'a', path, 'apply');
  assert(state.nodes.get('b').target); assert(state.nodes.get('b').path);
  assert(!state.nodes.get('c').allowed); assert(state.nodes.get('c').dimmed);
  assert(!state.nodes.get('shell').allowed); assert(state.nodes.get('shell').toggleAllowed); assert(!state.nodes.get('shell').dimmed);
});

test('visible node count stays bounded as distant graph size increases', async () => {
  const { nodeIndex, viewportBounds } = await geometry;
  const nodes = Array.from({ length: 20000 }, (_, i) => node(String(i), (i % 100) * 324, Math.floor(i / 100) * 112));
  const bounds = viewportBounds({ tx: 0, ty: 0, scale: 1 }, 1440, 960);
  assert(nodeIndex(nodes).search(bounds).length <= 60);
});

test('overview batching retains every edge segment and arrow exactly once', async () => {
  const { buildEdgeTiles, coarsenEdgeTiles } = await geometry;
  const a = node('a', -20000, -5000), b = node('b', 20000, 8000);
  const fine = buildEdgeTiles([{ from: 'a', to: 'b', type: 'prerequisite' }], new Map([['a', a], ['b', b]]));
  const coarse = coarsenEdgeTiles(fine, 8);
  assert(coarse.all().length < fine.all().length);
  const original = fine.all().flatMap(tile => tile.segments), batched = coarse.all().flatMap(tile => tile.segments);
  assert.equal(batched.length, original.length);
  assert.deepEqual(new Set(batched), new Set(original));
  for (const tile of coarse.all()) for (const segment of tile.segments) {
    assert(tile.minX <= segment.x1 && tile.maxX >= segment.x1 && tile.minX <= segment.x2 && tile.maxX >= segment.x2);
    assert(tile.minY <= segment.y1 && tile.maxY >= segment.y1 && tile.minY <= segment.y2 && tile.maxY >= segment.y2);
  }
});

test('overscan reuses text batches without excluding cards after pan, zoom or resize', async () => {
  const { createNodeWindow, nodeIndex, viewportBounds } = await geometry;
  const index = nodeIndex(Array.from({ length: 10000 }, (_, i) => node(String(i), (i % 100) * 324, Math.floor(i / 100) * 112)));
  const query = createNodeWindow(index), first = query({ tx: 0, ty: 0, scale: 1 }, 1440, 960);
  assert.equal(query({ tx: 2, ty: -2, scale: 1 }, 1440, 960), first, 'small pans must reuse the same candidate batch');
  for (const camera of [{ tx: 300, ty: -900, scale: 1 }, { tx: -1400, ty: 100, scale: .025 }, { tx: -6000, ty: -8000, scale: 2.8 }]) {
    for (const [width, height] of [[1440, 960], [2500, 1300]]) {
      const cached = new Set(query(camera, width, height).map(item => item.node.id));
      for (const item of index.search(viewportBounds(camera, width, height, 0))) assert(cached.has(item.node.id));
    }
  }
  assert(query({ tx: 0, ty: 0, scale: 1 }, 1440, 960).length < 200, 'zooming in must shrink a previously large overview batch');
});
