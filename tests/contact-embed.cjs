const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const formPath = process.env.CONTACT_FORM_PATH || path.resolve(__dirname, '../../../kneipenkoenig/manager/kneipenkoenig-manager/kontakt.html');
(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  for (const width of [1440,390]) {
   const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
   await page.addInitScript(()=>{if(window===top)localStorage.setItem('kk_cookies','essential');});
   await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.hostname==='manager.kneipenkoenig.de' && url.pathname==='/kontakt.html') return route.fulfill({contentType:'text/html',body:fs.readFileSync(formPath,'utf8')});
    if(url.origin===base) return route.continue();
    return route.abort();
   });
   await page.goto(base+'/index.html');
   const sizes = await page.locator('.usp-hero-cta > a').evaluateAll(els=>els.map(el=>({width:el.offsetWidth,height:el.offsetHeight})));
   assert.deepEqual(sizes[0],sizes[1]);
   const frame = page.frames().find(f=>f.url().includes('kontakt.html'));
   await frame.waitForFunction(()=>typeof showSuccess==='function');
   await page.locator('#kontakt').scrollIntoViewIfNeeded();
   await page.evaluate(()=>window.scrollBy(0,600));
   await frame.evaluate(()=>showSuccess());
   await page.waitForFunction(()=>{
    const r=document.getElementById('kontakt').getBoundingClientRect();
    return r.top>=0 && r.top<150 && r.height<650;
   });
   assert.equal(await frame.locator('#success-card').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(process.env.TEMP,`contact-success-${width}.png`)});
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.screenshot({path:path.join(process.env.TEMP,`hero-updated-${width}.png`)});
   console.log(`PASS ${width}: equal buttons, embedded success scroll and height, no overflow`);
   await page.close();
  }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
