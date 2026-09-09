/* Pure presentation projection. Containment is visual, never a prerequisite. */
(function (root) {
  function edgeMatchesDepth(graph, edge, depth) {
    // A projected edge can combine several original component relationships.
    return edge.indices.some(index => depth === "apply" || graph.edges[index].min_depth !== "apply");
  }
  function createView(graph, expanded, path) {
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const required = path ? new Set(path.node_ids) : null;
    const roots = graph.nodes.filter(node => !node.parent_id);
    const units = roots.map(node => {
      const children = expanded.has(node.id)
        ? node.children.filter(id => !required || required.has(id)).map(id => byId.get(id)) : [];
      const column = Math.max(0, Math.floor((node.x - 320) / 600));
      return { node, children, column, width: children.length ? 520 : 224,
        height: children.length ? 114 + Math.ceil(children.length / 2) * 112 : 88 };
    });
    const columns = [...new Set(units.map(unit => unit.column))].sort((a, b) => a - b);
    const xs = new Map();
    let cursorX = 320;
    for (const column of columns) {
      xs.set(column, cursorX);
      cursorX += Math.max(...units.filter(unit => unit.column === column).map(unit => unit.width)) + 100;
    }
    const nodes = [], containers = [], lanes = [];
    let cursorY = 40;
    for (const topic of graph.options.topics) {
      const members = units.filter(unit => unit.node.topics[0] === topic.id);
      if (!members.length) continue;
      const stacks = new Map();
      for (const unit of members.sort((a, b) => a.node.y - b.node.y || a.node.id.localeCompare(b.node.id))) {
        const stack = stacks.get(unit.column) || [];
        stack.push(unit); stacks.set(unit.column, stack);
      }
      const height = 80 + Math.max(...[...stacks.values()].map(stack => stack.reduce((sum, unit) => sum + unit.height + 24, 0)));
      lanes.push({ ...topic, y: cursorY, height });
      for (const [column, stack] of stacks) {
        let y = cursorY + 64;
        for (const unit of stack) {
          const x = xs.get(column);
          const header = { ...unit.node, x: x + unit.width / 2, y: y + 44, width: unit.width, height: 88 };
          nodes.push(header);
          if (unit.children.length) {
            containers.push({ id: unit.node.id, x: x - 12, y: y - 12, width: unit.width + 24, height: unit.height + 12, topic: topic.id });
            for (const [index, child] of unit.children.entries()) {
              nodes.push({ ...child, x: x + 20 + 112 + (index % 2) * 256,
                y: y + 154 + Math.floor(index / 2) * 112, width: 224, height: 88 });
            }
          }
          y += unit.height + 24;
        }
      }
      cursorY += height + 24;
    }
    const visible = new Set(nodes.map(node => node.id));
    const representative = id => visible.has(id) ? id : byId.get(id)?.parent_id;
    const edges = new Map();
    graph.edges.forEach((edge, index) => {
      const from = representative(edge.from), to = representative(edge.to);
      if (!from || !to || from === to) return;
      // In a locked path a hidden sibling must not masquerade as its parent.
      if (path && (!required.has(edge.from) || !required.has(edge.to))) return;
      const key = `${from}:${to}:${edge.type}:${edge.strength}`;
      if (!edges.has(key)) edges.set(key, { ...edge, from, to, indices: [] });
      edges.get(key).indices.push(index);
    });
    return { ...graph, nodes, edges: [...edges.values()], containers, lanes,
      bounds: { min_x: 0, min_y: 0, width: cursorX + 60, height: cursorY + 20 } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createView, edgeMatchesDepth };
  else root.GraphView = { createView, edgeMatchesDepth };
})(typeof window !== 'undefined' ? window : globalThis);
