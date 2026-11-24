import { GEO } from './constants.js';

export const REGULATION_EXPANDED_HAND_SIZE = GEO.HAND_SIZE + GEO.TEMP_C0 + 1;
export const REGULATION_EXPANDED_TEMP_SIZE = GEO.TEMP_SIZE + 2;
export const LEGACY_EXPANDED_HAND_SIZE = 22;
export const LEGACY_EXPANDED_TEMP_SIZE = 11;

export function benchGeo(size = GEO.HAND_SIZE, _boss = false, tempSize = GEO.TEMP_SIZE) {
  if (size === REGULATION_EXPANDED_HAND_SIZE) {
    return { ...GEO, HAND_SIZE: size, HAND_COLS: GEO.HAND_SIZE, TEMP_SIZE: REGULATION_EXPANDED_TEMP_SIZE };
  }
  if (size === LEGACY_EXPANDED_HAND_SIZE) {
    return { ...GEO, HAND_SIZE: size, HAND_COLS: 11, TEMP_ROW: 6, TEMP_C0: 0, TEMP_SIZE: tempSize };
  }
  return GEO;
}

/** Slot geometry shared by models, picking, dragging and UI actions.
 * @param {typeof GEO & {HAND_COLS?:number}} geo
 */
export function handTile(idx, geo = GEO) {
  if (geo.HAND_SIZE === REGULATION_EXPANDED_HAND_SIZE && idx === geo.HAND_SIZE - 1) {
    return { row: geo.HAND_ROW, col: GEO.HAND_SIZE };
  }
  const cols = geo.HAND_COLS || geo.HAND_SIZE || Infinity;
  return { row: geo.HAND_ROW + Math.floor(idx / cols), col: idx % cols };
}

/** Render-only layout; simulation stage and deployment coordinates are unchanged. */
export function benchStage(stage,size,tempSize=5,boss=false) {
 if (!stage?.rows) return stage;
 if (size === REGULATION_EXPANDED_HAND_SIZE) {
  const rows = [...stage.rows];
  const row = boss ? 1 : GEO.TEMP_ROW;
  const add = "a".repeat(GEO.TEMP_C0);
  const original = rows[row];
  if (typeof original !== 'string') return stage;
  rows[row] = boss ? add + original.slice(GEO.TEMP_C0, -GEO.TEMP_C0) + add : add + original.slice(GEO.TEMP_C0);
  const handRow = boss ? 0 : GEO.HAND_ROW;
  const paint = (r, c, glyph) => {
    if (typeof rows[r] === 'string' && c < rows[r].length) rows[r] = rows[r].slice(0, c) + glyph + rows[r].slice(c + 1);
  };
  paint(handRow, 10, 'a');
  for (const col of boss ? [9, 10, 11] : [9, 10]) paint(row, col, 'A');
  return { ...stage, rows, extendedBench: true };
 }
 if(size!==LEGACY_EXPANDED_HAND_SIZE)return stage;
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
