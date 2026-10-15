import test from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../server/match/Match.js';import {getData} from '../server/data.js';import {VirtualScheduler} from '../server/match/scheduler.js';import {roomPoolGroups} from '../public/js/screens/room.js';
import {startServer} from '../server/index.js';import {clearMonitorRoom} from '../server/http/monitor-v6.js';import {TestClient} from '../test/helpers/wsClient.js';
test('Personnel Archives raises 12 to 13 and 8 to 9 through real equip hooks; repeats do not stack',()=>{
 for(const base of [8,12]){const m=new Match({data:getData(),mode:'coop',difficulty:'HARD',ruleset:'entertainment',seed:24,scheduler:new VirtualScheduler(),seats:[{seat:0,playerId:'p',name:'P',isBot:false,connected:true}],send(){return true;},broadcast(){},onEnd(){},botRehearsal:0});m.start();
 try{assert.equal(m.setFunRules('p',{deployCap:base},m.setupRevision).ok,true);m.startRound(1);m.phase='PREP';const p=m.order[0],unit=p.acquireChess('chess_char_1_01_a',{fromPool:false});assert.equal(p.deployCap,base);
 for(let i=0;i<2;i++){const item=p.acquireItem('chess_item_6_08_e_a');const r=p.equip(item.uid,unit.uid);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(p.deployCap,base+1);}}
 finally{m.dispose();}}
});
test('seat groups match real occupied-seat layouts, not absolute seat index / 4',()=>{
 for(const [n,sizes] of [[6,[3,3]],[10,[4,3,3]],[13,[5,4,4]],[20,[4,4,4,4,4]]]){const seats=Array.from({length:n},(_,i)=>({seat:i,playerId:'p'+i}));const groups=roomPoolGroups({capacity:20,seats});assert.deepEqual(sizes.map((_,i)=>[...groups.values()].filter(g=>g.id===i+1).length),sizes);}
 const seats=Array(20).fill(null);[0,2,5,10,12,17].forEach((seat,i)=>seats[seat]={seat,playerId:'p'+i});const groups=roomPoolGroups({capacity:20,seats});assert.equal(groups.get('p2').label,'A');assert.equal(groups.get('p3').label,'B');
});
test('clear waiting and running rooms releases humans and spectators to lobby without disconnecting; stale incarnation refused',async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});const cs=[];
 try{const make=async name=>{const c=await TestClient.connect(srv.url.replace('http','ws')+'/ws');const w=await c.hello(name);c.id=w.playerId;cs.push(c);return c;};const host=await make('Host'),guest=await make('Guest'),viewer=await make('Viewer');
 for(const playing of [false,true]){assert.equal((await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',capacity:4})).t,'ok');const room=[...srv.lobby.rooms.values()][0];assert.equal((await guest.request({t:'room.join',code:room.code})).t,'ok');assert.equal((await viewer.request({t:'room.spectate',code:room.code})).t,'ok');
 if(playing){await guest.request({t:'room.ready',ready:true});assert.equal((await host.request({t:'room.start'})).t,'ok');assert.ok(room.match);}
 const command={roomCode:room.code,createdAt:room.createdAt,matchNo:room.matchCount??room.matchNo??0};assert.throws(()=>clearMonitorRoom(srv,{...command,createdAt:room.createdAt+1}),/room changed/);assert.ok(srv.lobby.rooms.has(room.code));
 const result=clearMonitorRoom(srv,command);assert.equal(result.inMatch,playing);assert.equal(srv.lobby.rooms.has(room.code),false);assert.equal(room.match,null);for(const c of cs){assert.equal(srv.registry.byId(c.id).roomCode,null);assert.equal(c.ws.readyState,1);}}
 }finally{for(const c of cs)await c.terminate().catch(()=>{});await srv.close();}
});
