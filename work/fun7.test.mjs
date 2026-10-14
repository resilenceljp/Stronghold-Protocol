import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../server/match/Match.js';
import {getData} from '../server/data.js';
import {VirtualScheduler} from '../server/match/scheduler.js';
import {consoleIntent,endlessFactor,endlessTemplateRound} from '../server/match/entertainment.js';
import {buildResult} from '../server/match/results.js';
import {recordToResult,buildRecord} from '../public/js/ui/stats.js';
const data=getData();
function make(){const m=new Match({data,mode:'coop',difficulty:'HARD',ruleset:'entertainment',seed:24,scheduler:new VirtualScheduler(),seats:[{seat:0,playerId:'p0',name:'T',isBot:false,connected:true}],send(){return true;},broadcast(){},onEnd(){},botRehearsal:0});m.start();return m;}
test('endless compounds per wave and each eighth wave builds an actual Boss template',()=>{
 assert.equal(endlessFactor(1),1.2);assert.ok(Math.abs(endlessFactor(8)-1.2**8)<1e-9);
 assert.ok(Math.abs(endlessFactor(9)-1.2**8*1.3)<1e-9);assert.ok(Math.abs(endlessFactor(17)-1.2**8*1.3**8*1.4)<1e-9);
 assert.equal(endlessFactor(15,15),1.2);assert.equal(endlessFactor(1e9),1e12);
 assert.deepEqual(Array.from({length:8},(_,i)=>endlessTemplateRound(i+1)),[7,8,9,10,11,12,13,14]);
 const m=make();try{m.setFunRules('p0',{endlessEnabled:true},m.setupRevision);
 for(const round of [8,16,24]){m.startRound(round);assert.equal(m.gd.bossRound,round);assert.ok(m.bossWaves[0].wave.spawns.length);assert.ok(m.bossWaves[0].wave.spawns.some(s=>s.preview?.boss));}
 m.startRound(17);assert.equal(m.gd.bossRound,24);assert.ok(m.wave.spawns.length);
 const result=buildResult(m,{victory:false,reason:'defeat'});assert.equal(result.endlessFloor,17);assert.equal(result.endlessCleared,16);assert.equal(recordToResult(buildRecord(result,{myId:'p0',now:1})).endlessFloor,17);
 }finally{m.dispose();}
});
test('console LP, reversible shop level, funds and upcoming enemies remain phase-scoped',()=>{
 const m=make();try{m.setFunRules('p0',{consoleEnabled:true,shopLevel7:true},m.setupRevision);m.startRound(1);m.phase='PREP';const p=m.order[0];
 assert.equal(consoleIntent(m,p,{kind:'lp',amount:77}).ok,true);assert.equal(p.lp,77);
 assert.equal(consoleIntent(m,p,{kind:'level',amount:7}).ok,true);assert.equal(p.shop.level,7);
 assert.equal(consoleIntent(m,p,{kind:'level',amount:1}).ok,true);assert.deepEqual(p.shop.layout,m.gd.shopSlots(1));assert.equal(p.shop.slots.length,p.shop.layout.chess+p.shop.layout.item);
 for(let i=0;i<2;i++)assert.equal(consoleIntent(m,p,{kind:'funds',amount:9999}).ok,true);assert.ok(p.funds>9999);
 const key=Object.keys(data.enemies).find(k=>data.enemies[k].rank==='NORMAL'&&!data.enemies[k].tokenOnly&&!data.enemies[k].templateSlot);
 assert.equal(consoleIntent(m,p,{kind:'enemy',id:key,amount:3}).ok,true);
 assert.ok(m._normalOpts(p).spawns.some(s=>s.enemyKey===key&&s.mods?.bountyId?.startsWith('console-')));
 assert.equal(p.bounties.find(b=>b.consoleGrant).roundsLeft,1);
 m.phase='COMBAT';assert.ok(consoleIntent(m,p,{kind:'lp',amount:88}).error);
 }finally{m.dispose();}
});
