const esbuild = require('esbuild');
const { readFileSync, writeFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
(async () => {
  const result = await esbuild.build({ absWorkingDir: root, entryPoints: ['static/graph-renderer.mjs'], bundle: true,
    format: 'iife', globalName: 'GraphRenderer', minify: true, legalComments: 'linked',
    outfile: 'static/graph-renderer.js', metafile: true,
    banner: { js: '/*! Third-party licenses: /static/THIRD_PARTY_LICENSES.txt */' } });
  const packages = new Set();
  for (const name of Object.keys(result.metafile.inputs)) {
    const match = name.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) packages.add(match[1]);
  }
  const licenses = [...packages].sort().map(name => {
    const directory = join(root, 'node_modules', name), pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    const file = readdirSync(directory).find(name => /^licen[cs]e(?:\..*)?$/i.test(name));
    if (!file && name === '@pixi/colord') return `${pkg.name} ${pkg.version}\n${readFileSync(join(__dirname, 'licenses/colord.txt'), 'utf8')}`;
    if (!file) throw new Error(`Missing bundled dependency license: ${name}`);
    return `${pkg.name} ${pkg.version}\n${'-'.repeat(72)}\n${readFileSync(join(directory, file), 'utf8')}`;
  });
  writeFileSync(join(root, 'static/THIRD_PARTY_LICENSES.txt'), licenses.join('\n\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
