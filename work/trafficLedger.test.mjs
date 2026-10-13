import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { installTrafficLedger,readTrafficHistory,ledgerDay,trafficKind } from '../server/http/traffic-ledger.js';
import { createTrafficJournal,quotaChange } from '../monitor/ledger.mjs';
const fixtureRoot=path.resolve('work','traffic-fixtures');fs.mkdirSync(fixtureRoot,{recursive:true});
function fixture(){
 let time=Date.UTC(2026,9,13,10),root=fs.mkdtempSync(path.join(fixtureRoot,'case-'));
 const server=new EventEmitter(),sessions=[],conns=new Map(),room={code:'ABCD',matchCount:1,mode:'coop',difficulty:'HARD',seats:[],match:null};
 const srv={server,registry:{all:()=>sessions},network:{conns,onFrame(conn,msg){msg();}},lobby:{rooms:new Map([['ABCD',room]]),onMatchEnd(r){r.match=null;},disposeRoom(r){r.disposed=true;this.rooms.delete(r.code);},create(){},startMatch(){}}};
 const ledger=installTrafficLedger(srv,root,{now:()=>time,flushMs:30000});
 function socket(){const s=new EventEmitter();Object.assign(s,{bytesRead:0,bytesWritten:0,remoteAddress:'127.0.0.1',remotePort:12345});server.emit('connection',s);return s;}
 return {srv,ledger,sessions,room,root,socket,now:()=>time,advance:ms=>time+=ms,close:()=>ledger.close()};
}
test('actual TCP bytes separate pre-game, waiting room, match, and excluded monitor requests without double counting',()=>{
 const f=fixture();try{
  const socket=f.socket(),ws={_socket:socket},session={playerId:'p0',name:'Tester',roomCode:null,ws};f.sessions.push(session);f.srv.network.conns.set(ws,{ws,session});
  const conn=f.srv.network.conns.get(ws);socket.bytesRead=100;socket.bytesWritten=200;f.ledger.snapshot();
  f.srv.network.onFrame(conn,()=>{session.roomCode='ABCD';});socket.bytesRead+=20;socket.bytesWritten+=30;f.ledger.snapshot();
  f.srv.network.onFrame(conn,()=>{f.room.match={phase:'PREP',round:1,ended:false,order:[{...session,alive:true,lp:20,funds:10,stats:{kills:3,token:'do-not-log'}}]};});
  socket.bytesRead+=50;socket.bytesWritten+=500;const snapshot=f.ledger.snapshot();
  assert.deepEqual(snapshot.totals.inMatch,{receivedBytes:50,sentBytes:500});assert.deepEqual(snapshot.totals.outsideMatch,{receivedBytes:120,sentBytes:230});
  assert.equal(snapshot.rows.filter(r=>r.playerId==='p0').reduce((n,r)=>n+r.receivedBytes+r.sentBytes,0),900);
  const excluded=f.socket(),response=new EventEmitter();excluded.bytesRead=999;excluded.bytesWritten=9999;
  f.srv.server.emit('request',{socket:excluded,headers:{'x-stronghold-monitor':'1'},url:'/healthz'},response);response.emit('finish');
  assert.equal(f.ledger.snapshot().totals.sentBytes,730);socket.emit('close');assert.equal(f.ledger.snapshot().totals.sentBytes,730);
 }finally{f.close();}
});
test('browser-linked HTTP artwork is associated with a known player and actual compressed bytes',()=>{
 const f=fixture();try{
  const id='a'.repeat(32),socket=f.socket(),ws={_socket:socket},session={playerId:'p0',name:'Tester',roomCode:'ABCD',ws};f.sessions.push(session);
  f.srv.server.emit('upgrade',{socket,headers:{cookie:'sp_monitor_client='+id}});f.ledger.snapshot();
  const http=f.socket(),response=new EventEmitter();http.bytesRead=120;
  f.srv.server.emit('request',{socket:http,headers:{cookie:'sp_monitor_client='+id+'; unrelated_secret=no-exposure'},url:'/assets/local/portrait.webp?x=1'},response);
  http.bytesWritten=400;response.emit('finish');
  const row=f.ledger.snapshot().rows.find(r=>r.channel==='http'&&r.category==='image');assert.equal(row.playerId,'p0');assert.equal(row.attribution,'browserLinked');assert.equal(row.receivedBytes,120);assert.equal(row.sentBytes,400);
  assert.equal(JSON.stringify(f.ledger.snapshot()).includes('unrelated_secret'),false);
 }finally{f.close();}
});
test('room closure and final outcome survive destruction; same room code gets a different history identity',async()=>{
 const f=fixture();try{
  f.room.match={phase:'RESULT',round:14,order:[{playerId:'p0',name:'Tester',alive:true,lp:10,funds:99,stats:{kills:40}}]};f.ledger.snapshot();
  f.srv.lobby.onMatchEnd(f.room,{}, {victory:true,reason:'victory'});f.srv.lobby.disposeRoom(f.room,'empty');
  const newRoom={code:'ABCD',matchCount:0,seats:[],mode:'coop',difficulty:'HARD'};f.srv.lobby.rooms.set('ABCD',newRoom);f.ledger.snapshot();
  const result=await readTrafficHistory(f.ledger.directory,{day:ledgerDay(f.now()),kind:'rooms',limit:500});
  assert.equal(result.entries.some(r=>r.event==='MATCH_ENDED'&&r.players[0]?.funds===99&&r.outcome.victory),true);
  assert.equal(new Set(result.entries.filter(r=>r.code==='ABCD').map(r=>r.roomKey)).size,2);
  await assert.rejects(()=>readTrafficHistory(f.ledger.directory,{day:'../private',kind:'rooms'}));
 }finally{f.close();}
});
test('byte-offset pagination works with Chinese and resumes durable import without recounting',async()=>{
 const f=fixture();try{
  const socket=f.socket();for(let n=0;n<3;n++){socket.bytesWritten+=100;f.advance(31000);f.ledger.snapshot();}
  f.ledger.flush();const first=await readTrafficHistory(f.ledger.directory,{day:ledgerDay(f.now()),limit:1});assert.equal(first.entries.length,1);assert.ok(first.nextCursor>0);
  const second=await readTrafficHistory(f.ledger.directory,{day:ledgerDay(f.now()),cursor:first.nextCursor,limit:500});assert.equal(second.entries.length,2);
  const dataDir=path.join(f.root,'monitor-data');fs.mkdirSync(dataDir);const fetchHistory=q=>readTrafficHistory(f.ledger.directory,q);
  const admin={trafficLedger:f.ledger.snapshot()};const journal=createTrafficJournal({dataDir,fetchHistory,now:f.now});await journal.sync(admin,{}, {force:true});
  const report=await journal.report(ledgerDay(f.now()));assert.equal(report.total.sentBytes,300);
  const restored=createTrafficJournal({dataDir,fetchHistory,now:f.now});await restored.sync(admin,{}, {force:true});assert.equal((await restored.report(ledgerDay(f.now()))).total.sentBytes,300);
  await assert.rejects(()=>restored.read({day:'../../secrets'}));
 }finally{f.close();}
});
test('account ledger distinguishes consumption, replenishment, day reset and baseline',()=>{
 const first={time:Date.UTC(2026,9,13,10),accountName:'A',dailyUsedBytes:100,remainingBytes:1000};
 assert.equal(quotaChange(null,first).observedUsedBytes,null);
 assert.equal(quotaChange(first,{...first,time:first.time+60000,dailyUsedBytes:150,remainingBytes:950}).observedUsedBytes,50);
 const refill=quotaChange(first,{...first,time:first.time+60000,dailyUsedBytes:150,remainingBytes:1950});assert.equal(refill.observedUsedBytes,50);assert.equal(refill.remainingChangeBytes,950);
 assert.equal(quotaChange(first,{...first,time:first.time+86400000,dailyUsedBytes:10}).observedUsedBytes,null);
 assert.equal(quotaChange(first,{...first,accountName:'B'}).observedUsedBytes,null);
 assert.equal(trafficKind('/data/chess.json'),'data');assert.equal(trafficKind('/assets/a.skel'),'model');
});
