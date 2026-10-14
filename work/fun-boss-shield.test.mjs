import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../server/match/Match.js';
import {VirtualScheduler} from '../server/match/scheduler.js';
import {getData} from '../server/data.js';
test('Boss round combines next-round shields and absorbs LP loss before team damage',()=>{
 const m=new Match({mode:'solo',difficulty:'NORMAL',ruleset:'endless',seed:1,data:getData(),
 seats:[{seat:0,playerId:'p',name:'Test',isBot:false,connected:true}],send(){return true;},broadcast(){},onEnd(){},scheduler:new VirtualScheduler(),botRehearsal:0});
 m.start();m.startRound(8);m.order[0].lp=28;m.order[0].relicShield=2;m.startFinalAssault(false);
 assert.equal(m.teamRelicShield,2);const lp=m.teamLp;m._teamLpLoss(1);assert.equal(m.teamLp,lp);assert.equal(m.teamRelicShield,1);
 m._teamLpLoss(2);assert.equal(m.teamLp,lp-1);assert.equal(m.teamRelicShield,0);m.dispose();
});
