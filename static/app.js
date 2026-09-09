    (() => {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.getElementById("graph");
      const viewport = document.getElementById("viewport");
      const lanesGroup = document.getElementById("lanes");
      const edgesGroup = document.getElementById("edges");
      const nodesGroup = document.getElementById("nodes");
      const loading = document.getElementById("loading");
      const errorBox = document.getElementById("error");
      const details = document.getElementById("details");
      const detailTitle = document.getElementById("detail-title");
      const detailId = document.getElementById("detail-id");
      const detailBody = document.getElementById("detail-body");
      const meta = document.getElementById("meta");
      const searchShell = document.getElementById("search-shell");
      const searchInput = document.getElementById("node-search");
      const searchResults = document.getElementById("search-results");
      const searchStatus = document.getElementById("search-status");
      const legendPanel = document.getElementById("legend-panel");
      const legendToggle = document.getElementById("legend-toggle");
      const statusLegendList = document.getElementById("status-legend-list");
      const topicLegendList = document.getElementById("topic-legend-list");

      const NODE_W = 224;
      const state = { graph: null, view: null, expanded: new Set(), path: null, depth: "understand", detailPayload: null, detailVersion: 0, pathVersion: 0, pathPending: false, pendingTarget: null, scale: 1, tx: 0, ty: 0, panning: false, navigating: false, moved: false, startX: 0, startY: 0, startTx: 0, startTy: 0, activeNode: null, hoverNode: null, gestureScale: 1, searchMatches: [], searchSelection: -1 };
      const nodeElements = new Map();
      const edgeElements = [];
      const topicDefinitions = new Map();
      const containersGroup = document.getElementById("containers");
      const depthSelect = document.getElementById("mastery-depth");
      const pathPanel = document.getElementById("path-panel");
      const pathSteps = document.getElementById("path-steps");
      const notice = document.getElementById("notice");
      let noticeTimer;
      function depthLabel(depth) { return depth === "apply" ? "Work on tasks" : "Understand the topic"; }
      function canExplore(id) { return !state.path || state.path.node_ids.includes(id); }
      function showNotice(message) {
        notice.textContent = message; notice.hidden = false;
        clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
      }
      function effectiveDepth(id) {
        return state.path?.steps.find(step => step.node_id === id)?.depth || state.depth;
      }
      const interactionRenderer = GraphInteractions.createRenderer({
        onTransform: ({ tx, ty, scale }) => viewport.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`)
      });
      let navigationTimer;
      function pauseHoverForNavigation() {
        if (!state.navigating) {
          state.navigating = true;
          svg.classList.add("is-navigating");
          clearHighlight();
        }
        clearTimeout(navigationTimer);
        navigationTimer = setTimeout(() => {
          if (!state.panning) {
            state.navigating = false;
            svg.classList.remove("is-navigating");
          }
        }, 120);
      }


      function svgElement(name, attributes = {}) {
        const element = document.createElementNS(NS, name);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
        return element;
      }

      function topicLabel(topic) {
        return topicDefinitions.get(topic)?.label || humanizeLabel(topic);
      }

      function topicColor(topic) {
        return topicDefinitions.get(topic)?.color || "#64748b";
      }

      function statusColor(status) {
        return {
          foundational: "#94a3b8",
          established_biology: "#22c55e",
          active_preclinical: "#f59e0b",
          early_clinical: "#38bdf8",
          clinical_platform: "#8b5cf6",
          speculative: "#fb7185"
        }[status] || "#94a3b8";
      }

      function humanizeLabel(value) {
        return value.replaceAll("_", " ");
      }

      function normalizeSearchText(value) {
        return String(value || "")
          .toLocaleLowerCase()
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .replaceAll("_", " ")
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim();
      }

      function searchNode(node, normalizedQuery, terms) {
        const title = normalizeSearchText(node.title);
        const id = normalizeSearchText(node.id);
        const summary = normalizeSearchText(node.summary);
        const evidence = normalizeSearchText(node.evidence_note);
        const metadata = normalizeSearchText([
          node.kind,
          node.level,
          node.status,
          ...node.topics.flatMap(topic => [topic, topicLabel(topic)])
        ].join(" "));
        const completeText = `${title} ${id} ${summary} ${evidence} ${metadata}`;
        if (!terms.every(term => completeText.includes(term))) return null;

        let score = 0;
        if (title === normalizedQuery) score += 500;
        else if (title.startsWith(normalizedQuery)) score += 250;
        else if (title.includes(normalizedQuery)) score += 160;
        if (id === normalizedQuery) score += 220;
        else if (id.startsWith(normalizedQuery)) score += 120;
        else if (id.includes(normalizedQuery)) score += 70;
        if (summary.includes(normalizedQuery)) score += 90;
        if (evidence.includes(normalizedQuery)) score += 70;
        if (metadata.includes(normalizedQuery)) score += 30;

        const titleWords = new Set(title.split(" "));
        for (const term of terms) {
          if (titleWords.has(term)) score += 50;
          else if (title.includes(term)) score += 25;
          if (id.includes(term)) score += 15;
          if (summary.includes(term)) score += 8;
          if (evidence.includes(term)) score += 6;
          if (metadata.includes(term)) score += 4;
        }
        return { node, score };
      }

      function contentSnippet(node, terms) {
        const candidates = [node.summary, node.evidence_note].filter(Boolean);
        const content = candidates.find(value => {
          const normalized = normalizeSearchText(value);
          return terms.some(term => normalized.includes(term));
        }) || node.summary;
        const compact = content.replace(/\s+/g, " ").trim();
        if (compact.length <= 170) return compact;

        const normalized = normalizeSearchText(compact);
        const firstMatch = terms
          .map(term => normalized.indexOf(term))
          .filter(index => index >= 0)
          .sort((a, b) => a - b)[0] || 0;
        const start = Math.max(0, firstMatch - 55);
        const end = Math.min(compact.length, start + 170);
        return `${start > 0 ? "…" : ""}${compact.slice(start, end).trim()}${end < compact.length ? "…" : ""}`;
      }

      function setSearchSelection(index) {
        const options = [...searchResults.querySelectorAll(".search-result")];
        if (!options.length) {
          state.searchSelection = -1;
          searchInput.removeAttribute("aria-activedescendant");
          return;
        }
        state.searchSelection = (index + options.length) % options.length;
        for (const [optionIndex, option] of options.entries()) {
          const selected = optionIndex === state.searchSelection;
          option.setAttribute("aria-selected", String(selected));
          if (selected) {
            searchInput.setAttribute("aria-activedescendant", option.id);
            option.scrollIntoView({ block: "nearest" });
          }
        }
      }

      function closeSearchResults() {
        searchResults.hidden = true;
        searchInput.setAttribute("aria-expanded", "false");
        searchInput.removeAttribute("aria-activedescendant");
        state.searchSelection = -1;
      }

      function selectSearchResult(nodeId) {
        closeSearchResults();
        openNode(nodeId, true);
      }

      function renderSearchResults() {
        const normalizedQuery = normalizeSearchText(searchInput.value);
        if (!normalizedQuery || !state.graph) {
          state.searchMatches = [];
          searchResults.replaceChildren();
          searchStatus.textContent = "";
          closeSearchResults();
          return;
        }

        const terms = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
        state.searchMatches = state.graph.nodes
          .filter(node => canExplore(node.id))
          .map(node => searchNode(node, normalizedQuery, terms))
          .filter(Boolean)
          .sort((left, right) => right.score - left.score || left.node.title.localeCompare(right.node.title))
          .slice(0, 8);
        searchResults.replaceChildren();

        if (!state.searchMatches.length) {
          const empty = document.createElement("div");
          empty.className = "search-empty";
          empty.textContent = "No matching nodes";
          searchResults.append(empty);
        } else {
          for (const [index, match] of state.searchMatches.entries()) {
            const result = document.createElement("button");
            result.type = "button";
            result.className = "search-result";
            result.id = `search-result-${index}`;
            result.setAttribute("role", "option");
            result.setAttribute("aria-selected", "false");

            const title = document.createElement("strong");
            title.textContent = match.node.title;
            const metadata = document.createElement("span");
            metadata.className = "search-result-meta";
            metadata.textContent = `${topicLabel(match.node.topics[0])} · ${humanizeLabel(match.node.level)}`;
            const snippet = document.createElement("span");
            snippet.className = "search-result-snippet";
            snippet.textContent = contentSnippet(match.node, terms);
            result.append(title, metadata, snippet);
            result.addEventListener("mouseenter", () => setSearchSelection(index));
            result.addEventListener("click", () => selectSearchResult(match.node.id));
            searchResults.append(result);
          }
        }

        state.searchSelection = -1;
        searchInput.removeAttribute("aria-activedescendant");
        searchResults.hidden = false;
        searchInput.setAttribute("aria-expanded", "true");
        const count = state.searchMatches.length;
        searchStatus.textContent = count ? `${count} matching ${count === 1 ? "node" : "nodes"}` : "No matching nodes";
      }

      function statusLegendItem(label, color) {
        const item = document.createElement("div");
        item.className = "status-legend-item";
        const swatch = document.createElement("span");
        swatch.className = "status-color-swatch";
        swatch.style.setProperty("--swatch-color", color);
        const text = document.createElement("span");
        text.className = "status-legend-label";
        text.textContent = humanizeLabel(label);
        item.append(swatch, text);
        return item;
      }

      function renderStatusLegend(options) {
        const statusOrder = ["foundational", "established_biology", "active_preclinical", "early_clinical", "clinical_platform", "speculative"];
        statusLegendList.replaceChildren(...statusOrder
          .filter(status => options.statuses.includes(status))
          .map(status => statusLegendItem(status, statusColor(status))));
        topicLegendList.replaceChildren(...options.topics.map(topic => {
          const item = document.createElement("div");
          item.className = "topic-legend-item";
          const swatch = document.createElement("span");
          swatch.className = "topic-color-swatch";
          swatch.style.setProperty("--swatch-color", topic.color);
          const label = document.createElement("span");
          label.className = "topic-legend-label";
          label.textContent = topic.label;
          item.append(swatch, label);
          return item;
        }));
      }

      function renderTopicLanes(graph) {
        lanesGroup.replaceChildren();
        for (const lane of graph.lanes) {
          const group = svgElement("g", { class: "topic-lane", "data-topic": lane.id });
          group.style.setProperty("--lane-color", lane.color);
          group.append(svgElement("rect", {
            class: "topic-lane-background",
            x: 20,
            y: lane.y,
            width: graph.bounds.width - 40,
            height: lane.height,
            rx: 18
          }));
          const label = svgElement("text", { class: "topic-lane-label", x: 36, y: lane.y + 29 });
          label.textContent = lane.label;
          group.append(label);
          group.append(svgElement("line", {
            class: "topic-lane-rule",
            x1: 24,
            y1: lane.y + 44,
            x2: graph.bounds.width - 24,
            y2: lane.y + 44
          }));
          lanesGroup.append(group);
        }
      }

      function edgePath(source, target) {
        const sx = source.x + (source.width || NODE_W) / 2;
        const sy = source.y;
        const tx = target.x - (target.width || NODE_W) / 2;
        const ty = target.y;
        const dx = tx - sx;
        if (dx >= 20) {
          const bend = Math.max(45, dx * .45);
          return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
        }
        const offset = 90 + Math.abs(ty - sy) * .18;
        return `M ${sx} ${sy} C ${sx + offset} ${sy}, ${tx + offset} ${ty}, ${tx} ${ty}`;
      }

      function renderGraph(graph, fit = false) {
        state.graph = graph;
        const view = GraphView.createView(graph, state.expanded, state.path);
        state.view = view;
        topicDefinitions.clear();
        for (const topic of graph.options.topics) topicDefinitions.set(topic.id, topic);
        renderTopicLanes(view);
        containersGroup.replaceChildren();
        edgesGroup.replaceChildren();
        nodesGroup.replaceChildren();
        nodeElements.clear();
        edgeElements.length = 0;
        const positions = new Map(view.nodes.map(node => [node.id, node]));
        for (const box of view.containers) {
          const rect = svgElement("rect", { x: box.x, y: box.y, width: box.width, height: box.height, rx: 16, class: "container-boundary" });
          rect.style.setProperty("--container-color", topicColor(box.topic));
          rect.dataset.container = box.id;
          containersGroup.append(rect);
        }
        for (const edge of view.edges) {
          const source = positions.get(edge.from), target = positions.get(edge.to);
          const path = svgElement("path", { d: edgePath(source, target), class: `edge ${edge.type} ${edge.strength}`, "marker-end": "url(#arrow)" });
          path.dataset.from = edge.from; path.dataset.to = edge.to; path.dataset.type = edge.type;
          edgesGroup.append(path); edgeElements.push({ element: path, edge });
        }
        for (const node of view.nodes) {
          const expandable = node.children.length > 0;
          const group = svgElement("g", { class: `node${expandable ? " container-node" : ""}${node.parent_id ? " component-node" : ""}`, transform: `translate(${node.x} ${node.y})`, tabindex: "0", role: "button", "aria-label": node.title });
          group.dataset.id = node.id;
          group.style.setProperty("--node-color", topicColor(node.topics[0]));
          group.style.setProperty("--status-color", statusColor(node.status));
          group.append(svgElement("rect", { class: "node-card", x: -node.width / 2, y: -44, width: node.width, height: 88 }));
          group.append(svgElement("rect", { class: "kind-mark", x: -node.width / 2 + 10, y: -32, width: 6, height: 62, rx: 3 }));
          group.append(svgElement("circle", { class: "status-dot", cx: node.width / 2 - 14, cy: -30, r: 5 }));
          const titleObject = svgElement("foreignObject", { x: -node.width / 2 + 28, y: -33, width: node.width - (expandable ? 78 : 50), height: 49 });
          const title = document.createElement("div"); title.className = "node-title-box"; title.textContent = node.title; title.title = node.title;
          titleObject.append(title); group.append(titleObject);
          const metaObject = svgElement("foreignObject", { x: -node.width / 2 + 28, y: 23, width: node.width - 44, height: 15 });
          const metaText = document.createElement("div"); metaText.className = "node-meta-box";
          const componentCount = state.path ? node.children.filter(id => state.path.node_ids.includes(id)).length : node.children.length;
          metaText.textContent = expandable ? `${componentCount}${state.path ? " required" : ""} components · ${humanizeLabel(node.level)}` : `${topicLabel(node.topics[0])} · ${humanizeLabel(node.level)}`;
          metaObject.append(metaText); group.append(metaObject);
          if (expandable) {
            const toggle = svgElement("g", { class: "container-toggle", transform: `translate(${node.width / 2 - 28} 0)`, role: "button", tabindex: "0", "aria-label": `${state.expanded.has(node.id) ? "Collapse" : "Expand"} ${node.title}`, "aria-expanded": state.expanded.has(node.id) });
            toggle.append(svgElement("rect", { x: -13, y: -13, width: 26, height: 26, rx: 6 }));
            const symbol = svgElement("text", { x: 0, y: 6, "text-anchor": "middle" }); symbol.textContent = state.expanded.has(node.id) ? "−" : "+";
            toggle.append(symbol);
            toggle.addEventListener("click", event => { event.stopPropagation(); toggleContainer(node.id); });
            toggle.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); toggleContainer(node.id); } });
            group.append(toggle);
          }
          group.addEventListener("mouseenter", () => highlightNode(node.id));
          group.addEventListener("mouseleave", clearHighlight);
          group.addEventListener("focus", () => highlightNode(node.id));
          group.addEventListener("blur", clearHighlight);
          group.addEventListener("click", () => { if (!state.moved) openNode(node.id); });
          group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNode(node.id); } });
          nodesGroup.append(group); nodeElements.set(node.id, group);
        }
        meta.textContent = `${graph.nodes.length} skills & topics · ${graph.nodes.filter(node => node.children.length).length} containers`;
        refreshHoverGraph();
        state.hoverNode = null;
        renderStatusLegend(graph.options); applyHighlight();
        if (fit) fitGraph();
      }

      function toggleContainer(id) {
        if (state.pathPending) return;
        if (state.path && !state.path.container_ids.includes(id) && !state.path.node_ids.includes(id)) return;
        const position = state.view.nodes.find(node => node.id === id);
        if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
        renderGraph(state.graph);
        // Keep the header anchored while the rest of its lane reflows.
        const next = state.view.nodes.find(node => node.id === id);
        if (position && next) { state.tx += (position.x - next.x) * state.scale; state.ty += (position.y - next.y) * state.scale; applyTransform(); }
        if (state.expanded.has(id)) {
          const box = state.view.containers.find(item => item.id === id);
          if (box) {
            const rect = svg.getBoundingClientRect();
            const availableWidth = Math.max(260, rect.width - (details.hidden ? 0 : Math.min(462, rect.width * .4)));
            state.scale = Math.min(1, (availableWidth - 48) / box.width, (rect.height - 64) / box.height);
            state.tx = availableWidth / 2 - (box.x + box.width / 2) * state.scale;
            state.ty = rect.height / 2 - (box.y + box.height / 2) * state.scale;
            applyTransform();
          }
        }
        if (state.detailPayload) renderDetails(state.detailPayload);
      }

      function refreshHoverGraph() {
        interactionRenderer.setGraph(nodeElements, edgeElements.filter(item =>
          GraphView.edgeMatchesDepth(state.graph, item.edge, state.depth)));
      }

      function applyHighlight() {
        // Only an explicit selection dims the graph. Pointer hover stays local.
        const highlightedNodes = [state.activeNode].filter(Boolean);
        interactionRenderer.setHover(state.hoverNode);
        const highlightedSet = new Set(highlightedNodes);
        const connected = new Set(highlightedNodes);
        const required = new Set(state.path?.node_ids || []);
        const requiredEdges = new Set(state.path?.edge_indices || []);
        for (const item of edgeElements) {
          const related = (highlightedSet.has(item.edge.from) || highlightedSet.has(item.edge.to))
            && GraphView.edgeMatchesDepth(state.graph, item.edge, state.depth);
          const onPath = state.path && item.edge.indices.some(index => requiredEdges.has(index));
          item.element.classList.toggle("is-related", state.path ? onPath : related);
          item.element.classList.toggle("is-dimmed", state.path ? !onPath : highlightedNodes.length > 0 && !related);
          if (related) { connected.add(item.edge.from); connected.add(item.edge.to); }
        }
        for (const [id, element] of nodeElements) {
          const shell = state.path?.container_ids.includes(id);
          const allowed = !state.path || required.has(id);
          element.classList.toggle("is-active", state.activeNode === id);
          element.classList.toggle("is-target", state.path?.target_id === id);
          element.classList.toggle("is-path", Boolean(state.path && required.has(id)));
          element.classList.toggle("is-dimmed", state.path ? !allowed && !shell : highlightedNodes.length > 0 && !connected.has(id));
          element.classList.toggle("is-unavailable", !allowed);
          element.setAttribute("aria-disabled", String(!allowed));
          element.setAttribute("tabindex", allowed ? "0" : "-1");
          const toggle = element.querySelector(".container-toggle");
          if (toggle) { toggle.setAttribute("tabindex", allowed || shell ? "0" : "-1"); toggle.setAttribute("aria-disabled", String(!(allowed || shell))); }
        }
      }

      function highlightNode(nodeId) {
        if (state.panning || state.navigating || !canExplore(nodeId)) return;
        state.hoverNode = nodeId;
        interactionRenderer.setHover(nodeId);
      }

      function clearHighlight() {
        state.hoverNode = null;
        interactionRenderer.setHover(null);
      }

      function applyTransform() {
        interactionRenderer.setTransform(state.tx, state.ty, state.scale);
      }

      function fitGraph() {
        if (!state.graph) return;
        const rect = svg.getBoundingClientRect();
        let bounds = state.view.bounds;
        if (state.path) {
          const selected = state.view.nodes.filter(node => state.path.node_ids.includes(node.id));
          if (selected.length) {
            const left = Math.min(...selected.map(node => node.x - node.width / 2));
            const top = Math.min(...selected.map(node => node.y - 44));
            bounds = { min_x: left, min_y: top, width: Math.max(...selected.map(node => node.x + node.width / 2)) - left, height: Math.max(...selected.map(node => node.y + 44)) - top };
          }
        }
        const padding = 54;
        state.scale = Math.max(.025, Math.min(1.2, (rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height));
        state.tx = (rect.width - bounds.width * state.scale) / 2 - bounds.min_x * state.scale;
        state.ty = (rect.height - bounds.height * state.scale) / 2 - bounds.min_y * state.scale;
        applyTransform();
      }

      function zoomAt(clientX, clientY, factor) {
        const rect = svg.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const previous = state.scale;
        const next = Math.max(.025, Math.min(2.8, previous * factor));
        state.tx = px - (px - state.tx) * (next / previous);
        state.ty = py - (py - state.ty) * (next / previous);
        state.scale = next;
        applyTransform();
      }

      svg.addEventListener("wheel", event => {
        event.preventDefault();
        pauseHoverForNavigation();
        if (event.ctrlKey) {
          // Chromium exposes a trackpad pinch as Ctrl + wheel. A normal
          // two-finger gesture has no Ctrl modifier and must only pan.
          zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * .01));
          return;
        }
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
        state.tx -= event.deltaX * unit;
        state.ty -= event.deltaY * unit;
        applyTransform();
      }, { passive: false });

      // Safari/WebKit exposes a native trackpad pinch through gesture events
      // instead of the Ctrl + wheel convention used by Chromium.
      svg.addEventListener("gesturestart", event => {
        event.preventDefault();
        pauseHoverForNavigation();
        state.gestureScale = Number(event.scale) || 1;
      }, { passive: false });
      svg.addEventListener("gesturechange", event => {
        event.preventDefault();
        pauseHoverForNavigation();
        const nextGestureScale = Number(event.scale) || state.gestureScale;
        const factor = nextGestureScale / state.gestureScale;
        zoomAt(event.clientX, event.clientY, factor);
        state.gestureScale = nextGestureScale;
      }, { passive: false });
      svg.addEventListener("gestureend", event => {
        event.preventDefault();
        state.gestureScale = 1;
      }, { passive: false });

      svg.addEventListener("pointerdown", event => {
        if (event.target.closest(".node")) return;
        state.panning = true;
        pauseHoverForNavigation();
        state.moved = false;
        state.startX = event.clientX;
        state.startY = event.clientY;
        state.startTx = state.tx;
        state.startTy = state.ty;
        svg.setPointerCapture(event.pointerId);
        svg.classList.add("is-panning");
      });
      svg.addEventListener("pointermove", event => {
        if (!state.panning) return;
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
        state.tx = state.startTx + dx;
        state.ty = state.startTy + dy;
        applyTransform();
      });
      function endPan(event) {
        if (!state.panning) return;
        state.panning = false;
        state.navigating = false;
        clearTimeout(navigationTimer);
        svg.classList.remove("is-navigating");
        if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
        svg.classList.remove("is-panning");
        setTimeout(() => { state.moved = false; }, 0);
      }
      svg.addEventListener("pointerup", endPan);
      svg.addEventListener("pointercancel", endPan);
      svg.addEventListener("click", event => {
        if (!event.target.closest(".node") && !state.moved) closeDetails();
      });

      function appendText(parent, className, text) {
        const element = document.createElement("p");
        element.className = className;
        element.textContent = text;
        parent.append(element);
      }

      function makeSection(title) {
        const section = document.createElement("section");
        section.className = "section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.append(heading);
        return section;
      }

      function renderRelations(parent, title, relations) {
        const section = makeSection(`${title} · ${relations.length}`);
        const list = document.createElement("div");
        list.className = "relation-list";
        if (!relations.length) {
          const empty = document.createElement("span");
          empty.className = "empty";
          empty.textContent = "No relationships of this type";
          list.append(empty);
        }
        for (const relation of relations) {
          const item = document.createElement("button");
          item.type = "button"; item.disabled = !canExplore(relation.node_id);
          item.className = "relation";
          const name = document.createElement("strong");
          name.textContent = relation.node_title;
          const description = document.createElement("span");
          description.textContent = `${relation.strength === "required" ? "Required" : "Recommended"}${relation.min_depth === "apply" ? " for tasks" : ""} — ${relation.rationale}`;
          item.append(name, description);
          item.addEventListener("click", () => openNode(relation.node_id, true));
          item.style.cursor = "pointer";
          list.append(item);
        }
        section.append(list);
        parent.append(section);
      }

      function focusNode(nodeId) {
        const node = state.view.nodes.find(item => item.id === nodeId);
        if (!node) return;
        const rect = svg.getBoundingClientRect();
        const available = rect.width - (details.hidden ? 0 : Math.min(462, rect.width * .4));
        state.scale = 1;
        state.tx = Math.max(140, available / 2) - node.x * state.scale;
        state.ty = rect.height / 2 - node.y * state.scale;
        applyTransform();
      }

      async function openNode(nodeId, focus = false) {
        if (!canExplore(nodeId) || state.pathPending) return;
        const version = ++state.detailVersion;
        state.activeNode = nodeId; state.hoverNode = null; state.detailPayload = null;
        const node = state.graph.nodes.find(item => item.id === nodeId);
        if (node?.parent_id && !state.expanded.has(node.parent_id)) {
          state.expanded.add(node.parent_id); renderGraph(state.graph);
        }
        applyHighlight(); details.hidden = false;
        detailTitle.textContent = "Loading…"; detailId.textContent = nodeId; detailBody.replaceChildren();
        if (focus) focusNode(nodeId);
        try {
          const response = await fetch("/api/nodes/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: nodeId }) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          if (version !== state.detailVersion) return;
          state.detailPayload = payload; renderDetails(payload);
        } catch (error) {
          if (version !== state.detailVersion) return;
          detailTitle.textContent = "Unable to load node"; appendText(detailBody, "evidence", String(error));
        }
      }

      function learningResourceLink(resource) {
        const link = document.createElement("a");
        link.className = "resource"; link.href = resource.url;
        link.target = "_blank"; link.rel = "noreferrer noopener";
        const name = document.createElement("strong");
        name.textContent = resource.title; name.lang = resource.language || "en";
        const info = document.createElement("span");
        info.textContent = `${resource.provider} · ${resource.depth === "apply" ? "Practice" : "Concepts"} · `;
        const language = document.createElement("span");
        language.className = "resource-language";
        language.textContent = resource.language === "ru" ? "RU" : "EN";
        language.title = resource.language === "ru" ? "Russian" : "English";
        info.append(language); link.append(name, info);
        if (resource.section) {
          const section = document.createElement("span"); section.className = "resource-section";
          section.textContent = resource.section; section.lang = resource.language || "en";
          link.append(section);
        }
        return link;
      }

      function renderExercises(parent, exercises) {
        if (!exercises.length) return;
        const section = makeSection(`Practical assignments · ${exercises.length}`);
        section.classList.add("practice-assignments");
        for (const exercise of exercises) {
          const card = document.createElement("details");
          card.className = "practice-assignment"; card.dataset.exerciseId = exercise.id;
          const title = document.createElement("summary"); title.textContent = exercise.title;
          const body = document.createElement("div"); body.className = "assignment-body";
          appendText(body, "learning-outcome", exercise.objective);
          for (const [heading, entries, tag] of [["Steps", exercise.steps, "ol"], ["Success criteria", exercise.success_criteria, "ul"]]) {
            const label = document.createElement("h4"); label.textContent = heading;
            const list = document.createElement(tag);
            for (const entry of entries) { const item = document.createElement("li"); item.textContent = entry; list.append(item); }
            body.append(label, list);
          }
          const deliverable = document.createElement("h4"); deliverable.textContent = "Deliverable";
          body.append(deliverable); appendText(body, "learning-outcome", exercise.deliverable);
          const materials = document.createElement("h4"); materials.textContent = "Assignment materials";
          body.append(materials);
          for (const resource of exercise.resources) body.append(learningResourceLink(resource));
          card.append(title, body); section.append(card);
        }
        parent.append(section);
      }

      function renderDetails(payload) {
        const node = payload.node, depth = effectiveDepth(node.id);
        detailTitle.textContent = node.title; detailId.textContent = payload.parent ? `Component of ${payload.parent.title}` : humanizeLabel(node.kind);
        detailBody.replaceChildren();
        const actions = document.createElement("div"); actions.className = "detail-actions";
        const lock = document.createElement("button"); lock.type = "button"; lock.className = "primary-button";
        lock.id = "lock-path"; lock.disabled = state.pathPending;
        lock.textContent = state.path ? (state.path.target_id === node.id ? "Path locked to this target" : "Set as path target") : "Lock learning path";
        lock.disabled = state.pathPending || state.path?.target_id === node.id;
        lock.addEventListener("click", () => lockPath(node.id)); actions.append(lock);
        if (payload.children.length) {
          const expand = document.createElement("button"); expand.type = "button"; expand.className = "secondary-button";
          expand.textContent = state.expanded.has(node.id) ? "Collapse components" : "Expand components";
          expand.addEventListener("click", () => toggleContainer(node.id)); actions.append(expand);
        }
        detailBody.append(actions);
        appendText(detailBody, "summary", node.summary);
        const outcome = makeSection(depthLabel(depth));
        appendText(outcome, "learning-outcome", node.outcomes[depth]);
        if (state.path && depth !== state.depth) appendText(outcome, "empty", "This path needs conceptual knowledge of this prerequisite.");
        detailBody.append(outcome);
        if (depth !== "apply" && node.exercises?.length) {
          appendText(outcome, "practice-hint", `Switch Depth to Work on tasks to explore ${node.exercises.length} practical ${node.exercises.length === 1 ? "assignment" : "assignments"} and include their task-level prerequisites.`);
        }
        if (node.evidence_note) appendText(detailBody, "evidence", node.evidence_note);
        if (payload.children.length) {
          const section = makeSection("Component skills");
          appendText(section, "empty", state.path ? "Only components required by the locked target are available." : "Choose a component to build a focused learning path.");
          for (const child of payload.children) {
            const button = document.createElement("button"); button.type = "button"; button.className = "component-link";
            button.textContent = child.title; button.disabled = !canExplore(child.id);
            button.addEventListener("click", () => openNode(child.id, true)); section.append(button);
          }
          detailBody.append(section);
        }
        const resources = makeSection("Learning materials");
        for (const resource of node.resources) {
          resources.append(learningResourceLink(resource));
        }
        detailBody.append(resources);
        if (depth === "apply") renderExercises(detailBody, node.exercises || []);
        renderRelations(detailBody, "Prerequisites", payload.prerequisites);
        renderRelations(detailBody, "Unlocks", payload.dependents);
        renderRelations(detailBody, "Other applications", payload.other_relations);
      }

      async function lockPath(targetId, { preserveView = false } = {}) {
        const version = ++state.pathVersion;
        state.pathPending = true; state.pendingTarget = targetId;
        if (state.detailPayload) renderDetails(state.detailPayload);
        try {
          const response = await fetch("/api/learning-path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: targetId, depth: state.depth }) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const path = await response.json();
          if (version !== state.pathVersion) return;
          const anchorId = path.node_ids.includes(state.activeNode) ? state.activeNode : targetId;
          const position = preserveView ? state.view.nodes.find(node => node.id === anchorId) : null;
          if (!state.path) state.overviewExpanded = new Set(state.expanded);
          state.path = path; state.depth = path.depth; depthSelect.value = path.depth; state.hoverNode = null;
          for (const id of path.container_ids) state.expanded.add(id);
          if (!path.node_ids.includes(state.activeNode)) { state.activeNode = targetId; state.detailPayload = null; }
          renderGraph(state.graph); renderPathPanel(); renderSearchResults(); closeSearchResults();
          if (preserveView) {
            // Keep the inspected skill in place as depth-specific components
            // change the layout, retaining any zoom/pan made during the request.
            const next = state.view.nodes.find(node => node.id === anchorId);
            if (position && next) {
              state.tx += (position.x - next.x) * state.scale;
              state.ty += (position.y - next.y) * state.scale;
              applyTransform();
            }
          } else fitGraph();
          state.pathPending = false;
          if (state.detailPayload) renderDetails(state.detailPayload); else if (!details.hidden) openNode(state.activeNode);
        } catch (error) {
          if (version !== state.pathVersion) return;
          // Preserve the prior locked path and its actual depth on failure.
          if (state.path) { state.depth = state.path.depth; depthSelect.value = state.depth; }
          showNotice(`Unable to build path: ${String(error)}`);
        } finally {
          if (version === state.pathVersion) { state.pathPending = false; state.pendingTarget = null; if (state.detailPayload) renderDetails(state.detailPayload); }
        }
      }

      function renderPathPanel() {
        pathPanel.hidden = !state.path;
        if (!state.path) return;
        const target = state.graph.nodes.find(node => node.id === state.path.target_id);
        document.getElementById("path-target").textContent = target.title;
        document.getElementById("path-summary").textContent = `${depthLabel(state.path.depth)} · ${state.path.node_ids.length - 1} prerequisite skills & topics. Explore highlighted nodes; the target stays fixed.`;
        pathSteps.replaceChildren();
        let currentStage = -1;
        for (const step of state.path.steps) {
          if (step.stage !== currentStage) {
            currentStage = step.stage; const label = document.createElement("p"); label.className = "stage-label";
            label.textContent = `Stage ${currentStage + 1}`; pathSteps.append(label);
          }
          const node = state.graph.nodes.find(item => item.id === step.node_id);
          const button = document.createElement("button"); button.className = "path-step"; button.type = "button"; button.dataset.nodeId = node.id;
          button.textContent = `${node.title} · ${depthLabel(step.depth)}`;
          button.addEventListener("click", () => openNode(node.id, true)); pathSteps.append(button);
        }
      }

      function resetPath() {
        const position = state.view.nodes.find(node => node.id === state.activeNode);
        ++state.pathVersion; state.pathPending = false; state.pendingTarget = null;
        state.path = null; state.expanded = state.overviewExpanded || state.expanded;
        state.overviewExpanded = null; pathPanel.hidden = true;
        const selected = state.graph.nodes.find(node => node.id === state.activeNode);
        if (selected?.parent_id) state.expanded.add(selected.parent_id);
        renderGraph(state.graph);
        // Restoring siblings can reflow the layout; keep the selection at its
        // current screen position without changing the user's zoom.
        const next = state.view.nodes.find(node => node.id === state.activeNode);
        if (position && next) {
          state.tx += (position.x - next.x) * state.scale;
          state.ty += (position.y - next.y) * state.scale;
          applyTransform();
        }
        if (state.detailPayload) renderDetails(state.detailPayload);
        renderSearchResults(); closeSearchResults();
      }

      function closeDetails() {
        ++state.detailVersion; state.detailPayload = null;
        details.hidden = true;
        state.activeNode = null;
        state.hoverNode = null;
        for (const element of nodeElements.values()) element.classList.remove("is-active");
        applyHighlight();
      }

      function setLegend(open) {
        legendPanel.hidden = !open;
        legendToggle.setAttribute("aria-expanded", String(open));
      }

      document.getElementById("reset-path").addEventListener("click", resetPath);
      depthSelect.addEventListener("change", () => {
        state.depth = depthSelect.value;
        if (state.path || state.pendingTarget) lockPath(state.path?.target_id || state.pendingTarget, { preserveView: true });
        else {
          refreshHoverGraph(); applyHighlight();
          if (state.detailPayload) renderDetails(state.detailPayload);
        }
      });
      document.getElementById("close-details").addEventListener("click", closeDetails);
      searchInput.addEventListener("input", renderSearchResults);
      searchInput.addEventListener("focus", () => {
        if (normalizeSearchText(searchInput.value)) renderSearchResults();
      });
      searchInput.addEventListener("keydown", event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (searchResults.hidden) renderSearchResults();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          setSearchSelection(state.searchSelection + direction);
        } else if (event.key === "Enter" && state.searchSelection >= 0) {
          event.preventDefault();
          selectSearchResult(state.searchMatches[state.searchSelection].node.id);
        } else if (event.key === "Escape" && !searchResults.hidden) {
          event.preventDefault();
          event.stopPropagation();
          closeSearchResults();
        }
      });
      document.addEventListener("pointerdown", event => {
        if (!searchShell.contains(event.target)) closeSearchResults();
      });
      legendToggle.addEventListener("click", () => setLegend(legendPanel.hidden));
      document.getElementById("close-legend").addEventListener("click", () => setLegend(false));
      document.getElementById("fit").addEventListener("click", fitGraph);
      document.getElementById("zoom-in").addEventListener("click", () => { const rect = svg.getBoundingClientRect(); zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25); });
      document.getElementById("zoom-out").addEventListener("click", () => { const rect = svg.getBoundingClientRect(); zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, .8); });
      window.addEventListener("resize", fitGraph);
      window.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closeDetails();
          setLegend(false);
        }
      });

      async function bootstrap() {
        try {
          const response = await fetch("/api/graph/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
          if (!response.ok) throw new Error(`Graph API returned HTTP ${response.status}`);
          const graph = await response.json();
          renderGraph(graph, true);
          loading.hidden = true;
        } catch (error) {
          loading.hidden = true;
          errorBox.hidden = false;
          errorBox.textContent = `Unable to load graph: ${String(error)}`;
        }
      }
      bootstrap();
    })();
