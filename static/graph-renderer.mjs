import { WebGLRenderer, Container, Graphics, BitmapText, BitmapFont, Buffer, BufferUsage, Geometry, Mesh, Shader } from 'pixi.js';
import { overviewMesh } from './graph-overview.mjs';
import { buildEdgeTiles, coarsenEdgeTiles, createNodeWindow, nodeIndex, hitTest, viewportBounds, highlightState, CARD_DETAIL_SCALE } from './graph-geometry.mjs';

const vertex = `
precision highp float;
in vec2 aPosition;
in vec2 aNormal;
in float aDistance;
in vec2 aPattern;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uScale;
uniform float uWidth;
out float vDistance;
out vec2 vPattern;
void main() {
  vec2 position = aPosition + aNormal * (uWidth * .5 / uScale);
  vec3 projected = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(position, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
  vDistance = aDistance * uScale;
  vPattern = aPattern;
}`;
const fragment = `
precision highp float;
in float vDistance;
in vec2 vPattern;
uniform vec4 uEdgeColor;
out vec4 finalColor;
void main() {
  if (vPattern.x > 0.0 && mod(vDistance, vPattern.x) > vPattern.y) discard;
  finalColor = vec4(uEdgeColor.rgb * uEdgeColor.a, uEdgeColor.a);
}`;

function edgeShader(width, color, alpha) {
  return Shader.from({ gl: { vertex, fragment }, resources: { styleUniforms: {
    uScale: { value: 1, type: 'f32' }, uWidth: { value: width, type: 'f32' },
    uEdgeColor: { value: [...rgb(color), alpha], type: 'vec4<f32>' }
  } } });
}
function rgb(hex) { return [16, 8, 0].map(shift => ((Number.parseInt(hex.slice(1), 16) >> shift) & 255) / 255); }
function mix(first, second, ratio) {
  const a = rgb(first), b = rgb(second);
  return '#' + a.map((v, i) => Math.round((v * ratio + b[i] * (1 - ratio)) * 255).toString(16).padStart(2, '0')).join('');
}
function edgeMesh(tile, shader) {
  const arrowCount = tile.segments.reduce((count, segment) => count + Number(segment.arrow), 0);
  const data = new Float32Array((tile.segments.length * 4 + arrowCount * 3) * 7);
  const indices = new Uint32Array(tile.segments.length * 6 + arrowCount * 3);
  let cursor = 0, indexCursor = 0;
  function point(x, y, nx, ny, distance, pattern) {
    data[cursor++] = x; data[cursor++] = y; data[cursor++] = nx; data[cursor++] = ny;
    data[cursor++] = distance; data[cursor++] = pattern[0]; data[cursor++] = pattern[1];
  }
  for (const s of tile.segments) {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), dx = (s.x2 - s.x1) / length, dy = (s.y2 - s.y1) / length;
    let base = cursor / 7;
    point(s.x1, s.y1, -dy, dx, s.distance, s.pattern); point(s.x1, s.y1, dy, -dx, s.distance, s.pattern);
    point(s.x2, s.y2, -dy, dx, s.distance + length, s.pattern); point(s.x2, s.y2, dy, -dx, s.distance + length, s.pattern);
    indices.set([base, base + 1, base + 2, base + 2, base + 1, base + 3], indexCursor); indexCursor += 6;
    if (s.arrow) {
      base = cursor / 7;
      point(s.x2, s.y2, 0, 0, 0, [0, 0]);
      point(s.x2, s.y2, -10 * dx + 5 * dy, -10 * dy - 5 * dx, 0, [0, 0]);
      point(s.x2, s.y2, -10 * dx - 5 * dy, -10 * dy + 5 * dx, 0, [0, 0]);
      indices.set([base, base + 1, base + 2], indexCursor); indexCursor += 3;
    }
  }
  const buffer = new Buffer({ data, usage: BufferUsage.VERTEX });
  const geometry = new Geometry({ attributes: {
    aPosition: { buffer, format: 'float32x2', stride: 28, offset: 0 },
    aNormal: { buffer, format: 'float32x2', stride: 28, offset: 8 },
    aDistance: { buffer, format: 'float32', stride: 28, offset: 16 },
    aPattern: { buffer, format: 'float32x2', stride: 28, offset: 20 }
  }, indexBuffer: indices });
  const mesh = new Mesh({ geometry, shader });
  mesh.eventMode = 'none';
  return mesh;
}

let nextFont = 0;
export async function create({ element, onContextChange = () => {} }) {
  let renderer, canvas, context;
  try {
    renderer = new WebGLRenderer();
    await renderer.init({ antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, backgroundAlpha: 0,
      width: element.clientWidth, height: element.clientHeight });
    canvas = renderer.canvas;
  } catch (error) {
    renderer = null;
    // Keep the map usable when WebGL is unavailable (remote desktops, disabled GPU).
    canvas = document.createElement('canvas'); context = canvas.getContext('2d');
    if (!context) throw error;
  }
  element.append(canvas);
  element.dataset.renderer = renderer ? 'webgl' : 'canvas2d';
  canvas.setAttribute('aria-hidden', 'true');
  const world = new Container({ isRenderGroup: true, eventMode: 'none', interactiveChildren: false });
  // Keep cached glyph batches independent of edge/lane visibility changes.
  const layers = Array.from({ length: 7 }, (_, i) => new Container({ isRenderGroup: i === 6, eventMode: 'none', interactiveChildren: false }));
  world.addChild(...layers);
  let overview = null, nodeNumbers = new Map();
  let view, graph, camera = { tx: 0, ty: 0, scale: 1 }, width = 1, height = 1;
  let index = nodeIndex([]), edges, coarseEdges, selectedEdges, hoverEdges, positions = new Map();
  let queryNodeWindow = createNodeWindow(index);
  let selection = { nodes: new Map(), related: new Set(), dimmed: false }, expanded = new Set(), path = null;
  let hovered = null, hoverDirty = true, disposed = false;
  const hoverSet = new Set(), nodeHandles = new Map();
  const nodeCache = new Map(), tileCaches = [new Map(), new Map(), new Map()];
  let visibleNodes = new Set(), visibleTiles = [new Set(), new Set(), new Set()];
  const media = matchMedia('(prefers-color-scheme: dark)');
  let palette;
  const fontId = `Map${++nextFont}`;
  let fontChars = '';
  const measure = document.createElement('canvas').getContext('2d');
  const metrics = { frames: 0, lastRenderMs: 0, visibleNodes: 0, visibleEdgeTiles: 0, cachedNodes: 0, backend: element.dataset.renderer };
  let shaders = [];
  const interactions = window.GraphInteractions.createRenderer({
    onTransform(value) { camera = value; }, onPaint: draw,
    onNodeHover(node, value) { if (value) hovered = node.id; else if (hovered === node.id) hovered = null; },
    onEdgeHover(edge, value) { if (value) hoverSet.add(edge); else hoverSet.delete(edge); hoverDirty = true; }
  });

  function destroyObject(object) {
    object.parent?.removeChild(object);
    if (object instanceof Mesh) object.geometry.destroy(true);
    if (object.ownsShader) object.shader.destroy();
    object.destroy({ children: true });
  }
  function clearCache(cache) { for (const object of cache.values()) destroyObject(object); cache.clear(); }
  function resetTiles(which) { clearCache(tileCaches[which]); visibleTiles[which] = new Set(); }
  function resetOverview() { if (overview) { destroyObject(overview); overview = null; } }
  function resetNodes() { clearCache(nodeCache); visibleNodes = new Set(); }
  function setTheme() {
    palette = media.matches ? { surface: '#111a2e', text: '#e8edf7', muted: '#93a0b5', border: '#2a3851', edge: '#72819a' }
      : { surface: '#ffffff', text: '#162033', muted: '#687386', border: '#d7deea', edge: '#7b879b' };
    if (renderer) {
      tileCaches.forEach((_, i) => resetTiles(i));
      shaders.forEach(shader => shader.destroy());
      shaders = [edgeShader(1.25, palette.edge, .28), edgeShader(3, '#22c55e', 1), edgeShader(2, '#22c55e', .8)];
      resetNodes(); resetOverview(); buildBackground();
    }
    interactions.invalidate();
  }
  function resize() {
    width = Math.max(1, element.clientWidth); height = Math.max(1, element.clientHeight);
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    if (renderer) renderer.resize(width, height, resolution);
    else { canvas.width = width * resolution; canvas.height = height * resolution; }
    interactions.invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(element); media.addEventListener('change', setTheme);
  canvas.addEventListener('webglcontextlost', () => onContextChange(false));
  canvas.addEventListener('webglcontextrestored', () => { onContextChange(true); interactions.invalidate(); });

  function text(value, size, bold = false, color = palette.text) {
    return new BitmapText({ text: value, style: { fontFamily: `${fontId}${bold ? 'Bold' : 'Regular'}`, fontSize: size, fill: color } });
  }
  function installFonts() {
    const chars = [...new Set(' 0123456789+−·…' + view.nodes.map(n => n.title + n.level).join('') + view.lanes.map(l => l.label).join('') + 'required components')].join('');
    if ([...chars].every(c => fontChars.includes(c))) return;
    resetNodes();
    for (const bold of [false, true]) {
      const name = `${fontId}${bold ? 'Bold' : 'Regular'}`;
      if (fontChars) BitmapFont.uninstall(name);
      BitmapFont.install({ name, chars, style: { fontFamily: 'Arial', fontSize: 26, fontWeight: bold ? 'bold' : 'normal', fill: '#ffffff' }, resolution: 2, skipKerning: true });
    }
    fontChars = chars;
  }
  function clipped(value, maxWidth) {
    if (measure.measureText(value).width <= maxWidth) return value;
    let result = value;
    while (result.length && measure.measureText(result + '…').width > maxWidth) result = result.slice(0, -1);
    return result.trimEnd() + '…';
  }
  function titleLines(value, maxWidth) {
    measure.font = 'bold 12.5px Arial';
    const words = value.split(/\s+/), lines = [];
    let line = '';
    while (words.length) {
      const word = words.shift(), next = line ? `${line} ${word}` : word;
      if (measure.measureText(next).width <= maxWidth) line = next;
      else if (line) { lines.push(line); line = ''; words.unshift(word); }
      else {
        let end = 1;
        while (end < word.length && measure.measureText(word.slice(0, end + 1)).width <= maxWidth) end++;
        lines.push(word.slice(0, end)); if (end < word.length) words.unshift(word.slice(end));
      }
      if (lines.length === 2) { lines.push(clipped([line, ...words].filter(Boolean).join(' '), maxWidth)); return lines; }
    }
    if (line) lines.push(line);
    return lines;
  }
  function nodeMeta(node) {
    const topic = topicLabels.get(node.topics[0]);
    const count = path ? node.children.filter(id => requiredIds.has(id)).length : node.children.length;
    return node.children.length ? `${count}${path ? ' required' : ''} components · ${node.level.replaceAll('_', ' ')}`
      : `${topic || node.topics[0]} · ${node.level.replaceAll('_', ' ')}`;
  }
  const status = { foundational: '#94a3b8', established_biology: '#22c55e', active_preclinical: '#f59e0b', early_clinical: '#38bdf8', clinical_platform: '#8b5cf6', speculative: '#fb7185' };
  let topics = new Map(), topicLabels = new Map(), requiredIds = new Set();
  function makeNode(node) {
    const group = new Container({ eventMode: 'none' }); group.position.set(node.x, node.y);
    group.shape = null; group.paintKey = '';
    group.color = topics.get(node.topics[0]) || '#64748b';
    const title = text(titleLines(node.title, node.width - (node.children.length ? 78 : 50)).join('\n'), 12.5, true);
    title.position.set(-node.width / 2 + 28, -33); group.addChild(title); group.titleLabel = title;
    if (node.children.length) {
      const symbol = text(expanded.has(node.id) ? '−' : '+', 21);
      symbol.anchor.set(.5); symbol.position.set(node.width / 2 - 28, 0); group.addChild(symbol);
    }
    measure.font = '9.5px Arial';
    const meta = text(clipped(nodeMeta(node), node.width - 44), 9.5, false, palette.muted);
    meta.position.set(-node.width / 2 + 28, 23); group.addChild(meta); group.metaLabel = meta;
    return group;
  }
  function paintNode(group, node, detailed) {
    const flags = selection.nodes.get(node.id) || {};
    const hover = hovered === node.id && flags.allowed;
    const key = [flags.active, flags.path, flags.target, flags.dimmed, hover, detailed].join(':');
    if (group.paintKey === key) return;
    group.paintKey = key; group.alpha = flags.dimmed ? .25 : 1;
    if (group.shape) group.shape.visible = detailed;
    // The shared overview mesh draws the card background below these labels.
    if (!detailed) return;
    if (!group.shape) { group.shape = new Graphics(); group.addChildAt(group.shape, 0); }
    const color = flags.target ? '#38bdf8' : flags.path ? '#22c55e' : group.color;
    const stroke = flags.active ? 5 : flags.target || hover ? 4 : flags.path ? 3 : 2;
    const g = group.shape.clear(), x = -node.width / 2;
    g.roundRect(x, -44, node.width, 88, 10)
      .fill(node.children.length ? mix(group.color, palette.surface, .1) : palette.surface).stroke({ color, width: stroke });
    g.roundRect(x + 10, -32, 6, 62, 3).fill(mix(group.color, palette.surface, .18)).stroke({ color: group.color, width: 1 });
    g.circle(node.width / 2 - 14, -30, 5).fill(status[node.status] || '#94a3b8');
    if (node.children.length) g.roundRect(node.width / 2 - 41, -13, 26, 26, 6).fill(palette.surface).stroke({ color: group.color, width: 1 });
  }
  function buildBackground() {
    if (!view || !renderer) return;
    for (const layer of layers.slice(0, 2)) for (const child of layer.removeChildren()) child.destroy({ children: true });
    for (const lane of view.lanes) {
      const group = new Container({ eventMode: 'none' }); group.graphBounds = { minX: 20, minY: lane.y, maxX: view.bounds.width - 20, maxY: lane.y + lane.height };
      group.addChild(new Graphics().roundRect(20, lane.y, view.bounds.width - 40, lane.height, 18)
        .fill(mix(lane.color, palette.surface, .09)).stroke({ color: mix(lane.color, palette.border, .32), width: 1.25 })
        .moveTo(24, lane.y + 44).lineTo(view.bounds.width - 24, lane.y + 44).stroke({ color: mix(lane.color, palette.border, .24), width: 1 }));
      const label = text(lane.label, 18, true, lane.color); label.position.set(36, lane.y + 10); group.addChild(label); layers[0].addChild(group);
    }
    for (const box of view.containers) {
      const color = topics.get(box.topic) || '#64748b';
      const shape = new Graphics().roundRect(box.x, box.y, box.width, box.height, 16)
        .fill(mix(color, palette.surface, .06)).stroke({ color: mix(color, palette.border, .55), width: 1.5 });
      shape.graphBounds = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
      layers[1].addChild(shape);
    }
  }
  function trimCache(cache, visible, limit) {
    if (cache.size <= Math.max(limit, visible.size * 2)) return;
    for (const [key, object] of cache) {
      if (!visible.has(key)) { destroyObject(object); cache.delete(key); }
      if (cache.size <= Math.max(limit, visible.size * 2)) break;
    }
  }
  function paintTiles(which, tree, bounds) {
    const cache = tileCaches[which], next = new Set();
    if (tree) for (const tile of tree.search(bounds)) {
      next.add(tile.key);
      let mesh = cache.get(tile.key);
      if (!mesh) { mesh = edgeMesh(tile, shaders[which]); cache.set(tile.key, mesh); layers[which + 2].addChild(mesh); }
      mesh.visible = true;
    }
    for (const key of visibleTiles[which]) if (!next.has(key)) cache.get(key).visible = false;
    visibleTiles[which] = next; trimCache(cache, next, 96);
  }
  function intersects(a, b) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }
  function draw() {
    if (!view || disposed) return;
    const started = performance.now(), bounds = viewportBounds(camera, width, height);
    const detailed = camera.scale >= CARD_DETAIL_SCALE;
    const visible = queryNodeWindow(camera, width, height);
    if (hoverDirty) { hoverEdges = buildEdgeTiles(selection.dimmed ? [] : hoverSet, positions); if (renderer) resetTiles(2); hoverDirty = false; }
    if (renderer) {
      world.position.set(camera.tx, camera.ty); world.scale.set(camera.scale);
      for (const layer of layers.slice(0, 2)) for (const child of layer.children) child.visible = intersects(child.graphBounds, bounds);
      shaders.forEach(shader => { shader.resources.styleUniforms.uniforms.uScale = camera.scale; });
      shaders[0].resources.styleUniforms.uniforms.uEdgeColor = [...rgb(palette.edge), selection.dimmed ? .035 : .28];
      paintTiles(0, detailed ? edges : coarseEdges, bounds);
      paintTiles(1, selectedEdges, bounds);
      paintTiles(2, hoverEdges, bounds);
      layers[5].visible = !detailed;
      if (!detailed) {
        if (!overview) { overview = overviewMesh(view.nodes, selection.nodes, palette, topics); layers[5].addChild(overview); }
        overview.shader.resources.overviewUniforms.uniforms.uOverviewScale = camera.scale;
        overview.shader.resources.overviewUniforms.uniforms.uHoverIndex = selection.nodes.get(hovered)?.allowed ? nodeNumbers.get(hovered) : -1;
      }
      const next = new Set();
      for (const { node } of visible) {
        next.add(node.id);
        let object = nodeCache.get(node.id);
        if (!object) { object = makeNode(node); nodeCache.set(node.id, object); layers[6].addChild(object); }
        object.visible = true; paintNode(object, node, detailed);
      }
      for (const id of visibleNodes) if (!next.has(id)) nodeCache.get(id).visible = false;
      visibleNodes = next; trimCache(nodeCache, next, 512);
      renderer.render({ container: world });
    } else drawCanvas(bounds, visible);
    metrics.frames++; metrics.visibleNodes = visible.length;
    metrics.visibleEdgeTiles = visibleTiles.reduce((sum, set) => sum + set.size, 0);
    metrics.cachedNodes = nodeCache.size; metrics.lastRenderMs = performance.now() - started;
  }

  function drawCanvas(bounds, visible) {
    const c = context, resolution = canvas.width / width;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(resolution * camera.scale, 0, 0, resolution * camera.scale, resolution * camera.tx, resolution * camera.ty);
    for (const lane of view.lanes) {
      if (lane.y > bounds.maxY || lane.y + lane.height < bounds.minY) continue;
      c.fillStyle = mix(lane.color, palette.surface, .09); c.fillRect(20, lane.y, view.bounds.width - 40, lane.height);
      c.fillStyle = lane.color; c.font = 'bold 18px Arial'; c.fillText(lane.label, 36, lane.y + 29);
    }
    for (const box of view.containers) {
      if (!intersects({ minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height }, bounds)) continue;
      const color = topics.get(box.topic) || '#64748b';
      c.beginPath(); c.roundRect(box.x, box.y, box.width, box.height, 16); c.fillStyle = mix(color, palette.surface, .06); c.fill(); c.strokeStyle = color; c.lineWidth = 1.5; c.stroke();
    }
    function lines(tree, color, alpha, lineWidth) {
      if (!tree) return;
      c.strokeStyle = color; c.fillStyle = color; c.globalAlpha = alpha; c.lineWidth = lineWidth / camera.scale;
      for (const tile of tree.search(bounds)) for (const s of tile.segments) {
        c.setLineDash(s.pattern[0] ? [s.pattern[1] / camera.scale, (s.pattern[0] - s.pattern[1]) / camera.scale] : []);
        c.lineDashOffset = -s.distance; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
        if (s.arrow) {
          const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), size = 6 * lineWidth / camera.scale;
          c.beginPath(); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 - Math.cos(angle - .45) * size, s.y2 - Math.sin(angle - .45) * size);
          c.lineTo(s.x2 - Math.cos(angle + .45) * size, s.y2 - Math.sin(angle + .45) * size); c.fill();
        }
      }
      c.setLineDash([]); c.globalAlpha = 1;
    }
    lines(edges, palette.edge, selection.dimmed ? .035 : .28, 1.25);
    lines(selectedEdges, '#22c55e', 1, 3); lines(hoverEdges, '#22c55e', .8, 2);
    for (const { node } of visible) {
      const flags = selection.nodes.get(node.id) || {}, color = topics.get(node.topics[0]) || '#64748b', x = node.x - node.width / 2;
      c.globalAlpha = flags.dimmed ? .25 : 1;
      c.beginPath(); c.roundRect(x, node.y - 44, node.width, 88, 10); c.fillStyle = node.children.length ? mix(color, palette.surface, .1) : palette.surface; c.fill();
      c.strokeStyle = flags.target ? '#38bdf8' : flags.path ? '#22c55e' : color;
      c.lineWidth = flags.active ? 5 : hovered === node.id ? 4 : flags.path ? 3 : 2; c.stroke();
      c.fillStyle = status[node.status] || '#94a3b8'; c.beginPath(); c.arc(node.x + node.width / 2 - 14, node.y - 30, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = palette.text; c.font = 'bold 12.5px Arial';
      titleLines(node.title, node.width - (node.children.length ? 78 : 50)).forEach((line, i) => c.fillText(line, x + 28, node.y - 22 + i * 16));
      if (node.children.length) { c.font = '21px Arial'; c.fillText(expanded.has(node.id) ? '−' : '+', node.x + node.width / 2 - 35, node.y + 7); }
      c.font = measure.font = '9.5px Arial'; c.fillStyle = palette.muted; c.fillText(clipped(nodeMeta(node), node.width - 44), x + 28, node.y + 33);
    }
    c.globalAlpha = 1;
  }

  function refreshHover(depth) {
    hoverSet.clear(); hovered = null; hoverDirty = true;
    interactions.setGraph(nodeHandles, view.edges.filter(edge => edge.indices.some(i => depth === 'apply' || graph.edges[i].min_depth !== 'apply')).map(edge => ({ edge, element: edge })));
  }
  function setHighlight(activeId, nextPath, depth) {
    selection = highlightState(graph, view, activeId, nextPath, depth);
    selectedEdges = buildEdgeTiles(selection.related, positions);
    if (renderer) { resetTiles(1); resetOverview(); }
    refreshHover(depth); interactions.invalidate();
  }
  setTheme(); resize();
  return {
    setGraph(nextGraph, nextView, options) {
      graph = nextGraph; view = nextView; expanded = options.expanded; path = options.path;
      requiredIds = new Set(path?.node_ids); topics = new Map(graph.options.topics.map(topic => [topic.id, topic.color]));
      topicLabels = new Map(graph.options.topics.map(topic => [topic.id, topic.label]));
      nodeNumbers = new Map(view.nodes.map((node, i) => [node.id, i]));
      positions = new Map(view.nodes.map(node => [node.id, node])); index = nodeIndex(view.nodes);
      queryNodeWindow = createNodeWindow(index);
      edges = buildEdgeTiles(view.edges, positions);
      coarseEdges = coarsenEdgeTiles(edges);
      nodeHandles.clear(); for (const node of view.nodes) nodeHandles.set(node.id, node);
      if (renderer) { tileCaches.forEach((_, i) => resetTiles(i)); resetNodes(); installFonts(); buildBackground(); }
      setHighlight(options.activeId, path, options.depth);
    },
    setHighlight,
    setHover(id) { interactions.setHover(id); },
    setTransform(tx, ty, scale) { interactions.setTransform(tx, ty, scale); },
    hitTest(clientX, clientY) { const rect = element.getBoundingClientRect(); return hitTest(index, camera, clientX - rect.left, clientY - rect.top); },
    getCamera() { return { ...camera }; },
    getMetrics() {
      const visibleLabelNodes = renderer ? [...visibleNodes].filter(id => {
        const group = nodeCache.get(id);
        return layers[6].visible && group.visible && group.titleLabel.visible && group.metaLabel.visible;
      }).length : metrics.visibleNodes;
      return { ...metrics, visibleLabelNodes, visibleBaseEdgeTiles: renderer ? visibleTiles[0].size : edges?.search(viewportBounds(camera, width, height)).length || 0,
        cachedEdgeTiles: tileCaches.reduce((sum, cache) => sum + cache.size, 0) };
    },
    dispose() {
      disposed = true; interactions.dispose(); observer.disconnect(); media.removeEventListener('change', setTheme);
      if (renderer) { resetOverview(); resetNodes(); tileCaches.forEach((_, i) => resetTiles(i)); world.destroy({ children: true }); shaders.forEach(shader => shader.destroy()); renderer.destroy(); }
      if (fontChars) for (const weight of ['Bold', 'Regular']) BitmapFont.uninstall(`${fontId}${weight}`);
      canvas.remove();
    }
  };
}
