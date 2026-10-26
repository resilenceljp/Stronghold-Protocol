import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../server/match/Match.js';
import { getData } from '../../server/data.js';
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
