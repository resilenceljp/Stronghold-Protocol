// i18n-ignore-file: Independent local administrator diagnostics.
// Telemetry plus explicit local-owner commands. Passive sampling never changes game state.
import fs from 'node:fs';
import path from 'node:path';
import { installTrafficLedger } from './traffic-ledger.js';
const states = new WeakMap(), rosters = new WeakMap(), hooked = new WeakMap();
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const clone = v => safe(() => JSON.parse(JSON.stringify(v)), null);
function avatar(manifest, rec) {
  const id = rec?.assets?.avatar || rec?.charId;
  const base = id?.endsWith('_2') ? manifest.chars?.[id.slice(0,-2)] : null;
  return manifest.chars?.[id]?.avatar || manifest.tokens?.[id]?.avatar || (base?.avatarE2 || base?.avatar) || manifest.chars?.[rec?.charId]?.avatar || null;
}
function piece(ps, p, manifest) {
  if (!p) return null;
  const original = safe(() => p.kind === 'item' ? ps.gd.item(p.id) : p.kind === 'token' ? ps.gd.token(p.id) : ps.gd.chess(p.id));
  const rec = p.kind === 'chess' ? safe(() => ps.fieldRecord(original), original) || original : original;
  const lo = p.kind === 'chess' ? safe(() => ps.loadoutFor(original)) : null;
  const skill = Number.isInteger(lo?.skillIndex) ? rec?.skills?.find(s => s.index === lo.skillIndex) || rec?.skill : rec?.skill;
  const module = rec?.modules?.find(m=>m.uniEquipId===lo?.moduleId);
  return {...p, name:rec?.name || p.id, avatarUrl:avatar(manifest,rec), iconUrl:p.kind==='item'?manifest.items?.[rec?.iconId || p.id] || null:null,
    skillIndex:lo?.skillIndex ?? null, skillName:skill?.name || null, moduleId:lo?.moduleId ?? null, moduleName:module?.name || null,
    potential:lo?.potential ?? null, cultivate:lo?.cultivate ?? null, standInFor:rec?.standInFor || null,
    items:(p.items || []).map(it=>({id:it.id,name:safe(()=>ps.gd.item(it.id)?.name,it.id)||it.id,iconUrl:manifest.items?.[it.id] || null}))};
}
export function captureRoster(match, manifest = {}) {
  let record = rosters.get(match);
  if (record?.round === match.round) return;
  record = {round:match.round, capturedAt:Date.now(), players:new Map()};
  for (const ps of match.order || match.players?.values?.() || []) {
    const pv = safe(()=>ps.privateView());
    if (!pv) continue;
    record.players.set(ps.playerId, clone({round:match.round,capturedAt:record.capturedAt,stageId:match.stageId,
      board:(pv.board || []).map(p=>piece(ps,p,manifest)), hand:(pv.hand || []).map(p=>piece(ps,p,manifest)), temp:(pv.temp || []).map(p=>piece(ps,p,manifest)),
      bonds:pv.bonds || [], effects:pv.effects || [], nextEnemies:pv.nextEnemies || [],
      bossMate:pv.bossMate ? {...pv.bossMate,units:(pv.bossMate.units||[]).map(u=>({...u,avatarUrl:avatar(manifest,{assets:{avatar:u.avatar}}),row:u.y,col:u.x,
        items:(u.items||[]).map(id=>({id,name:safe(()=>ps.gd.item(id)?.name,id)||id}))}))} : null,
      mapCharacters:pv.prepMapChars || [], rect:{r0:9,r1:12,c0:0,c1:10}}));
  }
  rosters.set(match,record);
}
export function playerExtra(match, ps) {
  const pv = safe(()=>ps.privateView());
  return {rosterSnapshot:rosters.get(match)?.players.get(ps.playerId) || null,
    relics:clone(pv?.relics), relicShield:pv?.relicShield??null, relicOffer:clone(pv?.relicOffer),
    monitorDetailError:pv?null:'此版本无法读取玩家明细',
    shopDetail:pv ? {...pv.shop, slots:(pv.shop?.slots || []).map(s=>s?{...s,name:safe(()=>s.kind==='item'?ps.gd.item(s.id)?.name:ps.gd.chess(s.id)?.name,s.id)||s.id}:null)} : null,
    effectsDetail:clone(pv?.effects), bondsDetail:clone(pv?.bonds?.map(b=>({...b,name:safe(()=>ps.gd.bond(b.bondId)?.name,b.bondId)||b.bondId}))),
    nextEnemiesDetail:clone(pv?.nextEnemies?.map(e=>({...e,name:safe(()=>ps.gd.enemy(e.enemyKey)?.name,e.enemyKey)||e.enemyKey}))),
    personalChoice:clone(pv?.personalChoice)};
}
export function installMonitorV6(srv, root) {
  if (states.has(srv)) return;
  const ledger=installTrafficLedger(srv,root);
  const manifest = safe(()=>JSON.parse(fs.readFileSync(path.join(root,'data','assets.json'),'utf8')),{});
  const proto = srv.lobby?.MatchClass?.prototype;
  const methods = hooked.get(proto) || [];
  if (proto && !hooked.has(proto)) {
    for (const method of ['startCombat','startFinalAssault']) {
      if (typeof proto[method] !== 'function') continue;
      const original = proto[method];
      proto[method] = function(...args) {
        if (this.phase === 'PREP') safe(()=>captureRoster(this,manifest));
        return original.apply(this,args);
      };
      methods.push(method);
    }
    hooked.set(proto,methods);
  }
  const active = new Map(), recent = [], totals={receivedBytes:0,sentBytes:0}, bootAt=Date.now();
  let seq=0, previous={...totals,time:bootAt}, rates={receivedBytesPerSecond:0,sentBytesPerSecond:0};
  const read = r => ({id:r.id,address:r.socket.remoteAddress || r.address,port:r.port,protocol:r.protocol,startedAt:r.startedAt,closedAt:r.closedAt || null,receivedBytes:r.socket.bytesRead || 0,sentBytes:r.socket.bytesWritten || 0,excluded:r.excluded});
  srv.server?.on('connection',socket=>{
    const r={id:`${process.pid}-${bootAt}-${++seq}`,socket,address:socket.remoteAddress,port:socket.remotePort,protocol:'http',startedAt:Date.now(),excluded:false};
    active.set(socket,r);
    socket.once('close',()=>{const row=read(r);row.closedAt=Date.now();active.delete(socket);if(!r.excluded){totals.receivedBytes+=row.receivedBytes;totals.sentBytes+=row.sentBytes;recent.push(row);if(recent.length>1000)recent.shift();}});
  });
  srv.server?.on('request',req=>{
    const r=active.get(req.socket), address=req.socket.remoteAddress;
    if(r && req.headers['x-stronghold-monitor']==='1' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)) r.excluded=true;
  });
  srv.server?.on('upgrade',req=>{const r=active.get(req.socket);if(r)r.protocol='websocket';});
  const current = () => {
    const connections=[...recent,...[...active.values()].map(read)].filter(r=>!r.excluded);
    const live=[...active.values()].filter(r=>!r.excluded).map(read);
    return {...totals,receivedBytes:totals.receivedBytes+live.reduce((s,r)=>s+r.receivedBytes,0),sentBytes:totals.sentBytes+live.reduce((s,r)=>s+r.sentBytes,0),connections};
  };
  const timer=setInterval(()=>{const n=current(),time=Date.now(),seconds=(time-previous.time)/1000;rates={receivedBytesPerSecond:Math.max(0,(n.receivedBytes-previous.receivedBytes)/seconds),sentBytesPerSecond:Math.max(0,(n.sentBytes-previous.sentBytes)/seconds)};previous={receivedBytes:n.receivedBytes,sentBytes:n.sentBytes,time};},1000);
  timer.unref();srv.server?.once('close',()=>clearInterval(timer));
  states.set(srv,{ledger,snapshot:()=>({monitorVersion:11,monitorCapabilities:{rosterBoundary:methods.length===2,gameTraffic:!!srv.server,detailedTraffic:true,shopDetails:true},trafficLedger:ledger.snapshot(),gameTraffic:{...current(),...rates,startedAt:bootAt,scope:'game TCP bytes; excludes tagged local monitor requests; not tunnel billing'}})});
}
export function serverExtra(srv) { return states.get(srv)?.snapshot() || {}; }
export function trafficLedgerFor(srv) { return states.get(srv)?.ledger || null; }

// Explicit local administrator action; never inferred from a player's nickname.
export function sendMonitorMessage(srv,command) {
 if(!command||!['all','room'].includes(command.scope)||typeof command.text!=='string')throw new Error('invalid message');
 const text=command.text.trim();
 if(!text||[...text].length>200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))throw new Error('invalid message text');
 const rooms=[...srv.lobby.rooms.values()].filter(r=>command.scope==='all'||r.code===command.roomCode);
 if(command.scope==='room'&&!rooms.length)throw new Error('room unavailable');
 const ids=new Set(rooms.flatMap(r=>[...r.seats,...(r.spectators||[])].filter(p=>p&&!p.left&&!p.isBot).map(p=>p.playerId)));
 const recipients=[...srv.registry.all()].filter(s=>s.ws?.readyState===1&&(command.scope==='all'||ids.has(s.playerId)));
 const toast=JSON.stringify({t:'m.toast',kind:'info',text:'服主通知：'+text});
 for(const s of recipients)s.ws.send(toast);
 for(const r of rooms){
   const chat=r.matchCtx?.chat;if(!chat||chat.closed)continue;
   const entry=Object.freeze({seq:++chat.seq,playerId:'server_monitor',name:'服主通知',seat:null,spectator:true,text,at:Date.now()});
   chat.messages.push(entry);if(chat.messages.length>chat.historyLimit)chat.messages.shift();
   srv.lobby.broadcastRoom(r,{t:'m.chat',matchId:chat.matchId,...entry});
 }
 return {ok:true,recipients:recipients.length,rooms:rooms.map(r=>r.code)};
}

// Disconnect a named identified session, using the game's normal leave lifecycle.
// This invalidates resume credentials, but does not ban a person from reconnecting as a new session.
export function kickMonitorPlayer(srv,command) {
 if(!command||typeof command.playerId!=='string'||command.playerId.length>128||!(command.roomCode===null||typeof command.roomCode==='string'))throw Error('invalid target');
 const session=srv.registry.byId(command.playerId);
 if(!session||!session.connected)throw Error('player is no longer online');
 const roomCode=session.roomCode||null;
 if(roomCode!==command.roomCode)throw Error('player location changed; refresh before kicking');
 const ws=session.ws,room=roomCode?srv.lobby.rooms.get(roomCode):null;
 if(room)srv.lobby.removeMember(room,session.playerId);
 srv.lobby.discovery?.forget(session.playerId);srv.lobby.clearResync?.(session.playerId);
 if(ws?.readyState===1)ws.send(JSON.stringify({t:'room.closed',reason:'kicked'}));
 const conn=srv.network?.conns?.get(ws);
 if(conn)conn.close(1008,'removed by server owner');else ws?.close(1008,'removed by server owner');
 srv.registry.remove(session);
 return {ok:true,playerId:session.playerId,name:session.name,roomCode};
}

export function clearMonitorRoom(srv,command) {
 if(!command||typeof command.roomCode!=='string'||!Number.isInteger(command.matchNo))throw Error('invalid room target');
 const room=srv.lobby.rooms.get(command.roomCode);
 if(!room||room.disposed)throw Error('room no longer exists');
 if((room.createdAt??null)!==command.createdAt||(room.matchCount??room.matchNo??0)!==command.matchNo)throw Error('room changed; refresh before clearing');
 const result={ok:true,roomCode:room.code,inMatch:!!room.match,members:[...room.seats,...(room.spectators||[])].filter(s=>s&&!s.isBot&&!s.left).map(s=>s.playerId)};
 srv.lobby.disposeRoom(room,'kicked');
 return result;
}
