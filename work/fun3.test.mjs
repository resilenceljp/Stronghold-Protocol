import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packAssetCache,parseAssetCachePackArgs } from '../tools/asset-cache-pack.mjs';
import { readZip } from '../tools/package-update.mjs';
import {Match} from '../server/match/Match.js';
import {getData} from '../server/data.js';
import {VirtualScheduler} from '../server/match/scheduler.js';
import {benchGeo,benchStage} from '../shared/bench.js';
import {pieceTile,tileSlot} from '../public/js/render/drag.js';
test('mobile pack retains full authoritative catalog while excluding expensive models, portraits and audio',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'fun3-lite-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'data'));await mkdir(path.join(root,'public/assets'),{recursive:true});
 const a={};for(const name of ['char/avatar/a.png','char/portrait/a.png','audio/a.mp3','spine/op/a.skel','ui/bond/a.png']){await mkdir(path.dirname(path.join(root,'public/assets',name)),{recursive:true});await writeFile(path.join(root,'public/assets',name),name);a[name]='/assets/'+name;}
 await writeFile(path.join(root,'data/assets.json'),JSON.stringify(a));await writeFile(path.join(root,'package.json'),'{"version":"0.2.4-20p-fun.3"}');
 const result=await packAssetCache({root,lite:true});const entries=new Map();readZip(result.zipPath,(name,bytes)=>entries.set(name,bytes));
 assert.deepEqual([...entries.keys()],['manifest.json','assets/char/avatar/a.png','assets/ui/bond/a.png']);assert.equal(JSON.parse(entries.get('manifest.json')).totalFiles,5);
 assert.throws(()=>parseAssetCachePackArgs(['--lite','--delta','--base-catalog','x']),/不能/);
});
test('full22-slot bench automatically absorbs temporary pieces when a real sale creates a vacancy',()=>{
 const m=new Match({mode:'solo',difficulty:'NORMAL',ruleset:'entertainment',seed:24,data:getData({log:{warn(){},info(){},error(){}}}),seats:[{seat:0,playerId:'p',name:'P',isBot:false,connected:true}],send(){return true;},broadcast(){},onEnd(){},scheduler:new VirtualScheduler(),botRehearsal:0});m.start();m.startRound(1);m.phase='PREP';const p=m.order[0];
 for(let i=0;i<22;i++)p.hand[i]={uid:100+i,kind:'chess',id:'chess_char_1_12_a',poolCopies:0};
 const temp={uid:500,kind:'chess',id:'chess_char_1_12_a',poolCopies:0};p._putTemp(0,temp);
 assert.equal(p.sell(105).ok,true);assert.equal(p.hand[5]?.uid,500);assert.equal(p.temp[0],null);
 const geo=benchGeo(22);assert.equal(geo.TEMP_C0,0);assert.deepEqual(pieceTile({area:'temp',idx:4},geo),{row:6,col:4});assert.deepEqual(tileSlot({row:6,col:4},geo),{area:'temp',idx:4});
 const stage=m.gd.stage(m.stageId);if(stage?.rows){const pad=benchStage(stage,22);assert.equal(pad.rows[6].slice(0,5),'AAAAA');assert.notEqual(pad,stage);}m.dispose();
});
