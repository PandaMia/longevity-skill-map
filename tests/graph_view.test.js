const assert = require('node:assert/strict');
const test = require('node:test');
const { createView } = require('../static/graph-view.js');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const root = join(__dirname, '..');
const payload = JSON.parse(execFileSync(join(root, '.venv/bin/python'), ['-c', `
import json
from config.graph import build_graph_response,build_learning_path
from config.models import GraphQuery,LearningPathRequest
print(json.dumps({'graph':build_graph_response(GraphQuery()).model_dump(mode='json',by_alias=True), 'path':build_learning_path(LearningPathRequest(node_id='flow_gating',depth='apply')).model_dump(mode='json')}))
`], { cwd: root, encoding: 'utf8' }));
const { graph, path } = payload;
test('collapsed overview contains roots only and aggregated edges refer to visible nodes', () => {
  const view = createView(graph, new Set(), null);
  const ids = new Set(view.nodes.map(n => n.id));
  assert(view.nodes.every(n => !n.parent_id));
  assert(view.edges.every(e => ids.has(e.from) && ids.has(e.to) && e.from !== e.to));
});
test('expanding a container exposes its actual children', () => {
  const view = createView(graph, new Set(['microscopy_flow_cytometry']), null);
  const parent = graph.nodes.find(n => n.id === 'microscopy_flow_cytometry');
  assert.deepEqual(new Set(view.nodes.filter(n => n.parent_id).map(n => n.id)), new Set(parent.children));
});
test('locked path exposes only required siblings and cannot project unrelated edges', () => {
  const view = createView(graph, new Set(path.container_ids), path);
  const children = view.nodes.filter(n => n.parent_id).map(n => n.id);
  assert.deepEqual(new Set(children), new Set(['flow_panel_design', 'flow_gating']));
  assert(view.edges.every(e => path.node_ids.includes(e.from) && path.node_ids.includes(e.to)));
  assert(!view.nodes.some(n => n.id === 'cell_sorting'));
});
test('all expanded cards fit inside their container without overlap', () => {
  const view = createView(graph, new Set(graph.nodes.filter(n => n.children.length).map(n => n.id)), null);
  for (const box of view.containers) {
    const children = view.nodes.filter(n => n.parent_id === box.id);
    for (const n of children) {
      assert(n.x - n.width / 2 >= box.x && n.x + n.width / 2 <= box.x + box.width, n.id);
      assert(n.y - 44 >= box.y && n.y + 44 <= box.y + box.height, n.id);
    }
  }
  for (let i = 0; i < view.nodes.length; i++) for (let j = i + 1; j < view.nodes.length; j++) {
    const a = view.nodes[i], b = view.nodes[j];
    assert(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= 88, `${a.id} overlaps ${b.id}`);
  }
});
test('projection is deterministic and does not mutate graph data', () => {
  const before = JSON.stringify(graph);
  assert.deepEqual(createView(graph, new Set(path.container_ids), path), createView(graph, new Set(path.container_ids), path));
  assert.equal(JSON.stringify(graph), before);
});
