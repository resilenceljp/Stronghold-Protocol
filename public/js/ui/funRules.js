import { html,Button } from './components.js';
import { useState,useEffect } from '../../vendor/hooks.module.js';
import { useStore } from '../store.js';
import { act } from './gameActions.js';
import { RELICS,RELIC_TIERS } from '../../../shared/relics.js';
import { SetupReroll } from './setupReroll.js';
import { t } from '../../../shared/i18n.js';
export function FunRules({pub}) {
 const myId=useStore(s=>s.me.playerId),hostId=useStore(s=>s.room?.hostId);
 const [busy,setBusy]=useState(false);
 const [amount,setAmount]=useState(String(pub.funRules.startingFunds));
 const rules=pub.funRules,host=myId===hostId;
 const set=async patch=>{if(busy||!host)return;setBusy(true);try{await act('room.funRules',{rules:patch,setupRevision:pub.setupRevision});}finally{setBusy(false);}};
 useEffect(()=>setAmount(String(rules.startingFunds)),[rules.startingFunds]);
 const disabled=!host||busy||!!pub.rerollVote;
 return html`<section class="fun-rules">
  <h2>${t('本局娱乐规则')}</h2><p>${t('由房主设置，全员确认后开始；修改规则会取消已有就绪。')}</p>
  <div class="fun-rule"><div><b>${t('休整期控制台')}</b><small>${t('全房玩家可用，只操作自己，无次数限制。')}</small></div>
   <nav class="fun-options"><button type="button" aria-pressed=${rules.consoleEnabled===false} class=${rules.consoleEnabled===false?'is-selected':''} disabled=${disabled} onClick=${()=>set({consoleEnabled:false})}>${t('关闭')}</button><button type="button" aria-pressed=${rules.consoleEnabled===true} class=${rules.consoleEnabled===true?'is-selected':''} disabled=${disabled} onClick=${()=>set({consoleEnabled:true})}>${t('开启')}</button></nav></div>
  <div class="fun-rule"><div><b>${t('干员练度')}</b><small>${t('官方：沿用个人调配。满练度：满潜能、最高自持有加成；技能与模组沿用游戏数据。')}</small></div>
   <nav class="fun-options"><button type="button" aria-pressed=${rules.training==="official"} class=${rules.training==="official"?'is-selected':''} disabled=${disabled} onClick=${()=>set({training:"official"})}>${t('官方')}</button><button type="button" aria-pressed=${rules.training==="max"} class=${rules.training==="max"?'is-selected':''} disabled=${disabled} onClick=${()=>set({training:"max"})}>${t('满练度')}</button></nav></div>
  <div class="fun-rule"><div><b>${t('部署位上限')}</b><small>${t('基础上限8或12，人事部文档等加成另计。')}</small></div>
   <nav class="fun-options"><button type="button" aria-pressed=${rules.deployCap===8} class=${rules.deployCap===8?'is-selected':''} disabled=${disabled} onClick=${()=>set({deployCap:8})}>${t('8位')}</button><button type="button" aria-pressed=${rules.deployCap===12} class=${rules.deployCap===12?'is-selected':''} disabled=${disabled} onClick=${()=>set({deployCap:12})}>${t('12位')}</button></nav></div>
  <div class="fun-rule"><div><b>${t('起始资金')}</b><small>${t('第1回合额外发放，正常回合收入另计。')}</small></div>
   <input aria-label=${t('起始资金')} type="number" min="0" max="9999" value=${amount} disabled=${disabled} onInput=${e=>setAmount(e.target.value)}/>
   <${Button} disabled=${disabled||!Number.isInteger(Number(amount))||Number(amount)<0||Number(amount)>9999} onClick=${()=>set({startingFunds:Number(amount)})}>${t('应用')}<//></div>
  <div class="fun-rule"><div><b>${t('对局藏品')}</b><small>${t('无漏怪三选一；连续3回合漏怪获得高稀有度选择及下回合2点LP护盾。同名不重复，仅本局有效。')}</small></div>
   <nav class="fun-options"><button type="button" aria-pressed=${rules.relicsEnabled===false} class=${rules.relicsEnabled===false?'is-selected':''} disabled=${disabled} onClick=${()=>set({relicsEnabled:false})}>${t('关闭')}</button><button type="button" aria-pressed=${rules.relicsEnabled===true} class=${rules.relicsEnabled===true?'is-selected':''} disabled=${disabled} onClick=${()=>set({relicsEnabled:true})}>${t('开启')}</button></nav></div>
  <${SetupReroll} pub=${pub}/>
  <h3>${t('本局藏品池')} · ${rules.relicIds.length}/${RELICS.length}</h3>
  <p>${t('勾选加入本局候选池，取消勾选可移除。已获得的藏品不会重复出现。')}</p>
  <div class="relic-pool relic-pool--compact">${RELICS.map(r=>html`<label key=${r.id} class=${'relic-row tier-'+r.tier}>
   <input type="checkbox" checked=${rules.relicIds.includes(r.id)} disabled=${disabled} onChange=${()=>set({relicIds:rules.relicIds.includes(r.id)?rules.relicIds.filter(id=>id!==r.id):[...rules.relicIds,r.id]})}/>
   <b>${t(r.name)}</b><small>${t(RELIC_TIERS[r.tier-1])}</small><p>${t(r.desc)}</p></label>`)}</div>
 </section>`;
}
