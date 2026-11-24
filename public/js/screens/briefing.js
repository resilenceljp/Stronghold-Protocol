import { factionTypes } from '../ui/gameLogic/enemies.js';
import { enemyIconUrl, factionIconUrl } from '../ui/assetUrls.js';
// Briefing — INFO_CHECK "1/2 确认本局信息" (research 06 §4.1, D1): enemy leader (silhouette, name,
// abilities), stage (+ its pool: 战场固定 / 战场随机（共N张）), 特训敌人 factions (icon, name, description), the difficulty
// tag, the ready count x/N with person pips, the 准备就绪 button (g.infoReady) and the countdown. The 核心盟约 / 附加盟约
// rows of bond discs (disabled bonds greyed with the banned-member badge), the legend and the 本局禁用干员 avatars, with
// the player's own 自选 pieces out of the shop (m.private.diyBanned), are ui/matchInfo.js MatchBondRow / MatchLegend /
// BannedOperators, the blocks the strategy draft's 本局信息 dialog shows (screens/bandDraft.js). The enemy section is shared too:
// ui/matchEnemies.js MatchEnemies (GitHub #484, DESIGN §35.6).
// The event's layout (PR #643, video 6:29–7:51): one scrolling column of sections under grey header bars — 本局遭遇敌方
// (MatchEnemies: the leader's framed portrait over 敌方领袖, its text with the battlefield, the 特训敌人 as round icons
// with their names, the description in a tooltip — the maintainer's decision of 2026-10-22), 核心盟约, 附加盟约 (the legend
// under it), 本局禁用干员 — with 已就绪 x/N over the person pips (已就绪 2/4 as research 06 §4.1 reads it, no colon) and
// the big 准备就绪 in the bottom-right corner. The sections come in from the right one after another
// (css/screens/briefing.css 开局转场). 规程 (config.version.family === 'regulation') uses ui/regulationBriefing.js
// instead; the return below is every other version, unchanged.

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from '../ui/components.js';
import { useGameData, Img, RichText } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchBondGroups, MatchBondRow, MatchLegend, BannedOperators, matchInfoModel, MatchBondDialog, regulationCoreAbsent } from '../ui/matchInfo.js';
import { MatchEnemies } from '../ui/matchEnemies.js';
import { RegulationBriefing, regulationBriefingLayout } from '../ui/regulationBriefing.js';
import { LoadoutButton } from './loadout.js';
import { FunRulesEntry } from '../ui/funRules.js';
import { UnofficialMark } from '../ui/pluginTag.js';
import { SetupReroll } from '../ui/setupReroll.js';
import { MatchChatButton } from '../ui/matchChat.js';
import { actions } from '../ui/gameActions.js';
import { sortedPlayers, phaseTotalSeconds, pregameStepCount, pregameStepIndex } from '../ui/gameLogic.js';
import { useStore } from '../store.js';
import { data } from '../data.js';
import { t, tParts } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** INFO_CHECK screen. */
export function BriefingScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo') || String(pub?.modeId || '').includes('single');
  // gameplay plugins (DESIGN §32.6): the briefing says the match is unofficial
  const room = useStore((s) => s.room);
  const gd = useGameData();
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bondId, setBondId] = useState(null);
  if (!pub) return null;

  const players = sortedPlayers(pub);
  const me = players.find((p) => p.playerId === myId);
  const readyN = players.filter((p) => p.ready).length;
  const mode = gd.config?.modes?.[pub.modeId];
  // (+ the own 自选 pieces this match leaves out of the shop: m.private.diyBanned)
  const info = matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } });
  const boss = pub.bossId ? gd.boss(pub.bossId) : null;
  const bossEnemy = boss ? gd.enemy(boss.enemyKey) : null;
  const stage = pub.stageId ? gd.stage(pub.stageId) : null;
  // the mode's battlefield pool (config.json modes[].stages): 标准 is always 战场#01, 险境+ draw one at random
  const poolN = Array.isArray(mode?.stages) ? mode.stages.length : 0;
  const pool = poolN > 1 ? t('战场随机（共{poolN}张）', { poolN }) : poolN === 1 ? t('战场固定') : '';
  const types = factionTypes(pub.factions);
  const factions = gd.factions?.types || {};
  const m = gd.m;

  const ready = async () => {
    if (busy || me?.ready) return;
    setBusy(true);
    await actions.infoReady(pub.setupRevision ?? 0);
    setBusy(false);
  };

  const pickGroup = async (idx) => {
    if (busy || !me || pub.rerollVote) return;
    setBusy(true);
    try { await actions.bondGroup(idx, pub.setupRevision ?? 0); }
    finally { setBusy(false); }
  };

  if (regulationBriefingLayout(gd.config)) {
    return html`<${RegulationBriefing} pub=${pub} gd=${gd} room=${room} solo=${solo} info=${info} players=${players} me=${me}
      readyN=${readyN} myId=${myId} exit=${exit} setExit=${setExit} busy=${busy} bondId=${bondId} setBondId=${setBondId}
      ready=${ready} pickGroup=${pickGroup} priv=${priv} />`;
  }

  return html`<div class="screen brief">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${pregameStepIndex(gd.config, 'INFO_CHECK')} of=${pregameStepCount(gd.config)} title=${t('确认本局信息')} micro="BRIEFING // INFO CHECK" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config)} onExit=${() => setExit(true)} />
    <${UnofficialMark} room=${room} class="brief__modmark" />
    <main class="brief__main">
      <section class="brief__left">
        <div class="brief-boss brackets">
          <${MicroLabel} tone="gold">${t('ENEMY LEADER // 敌方领袖')}</${MicroLabel}>
          <div class="brief-boss__art">
            <div class="brief-boss__ring" aria-hidden="true"></div>
            ${bossEnemy ? html`<${Img} src=${enemyIconUrl(m, boss.enemyKey)} class="brief-boss__sil" fallback=${html`<span class="brief-boss__q">?</span>`} />`
              : html`<span class="brief-boss__q">?</span>`}
          </div>
          <div class="brief-boss__text">
            <h2 class="brief-boss__name">${boss?.name || bossEnemy?.name || t('未知领袖')}</h2>
            <span class="brief-boss__when">${tParts('第 {r} 回合 · 最终攻势', { r: html`<b class="num">${mode?.bossRound ?? pub.lastRound ?? 14}</b>` })}</span>
            ${Array.isArray(boss?.abilities) && boss.abilities.length ? html`<ul class="brief-boss__abil">
              ${boss.abilities.slice(0, 3).map((a, i) => html`<li key=${i}><${RichText} text=${a} /></li>`)}
            </ul>` : null}
          </div>
        </div>
        <div class="brief-stage">
          <span class="brief-stage__k"><${MicroLabel}>BATTLEFIELD</${MicroLabel}>${pool ? html`<span class="brief-stage__pool">${pool}</span>` : null}</span>
          <span class="brief-stage__name"><${Icon} name="rook" />${stage?.name || pub.stageId || '—'}</span>
        </div>
        <div class="brief-factions">
          <h3 class="brief-h"><span>${t('特训敌人')}</span><${MicroLabel}>SPECIAL ENEMIES</${MicroLabel}></h3>
          ${types.length ? types.map((t) => html`<div key=${t} class="brief-faction">
            <span class="brief-faction__icon"><${Img} src=${factionIconUrl(m, factions[t]?.icon)} /></span>
            <span class="brief-faction__text"><b>${factions[t]?.name || t}</b><span>${factions[t]?.desc || ''}</span></span>
          </div>`) : html`<p class="t-dim">${t('本局没有特训敌人')}</p>`}
        </div>
      </section>

      <section class="brief-sec brief-sec--core" style="--i:2"><${MatchBondGroups} model=${info} onPick=${pickGroup} onBond=${setBondId} disabled=${!me || !!me.ready || !!pub.rerollVote} busy=${busy} /></section>
      <section class="brief-sec brief-sec--addon" style="--i:3">
        <${MatchBondRow} title=${t('附加盟约')} micro="ADD-ON BONDS" bonds=${info.addon} model=${info} onBond=${setBondId} />
        <${MatchLegend} model=${info} />
      </section>
    </main>
    <${SetupReroll} pub=${pub} />

    <footer class="brief__foot">
      <${MatchChatButton} class="mchat-brief-entry" />
      <${FunRulesEntry} pub=${pub} />
      <${LoadoutButton} from="briefing" size="lg" class="brief-loadout" />
      <div class="brief-ready">
        <span class="brief-ready__txt">${t('已就绪')} <b class="num">${readyN}</b><span class="num">/${players.length}</span></span>
        <span class=${cx('brief-ready__pips', players.length > 8 && 'is-many')}>${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'on', p.playerId === myId && 'me')} title=${p.name}><${Icon} name="user" /></i>`)}</span>
      </div>
      <${Button} variant="primary" size="xl" class="brief-go" icon=${me?.ready ? 'check' : me ? 'play' : 'eye'} active=${!!me?.ready} loading=${busy}
        disabled=${!!me?.ready || !me || !!pub.rerollVote || info.choice?.picked === null} onClick=${ready}>${me?.ready ? t('已就绪') : me ? t('准备就绪') : t('观战中')}<//>
    </footer>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
    <${MatchBondDialog} bondId=${bondId} onClose=${() => setBondId(null)} priv=${priv} banned=${info.banned} off=${info.sets.off.has(bondId)} coreAbsent=${regulationCoreAbsent(info, bondId)} />
  </div>`;
}
