import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Match } from '../server/match/Match.js';
import { getData } from '../server/data.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { validateC2S } from '../shared/protocol.js';
import { DataSource } from '../server/sim/simdata.js';
import { buildBattleSpec,createBattleFromSpec } from '../server/sim/spec.js';
import { sendMonitorMessage } from '../server/http/monitor-v6.js';
import { MatchChat } from '../server/matchChat.js';
const data=getData({log:{warn(){},error(){},info(){}}});
function make(humans=2,ruleset='entertainment'){
 const sched=new VirtualScheduler();const m=new Match({data,mode:'coop',difficulty:'HARD',ruleset,seed:24,scheduler:sched,
 seats:Array.from({length:humans},(_,seat)=>({seat,playerId:`p${seat}`,name:`T${seat}`,isBot:false,connected:true})),send(){return true;},broadcast(){},onEnd(){},botRehearsal:0});m.start();return m;
}
test('finite victory requires every human, rejects stale votes, and preserves state when continuing',()=>{
 const m=make();m.round=14;m.order[0].funds=77;
 const started=[];m.startRound=r=>started.push(r);m.offerEndless({victory:true,reason:'victory'});
 const id=m.endlessVote.id;assert.ok(m.voteEndless(m.order[0],id+1,true).error);
 m.voteEndless(m.order[0],id,true);assert.deepEqual(started,[]);assert.equal(m.ended,false);
 m.voteEndless(m.order[1],id,true);assert.deepEqual(started,[15]);assert.equal(m.ruleset,'endless');
 assert.equal(m.order[0].funds,77);assert.equal(m.gd.maxShopLevel,6);assert.equal(m.endlessVote,null);m.dispose();
});
test('refusal, timeout and departure finish with the original victory; standard does not offer a vote',()=>{
 for(const action of ['refuse','timeout','leave']){const m=make();m.round=14;const ended=[];m.finish=x=>ended.push(x);
 m.offerEndless({victory:true,reason:'victory'});if(action==='refuse')m.voteEndless(m.order[0],m.endlessVote.id,false);
 if(action==='timeout')m.sched.source.runUntil(()=>ended.length,61000);if(action==='leave')m.onLeave('p0');
 assert.equal(ended.length,1);assert.equal(ended[0].victory,true);assert.equal(m.endlessVote,null);m.dispose();}
 const s=make(1,'standard');s.finish=x=>{s.outcome=x;};s.offerEndless({victory:true});assert.equal(s.endlessVote,undefined);assert.equal(s.outcome.victory,true);s.dispose();
});
test('endless and shop7 are independent preparation options, changing rules invalidates readiness',()=>{
 const m=make();assert.equal(m.setFunRules('p0',{endlessEnabled:true,shopLevel7:false},0).ok,true);
 assert.equal(m.ruleset,'endless');assert.equal(m.gd.maxShopLevel,6);
 assert.equal(m.setFunRules('p0',{endlessEnabled:false,shopLevel7:true},1).ok,true);
 assert.equal(m.ruleset,'entertainment');assert.equal(m.gd.maxShopLevel,7);
 const a=m.gd.shopSlots(6),b=m.gd.shopSlots(7);assert.deepEqual(b,{chess:a.chess+1,item:a.item+1});
 assert.equal(m.order.every(p=>!p.infoReady),true);assert.ok(validateC2S({t:'g.endlessVote',voteId:1,agree:'yes'}));m.dispose();
});
test('full training caps follow official rarity, full trust and potential; battle uses the same generated profile',()=>{
 const full=data['full-training'];assert.ok(full?.chess);const rows=Object.values(full.chess).filter(c=>c.charId&&!c.isDiy);
 for(const c of rows){assert.ok(c.status.level>0);if(c.rarity===6)assert.deepEqual([c.status.phase,c.status.level],[2,90]);if(c.rarity===5)assert.deepEqual([c.status.phase,c.status.level],[2,80]);if(c.rarity===4)assert.deepEqual([c.status.phase,c.status.level],[2,70]);if(c.rarity===3)assert.deepEqual([c.status.phase,c.status.level],[1,55]);}
 const exu=rows.find(c=>c.charId==='char_103_angel');assert.equal(exu.stats.atk,540+90+27+41);
 const ds=new DataSource(data);const spec=buildBattleSpec({fullTraining:true,players:[],spawns:[],stageId:Object.keys(data.stages)[0]});
 const b=createBattleFromSpec(spec,ds,{quiet:true});assert.equal(b.data.rawChess(exu.chessId).status.level,90);
 assert.throws(()=>createBattleFromSpec(spec,new DataSource({chess:data.chess})),/full training data unavailable/);
 const m=make();assert.equal(m.setFunRules('p0',{training:'max'},0).ok,true);assert.equal(m.gd.chess(exu.chessId).status.level,90);m.dispose();
});
test('administrator messages target a room or everyone without leaking tokens and retain bounded current chat',()=>{
 const sent=[],chat=new MatchChat();const rooms=new Map([['ABCD',{code:'ABCD',seats:[{playerId:'p0'}],spectators:[],matchCtx:{chat}}],['EFGH',{code:'EFGH',seats:[{playerId:'p1'}],spectators:[]}]]);
 const srv={lobby:{rooms,broadcastRoom:(r,msg)=>sent.push(['chat',r.code,msg])},registry:{all:()=>['p0','p1','lobby'].map(playerId=>({playerId,token:'secret',ws:{readyState:1,send:frame=>sent.push([playerId,JSON.parse(frame)])}}))}};
 const result=sendMonitorMessage(srv,{scope:'room',roomCode:'ABCD',text:'Hello <b>literal</b>'});assert.equal(result.recipients,1);assert.equal(chat.messages.length,1);assert.equal(sent.some(x=>x[0]==='p1'),false);assert.equal(JSON.stringify(sent).includes('secret'),false);
 assert.equal(sendMonitorMessage(srv,{scope:'all',text:'All'}).recipients,3);
 assert.throws(()=>sendMonitorMessage(srv,{scope:'room',roomCode:'NONE',text:'X'}));assert.throws(()=>sendMonitorMessage(srv,{scope:'all',text:'x'.repeat(201)}));chat.clear();
});
test('console is part of the existing button flow and reroll stays on first briefing page',()=>{
 const game=readFileSync(new URL('../public/js/screens/game.js',import.meta.url),'utf8');assert.equal((game.match(/<\$\{EntertainmentConsole\}/g)||[]).length,1);assert.ok(game.indexOf('<${EntertainmentConsole}')>game.indexOf('<div class="gm__corner">'));
 const rules=readFileSync(new URL('../public/js/ui/funRules.js',import.meta.url),'utf8');assert.equal(rules.includes('SetupReroll'),false);
 const lobby=readFileSync(new URL('../public/js/screens/lobby.js',import.meta.url),'utf8');assert.equal(lobby.includes("['endless', t('无尽模拟')]"),false);
});

