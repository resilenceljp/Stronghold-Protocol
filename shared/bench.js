import { GEO } from './constants.js';
export function benchGeo(size=10,boss=false,tempSize=5) {return size===22?{...GEO,HAND_SIZE:22,HAND_COLS:11,TEMP_ROW:6,TEMP_C0:0,TEMP_SIZE:tempSize}:GEO;}
/** Slot geometry shared by models, picking, dragging and UI actions.
 * @param {typeof GEO & {HAND_COLS?:number}} geo
 */
export function handTile(idx,geo=GEO) {const cols=geo.HAND_COLS||geo.HAND_SIZE||Infinity;return {row:geo.HAND_ROW+Math.floor(idx/cols),col:idx%cols};}
/** Render-only layout; simulation stage and deployment coordinates are unchanged. */
export function benchStage(stage,size,tempSize=5,boss=false) {
 if(size!==22||!stage?.rows)return stage;
 const rows=[...stage.rows];
 const replace=(row,from,to,glyph)=>{rows[row]=(rows[row]||'#'.repeat(21)).split('').map((v,c)=>c>=from&&c<=to?glyph:v).join('');};
 if(boss){
  for(let r=7;r>=1;r--)rows[r]=stage.rows[r-1];
  for(const r of [1,2])replace(r,0,20,'a');
  replace(0,0,20,'A');
  const devices=(stage.devices||[]).filter(d=>d.pos?.[0]>1).map(d=>d.pos?.[0]<=6?{...d,pos:[d.pos[0]+1,d.pos[1]]}:d);
  return {...stage,rows,devices,extendedBossPrep:true};
 }
 for(const r of [7,8])replace(r,0,10,'a');
 replace(6,0,tempSize-1,'A');
 const devices=(stage.devices||[]).filter(d=>!([6,7,8].includes(d.pos?.[0])&&d.pos?.[1]<11));
 return {...stage,rows,devices,extendedBench:true};
}
