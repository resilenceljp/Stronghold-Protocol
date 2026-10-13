// Durable local accounting. Only whitelisted telemetry is persisted; no tokens, cookies or raw API responses.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
const dayOf=time=>new Date(time+8*3600000).toISOString().slice(0,10);
const bytes=n=>Number.isFinite(n)&&n>=0?n:null;
const fields=['recordId','runId','sourceId','browserId','connectionId','peerAddress','roomKey','roomCode','playerId','name','attribution','situation','phase','channel','category'];
function cleanUsage(row){
 if(!row||bytes(row.receivedBytes)===null||bytes(row.sentBytes)===null||bytes(row.time)===null)return null;
 const out={};for(const field of fields)out[field]=typeof row[field]==='string'?row[field].slice(0,200):null;
 for(const field of ['time','from','to','matchNo','round','peerPort','receivedBytes','sentBytes'])out[field]=bytes(row[field]);return out;
}
function cleanRoom(row){
 if(!row||typeof row.roomKey!=='string'||bytes(row.time)===null)return null;
 const out={};for(const key of ['recordId','runId','sourceId','roomKey','code','event','mode','difficulty','ruleset','phase'])out[key]=typeof row[key]==='string'?row[key].slice(0,200):null;
 for(const key of ['time','createdAt','closedAt','matchStartedAt','matchUptimeSec','matchNo','round'])out[key]=bytes(row[key]);
 out.players=(Array.isArray(row.players)?row.players:[]).slice(0,100).map(p=>({playerId:typeof p.playerId==='string'?p.playerId:null,name:typeof p.name==='string'?p.name:null,isBot:!!p.isBot,left:!!p.left,connected:!!p.connected,alive:typeof p.alive==='boolean'?p.alive:null,lp:bytes(p.lp),funds:bytes(p.funds),stats:Object.fromEntries(Object.entries(p.stats||{}).filter(([k,v])=>/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)&&Number.isFinite(v)))}));
 if(row.outcome)out.outcome={victory:!!row.outcome.victory,hiddenCleared:!!row.outcome.hiddenCleared,reason:typeof row.outcome.reason==='string'?row.outcome.reason:null};return out;
}
export function quotaChange(previous,current){
 const reset=!previous||previous.accountName!==current.accountName||dayOf(previous.time)!==dayOf(current.time)||current.dailyUsedBytes<previous.dailyUsedBytes;
 return {time:current.time,from:previous?.time||current.time,accountName:current.accountName||null,
  dailyUsedBytes:current.dailyUsedBytes,remainingBytes:current.remainingBytes,observedUsedBytes:reset?null:current.dailyUsedBytes-previous.dailyUsedBytes,
  remainingChangeBytes:previous&&previous.accountName===current.accountName?current.remainingBytes-previous.remainingBytes:null,
  baseline:!previous,counterReset:!!previous&&reset,scope:'SakuraFRP account, all tunnels; never allocated to a room or player'};
}
export function createTrafficJournal({dataDir,fetchHistory,now=Date.now}){
 const cursorFile=path.join(dataDir,'traffic-cursors.json'),quotaFile=path.join(dataDir,'sakura-last-observation.json'),sourceFile=path.join(dataDir,'traffic-source.json');
 let cursors={},lastQuota=null,lastSource=null,lastImportAt=0,busy=false,importError=null,quotaError=null;
 const routes=new Map();
 try{cursors=JSON.parse(fs.readFileSync(cursorFile,'utf8'));}catch{}
 try{lastQuota=JSON.parse(fs.readFileSync(quotaFile,'utf8'));}catch{}
 try{lastSource=JSON.parse(fs.readFileSync(sourceFile,'utf8'));}catch{}
 function writeJson(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),'utf8');fs.renameSync(temp,file);}
 const filename=(kind,day)=>path.join(dataDir,`${kind==='usage'?'traffic':kind==='rooms'?'rooms':'sakura'}-${day}.ndjson`);
 function append(kind,rows){
  const groups=new Map();for(const row of rows){const day=dayOf(row.time);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(row);}
  for(const [day,list] of groups)fs.appendFileSync(filename(kind,day),list.map(r=>JSON.stringify(r)).join('\n')+'\n','utf8');
 }
 function routeFor(row,diagnostics,identify=false){
  const address=String(row.peerAddress||'').replace(/^::ffff:/,'');
  if(identify&&row.connectionLive&&(diagnostics?.frpPeers||[]).some(p=>p.port===row.peerPort&&String(p.address||'').replace(/^::ffff:/,'')===address))routes.set(row.connectionId,'sakuraConfirmed');
  if(routes.has(row.connectionId))return routes.get(row.connectionId);
  const tail=address.match(/^100\.(\d+)\./);
  if(tail&&Number(tail[1])>=64&&Number(tail[1])<=127)return 'tailscaleCandidate';
  return ['127.0.0.1','::1'].includes(address)?'loopbackUnclassified':'directOrOther';
 }
 function observe(admin,diagnostics,quota){
  const ledger=admin?.trafficLedger;
  if(ledger?.directory&&path.isAbsolute(ledger.directory)&&path.basename(ledger.directory)==='monitor-traffic'&&path.basename(path.dirname(ledger.directory))==='runtime'){
    const source={sourceId:ledger.sourceId,directory:ledger.directory,identities:ledger.identities||[]};
    if(JSON.stringify(source)!==JSON.stringify(lastSource)){try{writeJson(sourceFile,source);lastSource=source;}catch(e){importError=e.message;}}
  }
  for(const row of admin?.trafficLedger?.rows||[])routeFor(row,diagnostics,true);
  if(routes.size>10000)routes.delete(routes.keys().next().value);
  if(quota?.fresh&&bytes(quota.remainingBytes)!==null&&bytes(quota.dailyUsedBytes)!==null&&quota.lastSuccessAt!==lastQuota?.time){
   const current={time:quota.lastSuccessAt,accountName:quota.accountName||null,dailyUsedBytes:quota.dailyUsedBytes,remainingBytes:quota.remainingBytes};
   try{append('sakura',[quotaChange(lastQuota,current)]);writeJson(quotaFile,current);lastQuota=current;quotaError=null;}catch(e){quotaError=e.message;}
  }
 }
 async function sync(admin,diagnostics,{force=false}={}){
  if(busy||!admin?.trafficLedger?.sourceId||(!force&&now()-lastImportAt<30000))return;
  busy=true;lastImportAt=now();
  try{
   const today=dayOf(now()),yesterday=dayOf(now()-86400000);
   const identities=new Map((admin.trafficLedger.identities||[]).map(s=>[s.browserId,s]));
   for(const day of [yesterday,today])for(const kind of ['usage','rooms']){
    const key=`${admin.trafficLedger.sourceId}:${day}:${kind}`;let cursor=cursors[key]||0;
    // Each page starts at a byte offset, so importing a busy day's history stays linear.
    for(let page=0;page<20;page++){
      const result=await fetchHistory({day,kind,cursor,limit:500});
      const rows=(result.entries||[]).map(kind==='usage'?cleanUsage:cleanRoom).filter(Boolean);
      if(kind==='usage')for(const row of rows){row.route=routeFor(row,diagnostics);const linked=identities.get(row.browserId);if(!row.playerId&&linked){row.playerId=linked.playerId;row.name=linked.name;row.attribution='browserLinked';}}
      append(kind,rows);cursor=result.endCursor??cursor;cursors[key]=cursor;writeJson(cursorFile,cursors);
      if(result.nextCursor==null)break;cursor=result.nextCursor;
    }
   }
   importError=null;
  }catch(e){importError=e.message;}finally{busy=false;}
 }
 async function read({day=dayOf(now()),kind='usage',cursor=0,limit=200}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['usage','rooms','sakura'].includes(kind)||!Number.isInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>500)throw new Error('查询参数无效');
  const file=filename(kind,day),entries=[];let offset=cursor,nextCursor=null;
  if(!fs.existsSync(file))return {ok:true,day,kind,entries,nextCursor};
  if(cursor>fs.statSync(file).size)cursor=offset=0;
  const stream=fs.createReadStream(file,{start:cursor,encoding:'utf8'}),reader=createInterface({input:stream,crlfDelay:Infinity});
  try{for await(const line of reader){if(entries.length>=limit){nextCursor=offset;break;}offset+=Buffer.byteLength(line)+1;try{entries.push(JSON.parse(line));}catch{}}}finally{reader.close();stream.destroy();}
  return {ok:true,day,kind,entries,nextCursor};
 }
 async function report(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('日期无效');
  const file=filename('usage',day),byRoom=new Map(),byPlayer=new Map(),byKind=new Map(),byRoute=new Map();
  const total={receivedBytes:0,sentBytes:0,inMatch:{receivedBytes:0,sentBytes:0},outsideMatch:{receivedBytes:0,sentBytes:0}};
  let records=0,lastAt=null;const seen=new Set();
  const add=(map,key,label,row)=>{let v=map.get(key);if(!v){v={key,label,receivedBytes:0,sentBytes:0,inMatchBytes:0,outsideMatchBytes:0};map.set(key,v);}v.receivedBytes+=row.receivedBytes;v.sentBytes+=row.sentBytes;v[row.situation==='inMatch'?'inMatchBytes':'outsideMatchBytes']+=row.receivedBytes+row.sentBytes;};
  if(fs.existsSync(file)){
   const stream=fs.createReadStream(file,{encoding:'utf8'}),reader=createInterface({input:stream,crlfDelay:Infinity});
   try{for await(const line of reader){let row;try{row=JSON.parse(line);}catch{continue;}
     if(row.recordId&&seen.has(row.recordId))continue;if(row.recordId)seen.add(row.recordId);
     if(bytes(row.receivedBytes)===null||bytes(row.sentBytes)===null)continue;records++;lastAt=Math.max(lastAt||0,row.to||row.time||0);
     total.receivedBytes+=row.receivedBytes;total.sentBytes+=row.sentBytes;const situation=row.situation==='inMatch'?'inMatch':'outsideMatch';total[situation].receivedBytes+=row.receivedBytes;total[situation].sentBytes+=row.sentBytes;
     add(byRoom,row.roomKey||'outside',row.roomCode?`${row.roomCode} · ${row.roomKey}`:'未进房 / 未识别',row);
     add(byPlayer,row.playerId?`${row.sourceId}:${row.playerId}`:'unidentified',row.playerId?`${row.name||row.playerId} · ${row.playerId}`:'未识别请求',row);
     add(byKind,`${row.channel}:${row.category}`,`${row.channel} / ${row.category}`,row);add(byRoute,row.route||'unknown',row.route||'unknown',row);
    }}finally{reader.close();stream.destroy();}
  }
  return {ok:true,day,total,byRoom:[...byRoom.values()],byPlayer:[...byPlayer.values()],byKind:[...byKind.values()],byRoute:[...byRoute.values()],records,lastAt};
 }
 return {observe,sync,read,report,filename,source:()=>lastSource,snapshot:()=>({lastImportAt,busy,error:importError||quotaError,day:dayOf(now()),lastQuotaObservation:lastQuota})};
}
