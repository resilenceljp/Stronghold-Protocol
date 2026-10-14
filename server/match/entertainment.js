// Deliberate owner-approved optional rules. Standard matches never use these overrides.
import { ERR } from '../../shared/constants.js';
export const RULESETS = ['standard', 'entertainment', 'endless'];
export function configureEntertainment(gd, ruleset = 'standard') {
  gd._standardMode ||= gd.mode;
  gd._standardModeId ||= gd.modeId;
  gd.modeId = gd._standardModeId;
  gd.mode = gd._standardMode;
  gd.ruleset = RULESETS.includes(ruleset) ? ruleset : 'standard';
  gd.layerCap = gd.ruleset === 'standard' ? 999 : 9999;
  gd._standardEconomy ||= gd.economy;
  gd.economy={...gd._standardEconomy};
  gd.inactiveEnemies=new Set(gd.mode.inactiveEnemyKeys||[]);
  if (gd.ruleset !== 'endless') return;
  // [ASSUMED] NORMAL supplies the 14-round campaign, all eight maps and the late normal-wave templates.
  const base = gd.config.modes?.[gd.isSolo ? 'mode_single_normal' : 'mode_multi_normal'] || gd.mode;
  gd.modeId = gd.isSolo ? 'mode_single_normal' : 'mode_multi_normal';
  gd.mode = { ...base, lastRound: 14, bossRound: 8, hiddenRound: null, maxShopLevel: 7,
    stages: [...(base.stages || [])], shopSlots: { ...base.shopSlots, 7: { chess: (base.shopSlots?.[6]?.chess||5)+1, item: (base.shopSlots?.[6]?.item||1)+1 } },
    upgradePrices: [...(base.upgradePrices || [5, 7, 9, 11, 13]), 20] };
  gd.inactiveEnemies = new Set(gd.mode.inactiveEnemyKeys || []);
}
export function configureShop7(gd, enabled) {
  if (!enabled) { if(gd.ruleset==='endless') gd.mode={...gd.mode,maxShopLevel:6}; return; }
  const slots=gd.mode.shopSlots?.[6]||{chess:5,item:1};
  gd.mode={...gd.mode,maxShopLevel:7,shopSlots:{...gd.mode.shopSlots,7:{chess:slots.chess+1,item:slots.item+1}},upgradePrices:[...gd.mode.upgradePrices.slice(0,5),20]};
}
export function endlessStep(round,start=1) { return Math.max(1,round-start+1); }
export function endlessTemplateRound(round,start=1) { const step=endlessStep(round,start);return step%8===0?14:7+((step-1)%8); }
export function endlessFactor(round,start=1) {
  // [ASSUMED] Seven normal waves + a boss; each cycle raises the per-wave compound multiplier.
  const step=endlessStep(round,start),cycle=Math.floor((step-1)/8);let factor=1;
  for(let c=0;c<=cycle;c++){factor*=Math.pow(1.2+c*0.1,c===cycle?(step-1)%8+1:8);if(factor>=1e12)return 1e12;}
  return factor;
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
    if (n > ps.gd.maxShopLevel) return fail(ERR.BAD_TARGET);
    ps.shop.level = n;
    ps.shop.upgradePrice = ps.gd.upgradeBase(n) ?? 0;
    const layout=ps.gd.shopSlots(n),oldLayout=ps.shop.layout||{chess:ps.shop.slots.length,item:0};
    const chess=ps.shop.slots.slice(0,oldLayout.chess).slice(0,layout.chess),items=ps.shop.slots.slice(oldLayout.chess).slice(0,layout.item);
    while(chess.length<layout.chess)chess.push(null);while(items.length<layout.item)items.push(null);
    ps.shop.slots=[...chess,...items];ps.shop.layout=layout;
    ps.recompute();
  } else if (msg.kind === 'lp') {if(m.teamLp!=null){m.teamLp=n;m._syncTeamLp();}else ps.lp=n;ps.recompute();}
  else if(msg.kind==='enemy'){
    const rec=ps.gd.enemy(msg.id);
    if(!rec||rec.templateSlot||rec.tokenOnly||!['NORMAL','ELITE'].includes(rec.rank)||n>20||m.round===m.gd.bossRound||m.round===m.gd.hiddenRound)return fail(ERR.BAD_TARGET);
    const extras=ps.bounties.filter(b=>b.consoleGrant);if(extras.reduce((sum,b)=>sum+b.card.count,0)+n>100)return fail(ERR.BAD_TARGET);
    m._consoleEnemySeq=(m._consoleEnemySeq||0)+1;
    ps.bounties.push({id:`console-${ps.playerId}-${m._consoleEnemySeq}`,consoleGrant:true,card:{enemyKey:msg.id,count:n,coin:0,payout:'kill',name:rec.name||msg.id},roundsLeft:1});ps.recompute();
  } else if (msg.kind === 'funds') ps.addFunds(n, { reason: 'console' });
  else return fail(ERR.BAD_MSG);
  ps.dirty(); m.markPublic();
  return { ok: true };
}

export function configureBench(gd, enabled) {
 gd.economy={...gd.economy,benchSize:enabled?22:gd._standardEconomy.benchSize,tempSize:enabled?11:gd._standardEconomy.tempSize};
}
