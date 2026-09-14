/* Touch-only camera math. Points are in CSS pixels relative to the graph. */
(function (root) {
  function createController({ getCamera, onTransform, minScale = .025, maxScale = 2.8, dragThreshold = 5 }) {
    const points = new Map();
    let reference = null, moved = false, tapStart = null;
    const copy = point => ({ x: point.x, y: point.y });
    function rebase() {
      reference = { camera: { ...getCamera() }, points: [...points.entries()].slice(0, 2).map(([id, point]) => ({ id, ...point })) };
    }
    function down(id, point) {
      if (points.has(id)) return;
      if (!points.size) { moved = false; tapStart = copy(point); }
      points.set(id, copy(point));
      if (points.size > 1) moved = true;
      rebase();
    }
    function move(id, point) {
      if (!points.has(id)) return;
      points.set(id, copy(point));
      if (!reference?.points.length) return;
      const [a, b] = reference.points, first = points.get(a.id), camera = reference.camera;
      if (!b) {
        const dx = first.x - a.x, dy = first.y - a.y;
        if (!moved && Math.hypot(dx, dy) < dragThreshold) return;
        moved = true;
        onTransform({ tx: camera.tx + dx, ty: camera.ty + dy, scale: camera.scale });
        return;
      }
      const second = points.get(b.id);
      const startDistance = Math.hypot(b.x - a.x, b.y - a.y);
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      // Coincident initial contacts must not divide by zero or cause a jump.
      if (startDistance < 1) { rebase(); return; }
      const scale = Math.max(minScale, Math.min(maxScale, camera.scale * distance / startDistance));
      const anchorX = ((a.x + b.x) / 2 - camera.tx) / camera.scale;
      const anchorY = ((a.y + b.y) / 2 - camera.ty) / camera.scale;
      onTransform({ scale, tx: (first.x + second.x) / 2 - anchorX * scale,
        ty: (first.y + second.y) / 2 - anchorY * scale });
    }
    function up(id, point, cancelled = false) {
      if (!points.has(id)) return null;
      if (cancelled) moved = true;
      else if (point) move(id, point);
      const end = point ? copy(point) : points.get(id);
      points.delete(id);
      const tap = !points.size && !moved ? { start: tapStart, end } : null;
      // 1→2→1 fingers always starts a new reference at the current camera.
      rebase();
      return tap;
    }
    return {
      down, move, up,
      has: id => points.has(id),
      get active() { return points.size > 0; },
      get moved() { return moved; },
      cancel() { points.clear(); reference = null; moved = true; tapStart = null; }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createController };
  else root.GraphTouch = { createController };
})(typeof window !== 'undefined' ? window : globalThis);
