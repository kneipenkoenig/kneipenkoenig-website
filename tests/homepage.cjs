const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({chromium} = require('playwright')); } catch {
  ({chromium} = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));
}
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const own = [{id:'test-event',title:'Testquiz Coesfeld',venue_name:'Coesfeld',start_date:'2027-10-02T17:00:00Z'}];
const tailor = {data:[{name:'Testquiz Marl',checkout_url:'https://www.tickettailor.com/test-event',start:{unix:1822582800,date:'2027-10-03',time:'19:00'},venue:{name:'Marl'},tickets_available:true}]};
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.TEST_BROWSER || 'msedge'});
 try {
  for (const delayOwn of [true,false]) {
   const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
   const errors=[]; let waitlistFail=true, soldOut=false; const submissions=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{ if (window.top === window) localStorage.setItem('kk_cookies','essential'); });
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    const json=data=>route.fulfill({json:data});
    if(u.origin===base) return route.continue();
    if(u.hostname.startsWith('tickettailor-proxy')) {if(!delayOwn) await new Promise(r=>setTimeout(r,150));return json(tailor);}
    if(u.pathname==='/rest/v1/events') {if(delayOwn) await new Promise(r=>setTimeout(r,150));return json(own);}
    if(u.pathname.startsWith('/availability/')) return json({event:{id:'test-event',title:'Testquiz',start_date:own[0].start_date,allow_cash:true},ticket_types:[{ticket_type_id:'test-ticket',ticket_type_name:'Teamticket',max_players:6,available:5,price:30}],sold_out:soldOut});
    if(u.pathname==='/rest/v1/waitlist') return route.fulfill({status:waitlistFail?500:201,json:{}});
    if(u.pathname==='/validate-discount') return json({valid:true,type:'percent',value:10});
    if(u.pathname==='/checkout') { submissions.push(route.request().postDataJSON()); return json({success:true,order_number:'TEST-ONLY'}); }
    if(u.pathname.includes('quiz_daily_votes')) return json([]);
    if(u.hostname.includes('supabase')) return json([]);
    return route.abort();
   });
   await page.goto(base+'/index.html');
   await page.waitForFunction(()=>document.querySelectorAll('#eventsContainer .event-card').length===2);
   assert.deepEqual(await page.locator('#eventsContainer .event-title').allTextContents(),['Testquiz Coesfeld','Testquiz Marl']);
   await page.selectOption('#eventVenue','Marl');
   assert.equal(await page.locator('#eventsContainer .event-card').count(),1);
   await page.selectOption('#eventVenue','');
   await page.locator('[data-event-id]').click();
   await page.locator('.co-qty button').last().click();
   await page.locator('#coNext1').click();
   await page.locator('#coNext2').click();
   assert.match(await page.locator('#coDetailsError').innerText(),/gültige E-Mail/);
   await page.fill('#coName','Testgast'); await page.fill('#coEmail','test@example.com');
   await page.locator('#coNext2').click();
   assert.equal(await page.locator('#coStep3').isVisible(),true);
   assert.match(await page.locator('#coTotalDisplay').innerText(),/30,00/);
   await page.locator('#coPayBar').click();
   await page.locator('#coSuccess').waitFor();
   assert.equal(submissions.length,1);
   assert.equal(submissions[0].quantity,1);
   assert.equal(submissions[0].payment_method,'bar');
   assert.equal(submissions[0].ticket_type_id,'test-ticket');
   await page.keyboard.press('Escape');
   await page.waitForTimeout(400);
   assert.equal(await page.locator('[data-event-id]').evaluate(el=>el===document.activeElement),true);
   soldOut=true;
   await page.locator('[data-event-id]').click();
   await page.fill('#coWlName','Testgast');await page.fill('#coWlEmail','test@example.com');
   await page.locator('.co-waitlist button').click();
   await page.waitForFunction(()=>document.getElementById('coWlMsg').textContent==='Fehler');
   waitlistFail=false;await page.locator('.co-waitlist button').click();
   await page.waitForFunction(()=>document.getElementById('coWlMsg').textContent.includes('Du stehst'));
   await page.keyboard.press('Escape');await page.waitForTimeout(400);
   soldOut=false; await page.locator('[data-event-id]').click();
   await page.locator('.co-qty button').last().waitFor();
   await page.locator('.co-qty button').last().click();
   await page.fill('#coDiscountCode','TEST10');
   await page.locator('.co-discount-row button').click();
   await page.waitForFunction(()=>document.getElementById('coDiscountMsg').textContent.includes('10%'));
   assert.match(await page.locator('#coSummary').innerText(),/27,00/);
   await page.locator('.co-qty button').first().click();
   assert.equal(await page.locator('#coNext1').isDisabled(),true);
   assert.equal(await page.locator('#coNext1').isVisible(),true);
   await page.keyboard.press('Escape');await page.waitForTimeout(400);
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.locator('#eventsContainer .event-time').first().isVisible(),true);
   assert.equal(await page.locator('#eventsContainer .badge-tickets').isVisible(),true);
   await page.locator('#navToggle').click();
   assert.equal(await page.locator('#mobileNavClose').evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Shift+Tab');
   assert.equal(await page.locator('#mobileNav a').last().evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'),'false');
   await page.locator('#quizFab').click();
   assert.equal(await page.locator('#quizFab').getAttribute('aria-expanded'),'true');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#quizFab').getAttribute('aria-expanded'),'false');
   await page.waitForTimeout(400);
   assert.equal(await page.locator('#quizOverlay').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const folder=process.env.TEMP || '.';
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(folder,'kneipenkoenig-mobile.png'),fullPage:true});
   await page.setViewportSize({width:1440,height:1000});
   await page.screenshot({path:path.join(folder,'kneipenkoenig-desktop.png'),fullPage:true});
   assert.deepEqual(errors,[]);
   console.log('PASS: source order '+(delayOwn?'Tailor → own':'own → Tailor')+', filter, checkout validation, waitlist failure/success, reopen, mobile menu, quiz, overflow');
   await page.close();
  }
  const page=await browser.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/index.html');
  await page.waitForFunction(()=>document.getElementById('eventsError').style.display==='block');
  assert.equal(await page.locator('a[href="https://www.tickettailor.com/events/derkneipenknig"]').count()>0,true);
  console.log('PASS: network failure gives visible fallback and ticket link');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
