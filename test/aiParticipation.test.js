import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';
import { aiBandAction, beginAiBandVote } from '../server/aiBands.js';
import { takeoverVoters } from '../server/aiTakeover.js';
import { ROOM_CAPACITIES } from '../shared/constants.js';
import { poolGroupSizes } from '../shared/playerCapacity.js';
async function fixture(t) {
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,botRehearsal:0});const clients=[];
 t.after(async()=>{for(const c of clients)await c.terminate().catch(()=>{});await srv.close();});
 const player=async name=>{const c=await TestClient.connect(srv.url.replace('http','ws')+'/ws');clients.push(c);const w=await c.hello(name);c.id=w.playerId;c.token=w.token;return c;};
 const host=await player('Host');assert.equal((await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',capacity:12})).t,'ok');const room=[...srv.lobby.rooms.values()][0];
 const a=await player('A'),b=await player('B');for(const c of [a,b]){await c.request({t:'room.join',code:room.code});await c.request({t:'room.ready',ready:true});}
 await host.request({t:'room.addBot'});const other=await player('Other');await other.request({t:'room.join',code:room.code});await other.request({t:'room.ready',ready:true});
 for(let i=0;i<3;i++)await host.request({t:'room.addBot'});
 assert.equal((await host.request({t:'room.start'})).t,'ok');const m=room.match;m.startRound(1);m.phase='PREP';m.setDeadline(0);for(const p of m.order){p.adminManual=p.isBot;p._botPrepToken=(p._botPrepToken||0)+1;}
 const late=await player('Late');assert.equal((await late.request({t:'room.spectate',code:room.code})).t,'ok');return {srv,room,m,host,a,b,other,late,player};
}
test('12 replaces 10 as an offered capacity and full rooms form three original pools',()=>{assert.deepEqual(ROOM_CAPACITIES,[4,8,12,16,20]);assert.deepEqual(poolGroupSizes(12),[4,4,4]);});
test('spectator request requires group majority; cross-group votes fail; ownership and reconnect survive',async t=>{
 const {srv,room,m,host,a,other,late}=await fixture(t);const bot=m.order[3],oldId=late.id,newId=bot.playerId,token=late.token;bot.funds=71;const piece=bot.acquireChess('chess_char_1_01_a',{fromPool:false});
 assert.equal((await late.request({t:'room.aiRequest',botId:newId})).t,'ok');const vote=room.aiTakeoverVotes[0];assert.equal(vote.eligible.length,3);
 assert.equal((await other.request({t:'room.aiVote',voteId:vote.id,approve:true})).t,'error');
 assert.equal((await host.request({t:'room.aiVote',voteId:vote.id,approve:true})).t,'ok');assert.equal(bot.isBot,true);
 assert.equal((await host.request({t:'room.aiVote',voteId:vote.id,approve:true})).t,'ok');assert.equal(bot.isBot,true,'duplicate votes count once');
 late.clearInbox();const approved=await a.request({t:'room.aiVote',voteId:vote.id,approve:true});assert.equal(approved.t,'ok',JSON.stringify(approved));await late.waitFor('welcome',w=>w.playerId===newId);
 assert.equal(bot.isBot,false);assert.equal(bot.funds,71);assert.ok(bot.hand.some(x=>x?.uid===piece.uid));assert.equal(srv.registry.byId(oldId),null);assert.equal(srv.registry.byToken(token).playerId,newId);assert.equal(m.poolGroups[0].playerIds.includes(newId),true);
 assert.equal((await late.request({t:'g.refresh'})).t,'ok');await late.terminate();const resumed=await TestClient.connect(srv.url.replace('http','ws')+'/ws');t.after(()=>resumed.terminate());const welcome=await resumed.hello('Late',token);assert.equal(welcome.playerId,newId);assert.equal(welcome.resumed,true);
});
test('combat cannot accept a takeover and a majority rejection closes the request',async t=>{
 const {room,m,host,a,late}=await fixture(t);const bot=m.order[3];m.phase='COMBAT';assert.equal((await late.request({t:'room.aiRequest',botId:bot.playerId})).t,'error');m.phase='PREP';await late.request({t:'room.aiRequest',botId:bot.playerId});const id=room.aiTakeoverVotes[0].id;
 await host.request({t:'room.aiVote',voteId:id,approve:false});assert.equal(room.aiTakeoverVotes.length,1);await a.request({t:'room.aiVote',voteId:id,approve:false});assert.equal(room.aiTakeoverVotes.length,0);assert.equal(bot.isBot,true);
});
test('AI strategy votes are group scoped and apply only on majority',async t=>{
 const {srv,room,m,host,a,other}=await fixture(t);room.aiBandPolicy='vote';m.phase='INFO_CHECK';m.enterBandDraft();const bot=m.order[3],g=m.draftGroup(bot.playerId);g.order=[bot.playerId];g.idx=0;g.done=false;m.clearDraftGroupTimer(g);assert.equal(beginAiBandVote(srv.lobby,room,bot,g),true);
 const id=m.gd.bandIds().find(id=>m.gd.bandAllowed(id)&&!m.bandTaken(id,bot.playerId));const action=c=>aiBandAction(srv.lobby,srv.registry.byId(c.id),{t:'room.aiBandVote',draftId:m.draft.id,botId:bot.playerId,bandId:id});
 assert.ok(action(other).error);assert.ok(aiBandAction(srv.lobby,srv.registry.byId(host.id),{t:'room.aiBandVote',draftId:'stale',botId:bot.playerId,bandId:id}).error);assert.ok(!action(host).error);assert.equal(m.draft.picks[bot.playerId],undefined);assert.ok(!action(a).error);assert.equal(m.draft.picks[bot.playerId],id);assert.equal(room.aiBandVotes.length,0);
});

test('a group without online humans delegates to the online host only',()=>{
 const seats=[{playerId:'host',connected:true,isBot:false},{playerId:'bot',isBot:true,connected:true}];const room={hostId:'host',seats,seatOf:id=>seats.find(s=>s.playerId===id),match:{poolGroups:[{playerIds:['bot']}],players:new Map()}};
 assert.deepEqual(takeoverVoters(room,'bot'),['host']);seats[0].connected=false;assert.deepEqual(takeoverVoters(room,'bot'),[]);
});
test('AI policy is host-only before drafting and invalidates prior briefing readiness',async t=>{
 const {srv,room,m,host,a}=await fixture(t);const action=(c,policy)=>aiBandAction(srv.lobby,srv.registry.byId(c.id),{t:'room.aiPolicy',policy});
 m.phase='INFO_CHECK';const revision=m.setupRevision;m.order[0].infoReady=true;assert.ok(action(a,'vote').error);assert.ok(!action(host,'vote').error);assert.equal(room.aiBandPolicy,'vote');assert.equal(m.setupRevision,revision+1);assert.equal(m.order[0].infoReady,false);
 m.phase='PREP';assert.ok(action(host,'auto').error);assert.equal(room.aiBandPolicy,'vote');
});
