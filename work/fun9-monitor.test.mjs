import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {startServer} from '../server/index.js';
import {startAdminServer} from '../server/http/boot.js';
import {kickMonitorPlayer} from '../server/http/monitor-v6.js';
import {TestClient} from '../test/helpers/wsClient.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const n=s.address().port;await new Promise(r=>s.close(r));return n;}
test('local-owner kick: lobby and room sockets close; resume credentials revoked; stale room refused; HTTP origin guarded',async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});const previous=process.env.SP_ADMIN_PORT;process.env.SP_ADMIN_PORT=String(await port());const admin=await startAdminServer(srv);const clients=[];
 try{
  const create=async name=>{const c=await TestClient.connect(srv.url.replace('http','ws')+'/ws');const w=await c.hello(name);c.id=w.playerId;clients.push(c);return c;};
  const lobby=await create('Lobby');const target=srv.registry.byId(lobby.id),token=target.token;const closed=once(lobby.ws,'close');kickMonitorPlayer(srv,{playerId:lobby.id,roomCode:null});await closed;assert.equal(srv.registry.byId(lobby.id),null);assert.equal(srv.registry.byToken(token),null);
  const host=await create('Host'),guest=await create('Guest');assert.equal((await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',capacity:4})).t,'ok');const room=[...srv.lobby.rooms.values()][0];assert.equal((await guest.request({t:'room.join',code:room.code})).t,'ok');
  assert.throws(()=>kickMonitorPlayer(srv,{playerId:guest.id,roomCode:null}),/location changed/);assert.ok(srv.registry.byId(guest.id));
  const url=`http://127.0.0.1:${admin.port}/admin/kick`,payload={playerId:guest.id,roomCode:room.code};
  const rejected=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example','X-Stronghold-Command':'local-monitor-kick'},body:JSON.stringify(payload)});assert.equal(rejected.status,403);
  const close=once(guest.ws,'close');const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Stronghold-Command':'local-monitor-kick'},body:JSON.stringify(payload)});assert.equal(r.status,200);await close;assert.equal(room.seatOf(guest.id),null);assert.equal(srv.registry.byId(guest.id),null);assert.ok(srv.registry.byId(host.id));
  const playing=await create('Playing');assert.equal((await playing.request({t:'room.join',code:room.code})).t,'ok');assert.equal((await playing.request({t:'room.ready',ready:true})).t,'ok');const started=await host.request({t:'room.start'});assert.equal(started.t,'ok',JSON.stringify(started));assert.ok(room.match);
  const departed=once(playing.ws,'close');kickMonitorPlayer(srv,{playerId:playing.id,roomCode:room.code});await departed;assert.equal(srv.registry.byId(playing.id),null);assert.ok(room.seatOf(playing.id)?.left||!srv.lobby.rooms.has(room.code));

 }finally{for(const c of clients)await c.terminate().catch(()=>{});await admin.close();await srv.close();if(previous===undefined)delete process.env.SP_ADMIN_PORT;else process.env.SP_ADMIN_PORT=previous;}
});
test('running-match kick uses normal onLeave and cannot target an AI or a stale identity',()=>{
 const calls=[],session={playerId:'human',name:'H',roomCode:'ROOM',connected:true,ws:{readyState:1,send:()=>{},close:()=>calls.push('close')}};const room={};
 const srv={registry:{byId:id=>id==='human'?session:null,remove:()=>calls.push('revoke')},lobby:{rooms:new Map([['ROOM',room]]),removeMember:(r,id)=>{assert.equal(r,room);assert.equal(id,'human');calls.push('leave');}}};
 kickMonitorPlayer(srv,{playerId:'human',roomCode:'ROOM'});assert.deepEqual(calls,['leave','close','revoke']);assert.throws(()=>kickMonitorPlayer(srv,{playerId:'bot',roomCode:'ROOM'}));
});
test('monitor moves off an occupied port and advertises the real port with a matching readiness PID',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-ports-'));const blocker=net.createServer();blocker.listen(0,'127.0.0.1');await once(blocker,'listening');const occupied=blocker.address().port;
 const child=spawn(process.execPath,['monitor/server.mjs'],{cwd:process.cwd(),env:{...process.env,MONITOR_UI_PORT:String(occupied),MONITOR_DATA_DIR:dir,MONITOR_SAKURA_DISABLED:'1'},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);
 try{const file=path.join(dir,`ui-ready-${child.pid}.json`);for(let i=0;i<120&&!fs.existsSync(file);i++)await pause(100);assert.ok(fs.existsSync(file),out);const ready=JSON.parse(fs.readFileSync(file));assert.notEqual(ready.port,occupied);assert.equal(ready.pid,child.pid);const status=await(await fetch(ready.url+'/api/status')).json();assert.equal(status.url,ready.url);assert.match(out,/EADDRINUSE/);}
 finally{child.kill();await once(child,'exit');await new Promise(r=>blocker.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
