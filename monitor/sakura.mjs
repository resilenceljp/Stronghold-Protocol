import fs from 'node:fs';
import path from 'node:path';
// /user/info contains a token: publish selected quota fields only, never raw responses.
export function launcherToken() {
  if(process.env.NATFRP_TOKEN)return process.env.NATFRP_TOKEN.trim();
  const file=process.env.MONITOR_SAKURA_CONFIG || path.join(process.env.ProgramData || 'C:/ProgramData','SakuraFrpService','config.json');
  try {const c=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));return typeof c.token==='string'?c.token.trim():'';}catch{return '';}
}
const nonnegative=v=>typeof v==='number' && Number.isFinite(v) && v>=0?v:null;
export function sanitizeQuota(info,plans) {
  if(info?.ban)throw Error('SakuraFRP 账户被冻结，无法读取可用流量');
  if(!Array.isArray(info?.traffic) || info.traffic.length!==2 || info.traffic.some(v=>nonnegative(v)===null))throw Error('SakuraFRP 流量字段格式不兼容');
  return {dailyUsedBytes:info.traffic[0],remainingBytes:info.traffic[1],accountName:typeof info.name==='string'?info.name:null,
    plans:Array.isArray(plans)?plans.map(p=>({name:typeof p.name==='string'?p.name:'流量包',totalBytes:nonnegative(p.total),remainingBytes:nonnegative(p.remaining),expiresAt:nonnegative(p.end_time)===null?null:p.end_time*1000})):null};
}
export function createSakuraMonitor({readToken=launcherToken,fetchFn=fetch,now=Date.now,intervalMs=60000,disabled=false}={}) {
  let data=null,lastSuccessAt=null,lastAttemptAt=null,nextAt=0,error=null,plansError=null,configured=false,busy=false,lastToken=null;
  async function request(route,token) {
    const response=await fetchFn('https://api.natfrp.com/v4/'+route,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error(`SakuraFRP API HTTP ${response.status}`);
    const value=await response.json();
    if(value && typeof value==='object' && !Array.isArray(value) && typeof value.code==='number')throw Error(`SakuraFRP API 错误代码 ${value.code}`);
    return value;
  }
  async function refresh() {
    if(disabled || busy || now()<nextAt)return;
    busy=true;lastAttemptAt=now();nextAt=lastAttemptAt+intervalMs;
    try{
      const token=readToken();configured=!!token;
      if(token!==lastToken){data=null;lastSuccessAt=null;lastToken=token;}
      if(!token){error='未找到 SakuraFRP 启动器访问密钥';return;}
      const [info,plans]=await Promise.allSettled([request('user/info',token),request('user/data_plans?status=valid',token)]);
      if(info.status!=='fulfilled')throw info.reason;
      if(plans.status==='fulfilled' && !Array.isArray(plans.value))throw Error('SakuraFRP 流量包字段格式不兼容');
      data=sanitizeQuota(info.value,plans.status==='fulfilled'?plans.value:null);
      lastSuccessAt=now();error=null;plansError=plans.status==='fulfilled'?null:'流量包详情暂时不可用，账户总剩余流量仍可读取';
    }catch(e){error=e instanceof Error && (e.message.startsWith('SakuraFRP ') || e.message.startsWith('未找到 '))?e.message:'SakuraFRP 官方接口暂时无法连接';}
    finally{busy=false;}
  }
  function snapshot(){return {...(data || {}),configured,disabled,lastSuccessAt,lastAttemptAt,error,plansError,refreshSeconds:intervalMs/1000,
    fresh:!!data && !error && now()-lastSuccessAt<=intervalMs*2+10000,source:'SakuraFRP 官方账户 API',scope:'account, all tunnels',nextUpdateAt:nextAt || null};}
  return {refresh,snapshot};
}
