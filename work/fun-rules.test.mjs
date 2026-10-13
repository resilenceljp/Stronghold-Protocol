import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../server/match/Match.js';
import { getData } from '../server/data.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { awardRelic,chooseRelic } from '../server/match/relics.js';
import { RELICS,relicMods,relicWeights } from '../shared/relics.js';
import { validateC2S } from '../shared/protocol.js';
import { benchGeo,handTile } from '../shared/bench.js';
import { tileSlot,resolveDrop } from '../public/js/render/drag.js';
import { buildBattleSpec,createBattleFromSpec } from '../server/sim/spec.js';
import { collectViolations } from '../server/match/invariants.js';
const data=getData({log:{warn(){},info(){},error(){}}});
function create(ruleset='entertainment',humans=1) {
 const m=new Match({mode:'coop',difficulty:'HARD',ruleset,seed:24,data,
 seats:Array.from({length:humans},(_,seat)=>({seat,playerId:`p${seat}`,name:`Test${seat}`,isBot:false,connected:true})),
 send(){return true;},broadcast(){},onEnd(){},scheduler:new VirtualScheduler(),botRehearsal:0});m.start();return m;
}
test('strict host rule payloads; revision cancels consent and cannot change standard matches',()=>{
 const m=create(),p=m.order[0];p.infoReady=true;
 assert.equal(m.setFunRules('p0',{startingFunds:50,training:'max',deployCap:12,expandedBench:true,relicsEnabled:true},0).ok,true);
 assert.equal(m.setupRevision,1);assert.equal(p.infoReady,false);assert.equal(p.deployCap,12);
 assert.ok(m.setFunRules('p0',{startingFunds:60},0).error);
 for(const rules of [{startingFunds:-1},{startingFunds:1.5},{deployCap:999},{training:'bad'},{relicIds:['bad']},{relicIds:['ruler','ruler']},{admin:true}]) {
  assert.ok(validateC2S({t:'room.funRules',rules,setupRevision:0}));assert.ok(m.setFunRules('p0',rules,1).error);
 }
 m.dispose();const s=create('standard');assert.ok(s.setFunRules('p0',{deployCap:12},0).error);assert.equal(s.order[0].hand.length,10);s.dispose();
});
test('starting funds paid exactly once in R1; default normal income remains, max applies to actual battle input',()=>{
 const m=create(),p=m.order[0];m.setFunRules('p0',{startingFunds:50,training:'max',deployCap:12,expandedBench:true},0);
 m.startRound(1);m.phase='PREP';assert.equal(p.funds,50+m.gd.income(1));assert.equal(p.hand.length,22);
 p.setLoadout(null,{char_133_mm:{potential:1,cultivate:0}});
 const cv=p.cultivationFor(m.gd.chess('chess_char_1_12_a'));assert.deepEqual(cv,{potential:6,cultivate:3});
 m.startRound(2);assert.equal(p.funds,50+m.gd.income(1)+m.gd.income(2));assert.deepEqual(collectViolations(m),[]);m.dispose();
});
test('battlefield-only reroll requires everyone; reject/disconnect preserve map; approval changes only map',()=>{
 const m=create('entertainment',3),before={boss:m.bossId,bans:m.bannedChess,pool:m.pool,factions:m.factions};const stage=m.stageId;
 assert.equal(m.requestSetupReroll('p0',0,'battlefield').ok,true);const id=m.setupVote.id;
 assert.equal(m.voteSetupReroll(m.order[1],id,true).ok,true);assert.equal(m.stageId,stage);
 m.voteSetupReroll(m.order[2],id,false);assert.equal(m.stageId,stage);assert.equal(m.setupVote,null);
 m.sched.source.advance(301);m.requestSetupReroll('p0',0,'battlefield');m.onDisconnect('p2');assert.equal(m.setupVote,null);
 m.onReconnect('p2');m.sched.source.advance(301);m.requestSetupReroll('p0',0,'battlefield');const v=m.setupVote.id;
 m.voteSetupReroll(m.order[1],v,true);m.voteSetupReroll(m.order[2],v,true);
 assert.notEqual(m.stageId,stage);assert.deepEqual({boss:m.bossId,bans:m.bannedChess,pool:m.pool,factions:m.factions},before);
 assert.equal(m.setupRevision,1);m.dispose();
});
test('22 slots map to two rows of11; server permits slot21 but standard denies it',()=>{
 const geo=benchGeo(22);
 for(let idx=0;idx<22;idx++){const tile=handTile(idx,geo);assert.ok(tile.col<11);assert.deepEqual(tileSlot(tile,geo),{area:'hand',idx});}
 assert.deepEqual(handTile(21,geo),{row:8,col:10});
 assert.deepEqual(resolveDrop({piece:{uid:1},from:{area:'hand',idx:0},tile:{row:8,col:10},overCanvas:true,geo}).target,{area:'hand',idx:21});
 const m=create();m.setFunRules('p0',{expandedBench:true},m.setupRevision);m.startRound(1);m.phase='PREP';const p=m.order[0];p.acquireChess('chess_char_1_12_a',{source:'console',fromPool:false});
 assert.equal(p.move(p.hand.find(Boolean).uid,{area:'hand',idx:21}).ok,true);assert.equal(p.hand[21].id,'chess_char_1_12_a');
 const spec=buildBattleSpec(m._normalOpts(p));assert.equal(spec.players[0].units.length,0,'bench never enters battle');m.dispose();
 const s=create('standard');s.startRound(1);s.phase='PREP';const q=s.order[0];q.acquireChess('chess_char_1_12_a',{source:'test',fromPool:false});assert.ok(q.move(q.hand.find(Boolean).uid,{area:'hand',idx:21}).error);s.dispose();
});
test('relic perfect/pity offers deterministic unique IDs; own selections persist and exclude acquired entries',()=>{
 const m=create(),p=m.order[0];m.setFunRules('p0',{relicsEnabled:true},0);m.round=1;awardRelic(m,p,0);
 assert.equal(p.relicOffer.choices.length,3);assert.equal(new Set(p.relicOffer.choices).size,3);
 m.phase='PREP';const offer=p.relicOffer,id=offer.choices[0];assert.ok(chooseRelic(m,p,id,'stale').error);
 assert.ok(p.setReady(true).error);assert.equal(chooseRelic(m,p,id,offer.id).ok,true);
 assert.equal(p.relics[0].id,id);m.round=2;awardRelic(m,p,0);assert.ok(!p.relicOffer.choices.includes(id));
 p.relicOffer=null;for(let r=3;r<=5;r++){m.round=r;awardRelic(m,p,1);}
 assert.equal(p.relicOffer.pity,true);assert.equal(p.nextRelicShield,2);assert.ok(p.relicOffer.choices.every(id=>RELICS.find(x=>x.id===id).tier>=3));
 assert.equal(p.relics.length,1);m.onDisconnect('p0');m.onReconnect('p0');assert.equal(p.privateView().relicOffer.id,p.relicOffer.id);m.dispose();
});
test('empty pool does not block progression; pity shield lasts next normal round only; elimination clears offers',()=>{
 const m=create(),p=m.order[0];m.setFunRules('p0',{relicsEnabled:true,relicIds:[]},0);
 m.round=1;awardRelic(m,p,0);assert.equal(p.relicOffer,null);p.nextRelicShield=2;m.startRound(2);assert.equal(p.relicShield,2);
 m.lastResults.set('p0',{leaked:[{},{},{}],killed:0,perfect:false});m.settle(null,null);
 assert.equal(p.stats.lpLost,1);assert.equal(p.relicShield,0);m.startRound(3);assert.equal(p.relicShield,0);m.dispose();
});
test('collections affect real BattleSpec deterministically, stack additive, do not leak to opponents or summons',()=>{
 const m=create(),p=m.order[0];m.setFunRules('p0',{relicsEnabled:true},0);m.startRound(1);m.phase='PREP';
 const piece=p.acquireChess('chess_char_1_12_a',{source:'console',fromPool:false});let loc;
 for(let r=9;r<=12&&!loc;r++)for(let c=2;c<=10&&!loc;c++) if(p.move(piece.uid,{area:'board',row:r,col:c}).ok)loc=[r,c];
 assert.ok(loc);p.relics=[{id:'crown',round:1},{id:'scope',round:1},{id:'blade',round:1},{id:'avenger',round:1}];
 assert.equal(relicMods(p.relics.map(x=>x.id)).atkPct,0.75);assert.ok(Math.abs(relicMods(p.relics.map(x=>x.id)).physDealtMul-1.4)<1e-9);
 const spec=buildBattleSpec(m._normalOpts(p)),a=createBattleFromSpec(spec,m.ds,{content:'none'}),b=createBattleFromSpec(JSON.parse(JSON.stringify(spec)),m.ds,{content:'none'});
 const unit=a.players[0].units.find(u=>u.uid===piece.uid);assert.ok(unit.buffs.some(x=>x.key==='entertainment:relics'));assert.equal(a.errorCount||0,0);a.start();b.start();assert.deepEqual(unit.s,b.players[0].units.find(u=>u.uid===piece.uid).s);assert.equal(unit.buffs.find(x=>x.key==='entertainment:relics').persist,true);
 assert.deepEqual(relicWeights(22),[10,30,35,15,10]);assert.equal(relicWeights(3)[2],0);m.dispose();
});
