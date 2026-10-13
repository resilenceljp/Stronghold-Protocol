import { RELICS,relicWeights } from '../../shared/relics.js';
export function awardRelic(m,ps,leaks) {
 if(m.ruleset==='standard'||!m.funRules.relicsEnabled||!ps.alive||ps.left) return;
 ps.relicLeakStreak=leaks>0?ps.relicLeakStreak+1:0;
 const pity=ps.relicLeakStreak>=3;
 if(pity) {ps.relicLeakStreak=0;ps.nextRelicShield=2;}
 if(leaks>0&&!pity) return;
 const pool=RELICS.filter(r=>m.funRules.relicIds.includes(r.id)&&!ps.relics.some(x=>x.id===r.id));
 const weights=relicWeights(m.round,pity), choices=[];
 const counts=RELICS.filter(r=>m.funRules.relicIds.includes(r.id)).reduce((out,r)=>{out[r.tier-1]++;return out;},[0,0,0,0,0]);
 // Base percentages are tier probabilities for a full enabled pool, not per-item weights.
 // Acquired candidates leave the pool and reduce that tier's actual probability.
 const weight=r=>weights[r.tier-1]/(counts[r.tier-1]||1);
 while(pool.length&&choices.length<3) {
  const sum=pool.reduce((n,r)=>n+weight(r),0); if(!sum) break;
  let pick=m.rngRelics()*sum, i=0;
  for(;i<pool.length-1;i++) {pick-=weight(pool[i]);if(pick<0) break;}
  choices.push(pool.splice(i,1)[0].id);
 }
 if(choices.length) ps.relicOffer={id:`relic:${m.round}:${ps.playerId}`,round:m.round,pity,choices};
 // Choices never stop settlement: they are resolved at the next PREP, before ready.
 ps.dirty();
}
export function chooseRelic(m,ps,id,offerId) {
 const offer=ps.relicOffer;
 if(m.phase!=='PREP'||ps.ready||!ps.alive||ps.left||!offer||offer.id!==offerId||!offer.choices.includes(id)) return {error:'BAD_TARGET'};
 ps.addFunds(RELICS.find(r=>r.id===id)?.income||0,{reason:'relic'});
 ps.relics.push({id,round:offer.round});ps.relicOffer=null;ps.dirty();return {ok:true};
}
