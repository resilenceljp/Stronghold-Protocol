import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const chrome=process.env.CHROME_PATH;
test('AI collaboration controls fit desktop and touch layouts and send guarded requests', {skip:process.env.SP_E2E!=='1'||!chrome||!existsSync(chrome),timeout:120000},async()=>{
 const {startServer}=await import('../../server/index.js'),puppeteer=(await import('puppeteer-core')).default;
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true}),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--no-proxy-server',`--explicitly-allowed-ports=${srv.port}`]});
 try{for(const [width,height,touch] of [[1920,1080,false],[844,390,true]]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height,isMobile:touch,hasTouch:touch});
  await page.goto(srv.url+'/dev/game-mock.html?shot=1&render=fallback&phase=PREP');await page.waitForSelector('.gm__corner');
  await page.evaluate(async()=>{
   const {store}=await import('/js/store.js'),{net}=await import('/js/net.js'),{html}=await import('/js/ui/components.js'),{render}=await import('/vendor/preact.module.js'),{AiParticipation}=await import('/js/ui/aiParticipation.js');
   globalThis.aiCalls=[];net.request=async(t,body)=>{globalThis.aiCalls.push({t,...body});return {t:'ok'};};
   const state=store.get(),me=state.me.playerId;
   store.set({room:{...state.room,mode:'coop',hostId:me,spectators:[{playerId:me,name:'Spectator'}],aiTakeoverVotes:[],aiBandPolicy:'auto'},match:{...state.match,public:{...state.match.public,phase:'PREP',players:[{playerId:'ai_test',name:'Test AI',isBot:true,alive:true}]}}});
   for(const el of document.body.children)if(el.tagName!=='SCRIPT')el.style.display='none';
   const host=document.createElement('div');host.id='ai-fixture';host.style.cssText='position:fixed;inset:10px;z-index:9999;background:#102019;padding:10px;overflow:auto';document.body.append(host);
   globalThis.aiMount=props=>render(html`<${AiParticipation} key=${props.settings ? 'settings' : props.bandsOnly ? 'bands' : 'takeover'} ...${props}/>`,host);globalThis.aiMount({});
  });
  await page.click('#ai-fixture .ai-participation-entry');await page.waitForSelector('#ai-fixture .modal');
  await page.evaluate(()=>[...document.querySelectorAll('#ai-fixture button')].find(b=>b.textContent.includes('申请接替')).click());
  assert.equal(await page.evaluate(()=>globalThis.aiCalls.at(-1).t),'room.aiRequest');
  await page.evaluate(()=>globalThis.aiMount({settings:true}));await page.waitForSelector('.ai-policy');
  await page.evaluate(()=>[...document.querySelectorAll('#ai-fixture button')].find(b=>b.textContent==='同组投票').click());
  assert.equal(await page.evaluate(()=>globalThis.aiCalls.at(-1).policy),'vote');
  const bounds=await page.$eval('.ai-policy',el=>({width:el.scrollWidth,client:el.clientWidth}));assert.ok(bounds.width<=bounds.client+1,'settings wrap instead of overflowing');
  await page.evaluate(async()=>{const {store}=await import('/js/store.js'),{data}=await import('/js/data.js'),s=store.get();const id=data.list('bands')[0].bandId;store.set({room:{...s.room,aiBandVotes:[{botId:'ai_test',draftId:'draft-current',votes:{},eligible:[s.me.playerId],candidates:[id]}]},match:{...s.match,public:{...s.match.public,phase:'BAND_DRAFT'}}});globalThis.aiMount({bandsOnly:true});});
  await page.click('#ai-fixture .ai-participation-entry');await page.waitForSelector('#ai-fixture select');
  const value=await page.$eval('#ai-fixture select',el=>el.options[1].value);await page.select('#ai-fixture select',value);
  assert.equal(await page.evaluate(()=>globalThis.aiCalls.at(-1).draftId),'draft-current');
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();await srv.close();}
});
