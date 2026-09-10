import RBush from 'rbush';

export const TILE_SIZE = 1024;
// Only card geometry changes with scale; text and edges stay visible.
export const CARD_DETAIL_SCALE = .42;

export function viewportBounds({ tx, ty, scale }, width, height, margin = 32) {
  return { minX: (-tx - margin) / scale, minY: (-ty - margin) / scale,
    maxX: (width - tx + margin) / scale, maxY: (height - ty + margin) / scale };
}

export function createNodeWindow(index) {
  let bounds = null, nodes = [], indexedScale = 0;
  return (camera, width, height) => {
    const viewport = viewportBounds(camera, width, height, 0);
    // Keep an overscan band so a two-pixel pan does not repeatedly invalidate
    // the bitmap-text GPU batches as individual cards enter/leave the screen.
    if (!bounds || camera.scale > indexedScale * 1.25 ||
        viewport.minX < bounds.minX || viewport.minY < bounds.minY ||
        viewport.maxX > bounds.maxX || viewport.maxY > bounds.maxY) {
      bounds = viewportBounds(camera, width, height, 128);
      indexedScale = camera.scale;
      nodes = index.search(bounds);
    }
    return nodes;
  };
}

// Adaptive subdivision bounds the deviation of a cubic from its polyline.
// Geometry is calculated once per layout, never while moving the camera.
export function edgePoints(source, target, tolerance = .7) {
  const start = { x: source.x + source.width / 2, y: source.y };
  const end = { x: target.x - target.width / 2, y: target.y };
  const dx = end.x - start.x;
  const bend = dx >= 20 ? Math.max(45, dx * .45) : 90 + Math.abs(end.y - start.y) * .18;
  const c1 = { x: start.x + bend, y: start.y };
  const c2 = { x: end.x + (dx >= 20 ? -bend : bend), y: end.y };
  const result = [start];
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function split(a, b, c, d, depth) {
    const ux = 3 * b.x - 2 * a.x - d.x, uy = 3 * b.y - 2 * a.y - d.y;
    const vx = 3 * c.x - 2 * d.x - a.x, vy = 3 * c.y - 2 * d.y - a.y;
    if (depth >= 12 || Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy) <= 16 * tolerance * tolerance) {
      result.push(d); return;
    }
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd);
    split(a, ab, abc, center, depth + 1); split(center, bcd, cd, d, depth + 1);
  }
  split(start, c1, c2, end, 0);
  return result;
}

export function edgePattern(edge) {
  if (edge.type === 'applied_in') return [8, 2];
  if (edge.type === 'recommended_before' || edge.strength === 'recommended') return [12, 7];
  return [0, 0];
}

export function buildEdgeTiles(edges, positions, tileSize = TILE_SIZE) {
  const tiles = new Map();
  function add(segment) {
    // Long straight segments are split too: endpoint culling must never drop
    // an edge that crosses the viewport with both endpoints off screen.
    const key = `${Math.floor((segment.x1 + segment.x2) / 2 / tileSize)}:${Math.floor((segment.y1 + segment.y2) / 2 / tileSize)}`;
    let tile = tiles.get(key);
    if (!tile) {
      tile = { key, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, segments: [] };
      tiles.set(key, tile);
    }
    tile.minX = Math.min(tile.minX, segment.x1, segment.x2);
    tile.minY = Math.min(tile.minY, segment.y1, segment.y2);
    tile.maxX = Math.max(tile.maxX, segment.x1, segment.x2);
    tile.maxY = Math.max(tile.maxY, segment.y1, segment.y2);
    tile.segments.push(segment);
  }
  for (const edge of edges) {
    const source = positions.get(edge.from), target = positions.get(edge.to);
    if (!source || !target) continue;
    const points = edgePoints(source, target), pattern = edgePattern(edge);
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!length) continue;
      const steps = Math.max(1, Math.ceil(length / (tileSize / 2)));
      for (let j = 0; j < steps; j++) {
        add({ x1: a.x + (b.x - a.x) * j / steps, y1: a.y + (b.y - a.y) * j / steps,
          x2: a.x + (b.x - a.x) * (j + 1) / steps, y2: a.y + (b.y - a.y) * (j + 1) / steps,
          distance: distance + length * j / steps, pattern, arrow: i === points.length - 1 && j === steps - 1 });
      }
      distance += length;
    }
  }
  return new RBush().load([...tiles.values()]);
}

export function nodeIndex(nodes) {
  return new RBush().load(nodes.map(node => ({ minX: node.x - node.width / 2, minY: node.y - node.height / 2,
    maxX: node.x + node.width / 2, maxY: node.y + node.height / 2, node })));
}

// A distant camera can see thousands of small edge tiles. Group nearby leaves
// for fewer draw calls without dropping or simplifying any edge segments.
export function coarsenEdgeTiles(tree, groupSize = 64) {
  const tiles = tree.all(), groups = [];
  for (let start = 0; start < tiles.length; start += groupSize) {
    const group = { key: `coarse:${start}`, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, segments: [] };
    for (const tile of tiles.slice(start, start + groupSize)) {
      group.minX = Math.min(group.minX, tile.minX); group.minY = Math.min(group.minY, tile.minY);
      group.maxX = Math.max(group.maxX, tile.maxX); group.maxY = Math.max(group.maxY, tile.maxY);
      for (const segment of tile.segments) group.segments.push(segment);
    }
    groups.push(group);
  }
  return new RBush().load(groups);
}

export function hitTest(index, camera, px, py) {
  const x = (px - camera.tx) / camera.scale, y = (py - camera.ty) / camera.scale;
  const node = index.search({ minX: x, minY: y, maxX: x, maxY: y })[0]?.node;
  if (!node) return null;
  return { id: node.id, toggle: node.children.length > 0 && Math.abs(x - (node.x + node.width / 2 - 28)) <= 15 && Math.abs(y - node.y) <= 15 };
}

export function highlightState(graph, view, activeId, path, depth) {
  const required = new Set(path?.node_ids), shells = new Set(path?.container_ids), requiredEdges = new Set(path?.edge_indices);
  const connected = new Set(activeId ? [activeId] : []);
  const related = new Set();
  for (const edge of view.edges) {
    const matches = edge.indices.some(index => depth === 'apply' || graph.edges[index].min_depth !== 'apply');
    const adjacent = matches && (edge.from === activeId || edge.to === activeId);
    if (adjacent) { connected.add(edge.from); connected.add(edge.to); }
    if (path ? edge.indices.some(index => requiredEdges.has(index)) : adjacent) related.add(edge);
  }
  const nodes = new Map(view.nodes.map(node => [node.id, {
    active: node.id === activeId, target: path?.target_id === node.id, path: Boolean(path && required.has(node.id)),
    dimmed: path ? !required.has(node.id) && !shells.has(node.id) : Boolean(activeId && !connected.has(node.id)),
    allowed: !path || required.has(node.id), toggleAllowed: !path || required.has(node.id) || shells.has(node.id)
  }]));
  return { nodes, related, dimmed: Boolean(path || activeId) };
}
