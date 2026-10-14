/* global document, window */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../server/index.js';
const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 await page.goto(srv.url,{waitUntil:'networkidle2'});
 const result=await page.evaluate(async()=>{
  const {data}=await import('/js/data.js');await data.loadAll('bonds','config','chess','items','assets');
  const {render}=await import('/vendor/preact.module.js');const {html}=await import('/js/ui/components.js');
  const {BondStrip}=await import('/js/ui/bondStrip.js');
  const host=document.createElement('div');host.className='gm__bonds';host.style.cssText='width:400px;left:40px;top:100px;right:auto';document.body.appendChild(host);
  const bonds=Object.keys(data.get('bonds')).map(bondId=>({bondId,layers:20,count:4,active:true}));
  render(html`<${BondStrip} bonds=${bonds} onOpen=${()=>{}} />`,host);
  await new Promise(r=>setTimeout(r,100));
  const list=host.querySelector('.bstrip');const count=host.querySelectorAll('.bslot').length;
  host.querySelector('button:last-child').click();await new Promise(r=>setTimeout(r,600));
  return {count,total:bonds.length,scroll:list.scrollLeft,width:list.clientWidth,full:list.scrollWidth};
 });
 assert.equal(result.count,result.total);assert.ok(result.full>result.width);assert.ok(result.scroll>0);console.log('All bonds rendered; arrow scrolling verified',result);
 await page.evaluate(async()=>{
  const {render}=await import('/vendor/preact.module.js');const {html}=await import('/js/ui/components.js');const {ResultView}=await import('/js/screens/result.js');
  const host=document.createElement('div');document.body.appendChild(host);render(html`<${ResultView} quiet=${true} backLabel="BACK" onBack=${()=>{}} res=${{victory:false,endless:true,endlessFloor:17,roundsPassed:16,players:[{playerId:'p0',name:'测试战报',seat:0,stats:{kills:99},lineup:[],bonds:[],alive:true,lp:77}]}} />`,host);
 });
 await new Promise(r=>setTimeout(r,1000));
 const image=await page.evaluate(async()=>{const {captureResult}=await import('/js/ui/resultShare.js');const blob=await captureResult(document.querySelector('.result'));return {type:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};});
 assert.equal(image.type,'image/png');const buffer=Buffer.from(image.bytes);assert.ok(buffer.length>10000);assert.equal(buffer.subarray(1,4).toString(),'PNG');
 fs.writeFileSync('work/fun7-result-share.png',buffer);console.log('Result PNG generated:',buffer.length,'bytes');
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__shareTest=payload.files.map(f=>({name:f.name,type:f.type,size:f.size}));}});[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存与分享').click();});
 await page.waitForSelector('.result-share-preview',{timeout:30000});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='分享图片').click());
 await page.waitForFunction(()=>window.__shareTest?.length===1);
 const shared=await page.evaluate(()=>window.__shareTest[0]);assert.equal(shared.type,'image/png');assert.ok(shared.size>10000);console.log('Native file-share handoff verified with a mock:',shared);
 const consoleCheck=await page.evaluate(async()=>{
  const {render}=await import('/vendor/preact.module.js');const {html}=await import('/js/ui/components.js');const {EntertainmentConsole}=await import('/js/ui/entertainmentConsole.js');const {net}=await import('/js/net.js');
  const calls=[];net.request=async(type,msg)=>{calls.push({type,...msg});return {ok:true};};
  const host=document.createElement('div');document.body.appendChild(host);render(html`<${EntertainmentConsole} editable=${true} priv=${{consoleEnabled:true,ruleset:'entertainment',alive:true,shop:{level:6,maxLevel:7},lp:77,bonds:[],layerCap:9999}} />`,host);
  await new Promise(r=>setTimeout(r,50));host.querySelector('.entertainment-console-entry button').click();await new Promise(r=>setTimeout(r,50));
  const tab=label=>[...document.querySelectorAll('.console-tabs button')].find(b=>b.textContent===label).click();
  tab('调度等级');await new Promise(r=>setTimeout(r,50));const level=document.querySelector('.console-value input');const min=level.min;level.value='3';level.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,50));document.querySelector('.console-value button').click();await new Promise(r=>setTimeout(r,50));
  tab('生命值LP');await new Promise(r=>setTimeout(r,50));const lp=document.querySelector('.console-value input').value;
  return {min,lp,calls};
 });assert.equal(consoleCheck.min,'1');assert.equal(consoleCheck.lp,'77');assert.equal(consoleCheck.calls[0].kind,'level');assert.equal(consoleCheck.calls[0].amount,3);console.log('Console lower-level input and current LP verified:',consoleCheck);


}finally{await browser.close();await srv.close();}
