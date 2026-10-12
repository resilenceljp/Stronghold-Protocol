// Optional room-local sandbox console. Every operation is validated by the server.
import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { data, useData } from '../data.js';
import { chessPortraitUrl, itemIconUrl } from './assetUrls.js';
import { net } from '../net.js';
import { toastError } from './toasts.js';
import { t } from '../../../shared/i18n.js';

export function EntertainmentConsole({ priv, editable }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chess');
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  useData('chess', 'items', 'bonds', 'assets');
  if (!priv?.consoleEnabled || priv.ruleset === 'standard' || !priv.alive) return null;
  const titles = { chess: t('干员'), item: t('装备'), layers: t('盟约层数'), level: t('调度等级'), funds: t('资金') };
  const key = tab === 'chess' ? 'chess' : tab === 'item' ? 'items' : 'bonds';
  const records = Object.entries(data.get(key) || {}).filter(([id, rec]) => rec && !rec.isHidden && !rec.isDiy &&
    (!search || `${id} ${rec.name || ''}`.toLowerCase().includes(search.toLowerCase())));
  const grant = async (id) => {
    if (!editable || busy) return;
    setBusy(true);
    try { await net.request('g.console', { kind: tab, ...(id ? { id } : {}), amount: Number(amount) }); }
    catch (e) { toastError(e); }
    finally { setBusy(false); }
  };
  return html`<div class="entertainment-console-entry">
    <${Button} size="sm" variant="secondary" disabled=${!editable} onClick=${() => setOpen(true)}>${t('控制台')}<//>
    <${Modal} open=${open && editable} title=${t('娱乐控制台')} micro="ENTERTAINMENT CONSOLE" tone="red" width="min(1000px,92vw)"
      onClose=${() => setOpen(false)} class="entertainment-console"
      actions=${html`<${Button} variant="secondary" onClick=${() => setOpen(false)}>${t('关闭')}<//>`}>
      <p class="console-note">${t('休整期可用 · 无次数限制 · 仅修改自己的数据')}</p>
      <nav class="console-tabs">${Object.entries(titles).map(([id, label]) => html`<button type="button"
        class=${tab === id ? 'is-selected' : ''} aria-pressed=${tab === id}
        onClick=${() => { setTab(id); setSearch(''); setAmount(id === 'level' ? priv.shop.level : 1); }}>${label}</button>`)}</nav>
      ${tab === 'level' || tab === 'funds' ? html`<div class="console-value">
        <label>${titles[tab]} <input type="number" min=${tab === 'level' ? priv.shop.level : 1}
          max=${tab === 'level' ? priv.shop.maxLevel : 9999} value=${amount} onInput=${(e) => setAmount(e.target.value)} /></label>
        <${Button} disabled=${busy} onClick=${() => grant(null)}>${t('获取')}<//>
      </div>` : html`
        <div class="console-search"><input aria-label=${t('搜索名称或ID')} placeholder=${t('搜索名称或ID')} value=${search}
          onInput=${(e) => setSearch(e.target.value)} />
          ${tab === 'layers' ? html`<label>${t('增加层数')} <input type="number" min="1" max="9999" value=${amount} onInput=${(e) => setAmount(e.target.value)} /></label>` : null}</div>
        <div class="console-catalog">${records.map(([id, rec]) => {
          const image = tab === 'chess' ? chessPortraitUrl(data.get('assets'), rec) : tab === 'item' ? itemIconUrl(data.get('assets'), rec) : null;
          return html`<button type="button" key=${id} disabled=${busy} class=${`console-card ${rec.isGolden ? 'is-golden' : ''}`} onClick=${() => grant(id)}>
            ${image ? html`<img src=${image} alt="" loading="lazy" />` : null}
            <span><b>${rec.name || id}${rec.isGolden ? ` · ${t('精锐')}` : ''}</b><small>${id}</small>
              ${tab === 'layers' ? html`<small>${t('当前层数')} ${(priv.bonds || []).find((b) => b.bondId === id)?.layers || 0} / ${priv.layerCap}</small>` : null}</span><b>＋</b></button>`;
        })}</div>`}
    <//>
  </div>`;
}
