import { Buffer, BufferUsage, Geometry, Mesh, Shader } from 'pixi.js';

// At overview scale thousands of cards are only a few pixels wide. A single
// immutable mesh lets the GPU clip and draw them without traversing thousands
// of scene objects on each pan. Picking still uses the full node R-tree.
export function overviewMesh(nodes, flags, palette, topics) {
  const data = new Float32Array(nodes.length * 4 * 16), indices = new Uint32Array(nodes.length * 6);
  const rgb = color => [16, 8, 0].map(shift => ((parseInt(color.slice(1), 16) >> shift) & 255) / 255);
  const surface = rgb(palette.surface);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i], state = flags.get(node.id) || {}, color = topics.get(node.topics[0]) || '#64748b';
    const border = rgb(state.target ? '#38bdf8' : state.path ? '#22c55e' : color);
    const tint = rgb(color), fill = node.children.length ? surface.map((c, i) => c * .9 + tint[i] * .1) : surface;
    const alpha = state.dimmed ? .25 : 1, stroke = state.active ? 5 : state.path || state.target ? 3 : 2;
    for (const [corner, [x, y]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
      const dx = node.width / 2 * x, dy = node.height / 2 * y;
      data.set([node.x + dx, node.y + dy, dx, dy, node.width, node.height, ...fill, alpha, ...border, alpha, i, stroke], (i * 4 + corner) * 16);
    }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const buffer = new Buffer({ data, usage: BufferUsage.VERTEX });
  const attribute = (format, offset) => ({ buffer, format, stride: 64, offset });
  const geometry = new Geometry({ attributes: {
    aPosition: attribute('float32x2', 0), aLocal: attribute('float32x2', 8), aSize: attribute('float32x2', 16),
    aFill: attribute('float32x4', 24), aBorder: attribute('float32x4', 40), aNumber: attribute('float32', 56), aStroke: attribute('float32', 60)
  }, indexBuffer: indices });
  const shader = Shader.from({ gl: {
    vertex: `precision highp float;
      in vec2 aPosition; in vec2 aLocal; in vec2 aSize;
      in vec4 aFill; in vec4 aBorder; in float aNumber; in float aStroke;
      uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
      uniform float uHoverIndex;
      out vec2 vLocal; out vec2 vSize; out vec4 vFill; out vec4 vBorder; out float vStroke;
      void main() {
        vec3 p = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
        gl_Position = vec4(p.xy, 0.0, 1.0); vLocal = aLocal; vSize = aSize;
        vFill = aFill; vBorder = aBorder; vStroke = abs(aNumber - uHoverIndex) < .5 ? 5.0 : aStroke;
      }`,
    fragment: `precision highp float;
      in vec2 vLocal; in vec2 vSize; in vec4 vFill; in vec4 vBorder; in float vStroke;
      uniform float uOverviewScale; out vec4 finalColor;
      void main() {
        vec2 distance = (vSize * .5 - abs(vLocal)) * uOverviewScale;
        float width = min(vStroke * .45, min(vSize.x, vSize.y) * uOverviewScale * .25);
        vec4 color = min(distance.x, distance.y) < width ? vBorder : vFill;
        finalColor = vec4(color.rgb * color.a, color.a);
      }`
  }, resources: { overviewUniforms: {
    uHoverIndex: { value: -1, type: 'f32' }, uOverviewScale: { value: 1, type: 'f32' }
  } } });
  const mesh = new Mesh({ geometry, shader }); mesh.ownsShader = true; mesh.eventMode = 'none';
  return mesh;
}
