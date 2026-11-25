import { consoleFormRows } from '../../public/js/ui/entertainmentConsole.js';
import { benchGeo, benchStage, handTile } from '../../shared/bench.js';
import { tileSlot } from '../../public/js/render/drag.js';
import { validateC2S } from '../../shared/protocol.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/match/Match.js';
import { getData, getVersionData } from '../../server/data.js';
import { VirtualScheduler } from '../../server/match/scheduler.js';
import { consoleIntent } from '../../server/match/entertainment.js';
import { awardRelic, chooseRelic } from '../../server/match/relics.js';
import { collectViolations } from '../../server/match/invariants.js';

function fixture(t, ruleset = 'entertainment', patch = {}) {
  const m = new Match({ data: getData(), mode: 'coop', difficulty: 'HARD', ruleset,
    seed: 24, scheduler: new VirtualScheduler(), botRehearsal: 0,
    seats: [{ seat: 0, playerId: 'owner', name: 'Owner', isBot: false, connected: true }],
    send() { return true; }, broadcast() {}, onEnd() {} });
  t.after(() => m.dispose());
  m.start();
  if (ruleset !== 'standard') assert.equal(m.setFunRules('owner', { consoleEnabled: true, ...patch }, m.setupRevision).ok, true);
  m.startRound(1);
  m.phase = 'PREP';
  return { m, p: m.order[0], command: msg => consoleIntent(m, m.order[0], msg) };
}

test('console grants units and equipment without reserving shared copies', t => {
  const { m, p, command } = fixture(t);
  const id = 'chess_char_1_01_a', stock = p.pool.left(id);
  assert.equal(command({ kind: 'chess', id }).ok, true);
  assert.ok(p.hand.some(piece => piece?.id === id));
  assert.equal(p.pool.left(id), stock);
  const [itemId] = Object.entries(m.data.items).find(([, rec]) => rec.tier === 1 && !rec.isGolden);
  assert.equal(command({ kind: 'item', id: itemId }).ok, true);
  assert.ok([...p.hand, ...p.temp].some(piece => piece?.id === itemId));
  assert.deepEqual(collectViolations(m), []);
});

test('console edits funds, LP, layers and upgrades/downgrades the seven-level shop', t => {
  const { m, p, command } = fixture(t, 'entertainment', { shopLevel7: true });
  const before = p.funds;
  assert.equal(command({ kind: 'funds', amount: 25 }).ok, true);
  assert.equal(p.funds, before + 25);
  assert.equal(command({ kind: 'lp', amount: 50 }).ok, true);
  assert.equal(p.lp, 50);
  const bond = Object.keys(m.data.bonds)[0], layers = p.layers[bond] || 0;
  assert.equal(command({ kind: 'layers', id: bond, amount: 3 }).ok, true);
  assert.equal(p.layers[bond], layers + 3);
  for (const amount of [7, 2, 6]) {
    assert.equal(command({ kind: 'level', amount }).ok, true);
    assert.equal(p.shop.level, amount);
    assert.deepEqual(p.privateView().shop.layout, m.gd.shopSlots(amount));
    assert.equal(p.shop.slots.length, p.shop.layout.chess + p.shop.layout.item);
  }
});

test('standard, disabled, ready and combat states reject console operations', t => {
  const standard = fixture(t, 'standard');
  assert.ok(standard.command({ kind: 'funds', amount: 1 }).error);
  const { m, p, command } = fixture(t);
  m.consoleEnabled = false;
  assert.ok(command({ kind: 'funds', amount: 1 }).error);
  m.consoleEnabled = true;
  p.ready = true;
  assert.ok(command({ kind: 'funds', amount: 1 }).error);
  p.ready = false;
  m.phase = 'COMBAT';
  assert.ok(command({ kind: 'funds', amount: 1 }).error);
});


test('expanded bench and relic selection survive setup revisions; endless requires explicit agreement', t => {
  const { m, p } = fixture(t, 'entertainment', { expandedBench: true, relicsEnabled: true });
  assert.equal(p.hand.length, 22);
  assert.equal(p.temp.length, 11);
  awardRelic(m, p, 0);
  const offer = p.relicOffer;
  assert.ok(offer.choices.length > 0 && offer.choices.length <= 3);
  assert.equal(chooseRelic(m, p, offer.choices[0], offer.id).ok, true);
  assert.equal(p.relics.length, 1);
  m.offerEndless({ victory: true });
  assert.equal(m.ruleset, 'entertainment');
  assert.equal(m.voteEndless(p, m.endlessVote.id, true).ok, true);
  assert.equal(m.ruleset, 'endless');
  assert.equal(m.round, 15);
});

test('regulation expanded bench supports extra operator and equipment slots plus normal Acrbot grants', t => {
  const data = getVersionData('act3autochess@V3_1');
  const m = new Match({ data, mode: 'coop', difficulty: 'NORMAL', ruleset: 'entertainment',
    seed: 24, scheduler: new VirtualScheduler(), botRehearsal: 0,
    seats: [{ seat: 0, playerId: 'owner', name: 'Owner', isBot: false, connected: true }],
    send() { return true; }, broadcast() {}, onEnd() {} });
  t.after(() => m.dispose());
  m.start();
  assert.equal(m.setFunRules('owner', { expandedBench: true }, m.setupRevision).ok, true);
  m.startRound(1);
  m.phase = 'PREP';
  const player = m.order[0];
  assert.equal(player.hand.length, 15);
  assert.equal(player.temp.length, 7);
  const geo = benchGeo(player.hand.length);
  const expandedStage = benchStage(m.stage, player.hand.length);
  assert.equal(expandedStage.rows[8].slice(0, 4), 'aaaa');
  assert.equal(expandedStage.rows[8].slice(4, 9), m.stage.rows[8].slice(4, 9));
  assert.equal(expandedStage.rows[8].slice(9, 11), 'AA');
  assert.equal(expandedStage.rows[7][10], 'a');
  const piece = player.acquireChess([...player.pool.entries.keys()].find(id => data.chess[id]?.tier === 1 && player.pool.left(id) > 0), { fromPool: false });
  for (let idx = 10; idx < 14; idx++) {
    const tile = handTile(idx, geo);
    assert.deepEqual(tile, { row: 8, col: idx - 10 });
    const to = tileSlot(tile, geo);
    assert.equal(validateC2S({ t: 'g.move', uid: piece.uid, to }), null);
    assert.equal(player.move(piece.uid, to).ok, true);
    assert.equal(player.hand[idx]?.uid, piece.uid);
  }
  assert.deepEqual(tileSlot({ row: 8, col: 4 }, geo), { area: 'temp', idx: 0 });
  const operatorSlot = tileSlot(handTile(14, geo), geo);
  assert.deepEqual(operatorSlot, { area: 'hand', idx: 14 });
  assert.equal(player.move(piece.uid, operatorSlot).ok, true);
  const itemId = Object.keys(data.items).find(id => !data.items[id].isHidden);
  const item = player.acquireItem(itemId, { consoleGrant: true });
  for (const idx of [5, 6]) {
    const slot = tileSlot({ row: 8, col: 4 + idx }, geo);
    assert.deepEqual(slot, { area: 'temp', idx });
    assert.equal(player.move(item.uid, slot).ok, true);
  }
  m.consoleEnabled = true;
  assert.equal(consoleIntent(m, player, { kind: 'chess', id: 'chess_char_5_22_a' }).ok, true);
  assert.ok(player.hand.some(p => p?.id === 'chess_char_5_22_a'));
  assert.equal(consoleIntent(m, player, { kind: 'chess', id: 'chess_char_5_22_b' }).ok, true);
  assert.ok(player.hand.some(p => p?.id === 'chess_char_5_22_b'));

  const bannedId = Object.keys(data.chess).find(id => {
    const record = data.chess[id];
    return !record.isHidden && !record.isDiy && !record.isGolden && record.bonds?.length;
  });
  m.disabledBonds = [...new Set([...m.disabledBonds, ...data.chess[bannedId].bonds])];
  assert.ok(m.chessExcluded(player.gd.chess(bannedId)));
  assert.equal(player.acquireChess(bannedId, { fromPool: false }), null);
  for (let i = 0; i < 3; i++) {
    assert.equal(consoleIntent(m, player, { kind: 'chess', id: bannedId }).ok, true);
  }
});


test('console forms stay paired even when normal and elite are returned out of order', () => {
  const normal = ['a', { baseId: 'a' }];
  const solo = ['solo', {}];
  const elite = ['b', { baseId: 'a', isGolden: true }];
  assert.deepEqual(consoleFormRows([elite, solo, normal]), [['a', [normal, elite]], ['solo', [solo, null]]]);
  assert.deepEqual(consoleFormRows([elite]), [['a', [null, elite]]]);
});
