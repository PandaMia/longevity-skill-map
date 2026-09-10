const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const root = join(__dirname, '..');
const url = process.env.GRAPH_URL || 'http://127.0.0.1:8001';
async function launch(options = {}) {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
  return chromium.launch({ executablePath, headless: true, ...options });
}
async function instrument(page) {
  await page.addInitScript(() => {
    let library;
    Object.defineProperty(window, 'GraphRenderer', { configurable: true, get: () => library, set(value) {
      library = { ...value, async create(options) {
        const instance = await value.create(options);
        window.testRenderer = instance;
        const setGraph = instance.setGraph;
        instance.setGraph = (graph, view, options) => { window.testGraph = graph; window.testView = view; window.testOptions = options; return setGraph(graph, view, options); };
        return instance;
      } };
    } });
  });
}
async function ready(page) {
  await page.goto(url); await page.waitForSelector('#loading', { state: 'hidden' });
  const error = await page.locator('#error').isVisible();
  if (error) throw new Error(await page.locator('#error').textContent());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function frames(page, n = 2) { await page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame); }, n); }
async function nodePoint(page, id, toggle = false) {
  return page.evaluate(({ id, toggle }) => {
    const node = testView.nodes.find(node => node.id === id), camera = testRenderer.getCamera(), rect = document.getElementById('graph').getBoundingClientRect();
    return { x: rect.left + camera.tx + (node.x + (toggle ? node.width / 2 - 28 : 0)) * camera.scale,
      y: rect.top + camera.ty + node.y * camera.scale, scale: camera.scale };
  }, { id, toggle });
}
async function search(page, value) {
  await page.locator('#node-search').fill(value); await page.locator('.search-result').first().click();
  await page.waitForFunction(() => document.getElementById('detail-title').textContent !== 'Loading…'); await frames(page);
}
function baselineAsset(ref, path) { return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); }
module.exports = { launch, instrument, ready, frames, nodePoint, search, url, root, baselineAsset };
