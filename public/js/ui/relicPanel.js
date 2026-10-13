import { useState } from '../../vendor/hooks.module.js';
import { html,Button,Modal } from './components.js';
import { useStore } from '../store.js';
import { act } from './gameActions.js';
import { RELICS,RELIC_TIERS } from '../../../shared/relics.js';
import { t } from '../../../shared/i18n.js';
export function RelicPanel() {
 const pub=useStore(s=>s.match.public),priv=useStore(s=>s.match.private);
 const [open,setOpen]=useState(null),[busy,setBusy]=useState(false);
 if(!pub?.funRules?.relicsEnabled||!priv) return null;
 const offer=pub.phase==='PREP'?priv.relicOffer:null;
 const pick=async id=>{if(busy)return;setBusy(true);try{await act('g.relic',{id,offerId:offer.id});}finally{setBusy(false);}};
 const card=(r,onClick)=>html`<article class=${'relic-card tier-'+r.tier}><b>${t(r.name)}</b><small>${t(RELIC_TIERS[r.tier-1])}</small><p>${t(r.desc)}</p>${onClick?html`<${Button} disabled=${busy} onClick=${onClick}>${t('选择此藏品')}<//>`:null}</article>`;
 return html`<div class="relic-effects">${(priv.relics||[]).map(x=>{const r=RELICS.find(r=>r.id===x.id);return r?html`<button type="button" class=${'relic-effect tier-'+r.tier} title=${t(r.name)} onClick=${()=>setOpen(x.id)}>${t(r.name)}</button>`:null;})}</div>
  <${Modal} open=${!!offer||!!open} title=${t(offer?(offer.pity?'逆风补给 · 藏品三选一':'无漏怪奖励 · 藏品三选一'):'你的收藏品')} onClose=${offer?undefined:()=>setOpen(null)}>
   <p>${t('每次只获得所选的一件，同名不重复，效果仅在本局有效。')}</p>
   <div class="relic-pool">${offer?offer.choices.map(id=>{const r=RELICS.find(x=>x.id===id);return card(r,()=>pick(id));}):(priv.relics||[]).filter(x=>x.id===open).map(x=>{const r=RELICS.find(r=>r.id===x.id);return html`<div>${card(r)}<small>${t('第 {r} 回合获得',{r:x.round})}</small></div>`;})}</div>
   ${!offer?html`<${Button} onClick=${()=>setOpen(null)}>${t('关闭')}<//>`:null}
  <//>`;
}
