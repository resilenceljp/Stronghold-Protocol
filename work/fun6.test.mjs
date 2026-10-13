import test from 'node:test';
import assert from 'node:assert/strict';
import {benchGeo,handTile,benchStage} from '../shared/bench.js';
import {bossPrepField} from '../public/js/render/prepfield.js';
import {Match} from '../server/match/Match.js';
import {getData} from '../server/data.js';
import {VirtualScheduler} from '../server/match/scheduler.js';
test('expanded hand and temporary slots round-trip on both boss sides',()=>{
 const geo=benchGeo(22,false,11);
 for(const side of ['L','R']){const xf=bossPrepField(side,true);
 for(let i=0;i<22;i++){const t=handTile(i,geo),d=xf.toDisp(t.row,t.col);assert.deepEqual(xf.toBoard(d.row,d.col),t);}
 for(let c=0;c<11;c++){const d=xf.toDisp(geo.TEMP_ROW,c);assert.equal(d.row,0);assert.deepEqual(xf.toBoard(d.row,d.col),{row:6,col:c});}}
 assert.deepEqual(handTile(21,geo),{row:8,col:10});
 assert.equal(bossPrepField('L').toBoard(6,0),null);
});
test('expanded stage leaves simulation unchanged and removes reserve obstacles',()=>{
 const stage={rows:Array(13).fill('#'.repeat(21)),devices:[{pos:[6,3]},{pos:[10,4]}]};const before=JSON.stringify(stage);
 const rendered=benchStage(stage,22,11);assert.equal(rendered.rows[6].slice(0,11),'A'.repeat(11));
 assert.equal(rendered.devices.length,1);assert.equal(JSON.stringify(stage),before);assert.equal(benchStage(stage,10),stage);
});
test('entertainment opt-in resizes all slots and refuses occupied extra slots on disabling',()=>{
 const m=new Match({data:getData(),mode:'coop',difficulty:'HARD',ruleset:'entertainment',seed:24,scheduler:new VirtualScheduler(),seats:[{seat:0,playerId:'p0',name:'T',isBot:false,connected:true}],send(){return true;},broadcast(){},onEnd(){},botRehearsal:0});m.start();
 try{const p=m.order[0];assert.equal(p.hand.length,10);assert.equal(p.temp.length,5);
 assert.equal(m.setFunRules('p0',{expandedBench:true},m.setupRevision).ok,true);assert.equal(p.hand.length,22);assert.equal(p.temp.length,11);
 p.hand[21]={kind:'item',id:'test'};assert.ok(m.setFunRules('p0',{expandedBench:false},m.setupRevision).error);assert.equal(p.hand.length,22);
 p.hand[21]=null;assert.equal(m.setFunRules('p0',{expandedBench:false},m.setupRevision).ok,true);assert.equal(p.hand.length,10);assert.equal(p.temp.length,5);
 }finally{m.dispose();}
});
