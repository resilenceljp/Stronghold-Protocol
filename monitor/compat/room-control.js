// i18n-ignore-file: Local owner actions and administrator notices.
// Explicit loopback-owner room interventions. Never called by public player messages.
const phaseAllowed=m=>!m.ended&&!m.disposed&&!m.emergencyFrozen&&['INFO_CHECK','PREP'].includes(m.phase);
const groups=m=>m.poolGroups||[{id:1,playerIds:m.order.map(p=>p.playerId),pool:m.pool,itemPool:m.itemPool}];
function target(srv,command,write=false){
 if(!command||typeof command.roomCode!=='string')throw Error('invalid room');
 const room=srv.lobby.rooms.get(command.roomCode),m=room?.match;
 if(!room||room.disposed)throw Error('room no longer exists');
 if(!m&&write&&command.action!=='removeAI')throw Error('this operation requires an active match');
 if(!((m?.adminControlVersion??srv.lobby.MatchClass?.prototype?.adminControlVersion)>=1))throw Error('game build lacks room intervention support; update the entertainment fork');
 if(write&&((room.createdAt??null)!==command.createdAt||(room.matchCount??room.matchNo??0)!==command.matchNo||(m?.round??0)!==command.round))throw Error('room or round changed; refresh the panel');
 return {room,m};
}
function aiView(p){
 const v=p.privateView(),name=(id,kind)=>((kind==='item'?p.gd.item(id):p.gd.chess(id))?.name||id);
 const piece=(x,area,index)=>x?{...x,name:name(x.id,x.kind),area,index,items:(x.items||[]).map(i=>({...i,name:name(i.id,'item')}))}:null;
 return {...v,hand:v.hand.map((x,i)=>piece(x,'hand',i)),temp:v.temp.map((x,i)=>piece(x,'temp',i)),board:v.board.map((x,i)=>piece(x,'board',i)),shop:{...v.shop,slots:v.shop.slots.map(x=>x?{...x,name:name(x.id,x.kind)}:null)}};
}
export function roomControlSnapshot(srv,command){
 const {room,m}=target(srv,command);
 if(!m)return {ok:true,roomCode:room.code,createdAt:room.createdAt??null,matchNo:room.matchCount??room.matchNo??0,round:0,phase:'LOBBY',allowed:true,pressure:1,pendingPressure:null,groups:[],players:room.seats.filter(p=>p&&!p.left).map(p=>({playerId:p.playerId,name:p.name,seat:p.seat,isBot:!!p.isBot,connected:!!p.connected,ready:!!p.ready,left:false,alive:true,manual:false,autoplay:false,private:null})),candidates:[]};
 const allGroups=groups(m).map(g=>({id:g.id,playerIds:g.playerIds.slice(),chess:[...g.pool.entries].map(([id,e])=>({id,name:m.gd.chess(id)?.name||id,tier:e.tier,cap:e.cap,held:e.cap-e.left,left:Math.max(0,e.left)})),items:Object.entries(m.gd.raw.items||{}).filter(([id,r])=>r&&!r.isGolden&&Number.isInteger(g.itemPool?.cap(id))).map(([id,r])=>({id,name:r.name,tier:r.tier,cap:g.itemPool.cap(id),held:g.itemPool.held(id),left:g.itemPool.left(id)}))}));
 return {ok:true,roomCode:room.code,createdAt:room.createdAt??null,matchNo:room.matchCount??room.matchNo??0,round:m.round,phase:m.phase,allowed:phaseAllowed(m),pressure:m.gd.adminPressure||1,pendingPressure:m.pendingAdminPressure??null,groups:allGroups,relicCatalog:(m.adminRelicCatalog||[]).map(({id,name,desc,tier})=>({id,name,desc,tier})),
 players:m.order.map(p=>({playerId:p.playerId,name:p.name,seat:p.seat,isBot:p.isBot,alive:p.alive,left:p.left,autoplay:p.autoplay,manual:!!p.adminManual,ready:p.ready,lp:p.lp,funds:p.funds,private:p.isBot?aiView(p):null})),
 candidates:[...srv.registry.all()].filter(s=>s.connected&&(!s.roomCode||s.roomCode===room.code&&room.spectatorOf(s.playerId))).map(s=>({playerId:s.playerId,name:s.name,spectator:s.roomCode===room.code}))};
}
function publish(m,text){m.broadcast({t:'m.toast',kind:'info',text:'服主干预：'+text});m.markPublic();for(const p of m.order)p.dirty();m.flush();}
function player(m,id){const p=m.players.get(id);if(!p||!p.alive||p.left)throw Error('player unavailable');return p;}
export function applyRoomControl(srv,command){
 const {room,m}=target(srv,command,true);
 if(!m){const seat=room.seatOf(command.playerId),host=srv.registry.byId(room.hostId);if(command.action!=='removeAI'||!seat?.isBot||!host)throw Error('waiting-room AI unavailable');const result=srv.lobby.removeBot(host,{seat:seat.seat,playerId:seat.playerId});if(result?.error)throw Error(result.error);const detail=`移除等待房间AI ${seat.name}`;srv.lobby.broadcastRoom(room,{t:'m.toast',kind:'info',text:'服主干预：'+detail});return {ok:true,action:command.action,roomCode:room.code,detail};}

 if(!phaseAllowed(m))throw Error('intervention is allowed only in information check or preparation');
 const kind=command.action;let detail='';
 if(kind==='pool'){
  if(!['chess','item'].includes(command.kind)||!Number.isInteger(command.count)||command.count<0||command.count>10000||!Number.isInteger(command.tier)||command.tier<1||command.tier>6)throw Error('invalid pool settings');
  const selected=groups(m).filter(g=>command.groupId===0||g.id===command.groupId);if(!selected.length)throw Error('group unavailable');const changes=[];
  for(const g of selected){
   if(command.kind==='chess')for(const [id,e] of g.pool.entries){if(e.tier!==command.tier||command.id&&command.id!==id)continue;const held=e.cap-e.left;if(command.count<held)throw Error(`${id}: total must be at least held copies (${held})`);changes.push(()=>{e.left+=command.count-e.cap;e.cap=command.count;});}
   else for(const [id,r] of Object.entries(m.gd.raw.items||{})){if(!r||r.isGolden||r.tier!==command.tier||command.id&&command.id!==id||!Number.isInteger(g.itemPool?.cap(id)))continue;if(command.count<g.itemPool.held(id))throw Error(`${id}: total below held equipment`);changes.push(()=>{const stock=g.itemPool;if(!stock._monitorCaps){stock._monitorCaps=new Map();const original=stock.cap.bind(stock);stock.cap=id=>stock._monitorCaps.has(stock.gd.baseIdOf(id))?stock._monitorCaps.get(stock.gd.baseIdOf(id)):original(id);}stock._monitorCaps.set(id,command.count);});}
  }
  if(!changes.length)throw Error('no eligible card in this tier/group');for(const change of changes)change();detail=`修改牌库 ${command.kind} / 阶${command.tier} / 每种总数${command.count} / ${changes.length}项`;
 }else if(kind==='pressure'){
  const factor=command.factor;if(typeof factor!=='number'||!Number.isFinite(factor)||factor<0.1||factor>20)throw Error('pressure must be 0.1–20');m.pendingAdminPressure=factor;detail=`下回合起敌人生命、攻击、防御额外乘${factor}（含Boss血池）`;
 }else if(kind==='autoplay'){
  const p=player(m,command.playerId);if(p.isBot||typeof command.on!=='boolean')throw Error('select a human player and a boolean state');m.setAutoplay(p,command.on);detail=`${p.name} 的AI托管${command.on?'开启':'关闭'}`;
 }else if(kind==='manualAI'){
  if(m.phase!=='PREP')throw Error('AI manual control requires preparation');const p=player(m,command.playerId);if(!p.isBot||typeof command.on!=='boolean')throw Error('AI teammate required');p.adminManual=command.on;p._botPrepToken=(p._botPrepToken||0)+1;if(command.on)p.setReady(false);else m.kickBot(p);detail=`${p.name} 后台人工控制${command.on?'开启':'关闭'}`;
 }else if(kind==='aiCommand'){
  if(m.phase!=='PREP')throw Error('AI commands require preparation');const p=player(m,command.playerId),msg=command.command;
  const allowed=['g.buy','g.refresh','g.freeze','g.levelUp','g.sell','g.move','g.equip','g.destroy','g.ready','g.reward','g.choice','g.art','g.relic'];
  if(!p.isBot||!p.adminManual||p.botControlled)throw Error('pause this AI before issuing manual commands');
  if(!msg||!allowed.includes(msg.t)||typeof srv.monitorControlValidate!=='function'||srv.monitorControlValidate(msg))throw Error('invalid AI operation');
  const result=m._handle(p,msg);if(result?.error)throw Error(`${result.error}: ${result.detail||''}`);detail=`人工操作 ${p.name}: ${msg.t}`;
 }else if(kind==='removeAI'){
  if(m.phase!=='PREP')throw Error('remove AI only during preparation');const p=player(m,command.playerId);if(!p.isBot)throw Error('AI teammate required');const seat=room.seatOf(p.playerId);p._botPrepToken=(p._botPrepToken||0)+1;p.left=true;p.autoplay=false;p.adminManual=true;if(seat){seat.left=true;seat.connected=false;seat.ready=false;}m._quit(p);srv.lobby.broadcastState(room);detail=`移除AI ${p.name}，其持有卡牌按离场归还`;
 }else if(kind==='assignAI'){
  if(m.phase!=='PREP')throw Error('AI handover only during preparation');const p=player(m,command.playerId);if(!p.isBot)throw Error('target must still be an AI');
  const session=srv.registry.byId(command.controllerId),seat=room.seatOf(p.playerId);if(!session?.connected||!session.ws||!seat||srv.registry.byId(p.playerId))throw Error('controller or AI unavailable');
  const oldId=session.playerId;if(session.roomCode&&!(session.roomCode===room.code&&room.spectatorOf(oldId)))throw Error('controller must be in lobby or spectating this room');
  if(srv.lobby.requireAssetCache&&!room.spectatorOf(oldId))throw Error('controller must first join this room as spectator to validate assets');
  const conn=srv.network.conns.get(session.ws);if(!conn||conn.closing||typeof srv.network.onHelloMsg!=='function')throw Error('connection unavailable');
  if(session.roomCode)srv.lobby.removeMember(room,oldId);srv.lobby.discovery.forget(oldId);srv.lobby.clearResync(oldId);
  srv.registry.byPlayerId.delete(oldId);session.playerId=p.playerId;srv.registry.byPlayerId.set(p.playerId,session);session.roomCode=room.code;session.notice=null;session.pendingResult=null;session.resyncAt=-Infinity;
  p._botPrepToken=(p._botPrepToken||0)+1;p.isBot=false;p.adminManual=false;p.autoplay=false;p.connected=true;p.ready=false;p.name=session.name;
  Object.assign(seat,{isBot:false,connected:true,left:false,ready:false,name:session.name});m.loneHuman=m.order.filter(x=>x.isHumanActive).length===1;
  // A repeated hello uses the existing token and retains the negotiated wire layout before any new pushes.
  session.monitorTakeoverFrom=oldId;m.markPublic();p.dirty();
  srv.network.onHelloMsg(conn,{t:'hello',version:1,name:session.name,token:session.token,wire:srv.network.wireVersion?.(session.ws)||0},Date.now());srv.lobby.broadcastState(room);detail=`${session.name} 接管AI席位P${p.seat+1}（保留原资金、阵容、分组）`;
 }else throw Error('unknown intervention');
 publish(m,detail);return {ok:true,action:kind,roomCode:room.code,detail};
}
