import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { useStore } from '../store.js';
import { net } from '../net.js';
import { toastError } from './toasts.js';
import { createLobbyDiscovery } from '../lobbyDiscovery.js';
import { LobbyDiscoveryPanel, LobbyRoomList } from './lobbyDiscovery.js';
export function LobbyDiscovery() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createLobbyDiscovery({ net });
  const discovery = ref.current;
  const state = useStore(s => s, Object.is, discovery.target);
  const online = useStore(s => s.connection?.status === 'online');
  const [capacity, setCapacity] = useState(null);
  useEffect(() => { discovery.start(); return () => discovery.dispose(); }, [discovery]);
  const run = (type, fields) => net.request(type, fields).catch(toastError);
  return html`<div style="position:relative;z-index:5">
    <${LobbyDiscoveryPanel} state=${state} connected=${online} capacity=${capacity} onCapacity=${setCapacity}
      onOpen=${() => discovery.show()} onQuickMatch=${() => run('lobby.quickMatch', capacity ? { capacity } : {})} />
    ${state.open ? html`<${LobbyRoomList} state=${state} connected=${online} onClose=${() => discovery.close()}
      onRefresh=${() => discovery.refresh()} onPage=${n=>discovery.page(n)}
      onJoin=${roomId=>run('lobby.join', { roomId })} onSpectate=${roomId=>run('lobby.spectate', { roomId })} />` : null}
  </div>`;
}
