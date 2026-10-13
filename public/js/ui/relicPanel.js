import { useState } from '../../vendor/hooks.module.js';
import { html,Button,Modal } from './components.js';
import { useStore } from '../store.js';
import { act } from './gameActions.js';
import { RELICS,RELIC_TIERS } from '../../../shared/relics.js';
import { t } from '../../../shared/i18n.js';
export function RelicPanel() {
 const pub=useStore(s=>s.match.public),priv=useStore(s=>s.match.private);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 if(!pub?.funRules?.relicsEnabled||!priv) return null;
 const offer=pub.phase==='PREP'?priv.relicOffer:null;
 const pick=async id=>{if(busy)return;setBusy(true);try{await act('g.relic',{id,offerId:offer.id});}finally{setBusy(false);}};
 const card=(r,onClick)=>html`<article class=${'relic-card tier-'+r.tier}><b>${t(r.name)}</b><small>${t(RELIC_TIERS[r.tier-1])}</small><p>${t(r.desc)}</p>${onClick?html`<${Button} disabled=${busy} onClick=${onClick}>${t('选择此藏品')}<//>`:null}</article>`;
 return html`<div class="relic-entry"><${Button} onClick=${()=>setOpen(true)}>${t('你的收藏品')} ${priv.relics?.length||0}<//></div>
  <${Modal} open=${!!offer||open} title=${t(offer?(offer.pity?'逆风补给 · 藏品三选一':'无漏怪奖励 · 藏品三选一'):'你的收藏品')} onClose=${offer?undefined:()=>setOpen(false)}>
   <p>${t('每次只获得所选的一件，同名不重复，效果仅在本局有效。')}</p>
   <div class="relic-pool">${offer?offer.choices.map(id=>{const r=RELICS.find(x=>x.id===id);return card(r,()=>pick(id));}):(priv.relics||[]).map(x=>{const r=RELICS.find(r=>r.id===x.id);return html`<div>${card(r)}<small>${t('第 {r} 回合获得',{r:x.round})}</small></div>`;})}</div>
   ${!offer?html`<${Button} onClick=${()=>setOpen(false)}>${t('关闭')}<//>`:null}
  <//>`;
}
