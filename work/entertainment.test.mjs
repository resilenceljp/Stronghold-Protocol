import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../server/match/Match.js';
import { getData } from '../server/data.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { buildBattleSpec, createBattleFromSpec } from '../server/sim/spec.js';
import { validateC2S } from '../shared/protocol.js';
import { encodeWire, decodeWire } from '../shared/wireCodec.js';
import { collectViolations } from '../server/match/invariants.js';
const data = getData({log:{warn(){},info(){},error(){}}});
function match(ruleset='standard', consoleEnabled=true, mode='solo') {
 const m = new Match({mode,difficulty:'NORMAL',ruleset,consoleEnabled,seed:3,data,
  seats:[{seat:0,playerId:'p_test',name:'Test',isBot:false,connected:true}],
  send(){return true;},broadcast(){},onEnd(){},scheduler:new VirtualScheduler(),botRehearsal:0});
 m.start(); m.startRound(1); m.phase='PREP';
 return m;
}
const intent=(m,kind,id,amount=1)=>m.handle('p_test',{t:'g.console',kind,...(id?{id}:{}),amount});
test('console protocol and compact wire accept strict shape and retain new room flags',()=>{
 assert.equal(validateC2S({t:'g.console',kind:'layers',id:'bond_victoria',amount:9999}),null);
 assert.ok(validateC2S({t:'g.console',kind:'layers',id:'x',amount:10000}));
 const msg={t:'g.console',kind:'funds',amount:19};
 assert.deepEqual(decodeWire(encodeWire(msg,'c2s'),'c2s'),msg);
});
test('standard and disabled entertainment deny console; phase/ready gates and unknown targets apply',()=>{
 for(const [mode,on] of [['standard',true],['entertainment',false]]) {
  const m=match(mode,on); assert.ok(intent(m,'funds').error); m.dispose();
 }
 const m=match('entertainment');
 assert.ok(intent(m,'chess','invalid').error);
 m.phase='COMBAT'; assert.ok(intent(m,'funds').error);
 m.phase='PREP'; m.order[0].ready=true; assert.ok(intent(m,'funds').error);
 m.dispose();
});
test('unlimited repeated self grants; free chess reserves no shared stock; layers use original increment hook up to9999',()=>{
 const m=match('entertainment'),p=m.order[0],b=m.gd.bondIds[0];
 for(let i=0;i<60;i++) assert.equal(intent(m,'funds',null,1).ok,true);
 assert.equal(intent(m,'layers',b,9998).ok,true); p.addLayers(b,20); assert.equal(p.layers[b],9999);
 assert.equal(intent(m,'chess','chess_char_1_12_a').ok,true);
 assert.equal(p.hand.find(Boolean).poolCopies,0);
 assert.equal(intent(m,'level',null,6).ok,true); assert.equal(p.shop.level,6);
 assert.ok(intent(m,'level',null,7).error);
 assert.deepEqual(collectViolations(m),[]); m.dispose();
});
test('standard layer cap remains999; pending views and settlement share room cap',()=>{
 const s=match(); const b=s.gd.bondIds[0]; s.order[0].addLayers(b,9999); assert.equal(s.order[0].layers[b],999);s.dispose();
 const m=match('entertainment'),p=m.order[0];p.addLayers(b,9990);p.pendingLayerGains={[b]:100};
 assert.equal(p.bondsView()[b].layers,9999);
 m.lastResults.set(p.playerId,{leaked:[],perfect:true,layerGains:{[b]:100}});m.settle(null,null);
 assert.equal(p.layers[b],9999);m.dispose();
});
test('actual simulation layer cap survives BattleSpec and holds at9999',()=>{
 const m=match('entertainment'),p=m.order[0],id=m.gd.bondIds[0];p.addLayers(id,9990);
 const opts=m._normalOpts(p);const spec=buildBattleSpec(opts);assert.equal(spec.flags.layerCap,9999);
 const battle=createBattleFromSpec(spec,m.ds,{content:'none'});battle.start();
 assert.equal(battle.addLayers(p.playerId,id,100),9);assert.equal(battle.addLayers(p.playerId,id,100),0);
 m.dispose();
});
test('endless uses an eight-wave cycle, no hidden, eight maps and rising compounding',()=>{
 const m=match('endless'),p=m.order[0];assert.equal(m.gd.bossRound,8);assert.equal(m.gd.hiddenRound,null);
 assert.equal(m.gd.mode.stages.length,8);assert.equal(m.gd.maxShopLevel,7);
 assert.equal(m.gd.enemyScale(1).hpMul,1.2);assert.ok(Math.abs(m.gd.enemyScale(15).atkMul-1.2**8*1.3**7)<1e-8);
 assert.equal(intent(m,'level',null,7).ok,true);p.rollShop();assert.equal(p.shop.layout.item,2);
 assert.equal(p.shop.slots.at(-1).special,undefined);assert.equal(p.shop.layout.chess,6);assert.equal(p.shop.slots.length,8);
 m.startRound(15);assert.ok(m.wave.spawns.length>0);assert.ok(m.wave.spawns.every(s=>s.mods.defMul>1));
 m.startRound(99);assert.ok(m.wave.spawns.length>0);assert.ok(Number.isFinite(m.gd.enemyScale(10000).hpMul));
 m.dispose();
});
test('actual first cycle Boss win enters9 then ordinary settlement enters10; loss ends',()=>{
 const m=match('endless');m.startRound(8);m.startFinalAssault(false);
 m.bossPool.hp=0;m._finalEnding='cleared';m._finishFinal(false,()=>({synthetic:true,perPlayer:{}}));
 m.sched.source.runUntil(()=>m.round===9 || m.ended,1000);
 assert.equal(m.round,9);assert.equal(m.ended,false);assert.equal(m.hiddenReached,false);
 m.phase='SETTLE';m.afterSettle();assert.equal(m.round,10);m.startRound(16);m.startFinalAssault(false);m.bossPool.hp=0;m._finalEnding='cleared';m._finishFinal(false,()=>({synthetic:true,perPlayer:{}}));m.sched.source.runUntil(()=>m.round===17||m.ended,1000);assert.equal(m.round,17);assert.equal(m.ended,false);m.dispose();
 const loss=match('endless');loss.startRound(8);loss.startFinalAssault(false);loss._finalEnding='forced';
 loss._finishFinal(false,()=>({synthetic:true,perPlayer:{}}));
 loss.sched.source.runUntil(()=>loss.ended,1000);assert.equal(loss.ended,true);assert.equal(loss.round,8);loss.dispose();
});
test('twenty-seat room isolates two human consoles and reconnect retains permission',()=>{
 const seats=Array.from({length:20},(_,seat)=>({seat,playerId:seat<2?`p_${seat}`:`ai_${seat}`,name:`S${seat}`,isBot:seat>=2,connected:true}));
 const m=new Match({mode:'coop',difficulty:'NORMAL',ruleset:'entertainment',consoleEnabled:true,seed:3,data,seats,
   send(){return true;},broadcast(){},onEnd(){},scheduler:new VirtualScheduler(),botRehearsal:0});
 m.start();m.startRound(1);m.phase='PREP';
 const before=m.order[1].funds;
 assert.equal(m.handle('p_0',{t:'g.console',kind:'funds',amount:99,playerId:'p_1'}).ok,true);
 assert.equal(m.order[1].funds,before);
 m.onDisconnect('p_0');m.onReconnect('p_0');assert.equal(m.consoleEnabled,true);
 assert.equal(m.handle('p_1',{t:'g.console',kind:'layers',id:m.gd.bondIds[0],amount:9999}).ok,true);
 assert.equal(m.order[0].layers[m.gd.bondIds[0]]||0,0);assert.equal(m.order[1].layers[m.gd.bondIds[0]],9999);
 assert.deepEqual(collectViolations(m),[]);m.dispose();
});
