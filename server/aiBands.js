// Optional group vote for actual AI seats; manual humans keep their own choices.
import { ERR } from '../shared/constants.js';
import { takeoverVoters } from './aiTakeover.js';
const fail = detail => ({ error: ERR.BAD_TARGET, detail });
export function beginAiBandVote(lobby, room, ps, group) {
  const m = room.match;
  if (room.aiBandPolicy !== 'vote' || !ps.isBot || !takeoverVoters(room, ps.playerId).length) return false;
  const vote = { botId: ps.playerId, group, draft: m.draft, votes: {}, expiresAt: Date.now() + 30000 };
  room.aiBandPending ||= new Map(); room.aiBandPending.set(ps.playerId, vote); sync(lobby, room);
  m.later(30000, () => {
    if (room.aiBandPending.get(ps.playerId) !== vote) return;
    room.aiBandPending.delete(ps.playerId);
    if (m.phase === 'BAND_DRAFT' && m.draft === vote.draft && m.draftTurn(ps.playerId) === ps.playerId) m._applyBand(ps, m.timeoutBand(ps.playerId), { dedupe: true });
    sync(lobby, room);
  });
  return true;
}
function sync(lobby, room) {
  const m = room.match;
  room.aiBandVotes = [...(room.aiBandPending?.values() || [])].filter(v => m?.draft === v.draft && m.phase === 'BAND_DRAFT' && m.draftTurn(v.botId) === v.botId).map(v => ({ botId: v.botId, draftId: v.draft.id, votes: { ...v.votes }, eligible: takeoverVoters(room, v.botId), expiresAt: v.expiresAt, candidates: m.gd.bandIds().filter(id => m.gd.bandAllowed(id) && !m.bandTaken(id, v.botId)) }));
  lobby.broadcastState(room);
}
export function aiBandAction(lobby, session, msg) {
  const room = lobby.roomOf(session), m = room?.match;
  if (!room || room.mode === 'solo' || m?.hosted || room.modded) return fail('original co-op room required');
  if (msg.t === 'room.aiPolicy') {
    if (room.hostId !== session.playerId || (m && m.phase !== 'INFO_CHECK')) return fail('host may configure this before drafting');
    room.aiBandPolicy = msg.policy;
    for (const s of room.seats) if (s && !s.isBot) s.ready = false;
    if (m) { m.setupRevision++; for (const p of m.order) p.infoReady = p.botControlled; m.cancel(m._infoAdvanceTimer); m._infoAdvanceTimer = null; m.markPublic(); m.flush(true); }
    lobby.broadcastState(room); return { ok: true };
  }
  const v = room.aiBandPending?.get(msg.botId);
  if (!m || m.phase !== 'BAND_DRAFT' || !v || msg.draftId !== m.draft.id || v.draft !== m.draft || m.draftTurn(msg.botId) !== msg.botId || Date.now() >= v.expiresAt) return fail('AI vote expired');
  const eligible = takeoverVoters(room, msg.botId);
  if (!eligible.includes(session.playerId) || (msg.bandId != null && (!m.gd.bandAllowed(msg.bandId) || m.bandTaken(msg.bandId, msg.botId)))) return fail('invalid teammate or strategy');
  if (msg.bandId == null) { delete v.votes[session.playerId]; sync(lobby, room); return { ok: true }; }
  v.votes[session.playerId] = msg.bandId;
  if (eligible.filter(id => v.votes[id] === msg.bandId).length >= Math.floor(eligible.length / 2) + 1) {
    room.aiBandPending.delete(msg.botId); m._applyBand(m.players.get(msg.botId), msg.bandId, { dedupe: true });
  }
  sync(lobby, room); return { ok: true };
}
