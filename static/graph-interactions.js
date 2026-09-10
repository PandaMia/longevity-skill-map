/* Paint high-frequency interactions once per frame, touching only changed items. */
(function (root) {
  function createRenderer({ onTransform, onPaint = () => {},
    onNodeHover = (node, value) => node.classList[value ? "add" : "remove"]("is-hovered"),
    onEdgeHover = (edge, value) => edge.classList[value ? "add" : "remove"]("is-hovered"),
    requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
    let nodes = new Map(), incident = new Map();
    let hovered = null, paintedNode = null, paintedEdges = new Set();
    let transform = null, hoverDirty = false, transformDirty = false, frame = null;

    function schedule() {
      if (frame === null) frame = requestFrame(paint);
    }

    function paint() {
      frame = null;
      if (transformDirty) {
        transformDirty = false;
        onTransform(transform);
      }
      if (!hoverDirty) { onPaint(); return; }
      hoverDirty = false;
      const node = nodes.get(hovered) || null;
      const nextEdges = incident.get(hovered) || new Set();
      if (node !== paintedNode) {
        if (paintedNode) onNodeHover(paintedNode, false);
        if (node) onNodeHover(node, true);
      }
      // An edge shared by the previous and next node stays highlighted.
      for (const element of paintedEdges) {
        if (!nextEdges.has(element)) onEdgeHover(element, false);
      }
      for (const element of nextEdges) {
        if (!paintedEdges.has(element)) onEdgeHover(element, true);
      }
      paintedNode = node;
      paintedEdges = nextEdges;
      onPaint();
    }

    return {
      setGraph(nodeElements, edgeElements) {
        // Graph replacement is rare; build the adjacency index once here.
        if (paintedNode) onNodeHover(paintedNode, false);
        for (const element of paintedEdges) onEdgeHover(element, false);
        nodes = nodeElements;
        incident = new Map();
        for (const { element, edge } of edgeElements) {
          for (const id of [edge.from, edge.to]) {
            if (!incident.has(id)) incident.set(id, new Set());
            incident.get(id).add(element);
          }
        }
        hovered = null; paintedNode = null; paintedEdges = new Set(); hoverDirty = false;
      },
      setHover(nodeId) {
        const next = nodes.has(nodeId) ? nodeId : null;
        if (next === hovered) return;
        hovered = next;
        hoverDirty = true;
        schedule();
      },
      setTransform(tx, ty, scale) {
        if (transform?.tx === tx && transform.ty === ty && transform.scale === scale) return;
        transform = { tx, ty, scale };
        transformDirty = true;
        schedule();
      },
      invalidate: schedule,
      dispose() {
        if (frame !== null) cancelFrame(frame);
        frame = null;
      }
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { createRenderer };
  else root.GraphInteractions = { createRenderer };
})(typeof window !== "undefined" ? window : globalThis);
