import { GEO } from './constants.js';
export function benchGeo(size=10,boss=false) {return size===22?{...GEO,HAND_SIZE:22,HAND_COLS:11,TEMP_ROW:boss?13:6}:GEO;}
/** @param {number} idx @param {any} geo */
export function handTile(idx,geo=GEO) {const cols=geo.HAND_COLS||geo.HAND_SIZE||Infinity;return {row:geo.HAND_ROW+Math.floor(idx/cols),col:idx%cols};}
// Render-only pads: never change battle routes, deployment legality or generated stage data.
export function benchStage(stage,size) {
 if(size!==22||!stage?.rows) return stage;
 const rows=[...stage.rows];
 for(const r of [0,1,7,8]) rows[r]='a'.repeat(21);
 rows[6]=rows[6].slice(0,4)+'A'.repeat(5)+rows[6].slice(9,12)+'A'.repeat(5)+rows[6].slice(17);
 return {...stage,rows};
}
