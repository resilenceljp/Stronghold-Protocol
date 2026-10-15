import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSakuraMonitor } from './sakura.mjs';
import { createTrafficJournal } from './ledger.mjs';
import { readTrafficHistory } from './compat/traffic-ledger.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const dataDir = process.env.MONITOR_DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, {recursive:true});
const settingsFile = path.join(dataDir, 'settings.json');
const defaults = {gamePort:3000, adminPort:3001, refreshSeconds:2, timeoutSeconds:2, ownerName:'', ownerPlayerId:''};
let config = {...defaults};
try { config = validate({...defaults, ...JSON.parse(fs.readFileSync(settingsFile,'utf8'))}); } catch {}
let uiPort = Number(process.env.MONITOR_UI_PORT || 3010);
if(!Number.isInteger(uiPort)||uiPort<1||uiPort>65535)throw Error("Invalid monitor port");
let portAttempts=0;
const startedAt = Date.now();
const sakuraMonitor=createSakuraMonitor({disabled:process.env.MONITOR_SAKURA_DISABLED==='1'});
let state = {status:'CHECKING', since:startedAt, health:null, admin:null, healthAt:null, adminAt:null, error:null, adminError:null, diagnostics:null, history:[], events:[]};
const trafficJournal=createTrafficJournal({dataDir,fetchHistory:async query=>{
  if(state.status==='ONLINE'){try{return await json(config.adminPort,'/admin/traffic-history?'+new URLSearchParams(query));}catch{}}
  const source=trafficJournal.source();if(!source?.directory)throw Error('游戏历史目录尚未识别');
  return readTrafficHistory(source.directory,query);
}});
let busy = false, previous = null, nextProbe = 0, lastFaultAt = 0, netPrevious = null, configRevision = 0;
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
function validate(c) {
  for (const key of ['gamePort','adminPort']) if (!Number.isInteger(c[key]) || c[key]<1 || c[key]>65535) throw Error('端口必须是 1–65535 的整数');
  if (!Number.isInteger(c.refreshSeconds) || c.refreshSeconds<2 || c.refreshSeconds>60) throw Error('刷新间隔应为 2–60 秒');
  if (!Number.isInteger(c.timeoutSeconds) || c.timeoutSeconds<1 || c.timeoutSeconds>10) throw Error('超时应为 1–10 秒');
  for (const key of ['ownerName','ownerPlayerId']) if (typeof c[key] !== 'string' || c[key].length>100) throw Error('服主设置格式无效');
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,c[k]]));
}
function append(file, line) { try { fs.appendFileSync(path.join(dataDir,file), line+'\n','utf8'); } catch (e) { state.storageError = e.message; } }
function event(type, detail, game=false) {
  const item={time:Date.now(),type,detail};
  state.events.unshift(item); state.events.length=Math.min(state.events.length,300);
  append(game?'stronghold-game-events.log':'stronghold-monitor-events.log', JSON.stringify(item));
}
async function json(port, route) {
  const res=await fetch(`http://127.0.0.1:${port}${route}`,{headers:{'X-Stronghold-Monitor':'1'},signal:AbortSignal.timeout(config.timeoutSeconds*1000)});
  if (!res.ok) throw Error(`HTTP ${res.status}`);
  const result=await res.json();
  if (result.ok!==true) throw Error('接口未返回 ok=true');
  return result;
}
async function tcp(port) {
  return new Promise(resolve=>{
    const socket=net.connect({host:'127.0.0.1',port});
    let settled=false;
    const done=v=>{if(settled)return;settled=true;socket.destroy();resolve(v);};
    socket.setTimeout(700); socket.once('connect',()=>done(true)); socket.once('timeout',()=>done(null)); socket.once('error',e=>done(e.code==='ECONNREFUSED'?false:null));
  });
}
function compare(old, fresh) {
  if (!old) return;
  const before=new Map((old.roomsDetail||[]).map(r=>[r.code,r]));
  const after=new Map((fresh.roomsDetail||[]).map(r=>[r.code,r]));
  for (const [code,r] of after) {
    const prev=before.get(code);
    if (!prev) {event('ROOM_CREATED',`房间 ${code}`);continue;}
    const m=r.matchDetail, p=prev.matchDetail;
    if (r.inMatch && (!prev.inMatch || r.matchNo!==prev.matchNo)) event('MATCH_STARTED',`${code} · 第 ${r.matchNo} 局`);
    if (!r.inMatch && prev.inMatch) event('MATCH_ENDED',code);
    if (!m || !p || r.matchNo!==prev.matchNo) continue;
    if (m.round!==p.round) event('ROUND_CHANGED',`${code} · ${p.round} → ${m.round}`,true);
    if (m.phase!==p.phase) event('PHASE_CHANGED',`${code} · ${p.phase} → ${m.phase}`,true);
    const players=new Map((p.players||[]).map(x=>[x.playerId,x]));
    for (const x of m.players||[]) {
      const y=players.get(x.playerId); if (!y) continue;
      if (x.alive===false && y.alive!==false) event('PLAYER_ELIMINATED',`${code} · ${x.name} · R${x.eliminatedRound??m.round}`,true);
      if (x.lp!==y.lp) event('LP_CHANGED',`${code} · ${x.name} · ${y.lp} → ${x.lp}`,true);
      if (x.shopLevel!==y.shopLevel) event('SHOP_LEVEL_CHANGED',`${code} · ${x.name} · ${y.shopLevel} → ${x.shopLevel}`,true);
    }
  }
  for (const code of before.keys()) if (!after.has(code)) event('ROOM_DISPOSED',code);
  const a=new Map((old.onlineSessions||[]).map(x=>[x.playerId,x]));
  const b=new Map((fresh.onlineSessions||[]).map(x=>[x.playerId,x]));
  for(const [id,x] of b) {
    if(!a.has(id)) event('USER_CONNECTED',`${x.name} · ${id}`);
    if(a.has(id) && a.get(id).roomCode!==x.roomCode) event('ROOM_MEMBERSHIP_CHANGED',`${x.name} · ${a.get(id).roomCode||'大厅'} → ${x.roomCode||'大厅'}`);
  }
  for(const [id,x] of a) if(!b.has(id)) event('USER_DISCONNECTED',`${x.name} · ${id}`);
}
async function poll() {
  if(busy || Date.now()<nextProbe)return; busy=true;
  const revision=configRevision;
  try {
    let status, health=null;
    try {health=await json(config.gamePort,'/healthz'); status='ONLINE'; state.error=null;} catch(e) {
      state.error=e.message;
      const listening=await tcp(config.gamePort);
      status=listening===false?'DOWN':listening===true?'HUNG':'UNKNOWN';
    }
    if(revision!==configRevision)return;
    if(status!==state.status) {event('SERVER_STATE',`${state.status} → ${status}`);state.since=Date.now();state.status=status;}
    if(health) {
      state.health=health;state.healthAt=Date.now();
      try {
        const admin=await json(config.adminPort,'/admin/status.json');
        if(revision!==configRevision)return;
        trafficJournal.observe(admin,state.diagnostics,sakuraMonitor.snapshot());trafficJournal.sync(admin,state.diagnostics).catch(e=>{state.storageError=e.message;});
        compare(previous,admin);previous=admin;state.admin=admin;state.adminAt=Date.now();state.adminError=null;
      } catch(e) {if(revision!==configRevision)return;state.adminError=e.message;}
    }
    const point={time:Date.now(),status,sockets:health?.sockets??null, rooms:health?.rooms??null, matches:health?.matches??null};
    state.history.push(point); if(state.history.length>180)state.history.shift();
    append('stronghold-monitor.csv',`${new Date(point.time).toISOString()},${status},${point.sockets??''},${point.rooms??''},${point.matches??''}`);
    if(['HUNG','DOWN','UNKNOWN'].includes(status) && Date.now()-lastFaultAt>=30000) {
      lastFaultAt=Date.now();append('stronghold-monitor-faults.log',JSON.stringify({time:Date.now(),status,error:state.error,diagnostics:state.diagnostics}));
    }
    if(state.admin?.trafficLedger||trafficJournal.source())trafficJournal.sync(state.admin||{trafficLedger:trafficJournal.source()},state.diagnostics).catch(e=>{state.storageError=e.message;});
    nextProbe=Date.now()+(status==='ONLINE'?config.refreshSeconds:Math.max(config.refreshSeconds,5))*1000;
  } finally {busy=false;}
}
async function diagnostics() {
  if(process.platform!=='win32' || process.env.MONITOR_NO_DIAGNOSTICS==='1') {state.diagnostics={available:false};return;}
  const script=`$ErrorActionPreference='SilentlyContinue'; $connections=@(Get-NetTCPConnection -LocalPort ${config.gamePort}); $listener=$connections|Where-Object State -eq Listen|Select-Object -First 1; $proc=$null; $perf=$null; if($listener){$proc=Get-Process -Id $listener.OwningProcess; $perf=Get-CimInstance Win32_PerfFormattedData_PerfProc_Process|Where-Object IDProcess -eq $listener.OwningProcess|Select-Object -First 1}; $adapter=$null; $routes=@(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0'|Sort-Object @{Expression={$_.RouteMetric+$_.InterfaceMetric}}); foreach($route in $routes){$candidate=Get-NetAdapter -InterfaceIndex $route.InterfaceIndex; if($candidate.Status -eq 'Up' -and $candidate.Name -notmatch 'Tailscale|Loopback|Bluetooth|vEthernet'){$adapter=$candidate;break}}; if(-not $adapter){$adapter=Get-NetAdapter -Physical|Where-Object Status -eq Up|Sort-Object LinkSpeed -Descending|Select-Object -First 1}; $traffic=if($adapter){Get-NetAdapterStatistics -Name $adapter.Name}; [pscustomobject]@{pid=$listener.OwningProcess; processName=$proc.ProcessName; memoryMB=[math]::Round($proc.WorkingSet64/1MB,1); cpuPercent=$perf.PercentProcessorTime; established=@($connections|Where-Object State -eq Established).Count; tcpStates=@($connections|Group-Object State|ForEach-Object {[pscustomobject]@{state=$_.Name;count=$_.Count}}); adapter=$adapter.Name; received=$traffic.ReceivedBytes; sent=$traffic.SentBytes; frpPeers=@(Get-NetTCPConnection -RemotePort ${config.gamePort} -State Established|Where-Object {$_.OwningProcess -in @(Get-Process -Name frpc,SakuraFrpService|Select-Object -ExpandProperty Id)}|ForEach-Object {[pscustomobject]@{port=$_.LocalPort;address=$_.LocalAddress}}); sakura=[bool](Get-Process -Name SakuraFrpService,frpc); tailscale=[bool](Get-Process -Name tailscaled)}|ConvertTo-Json -Depth 4 -Compress`;
  try {
    const utf8Script="[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; "+script;
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(utf8Script,'utf16le').toString('base64')],{windowsHide:true,timeout:12000,maxBuffer:1024*1024});
    const d=JSON.parse(stdout.replace(/^\uFEFF/,''));const now=Date.now();
    if(netPrevious && d.adapter===netPrevious.adapter) {
      const seconds=(now-netPrevious.time)/1000;
      d.downMbps=Math.max(0,(number(d.received)-number(netPrevious.received))*8/seconds/1e6);
      d.upMbps=Math.max(0,(number(d.sent)-number(netPrevious.sent))*8/seconds/1e6);
    }
    netPrevious={...d,time:now};state.diagnostics={...d,time:now,available:true};
  } catch(e) {state.diagnostics={available:false,error:e.message,time:Date.now()};}
}
const knownTrafficSources=new Map();
function trafficSummary() {
  const t=state.admin?.gameTraffic;if(!t)return null;
  const buckets={sakura:{receivedBytes:0,sentBytes:0},tailscaleCandidate:{receivedBytes:0,sentBytes:0},other:{receivedBytes:0,sentBytes:0}};
  const normalize=a=>String(a||'').replace(/^::ffff:/,'');
  for(const r of t.connections||[]) {
    const ip=normalize(r.address), peers=state.diagnostics?.frpPeers||[];
    let source=knownTrafficSources.get(r.id);
    if(!r.closedAt && peers.some(p=>p.port===r.port && normalize(p.address)===ip)) {source='sakura';knownTrafficSources.set(r.id,source);}
    if(!source){const m=ip.match(/^100\.(\d+)\./);source=m&&Number(m[1])>=64&&Number(m[1])<=127?'tailscaleCandidate':'other';}
    buckets[source].receivedBytes+=r.receivedBytes;buckets[source].sentBytes+=r.sentBytes;
  }
  // Older, evicted connections stay in game totals; their route cannot be reconstructed.
  const received=Object.values(buckets).reduce((s,b)=>s+b.receivedBytes,0),sent=Object.values(buckets).reduce((s,b)=>s+b.sentBytes,0);
  buckets.other.receivedBytes+=Math.max(0,t.receivedBytes-received);buckets.other.sentBytes+=Math.max(0,t.sentBytes-sent);
  if(knownTrafficSources.size>5000){const ids=new Set((t.connections||[]).map(r=>r.id));for(const id of knownTrafficSources.keys())if(!ids.has(id))knownTrafficSources.delete(id);}
  return {...t,connections:undefined,buckets};
}
function snapshot() {
  const now=Date.now();
  return {...state,trafficJournal:trafficJournal.snapshot(),sakura:sakuraMonitor.snapshot(),traffic:trafficSummary(),config,startedAt,now,healthFresh:state.status==='ONLINE' && now-state.healthAt<Math.max(15000,config.refreshSeconds*3000),adminFresh:state.status==='ONLINE' && !state.adminError && now-state.adminAt<Math.max(15000,config.refreshSeconds*3000),features:{rosterBoundary:!!state.admin?.monitorCapabilities?.rosterBoundary,matchDetail:state.admin?.monitorVersion>=5 || !!state.admin?.roomsDetail?.some(r=>'matchDetail' in r),connectedAt:state.admin?.monitorVersion>=6 || !!state.admin?.onlineSessions?.some(s=>'connectedAt' in s)},url:`http://127.0.0.1:${uiPort}`};
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const imageCache=new Map();let imageCacheBytes=0;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  const allowed=new Set([`127.0.0.1:${uiPort}`,`localhost:${uiPort}`]);
  if(!allowed.has(req.headers.host)) {res.writeHead(403);res.end('Invalid host');return;}
  const route=new URL(req.url,'http://127.0.0.1').pathname;
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  try {
    if(req.method==='GET'&&['/api/traffic-history','/api/traffic-report','/api/traffic-export'].includes(route)){
      const q=new URL(req.url,'http://127.0.0.1').searchParams,day=q.get('day')||trafficJournal.snapshot().day,kind=q.get('kind')||'usage';
      if(route==='/api/traffic-report')return send(200,await trafficJournal.report(day));
      const result=await trafficJournal.read({day,kind,cursor:Number(q.get('cursor')||0),limit:Number(q.get('limit')||200)});
      if(route==='/api/traffic-history')return send(200,result);
      const filename=trafficJournal.filename(kind,day);if(!fs.existsSync(filename))return send(404,{error:'当天尚无记录'});
      res.setHeader('Content-Disposition',`attachment; filename="${kind}-${day}.ndjson"`);res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});fs.createReadStream(filename).pipe(res);return;
    }
    if(req.method==='GET' && route==='/api/game-image') {
      const asset=new URL(req.url,'http://127.0.0.1').searchParams.get('path') || '';
      if(!/^\/assets\/[a-zA-Z0-9_./-]+\.(png|webp|jpg|jpeg)$/i.test(asset) || asset.includes('..'))return send(400,{error:'图片路径无效'});
      const key=config.gamePort+':'+asset;
      let cached=imageCache.get(key);
      if(!cached) {
        const upstream=await fetch(`http://127.0.0.1:${config.gamePort}${asset}`,{redirect:'error',headers:{'X-Stronghold-Monitor':'1'},signal:AbortSignal.timeout(4000)});
        if(!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/'))return send(404,{error:'游戏图片不可用'});
        if(Number(upstream.headers.get('content-length'))>2097152)return send(413,{error:'图片过大'});
        const reader=upstream.body.getReader();let size=0;const parts=[];
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();return send(413,{error:'图片过大'});}parts.push(Buffer.from(value));}
        cached={bytes:Buffer.concat(parts),type:upstream.headers.get('content-type')};
        imageCache.set(key,cached);imageCacheBytes+=cached.bytes.length;
        while(imageCache.size>128 || imageCacheBytes>16777216){const oldest=imageCache.keys().next().value;imageCacheBytes-=imageCache.get(oldest).bytes.length;imageCache.delete(oldest);}
      }
      res.setHeader('Cache-Control','private, max-age=86400');res.writeHead(200,{'Content-Type':cached.type});res.end(cached.bytes);return;
    }
    if(req.method==='GET' && route==='/api/status')return send(200,snapshot());
    if(req.method==='GET' && route==='/api/export') {
      res.setHeader('Content-Disposition','attachment; filename="stronghold-snapshot.json"');return send(200,snapshot());
    }
    if(route==='/api/room-control'&&['GET','POST'].includes(req.method)){
      if(!state.admin?.monitorActions?.roomControl)return send(409,{error:'此功能需要 boot v11 与 room-control.js，请在空闲时更新并重启游戏服。'});
      if(req.method==='GET'){const roomCode=new URL(req.url,'http://127.0.0.1').searchParams.get('roomCode');return send(200,await json(config.adminPort,'/admin/room-control?'+new URLSearchParams({roomCode})));}
      if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求来源无效'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return send(413,{error:'请求过大'});}
      const response=await fetch(`http://127.0.0.1:${config.adminPort}/admin/room-control`,{method:'POST',headers:{'Content-Type':'application/json','X-Stronghold-Command':'local-monitor-room-control'},body,redirect:'error',signal:AbortSignal.timeout(5000)});
      const result=await response.json();if(response.ok){event('OWNER_INTERVENTION',`${result.roomCode}: ${result.detail}`);nextProbe=0;}return send(response.status,result);
    }
    if(req.method==='POST' && route==='/api/clear-room'){
      if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求来源无效'});
      if(!state.admin?.monitorActions?.clearRooms)return send(409,{error:'清除房间需要 boot v10，请在空闲时重启更新后的游戏服。'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'请求过大'});}
      const response=await fetch(`http://127.0.0.1:${config.adminPort}/admin/clear-room`,{method:'POST',headers:{'Content-Type':'application/json','X-Stronghold-Command':'local-monitor-clear-room'},body,redirect:'error',signal:AbortSignal.timeout(4000)});
      const result=await response.json();if(response.ok){event('OWNER_CLEAR_ROOM',`清除房间 ${result.roomCode} · ${result.members.length} 名玩家 · 对局${result.inMatch?'已结束':'未开始'}`);nextProbe=0;}
      return send(response.status,result);
    }
    if(req.method==='POST' && route==='/api/kick'){
      if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求来源无效'});
      if(!state.admin?.monitorActions?.kick)return send(409,{error:'当前游戏不支持踢出，请安装 boot v9 并在空闲时重启游戏服。'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'请求过大'});}
      const response=await fetch(`http://127.0.0.1:${config.adminPort}/admin/kick`,{method:'POST',headers:{'Content-Type':'application/json','X-Stronghold-Command':'local-monitor-kick'},body,redirect:'error',signal:AbortSignal.timeout(4000)});
      const result=await response.json();if(response.ok){event('OWNER_KICK',`踢出 ${result.name} (${result.playerId}) · ${result.roomCode||'大厅'}`);nextProbe=0;}
      return send(response.status,result);
    }
    if(req.method==='POST' && route==='/api/message'){
      if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求来源无效'});
      if(!state.admin?.monitorActions?.messages)return send(409,{error:'当前游戏启动器不支持消息，请安装新版 boot 并重启游戏服。'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'消息过大'});}
      const response=await fetch(`http://127.0.0.1:${config.adminPort}/admin/message`,{method:'POST',headers:{'Content-Type':'application/json','X-Stronghold-Command':'local-monitor-message'},body,redirect:'error',signal:AbortSignal.timeout(4000)});
      const result=await response.json();if(response.ok)event('OWNER_MESSAGE',`发送服主消息：${result.recipients} 位在线玩家`);return send(response.status,result);
    }
    if(req.method==='POST' && route==='/api/settings') {
      if(req.headers.origin!==`http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'请求来源无效'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,{error:'请求过大'});}
      const updated=validate({...config,...JSON.parse(body)});
      fs.writeFileSync(settingsFile,JSON.stringify(updated,null,2),'utf8');
      config=updated;configRevision++;previous=null;state.health=null;state.admin=null;state.healthAt=null;state.adminAt=null;state.adminError=null;state.error=null;state.diagnostics=null;state.status='CHECKING';state.since=Date.now();nextProbe=0;
      event('SETTINGS_CHANGED','监控设置已保存');return send(200,{ok:true});
    }
    if(req.method!=='GET')return send(405,{error:'Method not allowed'});
    const files={'/':'index.html','/app.js':'app.js','/room-control-ui.js':'room-control-ui.js','/style.css':'style.css'};
    if(!files[route])return send(404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':mime[path.extname(files[route])]});fs.createReadStream(path.join(root,'public',files[route])).pipe(res);
  } catch(e) {send(400,{error:e.message});}
});
if(!fs.existsSync(path.join(dataDir,'stronghold-monitor.csv')))append('stronghold-monitor.csv','Time,ServerState,Sockets,Rooms,Matches');
server.on('listening',()=>{
  uiPort=server.address().port;
  const ready={pid:process.pid,port:uiPort,url:`http://127.0.0.1:${uiPort}`,startedAt};
  fs.writeFileSync(path.join(dataDir,'monitor.pid'),String(process.pid));
  fs.writeFileSync(path.join(dataDir,`ui-ready-${process.pid}.json`),JSON.stringify(ready));
  fs.writeFileSync(path.join(dataDir,'ui-last.json'),JSON.stringify(ready));
  console.log(`Stronghold Monitor UI: ${ready.url}`);event('MONITOR_STARTED',`监视台启动：${ready.url}`);poll();diagnostics();
});
server.on('error',e=>{
  if(['EACCES','EADDRINUSE'].includes(e.code)&&portAttempts++<40){
    const next=portAttempts===40?0:e.code==='EACCES'&&uiPort<13010?13010:uiPort<65535?uiPort+1:1024;
    console.log(`[port] ${uiPort} unavailable (${e.code}); trying ${next||'system-assigned port'}`);
    uiPort=next;server.listen(uiPort,'127.0.0.1');return;
  }
  console.error(e.message);process.exit(1);
});
server.listen(uiPort,'127.0.0.1');
const pollTimer=setInterval(()=>poll().catch(e=>{state.error=e.message;}),500);
let diagBusy=false;const diagTimer=setInterval(async()=>{if(diagBusy)return;diagBusy=true;try{await diagnostics();}finally{diagBusy=false;}},10000);
const sakuraTimer=setInterval(()=>{sakuraMonitor.refresh();trafficJournal.observe(state.admin,state.diagnostics,sakuraMonitor.snapshot());},1000);sakuraMonitor.refresh();
function stop(){clearInterval(pollTimer);clearInterval(diagTimer);clearInterval(sakuraTimer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
