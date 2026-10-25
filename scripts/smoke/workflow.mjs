import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.WORKFLOW_BASE_URL ?? 'http://127.0.0.1:3458';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('Local QA only');
await mkdir('tmp/workflow-qa', { recursive:true });
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{width:1440,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 for (const product of ['popup','hinge','letters','parametric','shadowbox']) {
  await page.goto(`${base}/app/editor/local?p=${product}`,{waitUntil:'domcontentloaded',timeout:120000});
  const workflow=page.getByRole('navigation',{name:'Workflow',exact:true});
  await workflow.waitFor({timeout:90000});
  assert.equal(await workflow.getByRole('button').count(),7);
  await page.getByRole('button',{name:'Simple',exact:true}).click();
  assert.equal(await page.locator('.dock-col [data-advanced]:visible').count(),0);
  await page.getByRole('button',{name:'Advanced',exact:true}).click();
  await workflow.getByRole('button',{name:'Material',exact:true}).click();
  assert.ok(await page.locator('.dock-body [data-step="material"] summary').first().evaluate(el=>el===document.activeElement));
  await workflow.getByRole('button',{name:'Export',exact:true}).click();
  assert.ok(await page.locator('.btn-export.wide').evaluate(el=>el===document.activeElement));
  await page.getByRole('button',{name:'Collapse settings',exact:true}).click();
  assert.equal(await page.locator('.dock-body').isVisible(),false);
  await page.getByRole('button',{name:'Expand settings',exact:true}).click();
  assert.equal(await page.locator('.dock-body').isVisible(),true);
  const separator=page.getByRole('separator',{name:'Settings panel width'});
  await separator.focus(); await page.keyboard.press('Home');
  assert.equal(await separator.getAttribute('aria-valuenow'),'280');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await separator.getAttribute('aria-valuenow'),'296');
  await page.keyboard.press('End');
  assert.equal(await separator.getAttribute('aria-valuenow'),'560');
  await page.screenshot({path:`tmp/workflow-qa/${product}-desktop.png`});
  console.log('PASS workflow',product);
 }
 for (const width of [375,768,1024]) {
  await page.setViewportSize({width,height:900});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2, { }, {timeout:5000});
  await page.screenshot({path:`tmp/workflow-qa/responsive-${width}.png`});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  if(overflow) console.log(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(x=>x.getBoundingClientRect().right>innerWidth+2).slice(0,15).map(x=>({tag:x.tagName,cls:String(x.className),right:x.getBoundingClientRect().right,overflow:getComputedStyle(x).overflow}))})));
  assert.equal(overflow,false,`page overflow at ${width}`);
  console.log('PASS viewport',width);
 }
 assert.deepEqual(errors,[]);
} finally { await browser.close(); }
