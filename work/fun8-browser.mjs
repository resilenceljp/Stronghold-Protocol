/* global document */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';
const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--no-sandbox']});
try {
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});await page.goto(srv.url,{waitUntil:'networkidle2'});
 const result=await page.evaluate(async()=>{
  const {data}=await import('/js/data.js');await data.loadAll('chess','items','bonds','assets','backups');
  const {diyPool}=await import('/shared/diy.js');const dd={chess:data.get('chess'),backups:data.get('backups')};
  const slot=Object.values(dd.chess).find(r=>r.isDiy&&!r.isGolden&&r.tier===5);const choices=diyPool(5,{data:dd});const charId=choices[0]?.charId||choices[0];
  const {render}=await import('/vendor/preact.module.js');const {html}=await import('/js/ui/components.js');const {EntertainmentConsole}=await import('/js/ui/entertainmentConsole.js');
  const host=document.createElement('div');document.body.appendChild(host);render(html`<${EntertainmentConsole} editable=${true} priv=${{consoleEnabled:true,ruleset:'entertainment',alive:true,shop:{level:6,maxLevel:7},lp:50,diy:{[slot.baseId||slot.chessId]:{charId}},bonds:[]}} />`,host);
  const tick=()=>new Promise(r=>setTimeout(r,80));await tick();host.querySelector('.entertainment-console-entry button').click();await tick();
  const first=document.querySelector('.console-card').textContent;
  const selects=[...document.querySelectorAll('.console-filters select')];const change=async(index,value)=>{selects[index].value=value;selects[index].dispatchEvent(new Event('change',{bubbles:true}));await tick();};
  const tiers=[...selects[0].options].map(o=>o.value);await change(0,'1');const tierRows=[...document.querySelectorAll('.console-card')].map(n=>n.textContent);await change(0,'');await change(1,'SNIPER');const profRows=[...document.querySelectorAll('.console-card')].map(n=>n.textContent);
  [...document.querySelectorAll('.console-tabs button')].find(n=>n.textContent==='装备').click();await tick();const itemSelects=document.querySelectorAll('.console-filters select');const itemMeta=document.querySelector('.console-card').textContent;
  return {charId,first,tiers,tierRows,profRows,itemFilters:itemSelects.length,itemMeta};
 });
 assert.ok(result.first.includes('自选'),JSON.stringify(result));assert.ok(result.tiers.includes('6'));assert.ok(result.tierRows.length>0&&result.tierRows.every(s=>s.includes('品阶 1')));assert.ok(result.profRows.length>0&&result.profRows.every(s=>s.includes('狙击')));assert.equal(result.itemFilters,3);assert.ok(result.itemMeta.includes('维多利亚'));
 console.log(JSON.stringify({selected:result.charId,first:result.first,tierCount:result.tierRows.length,professionCount:result.profRows.length,itemFilters:result.itemFilters,itemMeta:result.itemMeta}));
 await page.screenshot({path:'work/fun8-console.png'});
} finally {await browser.close();await srv.close();}
