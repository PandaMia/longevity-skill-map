const assert = require('node:assert/strict');
const {mkdirSync} = require('node:fs');
const {join} = require('node:path');
const {launch, instrument, ready, frames, search, root} = require('./browser_helpers.cjs');
const output = join(root, 'artifacts'); mkdirSync(output, {recursive:true});
const camera = page => page.evaluate(() => testRenderer.getCamera());
async function panTo(page, world, screen = {x: 530, y: 360}) {
  const c = await camera(page);
  await page.locator('#graph').dispatchEvent('wheel', {shiftKey:true, deltaX:c.tx + world.x*c.scale - screen.x, deltaY:c.ty + world.y*c.scale - screen.y});
  await frames(page);
  await page.waitForFunction(() => !document.getElementById('graph').classList.contains('is-navigating'));
  const rect = await page.locator('#graph').boundingBox();
  return {x: rect.x+screen.x, y: rect.y+screen.y};
}
async function edgePoint(page, predicate, screen) {
  const {edgePoints} = await import('../static/graph-geometry.mjs');
  const view = await page.evaluate(() => ({nodes: testView.nodes.map(({id,title,x,y,width,height})=>({id,title,x,y,width,height})), edges:testView.edges}));
  const nodes = new Map(view.nodes.map(n=>[n.id,n]));
  for (const edge of view.edges.filter(predicate)) {
    const points = edgePoints(nodes.get(edge.from),nodes.get(edge.to));
    for (const fraction of [.45,.65,.25,.8]) {
      const i = Math.max(1, Math.min(points.length-1,Math.floor(points.length*fraction))), a=points[i-1], b=points[i];
      const world={x:(a.x+b.x)/2,y:(a.y+b.y)/2}, point = await panTo(page,world,screen);
      const hit = await page.evaluate(p=>testRenderer.hitTestEdge(p.x,p.y),point);
      if (hit?.from===edge.from && hit?.to===edge.to) return {edge,world,point,title:nodes.get(edge.to).title};
    }
  }
  throw new Error('No unobscured edge point matched this scenario');
}
(async()=>{
  const browser=await launch();
  try {
    for (const backend of ['webgl','canvas2d']) {
      const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:2,hasTouch:true});
      if (backend==='canvas2d') await context.addInitScript(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};
      });
      const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await instrument(page);await ready(page);
      assert.equal(await page.locator('#graph').getAttribute('data-renderer'),backend);
      await search(page,'Linear algebra');
      const c=await camera(page);
      await page.locator('#graph').dispatchEvent('wheel',{ctrlKey:true,deltaY:-Math.log(1/c.scale)/.01,clientX:500,clientY:400});await frames(page);
      let found=await edgePoint(page,e=>e.from==='linear_algebra' && e.to!=='linear_algebra');
      await page.mouse.move(found.point.x,found.point.y);await frames(page,3);
      const tooltip=page.locator('#edge-tooltip');
      assert(await tooltip.isVisible());
      assert.equal(await page.locator('#edge-tooltip-title').textContent(),`→ ${found.title}`);
      assert.equal(await tooltip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await tooltip.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
      assert.deepEqual(await page.evaluate(()=>testRenderer.getMetrics().hoveredEdge),{from:found.edge.from,to:found.edge.to});
      await page.screenshot({path:join(output,`edge-tooltip-${backend}.png`)});
      const hoverCamera=await camera(page);
      await page.mouse.down();await page.mouse.move(found.point.x+80,found.point.y+45,{steps:8});await page.mouse.up();await frames(page);
      const dragged=await camera(page);
      assert(Math.abs(dragged.tx-hoverCamera.tx-80)<.001 && Math.abs(dragged.ty-hoverCamera.ty-45)<.001);
      assert.equal(dragged.scale,hoverCamera.scale);
      assert.equal(await page.locator('#detail-title').textContent(),'Linear algebra','dragging an edge must not activate its target');
      assert(await tooltip.isHidden());
      found=await edgePoint(page,e=>e.from==='linear_algebra');
      await page.mouse.move(found.point.x,found.point.y);await frames(page,3);
      await page.locator('#graph').dispatchEvent('wheel',{ctrlKey:true,deltaY:-5,clientX:found.point.x,clientY:found.point.y});await frames(page);
      assert(await tooltip.isHidden(),'navigation dismisses stale tooltips');
      found=await edgePoint(page,e=>e.from==='linear_algebra');
      const beforeClick=await camera(page);
      await page.mouse.click(found.point.x,found.point.y);
      await page.waitForFunction(title=>document.getElementById('detail-title').textContent===title,found.title);await frames(page);
      assert.equal((await camera(page)).scale,beforeClick.scale,'edge navigation keeps zoom');
      assert(await tooltip.isHidden());
      const priority = await page.evaluate(id => {
        const node = testView.nodes.find(n => n.id === id), c = testRenderer.getCamera(), rect = document.getElementById('graph').getBoundingClientRect();
        const x = rect.left + c.tx + node.x * c.scale, y = rect.top + c.ty + node.y * c.scale;
        return { node: testRenderer.hitTest(x, y), edge: testRenderer.hitTestEdge(x, y) };
      }, found.edge.to);
      assert.equal(priority.node.id, found.edge.to); assert.equal(priority.edge, null, 'cards win over edges beneath them');
      console.log(`PASS ${backend}: edge hover, target click, drag/zoom and unchanged scale`);

      await page.locator('#close-details').click();
      await page.emulateMedia({colorScheme:'dark'});await frames(page);
      found=await edgePoint(page,e=>e.from==='linear_algebra',{x:1420,y:880});
      await page.mouse.move(found.point.x,found.point.y);await frames(page,3);
      const box=await tooltip.boundingBox();
      assert(box.x>=0 && box.y>=0 && box.x+box.width<=1440 && box.y+box.height<=960);
      assert.equal(await tooltip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await page.evaluate(()=>testRenderer.getMetrics().hoveredEdge),null,'without a selected node, direct edge hover must not highlight');
      assert.equal(await page.evaluate(()=>testRenderer.getMetrics().visibleHoverEdgeTiles),0);
      await page.screenshot({path:join(output,`edge-tooltip-dark-${backend}.png`)});
      await page.mouse.move(100,25);await frames(page);
      assert(await tooltip.isHidden(),'leaving the graph hides the tooltip');
      console.log(`PASS ${backend}: white tooltip in dark theme and screen-edge positioning`);

      const linear = await page.evaluate(()=>testView.nodes.find(n=>n.id==='linear_algebra'));
      const nodePoint = await panTo(page,linear);
      await page.mouse.move(nodePoint.x,nodePoint.y);await frames(page,3);
      assert((await page.evaluate(()=>testRenderer.getMetrics().visibleHoverEdgeTiles))>0,'hovering an unselected node still highlights its incident edges');
      await page.mouse.move(100,25);await frames(page,3);
      assert.equal(await page.evaluate(()=>testRenderer.getMetrics().visibleHoverEdgeTiles),0,'leaving the node clears incident-edge highlighting');
      found=await edgePoint(page,e=>e.from==='linear_algebra');
      const unselectedCamera=await camera(page);
      await page.mouse.click(found.point.x,found.point.y);
      await page.waitForFunction(title=>document.getElementById('detail-title').textContent===title,found.title);await frames(page);
      assert.equal((await camera(page)).scale,unselectedCamera.scale,'unselected edges remain navigable without changing zoom');
      console.log(`PASS ${backend}: unselected edge hover stays subdued; node hover and edge navigation remain active`);

      await search(page,'aging_gene_evidence');
      await search(page,'data_management_fair');
      await page.locator('#mastery-depth').selectOption('apply'); await frames(page);
      found = await edgePoint(page,e=>e.from==='data_management_fair' && e.to==='aging_gene_evidence');
      await page.locator('#mastery-depth').selectOption('understand'); await frames(page);
      const taskOnlyHit = await page.evaluate(p=>testRenderer.hitTestEdge(p.x,p.y),found.point);
      assert(taskOnlyHit?.to !== 'aging_gene_evidence', 'task-only edges must obey conceptual-depth filtering');
      await page.locator('#mastery-depth').selectOption('apply'); await frames(page);
      assert.equal((await page.evaluate(p=>testRenderer.hitTestEdge(p.x,p.y),found.point))?.to,'aging_gene_evidence');
      console.log(`PASS ${backend}: edge picking respects mastery depth`);

      await search(page,'Epigenetic rejuvenation');
      await page.locator('#mastery-depth').selectOption('apply');
      await page.getByRole('button',{name:'Lock learning path',exact:true}).click();
      await page.waitForFunction(()=>testOptions.path?.target_id==='epigenetic_rejuvenation');await frames(page);
      found=await edgePoint(page,e=>e.to!=='epigenetic_rejuvenation');
      const beforePath=await camera(page);
      await page.mouse.click(found.point.x,found.point.y);
      await page.waitForFunction(title=>document.getElementById('detail-title').textContent===title,found.title);await frames(page);
      assert.equal(await page.evaluate(()=>testOptions.path.target_id),'epigenetic_rejuvenation');
      assert.equal((await camera(page)).scale,beforePath.scale);
      console.log(`PASS ${backend}: edge exploration retains locked target and zoom`);
      found = await edgePoint(page,e=>e.to!=='epigenetic_rejuvenation');
      let detailRequests = 0;
      const countDetails = request => { if (request.url().includes('/api/nodes/details')) detailRequests++; };
      page.on('request', countDetails);
      const beforeTap = await camera(page);
      await page.touchscreen.tap(found.point.x, found.point.y);
      await page.waitForFunction(title=>document.getElementById('detail-title').textContent===title,found.title); await frames(page,3);
      assert.equal(detailRequests,1,'touch tap follows an edge once, without a compatibility-click duplicate');
      assert.equal((await camera(page)).scale,beforeTap.scale);
      assert.equal(await page.evaluate(()=>testOptions.path.target_id),'epigenetic_rejuvenation');
      page.off('request',countDetails);
      console.log(`PASS ${backend}: touch edge selection`);
      await page.locator('#close-details').click();await frames(page);
      found=await edgePoint(page,e=>e.to!=='epigenetic_rejuvenation');
      await page.mouse.move(found.point.x,found.point.y);await frames(page,3);
      assert(await tooltip.isVisible());
      assert.equal(await page.evaluate(()=>testRenderer.getMetrics().hoveredEdge),null,'a locked path alone does not enable direct edge highlighting');
      assert.equal(await page.evaluate(()=>testRenderer.getMetrics().visibleHoverEdgeTiles),0);
      assert.deepEqual(errors,[]);await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
