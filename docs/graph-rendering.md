# Graph rendering and performance

The map uses PixiJS 8.20.1 with WebGL. The application remains plain JavaScript and FastAPI. The production bundle is included at `static/graph-renderer.js`; running Python or building the existing Docker image does not require Node.js or an external CDN.

## Why change the SVG implementation?

SVG is a reasonable choice for small graphs. In this application, the collapsed view already had 135 cards, 658 projected edges and 2,019 DOM elements, including two HTML `foreignObject` labels per card. The browser repeatedly painted those objects during camera movement. Expanding containers rebuilt the entire SVG scene.

A GPU backend alone is insufficient: geometry, labels, hit testing and the overview must also scale. The replacement implements:

- **One scheduled frame for camera and hover updates.** An idle map performs no rendering. Wheel bursts use the latest camera state. Resizing preserves the camera. Locking a path preserves zoom and the inspected node's screen position, including any navigation while the path request is pending.
- **Spatial indexing.** RBush finds visible cards and the card under the pointer. A 128-pixel overscan band keeps text batches stable during small pans; zooming in shrinks the retained window. No per-card DOM event listeners or Pixi scene traversal for picking.
- **Tiled GPU edge meshes.** Cubic curves are flattened once per layout, divided into bounded spatial fragments and uploaded on demand. Offscreen fragments are skipped, including the offscreen portions of long edges that cross the viewport. Stroke widths, arrowheads and dashes use screen coordinates, without rebuilding geometry during zoom. At distant scales, groups of tiles share larger GPU buffers to reduce draw calls while retaining every segment and arrow.
- **Separate selection and hover layers.** Camera movement does not scan graph relationships. Hover uses an adjacency index and only changes the local neighborhood. The existing depth and locked-path semantics are preserved.
- **A single overview mesh.** Below scale `0.42`, card backgrounds share one draw call. Labels remain in a separate layer above these backgrounds. The GPU clips them to the viewport. Changing the card geometry does not recreate labels. The text layer has its own render group, so changing visible edges or lanes does not invalidate all glyph batches.
- **Shared glyph atlases.** Pixi BitmapText replaces HTML labels and per-string textures. Titles, metadata and all relationship types are rendered at every scale. Only objects outside the viewport are culled; no zoom threshold hides content.
- **Bounded detail caches.** Offscreen cards and edge tiles are evicted, and their GPU buffers are explicitly destroyed. Buffers are shared between attributes. Resolution is capped at 2 device pixels per CSS pixel.
- **Indexed layout and search.** Column widths and topic membership are computed in one pass. Search normalization and path membership are cached.
- **Keyboard and fallback support.** The graph has one accessible tab stop: arrows browse nodes, Enter/Space opens details, and +/- expands/collapses a container. Search can reach offscreen and collapsed nodes. A Canvas2D backend keeps the map usable without WebGL.

Text scales with its card and remains present in the overview. Opening/collapsing containers, searching, following related skills or path steps, and keyboard navigation preserve the current zoom; navigation pans to reveal the target. Only explicit zoom controls/gestures and **Fit graph** change the scale after startup. Use **Fit graph** explicitly to fit the graph or path; **Lock learning path** does not fit or zoom the camera.

## Alternatives considered

| Approach | Fit for this application |
| --- | --- |
| Optimized SVG | Simplest DOM accessibility; retains browser paint overhead for many HTML labels and curved paths. |
| Canvas2D | Small dependency footprint and a useful fallback; every visible shape still needs CPU drawing. |
| **PixiJS + custom edge/overview meshes** | Preserves rectangular cards, containers, topic lanes and curved relationships while batching the heavy geometry on the GPU. |
| Sigma.js | A strong graph-specific WebGL option, especially for conventional network views. This card layout would require custom node/edge programs and label rendering. |
| Cytoscape.js | Rich graph algorithms and compound nodes, with a WebGL rendering mode; adds graph/layout machinery that the existing deterministic layout does not need. |
| React Pixi | A React integration for PixiJS. This application does not use React; adding it would not itself improve GPU performance. |

This is an architectural choice for the existing UI, not a benchmark claiming PixiJS is faster than every alternative.

Primary documentation: [PixiJS performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips), [BitmapText](https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap), [Sigma customization](https://www.sigmajs.org/docs/advanced/customization/), [Cytoscape rendering and performance](https://js.cytoscape.org/#performance).

## Build and verify

```bash
npm ci
npm run build
npm test
python -m unittest discover -s tests -v
python scripts/validate_graph.py
```

The build generates the browser bundle and `static/THIRD_PARTY_LICENSES.txt`. Edit the `.mjs` sources and rebuild; do not edit the generated bundle. Dependencies are pinned in `package-lock.json`.

For browser checks, start the local server in another terminal:

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8001
npm run test:browser
npm run benchmark
npm run benchmark -- --extended
```

The scripts use the installed Google Chrome on macOS. Elsewhere, install Playwright Chromium with `npx playwright install chromium`, or set `CHROME_PATH`. Set `GRAPH_URL` for a different server URL. Screenshots and raw benchmark JSON are written to ignored `artifacts/`.

To compare with an SVG revision, use `npm run benchmark -- --compare <git-revision>`. This serves that revision's HTML, styles and scripts through browser request interception without modifying the working tree. `BENCH_FRAMES` controls sample count (default 180).

## Measured results

These measurements include titles, metadata and background edges at every scale.

Measurements are recorded in [graph-performance-results.json](graph-performance-results.json). They use headless Chrome, a 1440 × 960 CSS-pixel viewport and device scale factor 2. Each pan sample follows 30 warm-up frames, at scale 1, with the same camera coordinates and wheel input for both renderers.

| Source nodes / edges | SVG pan median / p95 | WebGL pan median / p95 | WebGL overview median / p95 |
| --- | --- | --- | --- |
| 278 / 1,053 | 26.0 / 30.9 ms | 16.7 / 17.6 ms | 16.7 / 17.4 ms |
| 2,780 / 10,530 | 41.8 / 50.3 ms | 16.7 / 17.5 ms | 16.7 / 17.2 ms |
| 13,900 / 52,650 | 97.8 / 142.0 ms | 16.7 / 17.6 ms | 16.6 / 17.8 ms |

The zoom sweep had p95 frame intervals of 18.2–24.7 ms. The largest overview retained 11,064 cards including overscan, each with title and metadata, and 47 coarse edge batches. Its maximum frame interval was 177.7 ms; rebuilding large text batches can still produce isolated pauses. Graph DOM remained at 133 elements for every size; the SVG baseline reached 164,323. SVG figures come from commit `092fd8035c09f94fe5951b02c8b3596714ef1fa5`; WebGL figures are from the current extended run.

The enlarged fixtures repeat the fully expanded real graph at separate spatial offsets: 2,780 nodes / 10,530 edges and 13,900 nodes / 52,650 edges. They test increasing total graph size with a similar local density, not an all-to-all network or thousands of overlapping edges in one viewport. The current-map fixture uses the real collapsed projection of 278 source nodes / 1,053 relationships.

Frame intervals include the browser's presentation cadence; the roughly 16.7 ms median is the 60 Hz ceiling, not a CPU rendering cost. CPU submission timing excludes asynchronous GPU execution. Initial loading includes graph transfer, projection/indexing and first paint, and should not be interpreted as pure renderer speed. The benchmark bypasses layout projection for the enlarged fixtures to compare rendering consistently.

Increasing local density, changing hardware/DPR, or loading much larger graphs can still affect performance. Large graph projection, curve preparation and JSON loading remain synchronous; a worker/streaming pipeline would be the next step if initial loading or container expansion, rather than navigation, becomes the bottleneck.
