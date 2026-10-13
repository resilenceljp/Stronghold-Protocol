// i18n-ignore-file: Local administrator accounting, no player-facing UI or credentials.
// TCP counters include HTTP/WS framing and compressed bodies, but never FRP/TLS/IP billing overhead.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

export const ledgerDay = time => new Date(time + 8 * 3600000).toISOString().slice(0,10);
const cookieId = headers => /(?:^|;\s*)sp_monitor_client=([a-f0-9]{32})(?:;|$)/.exec(headers?.cookie||'')?.[1] || null;
const local = address => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
const num = value => Number.isFinite(value) ? value : null;
export function trafficKind(url) {
 const pathname=String(url||'').split('?')[0];
 if(pathname.startsWith('/data/'))return 'data';
 if(/\.(mp3|ogg|wav|m4a)$/i.test(pathname))return 'audio';
 if(/\.(bin|skel|atlas|glb|gltf)$/i.test(pathname))return 'model';
 if(/\.(png|webp|jpg|jpeg|gif|svg)$/i.test(pathname))return 'image';
 if(/\.(js|mjs|css|woff2?)$/i.test(pathname))return 'code';
 return 'page';
}

export function installTrafficLedger(srv,root,{now=Date.now,flushMs=30000,maxCells=5000}={}) {
 const runId=`${process.pid}-${now()}`,dir=path.join(root,'runtime','monitor-traffic');
 const sourceId=createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
 const sockets=new Map(),cells=new Map(),pending=new Map(),clients=new Map(),roomKeys=new WeakMap(),rooms=new Map();
 const totals={receivedBytes:0,sentBytes:0,inMatch:{receivedBytes:0,sentBytes:0},outsideMatch:{receivedBytes:0,sentBytes:0}};
 let nextRoom=0,nextRecord=0,lastFlush=now(),storageError=null,evictedCells=0;
 const files={usage:'traffic',rooms:'rooms'};
 function append(kind,entries){
  if(!entries.length)return true;
  try{fs.mkdirSync(dir,{recursive:true});const groups=new Map();
   for(const row of entries){row.recordId||=`${runId}:record${++nextRecord}`;row.sourceId=sourceId;const day=ledgerDay(row.time);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(row);}
   for(const [day,rows] of groups)fs.appendFileSync(path.join(dir,`${files[kind]}-${day}.ndjson`),rows.map(r=>JSON.stringify(r)).join('\n')+'\n','utf8');
   storageError=null;return true;
  }catch(error){storageError=error.message;return false;}
 }
 function identity(room){
  let key=roomKeys.get(room);if(!key){key=`${runId}:room${++nextRoom}`;roomKeys.set(room,key);}return key;
 }
 function roomRecord(room,event,outcome=null){
  const key=identity(room),time=now();const prior=rooms.get(key);
  const players=(room.match?.order||room.seats||[]).filter(Boolean).map(p=>({playerId:p.playerId,name:p.name,isBot:!!p.isBot,left:!!p.left,connected:!!p.connected,alive:typeof p.alive==='boolean'?p.alive:null,lp:num(p.lp),funds:num(p.funds),stats:p.stats?Object.fromEntries(Object.entries(p.stats).filter(([key,value])=>/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)&&Number.isFinite(value))):null}));
  const matchStartedAt=event==='MATCH_STARTED'?time:prior?.matchStartedAt||null;
  const row={time,event,runId,roomKey:key,code:room.code,createdAt:prior?.createdAt||room.__monitorCreatedAt||room.createdAt||time,matchStartedAt,matchUptimeSec:matchStartedAt?Math.max(0,(time-matchStartedAt)/1000):null,matchNo:room.matchCount||0,mode:room.mode,difficulty:room.difficulty,ruleset:room.match?.ruleset||room.ruleset||'standard',phase:room.match?.phase||null,round:room.match?.round||null,players,
   ...(outcome?{outcome:{victory:!!outcome.victory,reason:outcome.reason||null,hiddenCleared:!!outcome.hiddenCleared}}:{}),...(event==='ROOM_CLOSED'?{closedAt:time}:{})};
  rooms.set(key,row);if(rooms.size>500)rooms.delete(rooms.keys().next().value);append('rooms',[row]);return row;
 }
 function observeRooms(){
  for(const room of srv.lobby?.rooms?.values?.()||[]){const key=identity(room),old=rooms.get(key);
   if(!old)roomRecord(room,'ROOM_CREATED');
   if(room.match&&(!old||old.matchNo!==room.matchCount||!old.phase))roomRecord(room,'MATCH_STARTED');
  }
 }
 function getSession(r){
  const conn=r.ws&&srv.network?.conns?.get?.(r.ws);
  if(conn?.session)r.session=conn.session;
  if(r.session)return r.session;
  if(r.clientId&&clients.has(r.clientId))return clients.get(r.clientId);
  return null;
 }
 function refreshSessions(){
  for(const s of srv.registry?.all?.()||[]){const r=sockets.get(s.ws?._socket);if(r){r.session=s;r.ws=s.ws;if(r.clientId)clients.set(r.clientId,s);}}
  if(clients.size>5000)clients.delete(clients.keys().next().value);
 }
 function context(r){
  const session=getSession(r),room=session?.roomCode?srv.lobby?.rooms?.get?.(session.roomCode):null;
  const match=room?.match;const inMatch=!!match&&!match.ended&&match.phase!=='RESULT';
  return {runId,sourceId,browserId:r.clientId||null,connectionId:r.id,peerAddress:r.socket.remoteAddress||null,peerPort:r.socket.remotePort||null,roomKey:room?identity(room):null,roomCode:room?.code||null,matchNo:match?room.matchCount||0:null,
   playerId:session?.playerId||null,name:session?.name||null,attribution:session?(r.ws?'identifiedSocket':'browserLinked'):'unidentified',
   situation:inMatch?'inMatch':'outsideMatch',phase:inMatch?match.phase:null,round:inMatch?match.round:null,
   channel:r.ws?'websocket':'http',category:r.ws?'game':r.category||'page'};
 }
 function add(ctx,received,sent,time){
  if(!received&&!sent)return;const key=ledgerDay(time)+':'+JSON.stringify(ctx);
  totals.receivedBytes+=received;totals.sentBytes+=sent;totals[ctx.situation].receivedBytes+=received;totals[ctx.situation].sentBytes+=sent;
  let cell=cells.get(key);if(!cell){cell={...ctx,firstAt:time,lastAt:time,receivedBytes:0,sentBytes:0};cells.set(key,cell);}
  cell.receivedBytes+=received;cell.sentBytes+=sent;cell.lastAt=time;
  let delta=pending.get(key);if(!delta){delta={...ctx,time,from:time,to:time,receivedBytes:0,sentBytes:0};pending.set(key,delta);}
  delta.to=time;delta.receivedBytes+=received;delta.sentBytes+=sent;
  if(cells.size>maxCells){cells.delete(cells.keys().next().value);evictedCells++;}
 }
 function sample(r,next=null){
  const read=Math.max(r.lastRead,r.socket.bytesRead||0),written=Math.max(r.lastWritten,r.socket.bytesWritten||0);
  if(!r.excluded)add(r.context||context(r),read-r.lastRead,written-r.lastWritten,now());
  r.lastRead=read;r.lastWritten=written;r.context=next||context(r);
 }
 function flush(force=false){
  if(!force&&now()-lastFlush<flushMs)return;
  if(append('usage',[...pending.values()])){pending.clear();lastFlush=now();}
 }
 const onConnection=socket=>{
  const r={socket,id:`${runId}:socket${sockets.size}-${++nextRecord}`,lastRead:0,lastWritten:0,category:'page',excluded:false,context:null};sockets.set(socket,r);
  socket.once('close',()=>{sample(r);sockets.delete(socket);flush();});
 };
 const onRequest=(req,res)=>{
  const r=sockets.get(req.socket);if(!r)return;
  if(req.headers['x-stronghold-monitor']==='1'&&local(req.socket.remoteAddress)){r.excluded=true;r.lastRead=req.socket.bytesRead||0;r.lastWritten=req.socket.bytesWritten||0;return;}
  r.clientId=cookieId(req.headers);r.category=trafficKind(req.url);r.context=context(r);sample(r);
  res.once('finish',()=>sample(r));
 };
 const onUpgrade=req=>{const r=sockets.get(req.socket);if(!r)return;sample(r);r.clientId=cookieId(req.headers);r.category='game';};
 srv.server?.on('connection',onConnection);srv.server?.prependListener('request',onRequest);srv.server?.prependListener('upgrade',onUpgrade);
 const originalFrame=srv.network?.onFrame;
 if(typeof originalFrame==='function')srv.network.onFrame=function(conn,...args){
  const r=sockets.get(conn.ws?._socket);if(r){r.ws=conn.ws;sample(r);}
  try{return originalFrame.call(this,conn,...args);}finally{if(r){if(conn.session)r.session=conn.session;refreshSessions();r.context=context(r);sample(r);}observeRooms();}
 };
 for(const [method,event] of [['onMatchEnd','MATCH_ENDED'],['disposeRoom','ROOM_CLOSED']]){
  const original=srv.lobby?.[method];if(typeof original!=='function')continue;
  srv.lobby[method]=function(room,...args){
   if(room&&!room.disposed){for(const r of sockets.values())sample(r);roomRecord(room,event,method==='onMatchEnd'?args[1]:null);flush(true);}
   return original.call(this,room,...args);
  };
 }
 for(const method of ['create','startMatch']){const original=srv.lobby?.[method];if(typeof original==='function')srv.lobby[method]=function(...args){try{return original.apply(this,args);}finally{observeRooms();}};}
 const tick=()=>{refreshSessions();for(const r of sockets.values())sample(r);observeRooms();flush();};
 const timer=setInterval(tick,1000);timer.unref();
 const close=()=>{clearInterval(timer);tick();flush(true);};srv.server?.once('close',close);
 return {
  snapshot(){tick();return {version:1,runId,sourceId,startedAt:Number(runId.split('-')[1]),sampleSeconds:1,flushSeconds:flushMs/1000,totals:JSON.parse(JSON.stringify(totals)),rows:[...cells.values()].slice(-500).map(row=>({...row,connectionLive:[...sockets.values()].some(r=>r.id===row.connectionId)})),rooms:[...rooms.values()],identities:[...clients].map(([browserId,s])=>({browserId,playerId:s.playerId,name:s.name})),evictedCells,storageError,
   scope:'actual game TCP payload bytes, not SakuraFRP billing; attribution follows sampled membership',limitations:['HTTP uses a non-secret browser identifier; unlinked requests remain unidentified','membership boundaries sampled at frames/requests and every second','FRP route and billing cannot be inferred from a player id'],directory:dir};},
  directory:dir,flush:()=>flush(true),close,
 };
}

export async function readTrafficHistory(dir,{day=ledgerDay(Date.now()),kind='usage',cursor=0,limit=200}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['usage','rooms'].includes(kind)||!Number.isInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>500)throw new Error('invalid history query');
 const filename=path.join(dir,`${kind==='usage'?'traffic':'rooms'}-${day}.ndjson`);
 const entries=[];let offset=cursor,nextCursor=null;
 if(!fs.existsSync(filename))return {ok:true,day,kind,entries,nextCursor};
 const size=fs.statSync(filename).size,reset=cursor>size;if(reset){offset=0;cursor=0;}
 const stream=fs.createReadStream(filename,{encoding:'utf8',start:cursor}),reader=createInterface({input:stream,crlfDelay:Infinity});
 try{for await(const line of reader){if(entries.length>=limit){nextCursor=offset;break;}offset+=Buffer.byteLength(line,'utf8')+1;try{entries.push(JSON.parse(line));}catch{}}}
 finally{reader.close();stream.destroy();}
 return {ok:true,day,kind,entries,nextCursor,endCursor:offset,reset};
}
