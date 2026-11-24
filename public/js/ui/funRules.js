import { html, Button, Modal } from './components.js';
import { useState } from '../../vendor/hooks.module.js';
import { useStore } from '../store.js';
import { act } from './gameActions.js';
import { t,N_ } from '../../../shared/i18n.js';
export function FunRules({pub}) {
 const myId=useStore(s=>s.me.playerId),hostId=useStore(s=>s.room?.hostId);
 const [busy,setBusy]=useState(false);
 const rules=pub.funRules,host=myId===hostId;
 const set=async patch=>{if(busy||!host)return;setBusy(true);try{await act('room.funRules',{rules:patch,setupRevision:pub.setupRevision});}finally{setBusy(false);}};
 const disabled=!host||busy||!!pub.rerollVote;
 const toggle=(key,label,hint)=>html`<div class="fun-rule"><div><b>${t(label)}</b><small>${t(hint)}</small></div><nav class="fun-options">${[false,true].map(value=>html`<button type="button" aria-pressed=${rules[key]===value} class=${rules[key]===value?'is-selected':''} disabled=${disabled} onClick=${()=>set({[key]:value})}>${value?t('开启'):t('关闭')}</button>`)}</nav></div>`;
 return html`<section class="fun-rules">
  <p>${t('由房主设置，全员确认后开始；修改规则会取消已有就绪。')}</p>
  <div class="fun-rule"><div><b>${t('部署位上限')}</b><small>${t('基础上限8或12，人事部文档等加成另计。')}</small></div>
   <nav class="fun-options"><button type="button" aria-pressed=${rules.deployCap===8} class=${rules.deployCap===8?'is-selected':''} disabled=${disabled} onClick=${()=>set({deployCap:8})}>${t('8位')}</button><button type="button" aria-pressed=${rules.deployCap===12} class=${rules.deployCap===12?'is-selected':''} disabled=${disabled} onClick=${()=>set({deployCap:12})}>${t('12位')}</button></nav></div>
  ${toggle('consoleEnabled',N_('娱乐控制台'),N_('开启后，玩家可在休整期使用控制台。'))}
  ${toggle('expandedBench',N_('扩展整备区'),N_('规程：装备栏左侧增加4个干员格，装备栏保留5格。其他赛季的扩展整备区为22格。'))}
  ${toggle('shopLevel7',N_('七级商店'),N_('允许调度升至7级，增加一个干员槽和一个装备槽，其他规则不变。'))}
 </section>`;
}

export function FunRulesEntry({ pub }) {
  const [open, setOpen] = useState(false);
  if (pub.ruleset !== 'entertainment' || !pub.funRules) return null;
  return html`<${Button} variant="secondary" class="fun-rules-open" onClick=${() => setOpen(true)}>${t('本局娱乐规则')}<//>
    <${Modal} open=${open} class="fun-rules-dialog" title=${t('本局娱乐规则')} onClose=${() => setOpen(false)}>
      <${FunRules} pub=${pub}/>
    <//>`;
}
