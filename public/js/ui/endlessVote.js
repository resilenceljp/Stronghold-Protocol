import {html,Button,Modal} from './components.js';
import {useStore} from '../store.js';
import {useState} from '../../vendor/hooks.module.js';
import {act} from './gameActions.js';
import {t} from '../../../shared/i18n.js';
export function EndlessVote({pub}) {
 const id=useStore(s=>s.me.playerId),[busy,setBusy]=useState(false),vote=pub?.endlessVote;
 if(!vote)return null;
 const voter=vote.voters.includes(id),agreed=vote.agreed.includes(id);
 const send=async agree=>{if(busy)return;setBusy(true);try{await act('g.endlessVote',{voteId:vote.id,agree});}finally{setBusy(false);}};
 return html`<${Modal} open=${true} title=${t('是否进入无尽模式？')} micro="ENDLESS VOTE" onClose=${()=>{}} actions=${voter?html`<${Button} disabled=${busy||agreed} onClick=${()=>send(true)}>${agreed?t('已同意'):t('同意')}<//><${Button} variant="secondary" disabled=${busy} onClick=${()=>send(false)}>${t('结束本局')}<//>`:null}>
 <p>${t('已完成有限关卡。全体真人同意后保留阵容、资金和藏品继续无尽；任何人拒绝、退出或60秒未确认则按胜利结束。')}</p>
 <p>${t('敌人属性每回合复利增长10%。七级商店沿用准备页设置。')}</p>
 ${vote.voters.map(pid=>html`<p key=${pid}>${pub.players.find(p=>p.playerId===pid)?.name||pid} · ${vote.agreed.includes(pid)?t('已同意'):t('待同意')}</p>`)}
 <//>`;
}
