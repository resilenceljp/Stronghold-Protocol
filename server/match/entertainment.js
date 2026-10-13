// Deliberate owner-approved optional rules. Standard matches never use these overrides.
import { ERR } from '../../shared/constants.js';
export const RULESETS = ['standard', 'entertainment', 'endless'];
export function configureEntertainment(gd, ruleset = 'standard') {
  gd.ruleset = RULESETS.includes(ruleset) ? ruleset : 'standard';
  gd.layerCap = gd.ruleset === 'standard' ? 999 : 9999;
  if(gd.ruleset !== 'standard') gd.economy={...gd.economy,benchSize:22};
  if (gd.ruleset !== 'endless') return;
  // [ASSUMED] NORMAL supplies the 14-round campaign, all eight maps and the late normal-wave templates.
  const base = gd.config.modes?.[gd.isSolo ? 'mode_single_normal' : 'mode_multi_normal'] || gd.mode;
  gd.mode = { ...base, lastRound: 14, bossRound: 14, hiddenRound: null, maxShopLevel: 7,
    stages: [...(base.stages || [])], shopSlots: { ...base.shopSlots, 7: { chess: 5, item: 2 } },
    upgradePrices: [...(base.upgradePrices || [5, 7, 9, 11, 13]), 20] };
  gd.inactiveEnemies = new Set(gd.mode.inactiveEnemyKeys || []);
}
export function endlessFactor(round) {
  // Numeric safety ceiling, reached only after ~290 rounds; no finite round-count limit.
  return Math.min(1e12, 1.1 ** Math.max(0, round - 1));
}
export function consoleIntent(m, ps, msg) {
  const fail = (error, detail) => ({ error, detail });
  if (m.ruleset === 'standard' || !m.consoleEnabled || ps.isBot || ps.left) return fail(ERR.BAD_TARGET, 'console disabled');
  const gate = ps._gate(); if (gate) return gate;
  const n = msg.amount ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 9999) return fail(ERR.BAD_MSG);
  if (msg.kind === 'chess' || msg.kind === 'item') {
    const rec = msg.kind === 'chess' ? ps.gd.chess(msg.id) : ps.gd.item(msg.id);
    if (!rec || rec.isHidden || (rec.isDiy && !rec.diyFor)) return fail(ERR.BAD_TARGET);
    // Never reserve shared chess copies for a free console grant. Normal merge/onGain hooks still run.
    const piece = msg.kind === 'chess' ? ps.acquireChess(msg.id, { source: 'console', fromPool: false })
      : ps.acquireItem(msg.id, { source: 'console', consoleGrant: true });
    if (!piece) return fail(ERR.HAND_FULL);
  } else if (msg.kind === 'layers') {
    if (!ps.gd.bond(msg.id)) return fail(ERR.BAD_TARGET);
    ps.addLayers(msg.id, n, { reason: 'console' });
  } else if (msg.kind === 'level') {
    if (n > ps.gd.maxShopLevel || n < ps.shop.level) return fail(ERR.BAD_TARGET);
    ps.shop.level = n;
    ps.shop.upgradePrice = ps.gd.upgradeBase(n) ?? 0;
    ps._openLevelSlots();
    ps.recompute();
  } else if (msg.kind === 'funds') ps.addFunds(n, { reason: 'console' });
  else return fail(ERR.BAD_MSG);
  ps.dirty(); m.markPublic();
  return { ok: true };
}
