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
      const NODE_H = 72;
      const state = { graph: null, scale: 1, tx: 0, ty: 0, panning: false, moved: false, startX: 0, startY: 0, startTx: 0, startTy: 0, activeNode: null, hoverNode: null, gestureScale: 1, searchMatches: [], searchSelection: -1 };
      const nodeElements = new Map();
      const edgeElements = [];
      const topicDefinitions = new Map();

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
        openNode(nodeId);
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
        const sx = source.x + NODE_W / 2;
        const sy = source.y;
        const tx = target.x - NODE_W / 2;
        const ty = target.y;
        const dx = tx - sx;
        if (dx >= 20) {
          const bend = Math.max(45, dx * .45);
          return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
        }
        const offset = 90 + Math.abs(ty - sy) * .18;
        return `M ${sx} ${sy} C ${sx + offset} ${sy}, ${tx + offset} ${ty}, ${tx} ${ty}`;
      }

      function renderGraph(graph) {
        state.graph = graph;
        topicDefinitions.clear();
        for (const topic of graph.options.topics) topicDefinitions.set(topic.id, topic);
        renderTopicLanes(graph);
        edgesGroup.replaceChildren();
        nodesGroup.replaceChildren();
        nodeElements.clear();
        edgeElements.length = 0;
        const positions = new Map(graph.nodes.map(node => [node.id, node]));

        for (const edge of graph.edges) {
          const source = positions.get(edge.from);
          const target = positions.get(edge.to);
          if (!source || !target) continue;
          const path = svgElement("path", { d: edgePath(source, target), class: `edge ${edge.type}`, "marker-end": "url(#arrow)" });
          path.dataset.from = edge.from;
          path.dataset.to = edge.to;
          path.dataset.type = edge.type;
          edgesGroup.append(path);
          edgeElements.push({ element: path, edge });
        }

        for (const node of graph.nodes) {
          const group = svgElement("g", { class: "node", transform: `translate(${node.x} ${node.y})`, tabindex: "0", role: "button", "aria-label": node.title });
          group.dataset.id = node.id;
          group.style.setProperty("--node-color", topicColor(node.topics[0]));
          group.style.setProperty("--status-color", statusColor(node.status));
          group.append(svgElement("rect", { class: "node-card", x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H }));
          group.append(svgElement("rect", { class: "kind-mark", x: -NODE_W / 2 + 10, y: -NODE_H / 2 + 10, width: 8, height: 52, rx: 4 }));
          group.append(svgElement("circle", { class: "status-dot", cx: NODE_W / 2 - 14, cy: -NODE_H / 2 + 14, r: 5 }));

          const titleObject = svgElement("foreignObject", { x: -NODE_W / 2 + 28, y: -27, width: NODE_W - 50, height: 40 });
          const title = document.createElement("div");
          title.className = "node-title-box";
          title.textContent = node.title;
          title.title = node.title;
          titleObject.append(title);
          group.append(titleObject);
          const metaObject = svgElement("foreignObject", { x: -NODE_W / 2 + 28, y: 20, width: NODE_W - 50, height: 13 });
          const topic = document.createElement("div");
          topic.className = "node-meta-box";
          topic.textContent = `${topicLabel(node.topics[0])} · ${humanizeLabel(node.level)}`;
          topic.title = topic.textContent;
          metaObject.append(topic);
          group.append(metaObject);

          group.addEventListener("mouseenter", () => highlightNode(node.id));
          group.addEventListener("mouseleave", clearHighlight);
          group.addEventListener("focus", () => highlightNode(node.id));
          group.addEventListener("blur", clearHighlight);
          group.addEventListener("click", () => { if (!state.moved) openNode(node.id); });
          group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNode(node.id); } });
          nodesGroup.append(group);
          nodeElements.set(node.id, group);
        }
        meta.textContent = `${graph.nodes.length} nodes · ${graph.edges.length} edges`;
        renderStatusLegend(graph.options);
        fitGraph();
      }

      function applyHighlight() {
        const highlightedNodes = [state.activeNode, state.hoverNode].filter(Boolean);
        if (!highlightedNodes.length) {
          for (const item of edgeElements) item.element.classList.remove("is-related", "is-dimmed");
          for (const element of nodeElements.values()) element.classList.remove("is-dimmed");
          return;
        }
        const highlightedSet = new Set(highlightedNodes);
        const connected = new Set(highlightedNodes);
        for (const item of edgeElements) {
          const related = highlightedSet.has(item.edge.from) || highlightedSet.has(item.edge.to);
          item.element.classList.toggle("is-related", related);
          item.element.classList.toggle("is-dimmed", !related);
          if (related) { connected.add(item.edge.from); connected.add(item.edge.to); }
        }
        for (const [id, element] of nodeElements) element.classList.toggle("is-dimmed", !connected.has(id));
      }

      function highlightNode(nodeId) {
        state.hoverNode = nodeId;
        applyHighlight();
      }

      function clearHighlight() {
        state.hoverNode = null;
        applyHighlight();
      }

      function applyTransform() {
        viewport.setAttribute("transform", `translate(${state.tx} ${state.ty}) scale(${state.scale})`);
      }

      function fitGraph() {
        if (!state.graph) return;
        const rect = svg.getBoundingClientRect();
        const bounds = state.graph.bounds;
        const padding = 54;
        state.scale = Math.max(.08, Math.min(1.2, (rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height));
        state.tx = (rect.width - bounds.width * state.scale) / 2 - bounds.min_x * state.scale;
        state.ty = (rect.height - bounds.height * state.scale) / 2 - bounds.min_y * state.scale;
        applyTransform();
      }

      function zoomAt(clientX, clientY, factor) {
        const rect = svg.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const previous = state.scale;
        const next = Math.max(.07, Math.min(2.8, previous * factor));
        state.tx = px - (px - state.tx) * (next / previous);
        state.ty = py - (py - state.ty) * (next / previous);
        state.scale = next;
        applyTransform();
      }

      svg.addEventListener("wheel", event => {
        event.preventDefault();
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
        state.gestureScale = Number(event.scale) || 1;
      }, { passive: false });
      svg.addEventListener("gesturechange", event => {
        event.preventDefault();
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
          const item = document.createElement("div");
          item.className = "relation";
          const name = document.createElement("strong");
          name.textContent = relation.node_title;
          const description = document.createElement("span");
          description.textContent = `${relation.type} · ${relation.strength} — ${relation.rationale}`;
          item.append(name, description);
          item.addEventListener("click", () => openNode(relation.node_id));
          item.style.cursor = "pointer";
          list.append(item);
        }
        section.append(list);
        parent.append(section);
      }

      async function openNode(nodeId) {
        state.activeNode = nodeId;
        for (const [id, element] of nodeElements) element.classList.toggle("is-active", id === nodeId);
        applyHighlight();
        details.hidden = false;
        detailTitle.textContent = "Loading…";
        detailId.textContent = nodeId;
        detailBody.replaceChildren();
        try {
          const response = await fetch("/api/nodes/details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: nodeId })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          const node = payload.node;
          detailTitle.textContent = node.title;
          detailId.textContent = node.id;
          appendText(detailBody, "summary", node.summary);
          const chips = document.createElement("div");
          chips.className = "chips";
          for (const value of [humanizeLabel(node.kind), humanizeLabel(node.level), humanizeLabel(node.status), ...node.topics.map(topicLabel)]) {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = value;
            chips.append(chip);
          }
          detailBody.append(chips);
          if (node.evidence_note) appendText(detailBody, "evidence", node.evidence_note);

          const resources = makeSection(`Learning resources · ${node.resources.length}`);
          const resourceList = document.createElement("div");
          resourceList.className = "resource-list";
          for (const resource of node.resources) {
            const link = document.createElement("a");
            link.className = "resource";
            link.href = resource.url;
            link.target = "_blank";
            link.rel = "noreferrer noopener";
            const name = document.createElement("strong");
            name.textContent = resource.title;
            const info = document.createElement("span");
            info.textContent = `${resource.provider} · ${resource.type} · ${resource.level}`;
            link.append(name, info);
            resourceList.append(link);
          }
          resources.append(resourceList);
          detailBody.append(resources);
          renderRelations(detailBody, "Prerequisites", payload.prerequisites);
          renderRelations(detailBody, "Unlocks", payload.dependents);
          renderRelations(detailBody, "Other applications", payload.other_relations);
        } catch (error) {
          detailTitle.textContent = "Unable to load node";
          appendText(detailBody, "evidence", String(error));
        }
      }

      function closeDetails() {
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
          renderGraph(graph);
          loading.hidden = true;
        } catch (error) {
          loading.hidden = true;
          errorBox.hidden = false;
          errorBox.textContent = `Unable to load graph: ${String(error)}`;
        }
      }
      bootstrap();
    })();
