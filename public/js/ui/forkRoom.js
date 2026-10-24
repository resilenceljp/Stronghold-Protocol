import { html } from './components.js';
import { net } from '../net.js';
import { toastError } from './toasts.js';
import { t } from '../../../shared/i18n.js';
import { ROOM_CAPACITIES } from '../../../shared/constants.js';
export function ForkRoomControls({room,myId}) {
  if (!room || room.mode === 'solo' || room.inMatch) return null;
  const host=room.hostId===myId;
  const run=(type,body)=>net.request(type,body).catch(toastError);
  return html`<div class="fork-room-controls" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;position:relative;z-index:10">
    <label>${t('房间人数')} <select disabled=${!host} value=${room.capacity} onChange=${e=>run('room.setCapacity',{capacity:Number(e.target.value)})}>${ROOM_CAPACITIES.map(n=>html`<option value=${n}>${n}</option>`)}</select></label>
    <button type="button" disabled=${!host} aria-pressed=${room.allowMatchmaking!==false} onClick=${()=>run('room.setMatchmaking',{allowed:room.allowMatchmaking===false})}>${t('公开匹配')}</button>
    ${host ? (room.seats||[]).filter(s=>s&&!s.isBot&&s.playerId!==myId&&s.connected).map(s=>html`<button type="button" onClick=${()=>run('room.transferHost',{playerId:s.playerId})}>${t('转让房主')} · ${s.name}</button>`) : null}
  </div>`;
}
