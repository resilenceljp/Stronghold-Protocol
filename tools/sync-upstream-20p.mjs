// Fetch and preserve upstream separately; never auto-merge entertainment or touch a running server.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=(args,capture=false)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit'});if(r.status!==0)throw new Error(`git ${args[0]} failed (${r.status})`);return r.stdout?.trim();};
const argv=process.argv.slice(2);
if(argv.some(x=>!['--push','--apply-version'].includes(x))) throw new Error('Use --push or --apply-version only');
run(['rev-parse','--show-toplevel'],true); // This maintenance tool requires a Git source checkout.
run(['fetch','https://github.com/LongQianChen/Stronghold-Protocol.git','feat/IncreasePlayerCapacity']);
const sha=run(['rev-parse','FETCH_HEAD'],true);
const base=JSON.parse(run(['show',`${sha}:package.json`],true)).version;
const mirror='upstream/20p',snapshot=`upstream20/v${base}-${sha.slice(0,12)}`;
// An existing tracking branch may only advance, so unrelated local work cannot be overwritten.
const prev=spawnSync('git',['rev-parse','--verify',`refs/heads/${mirror}`],{cwd:root,encoding:'utf8'});
if(prev.status===0) run(['merge-base','--is-ancestor',prev.stdout.trim(),sha]);
run(['update-ref',`refs/heads/${mirror}`,sha,prev.status===0?prev.stdout.trim():'0000000000000000000000000000000000000000']);
const exists=spawnSync('git',['show-ref','--verify',`refs/heads/${snapshot}`],{cwd:root,encoding:'utf8'});
if(exists.status!==0)run(['branch',snapshot,sha]);
if(argv.includes('--push'))run(['push','origin',`refs/heads/${mirror}:refs/heads/${mirror}`,`refs/heads/${snapshot}:refs/heads/${snapshot}`]);
if(argv.includes('--apply-version')) {
 // Only stamp the upstream version after its exact commit has been merged into the current branch.
 run(['merge-base','--is-ancestor',sha,'HEAD']);
 const path=n=>new URL('../'+n,import.meta.url);
 const meta=JSON.parse(readFileSync(path('UPSTREAM.json'),'utf8'));
 meta.baseVersion=base;meta.commit=sha;
 const bases=[base,meta.originalVersion].filter(Boolean);bases.sort((a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]-y[i];}return 0;});
 const version=`${bases.at(-1)}-${meta.extension}.${meta.revision}`;
 for(const f of ['package.json','package-lock.json']) {const x=JSON.parse(readFileSync(path(f),'utf8'));x.version=version;if(x.packages)x.packages[''].version=version;writeFileSync(path(f),JSON.stringify(x,null,2)+'\n');}
 const f=path('shared/constants.js');writeFileSync(f,readFileSync(f,'utf8').replace(/APP_VERSION = '[^']*'/,`APP_VERSION = '${version}'`));
 writeFileSync(path('UPSTREAM.json'),JSON.stringify(meta,null,2)+'\n');
}
console.log(`Upstream ${base} ${sha}; preserved ${mirror} and ${snapshot}. Entertainment is not merged or deployed.`);
