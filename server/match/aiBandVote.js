import { ERR, PHASE } from '../../shared/constants.js';
import { OK, fail } from './match/common.js';

function voters(match, botId) {
  const group = match.draftGroup(botId);
  const eligible = (group?.playerIds || []).filter(id => {
    const player = match.players.get(id);
    return player?.connected && !player.isBot && !player.left && !player.autoplay;
  });
  const host = match.players.get(match.hostId);
  return eligible.length || !host?.connected || host.left ? eligible : [host.playerId];
}

export function setAiBandPolicy(match, policy) {
  if (match.isSolo || match.phase !== PHASE.INFO_CHECK || match.setupVote) return fail(ERR.WRONG_PHASE);
  if (match.aiBandPolicy === policy) return OK;
  match.aiBandPolicy = policy;
  match.setupRevision++;
  for (const player of match.order) player.infoReady = player.botControlled;
  match.cancel(match._infoAdvanceTimer);
  match._infoAdvanceTimer = null;
  match.markPublic();
  match.flush(true);
  return OK;
}

export function beginAiBandVote(match, player) {
  if (match.aiBandPolicy !== 'vote' || !player.isBot || !voters(match, player.playerId).length) return false;
  const draft = match.draft;
  const botId = player.playerId;
  if (draft.aiVotes?.has(botId)) return true;
  draft.aiVotes ??= new Map();
  const group = match.draftGroup(botId);
  match.cancel(group.timer);
  const expiresAt = match.sched.gameNow() + 30000;
  group.turnSeconds = 30;
  group.turnDeadline = expiresAt;
  const vote = { botId, expiresAt, votes: {} };
  draft.aiVotes.set(botId, vote);
  group.timer = match.later(30000, () => {
    if (match.phase !== PHASE.BAND_DRAFT || match.draft !== draft || draft.aiVotes.get(botId) !== vote || match.draftTurn(botId) !== botId) return;
    match._applyBand(player, match.timeoutBand(botId), { dedupe: true });
    match.flush(true);
  });
  match.syncDraftDeadline(draft);
  return true;
}

function available(match, bandId, botId) {
  return match.gd.bandAllowed(bandId) && !match.bandTaken(bandId, botId);
}

export function aiBandView(match) {
  if (match.phase !== PHASE.BAND_DRAFT || !match.draft?.aiVotes?.size) return [];
  return [...match.draft.aiVotes.values()].filter(v => match.draftTurn(v.botId) === v.botId).map(v => ({
    ...v, votes: { ...v.votes }, draftId: match.draft.id, eligible: voters(match, v.botId),
    candidates: match.gd.bandIds().filter(id => available(match, id, v.botId)),
  }));
}

export function voteAiBand(match, playerId, { botId, draftId, bandId }) {
  const vote = match.draft?.aiVotes?.get(botId);
  if (match.phase !== PHASE.BAND_DRAFT || !vote || match.draft.id !== draftId || match.draftTurn(botId) !== botId
      || match.sched.gameNow() >= vote.expiresAt) return fail(ERR.BAD_TARGET);
  const eligible = voters(match, botId);
  if (!eligible.includes(playerId) || (bandId != null && !available(match, bandId, botId))) return fail(ERR.BAD_TARGET);
  if (bandId == null) delete vote.votes[playerId];
  else {
    vote.votes[playerId] = bandId;
    if (eligible.filter(id => vote.votes[id] === bandId).length > eligible.length / 2) {
      match._applyBand(match.players.get(botId), bandId, { dedupe: true });
    }
  }
  match.markPublic();
  match.flush(true);
  return OK;
}
