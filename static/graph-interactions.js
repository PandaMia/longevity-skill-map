/* Paint high-frequency interactions once per frame, touching only changed items. */
(function (root) {
  function createRenderer({ onTransform, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
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
      if (!hoverDirty) return;
      hoverDirty = false;
      const node = nodes.get(hovered) || null;
      const nextEdges = incident.get(hovered) || new Set();
      if (node !== paintedNode) {
        paintedNode?.classList.remove("is-hovered");
        node?.classList.add("is-hovered");
      }
      // An edge shared by the previous and next node stays highlighted.
      for (const element of paintedEdges) {
        if (!nextEdges.has(element)) element.classList.remove("is-hovered");
      }
      for (const element of nextEdges) {
        if (!paintedEdges.has(element)) element.classList.add("is-hovered");
      }
      paintedNode = node;
      paintedEdges = nextEdges;
    }

    return {
      setGraph(nodeElements, edgeElements) {
        // Graph replacement is rare; build the adjacency index once here.
        paintedNode?.classList.remove("is-hovered");
        for (const element of paintedEdges) element.classList.remove("is-hovered");
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
      dispose() {
        if (frame !== null) cancelFrame(frame);
        frame = null;
      }
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { createRenderer };
  else root.GraphInteractions = { createRenderer };
})(typeof window !== "undefined" ? window : globalThis);
