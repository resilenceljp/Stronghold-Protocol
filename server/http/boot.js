// Universal local monitor boot.js v12 for Stronghold-Protocol variants.
// Compatible with the current sganggs/Stronghold-Protocol and LongQianChen/Stronghold-Protocol
// layouts that expose { lobby, network, registry } from startServer().
//
// Adds LOCAL-ONLY monitoring and explicit administrator messaging:
//   http://127.0.0.1:<game-port+1>/admin/status.json
// Example: game :3000 -> monitor :3001
//
// It also tries to identify the running build:
//   - exact Git branch + origin remote when .git metadata exists
//   - otherwise falls back to APP_VERSION + package.json + MAX_SEATS heuristics
//
// No reconnect tokens are exposed. Local administrators can inspect game inventories.
//   * first, an update package extracted over the install (UPDATE.json) is finished — old files deleted, the install
//     verified (server/update.js); one that does not match its MANIFEST.json keeps the server from starting (exit 1);
//   * the boot banner: release version, the Local URL, the LAN URLs when listening on every interface, the plugin
//     studio's address with its key (server/studio/key.js: this machine and the local network only), the cloudflared
//     command for internet play;
//   * a server that cannot start exits 1 (with a hint when the port is in use); unhandled rejections and uncaught
//     exceptions are logged, not fatal;
//   * graceful shutdown on SIGINT/SIGTERM (rooms get room.closed{reason:'shutdown'}, sockets close 1001); a second
//     signal exits at once, and the process exits anyway 5 s after the first.

import { installMonitorV6, playerExtra, serverExtra, sendMonitorMessage, kickMonitorPlayer, clearMonitorRoom, trafficLedgerFor } from './monitor-v6.js';
import { roomControlSnapshot, applyRoomControl } from './room-control.js';
import { validateC2S } from '../../shared/protocol.js';
import { readTrafficHistory } from './traffic-ledger.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, DEV_BUILD, MAX_SEATS } from '../../shared/constants.js';
import { limitKeyOf } from '../net.js';
import { applyPendingUpdate } from '../update.js';
import { ROOT } from './config.js';

export function lanUrls(port) {
  const v4 = [];
  const v6 = [];
  const v6Seen = new Set();

  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.internal) continue;

      if (a.family === 'IPv4' || a.family === 4) {
        v4.push(`http://${a.address}:${port}`);
        continue;
      }

      if (a.family !== 'IPv6' && a.family !== 6) continue;
      if (/^fe80:/i.test(a.address)) continue;

      const prefix = limitKeyOf(a.address);
      if (v6Seen.has(prefix)) continue;
      v6Seen.add(prefix);
      v6.push(`http://[${a.address}]:${port}`);
    }
  }

  return [...v4, ...v6];
}

export function displayHost(host) {
  if (host === '0.0.0.0' || host === '::') return 'localhost';
  return host.includes(':') ? `[${host}]` : host;
}

export function isProcessEntry(metaUrl) {
  if (!process.argv[1]) return false;

  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

/**
 * Print the boot banner of a started server.
 * @param {{ url: string, host: string, port: number, studio?: { pageUrl: (base: string) => string | null } | null }} srv
 */
export function printBanner(srv) {
  console.log(`\n  卫戍协议：盟约 · Stronghold Protocol: Alliance v${APP_VERSION}`);

  if (DEV_BUILD) {
    console.log('  ! 开发版（dev 分支）：不稳定，请勿用于公开服务器 · development build — unstable, not for public servers');
  }

  console.log(`  Local:   ${srv.url}`);

  if (srv.host === '0.0.0.0' || srv.host === '::') {
    for (const u of lanUrls(srv.port)) {
      console.log(`  LAN:     ${u}`);
    }
  }

  // the plugin studio with its key: what a change in it needs (a raw TCP tunnel looks like this machine; the key does not)
  const studio = srv.studio?.pageUrl?.(srv.url);
  if (studio) console.log(`  Studio:  ${studio}  (插件工作台 · plugin studio — this machine and the LAN; the link carries its key)`);
  console.log('  Internet: cloudflared tunnel --url ' + `http://localhost:${srv.port}` + '\n');
}

function safeJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function resolveGitDir(root) {
  const dotGit = path.join(root, '.git');

  try {
    const st = fs.statSync(dotGit);

    if (st.isDirectory()) return dotGit;

    if (st.isFile()) {
      const text = fs.readFileSync(dotGit, 'utf8');
      const m = text.match(/^\s*gitdir:\s*(.+?)\s*$/im);

      if (m) {
        return path.resolve(root, m[1]);
      }
    }
  } catch {}

  return null;
}

function gitInfo(root) {
  const out = {
    branch: null,
    commit: null,
    remote: null,
  };

  const gitDir = resolveGitDir(root);
  if (!gitDir) return out;

  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();

    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      out.branch = ref.replace(/^refs\/heads\//, '');

      try {
        out.commit = fs.readFileSync(path.join(gitDir, ref), 'utf8').trim() || null;
      } catch {
        try {
          const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
          const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const m = packed.match(new RegExp(`^([0-9a-f]{40})\\s+${escaped}$`, 'm'));
          if (m) out.commit = m[1];
        } catch {}
      }
    } else if (/^[0-9a-f]{40}$/i.test(head)) {
      out.commit = head;
      out.branch = '(detached)';
    }
  } catch {}

  try {
    const config = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
    const originBlock = config.match(/\[remote\s+"origin"\]([\s\S]*?)(?=\n\[|$)/);

    if (originBlock) {
      const url = originBlock[1].match(/^\s*url\s*=\s*(.+?)\s*$/m);
      if (url) out.remote = url[1];
    }
  } catch {}

  return out;
}

function normalizeRepo(remote) {
  if (!remote) return null;

  const cleaned = String(remote)
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  return /^[^/]+\/[^/]+$/.test(cleaned) ? cleaned : null;
}

function detectBuild() {
  const pkg = safeJsonFile(path.join(ROOT, 'package.json')) || {};
  const git = gitInfo(ROOT);
  const repo = normalizeRepo(git.remote);
  const packageVersion = typeof pkg.version === 'string' ? pkg.version : null;
  const description = typeof pkg.description === 'string' ? pkg.description : '';

  let variant = null;

  if (repo && git.branch) {
    variant = `${repo} / ${git.branch}`;
  } else if (MAX_SEATS >= 20 && APP_VERSION === '0.2.4') {
    variant = '20-player variant · IncreasePlayerCapacity-like';
  } else if (MAX_SEATS >= 20 && APP_VERSION === '0.2.3') {
    variant = '20-player variant · compact-wire-bandwidth-like';
  } else if (MAX_SEATS === 4) {
    variant = 'Standard 4-player build';
  } else {
    variant = `Custom build · MAX_SEATS=${MAX_SEATS}`;
  }

  if (!repo && /20\s*人/.test(description) && MAX_SEATS >= 20) {
    variant += ' · package marks 20-player';
  }

  return {
    appVersion: APP_VERSION,
    packageVersion,
    maxSeats: MAX_SEATS,
    variant,
    repo,
    branch: git.branch,
    commit: git.commit ? git.commit.slice(0, 12) : null,
    installDir: path.basename(ROOT),
  };
}


/**
 * Add monitor-only timestamps to lobby membership objects without changing
 * the game protocol. These properties stay server-side and are only exposed
 * by the local monitor endpoint.
 *
 * humanSeat() is the single creation path for human player seats in the
 * current official / LongQianChen variants. spectate() is wrapped so a
 * spectator also gets an exact entry timestamp.
 */
function installMonitorTimestamps(srv) {
  const lobby = srv?.lobby;
  if (!lobby || lobby.__strongholdMonitorTimestampsInstalled) return;

  Object.defineProperty(lobby, '__strongholdMonitorTimestampsInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  if (typeof lobby.onHello === 'function') {
    const originalOnHello = lobby.onHello;

    lobby.onHello = function monitoredOnHello(session, meta) {
      const now = typeof this.now === 'function' ? this.now() : Date.now();

      // repeat=true means another hello on the same live socket: do not reset
      // the current-online timer. New and resumed connections both have
      // repeat=false and therefore start a new current connection period.
      if (session && !meta?.repeat) {
        session.__monitorConnectedAt = now;
      }

      if (session && !Number.isFinite(session.__monitorFirstSeenAt)) {
        session.__monitorFirstSeenAt = now;
      }

      return originalOnHello.call(this, session, meta);
    };
  }

  if (typeof lobby.humanSeat === 'function') {
    const originalHumanSeat = lobby.humanSeat;

    lobby.humanSeat = function monitoredHumanSeat(idx, session) {
      const seat = originalHumanSeat.call(this, idx, session);

      if (seat && !Number.isFinite(seat.__monitorJoinedAt)) {
        const now = typeof this.now === 'function' ? this.now() : Date.now();
        seat.__monitorJoinedAt = now;
      }

      return seat;
    };
  }

  if (typeof lobby.spectate === 'function') {
    const originalSpectate = lobby.spectate;

    lobby.spectate = function monitoredSpectate(session, msg) {
      const result = originalSpectate.call(this, session, msg);

      if (result?.ok) {
        const room = this.roomOf?.(session);
        const spectator = room?.spectatorOf?.(session.playerId);

        if (spectator && !Number.isFinite(spectator.__monitorJoinedAt)) {
          const now = typeof this.now === 'function' ? this.now() : Date.now();
          spectator.__monitorJoinedAt = now;
        }
      }

      return result;
    };
  }

  // Extremely small startup race fallback: if somebody connected/entered
  // before the wrappers were installed, mark the first observed instant.
  // Normal launches install this before any user has time to connect.
  const now = typeof lobby.now === 'function' ? lobby.now() : Date.now();

  for (const session of srv.registry?.all?.() || []) {
    if (session?.connected && !Number.isFinite(session.__monitorConnectedAt)) {
      session.__monitorConnectedAt = now;
    }
    if (session && !Number.isFinite(session.__monitorFirstSeenAt)) {
      session.__monitorFirstSeenAt = now;
    }
  }

  for (const room of lobby.rooms?.values?.() || []) {
    for (const seat of room.seats || []) {
      if (seat && !seat.isBot && !Number.isFinite(seat.__monitorJoinedAt)) {
        seat.__monitorJoinedAt = now;
      }
    }

    for (const spectator of room.spectators || []) {
      if (spectator && !Number.isFinite(spectator.__monitorJoinedAt)) {
        spectator.__monitorJoinedAt = now;
      }
    }
  }
}


function monitorNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function monitorCount(list) {
  if (Array.isArray(list)) return list.filter(Boolean).length;
  if (list && typeof list.size === 'number') return list.size;
  return 0;
}

function monitorMatchSnapshot(room, now) {
  const match = room?.match;
  if (!match) return null;

  let publicView = null;
  try {
    if (typeof match.publicView === 'function') publicView = match.publicView();
  } catch {
    publicView = null;
  }

  const matchNow = monitorNumber(publicView?.serverNow)
    ?? monitorNumber(match.sched?.now?.())
    ?? now;

  const deadline = monitorNumber(publicView?.deadline, 0) ?? 0;
  const remainingSec = deadline > 0
    ? Math.max(0, Math.ceil((deadline - matchNow) / 1000))
    : null;

  const publicPlayers = new Map(
    Array.isArray(publicView?.players)
      ? publicView.players.map((p) => [p.playerId, p])
      : []
  );

  const order = Array.isArray(match.order)
    ? match.order
    : [...(match.players?.values?.() || [])];

  const players = order.map((ps) => {
    const pv = publicPlayers.get(ps.playerId) || null;
    const last = match.lastResults?.get?.(ps.playerId) || null;

    const handCount = Array.isArray(ps.hand) ? ps.hand.filter(Boolean).length : null;
    const tempCount = Array.isArray(ps.temp) ? ps.temp.filter(Boolean).length : null;
    const boardCount = ps.board && typeof ps.board.size === 'number'
      ? ps.board.size
      : monitorNumber(pv?.boardCount);

    const shopSlots = Array.isArray(ps.shop?.slots) ? ps.shop.slots : [];
    const shopUnsold = shopSlots.filter((s) => s && !s.sold).length;
    const shopSold = shopSlots.filter((s) => s && s.sold).length;

    const stats = ps.stats && typeof ps.stats === 'object' ? ps.stats : {};
    const roundStats = ps.round && typeof ps.round === 'object' ? ps.round : {};

    let deployCount = monitorNumber(pv?.boardCount);
    let deployCap = null;
    try { deployCount = monitorNumber(ps.deployCount, deployCount); } catch {}
    try { deployCap = monitorNumber(ps.deployCap); } catch {}

    const lastCombat = last && typeof last === 'object' ? {
      killed: monitorNumber(last.killed, 0),
      total: monitorNumber(last.total, 0),
      resolved: monitorNumber(last.resolved),
      leaks: Array.isArray(last.leaked)
        ? last.leaked.filter((x) => x && x.counted !== false).length
        : 0,
      perfect: last.perfect !== false,
      coins: monitorNumber(last.coins, 0),
      damageDealt: monitorNumber(last.damageDealt, 0),
      healingDone: monitorNumber(last.healingDone, 0),
    } : null;

    return {
      ...playerExtra(match, ps),
      playerId: ps.playerId,
      seat: ps.seat,
      name: ps.name,
      isBot: !!ps.isBot,
      connected: !!(pv ? pv.connected : (ps.isBot || (ps.connected && !ps.left))),
      left: !!ps.left,
      alive: ps.alive !== false,
      eliminatedRound: Number.isInteger(ps.eliminatedRound) ? ps.eliminatedRound : null,
      autoplay: !!ps.autoplay,
      ready: !!(pv ? pv.ready : ps.ready),
      infoReady: !!ps.infoReady,
      status: pv?.status || null,
      fieldId: pv?.fieldId || null,

      lp: Math.max(0, monitorNumber(pv?.lp, monitorNumber(ps.lp, 0)) ?? 0),
      pendingLp: monitorNumber(pv?.pendingLp),
      uniteLeft: monitorNumber(pv?.uniteLeft),

      funds: Math.max(0, monitorNumber(ps.funds, 0) ?? 0),
      pendingFunds: monitorNumber(ps.pendingFunds, 0) ?? 0,
      bandId: ps.bandId || pv?.bandId || null,

      shopLevel: monitorNumber(ps.shop?.level, monitorNumber(pv?.shopLevel)),
      shopMaxLevel: monitorNumber(ps.gd?.maxShopLevel),
      shopUpgradePrice: monitorNumber(ps.shop?.upgradePrice),
      shopFreeRefreshes: monitorNumber(ps.shop?.freeRefreshes, 0),
      shopFrozen: !!ps.shop?.frozen,
      shopSlots: shopSlots.length,
      shopUnsold,
      shopSold,

      deployCount,
      deployCap,
      boardCount,
      handCount,
      tempCount,

      effectsCount: Array.isArray(ps.effects) ? ps.effects.length : null,
      bountiesCount: Array.isArray(ps.bounties) ? ps.bounties.length : null,

      roundStats: {
        refreshes: monitorNumber(roundStats.refreshes, 0),
        buys: monitorNumber(roundStats.buys, 0),
        sells: monitorNumber(roundStats.sells, 0),
        spent: monitorNumber(roundStats.spent, 0),
        gainedChess: monitorNumber(roundStats.gainedChess, 0),
        arts: monitorNumber(roundStats.arts, 0),
      },

      stats: {
        dmgDealt: monitorNumber(stats.dmgDealt, 0),
        kills: monitorNumber(stats.kills, 0),
        leaks: monitorNumber(stats.leaks, 0),
        gold: monitorNumber(stats.gold, 0),
        refreshes: monitorNumber(stats.refreshes, 0),
        merges: monitorNumber(stats.merges, 0),
        itemMerges: monitorNumber(stats.itemMerges, 0),
        itemsEquipped: monitorNumber(stats.itemsEquipped, 0),
        bossDamage: monitorNumber(stats.bossDamage, 0),
        lpLost: monitorNumber(stats.lpLost, 0),
        buys: monitorNumber(stats.buys, 0),
        sells: monitorNumber(stats.sells, 0),
        perfectRounds: monitorNumber(stats.perfectRounds, 0),
        fundsGained: monitorNumber(stats.fundsGained, 0),
        healing: monitorNumber(stats.healing, 0),
      },

      lastCombat,
    };
  });

  const fields = (Array.isArray(publicView?.fields) ? publicView.fields : []).map((f) => {
    const p = f?.progress || null;
    const total = monitorNumber(p?.total, 0) ?? 0;
    const resolved = monitorNumber(p?.resolved);
    const killed = monitorNumber(p?.killed, 0) ?? 0;
    const numerator = resolved == null ? killed : resolved;

    return {
      fieldId: f?.fieldId || null,
      kind: f?.kind || null,
      players: Array.isArray(f?.players) ? f.players.slice() : [],
      live: !!f?.live,
      progress: p ? {
        killed,
        resolved,
        total,
        done: !!p.done,
        percent: total > 0
          ? Math.max(0, Math.min(100, Math.round((numerator / total) * 1000) / 10))
          : null,
      } : null,
    };
  });

  const totalResolved = fields.reduce((sum, f) => {
    const p = f.progress;
    if (!p) return sum;
    return sum + (p.resolved == null ? p.killed : p.resolved);
  }, 0);

  const totalScheduled = fields.reduce(
    (sum, f) => sum + (f.progress?.total || 0),
    0
  );

  const bossHp = publicView?.bossHp && typeof publicView.bossHp === 'object'
    ? {
        hp: Math.max(0, monitorNumber(publicView.bossHp.hp, 0) ?? 0),
        max: Math.max(0, monitorNumber(publicView.bossHp.max, 0) ?? 0),
      }
    : match.bossPool
      ? {
          hp: Math.max(0, monitorNumber(match.bossPool.hp, 0) ?? 0),
          max: Math.max(0, monitorNumber(match.bossPool.maxHp, 0) ?? 0),
        }
      : null;

  if (bossHp) {
    bossHp.percent = bossHp.max > 0
      ? Math.max(0, Math.min(100, Math.round((bossHp.hp / bossHp.max) * 1000) / 10))
      : null;
  }

  const living = players.filter((p) => p.alive && !p.left);
  const dead = players.filter((p) => !p.alive && !p.left);
  const human = players.filter((p) => !p.isBot && !p.left);

  const economy = {
    totalFunds: human.reduce((n, p) => n + (p.funds || 0), 0),
    totalPendingFunds: human.reduce((n, p) => n + (p.pendingFunds || 0), 0),
    averageFunds: human.length
      ? Math.round((human.reduce((n, p) => n + (p.funds || 0), 0) / human.length) * 10) / 10
      : 0,
    maxFunds: human.length ? Math.max(...human.map((p) => p.funds || 0)) : 0,
    averageShopLevel: human.length
      ? Math.round((human.reduce((n, p) => n + (p.shopLevel || 0), 0) / human.length) * 10) / 10
      : 0,
  };

  return {
    poolGroups:(match.poolGroups||[]).map(g=>({id:g.id,playerIds:g.playerIds.slice()})),
    funRules: match.funRules || null, ruleset: match.ruleset || 'standard', consoleEnabled: !!match.consoleEnabled, endless: match.ruleset === 'endless',
    phase: publicView?.phase || match.phase || null,
    round: monitorNumber(publicView?.round, monitorNumber(match.round, 0)),
    lastRound: monitorNumber(publicView?.lastRound, monitorNumber(match.gd?.lastRound)),
    deadline,
    serverNow: matchNow,
    remainingSec,
    modeId: publicView?.modeId || match.modeId || null,
    difficulty: publicView?.difficulty || match.difficulty || null,
    stageId: publicView?.stageId || match.stageId || null,
    combatMode: publicView?.combatMode || (match.clientCombat ? 'client' : 'server'),
    paused: !!(publicView?.paused ?? match.paused),
    spRound: !!publicView?.spRound,
    bossRound: monitorNumber(publicView?.bossRound, monitorNumber(match.gd?.bossRound)),
    hiddenRound: monitorNumber(publicView?.hiddenRound, monitorNumber(match.gd?.hiddenRound)),
    teamLp: monitorNumber(publicView?.teamLp, monitorNumber(match.teamLp)),
    overtimeAt: monitorNumber(publicView?.overtimeAt, monitorNumber(match.overtimeAt)),
    bossHp,

    progress: {
      resolved: totalResolved,
      total: totalScheduled,
      percent: totalScheduled > 0
        ? Math.max(0, Math.min(100, Math.round((totalResolved / totalScheduled) * 1000) / 10))
        : null,
      fields: fields.length,
      liveFields: fields.filter((f) => f.live).length,
    },

    counts: {
      players: players.filter((p) => !p.left).length,
      humans: human.length,
      bots: players.filter((p) => p.isBot && !p.left).length,
      alive: living.length,
      dead: dead.length,
      connectedHumans: human.filter((p) => p.connected).length,
    },

    economy,
    fields,
    players,
  };
}

function adminSnapshot(srv) {
  const base = srv.lobby.stats();
  const build = detectBuild();
  const now = Date.now();

  const rooms = [...srv.lobby.rooms.values()].map((room) => {
    const createdAt = Number.isFinite(room.createdAt) ? room.createdAt : null;
    const matchStartedAt = Number.isFinite(room.match?.startedAt) ? room.match.startedAt : null;

    return {
    code: room.code,
    mode: room.mode,
    difficulty: room.difficulty,
    inMatch: !!room.match,
    hostId: room.hostId,
    createdAt,
    roomUptimeSec: createdAt == null ? null : Math.max(0, Math.round((now - createdAt) / 1000)),
    matchNo: Number.isInteger(room.matchCount) ? room.matchCount : 0,
    matchStartedAt,
    matchUptimeSec: matchStartedAt == null ? null : Math.max(0, Math.round((now - matchStartedAt) / 1000)),
    matchDetail: monitorMatchSnapshot(room, now),
    chat: room.matchCtx?.chat?.snapshot?.()||null,
    players: room.seats
      .filter((seat) => seat && !seat.left)
      .map((seat) => ({
        seat: seat.seat,
        playerId: seat.playerId,
        name: seat.name,
        isBot: !!seat.isBot,
        connected: !!seat.connected,
        ready: !!seat.ready,
        host: seat.playerId === room.hostId,
        joinedAt: Number.isFinite(seat.__monitorJoinedAt) ? seat.__monitorJoinedAt : null,
        roomTimeSec: Number.isFinite(seat.__monitorJoinedAt)
          ? Math.max(0, Math.round((now - seat.__monitorJoinedAt) / 1000))
          : null,
      })),
    spectators: (room.spectators || []).map((s) => ({
      playerId: s.playerId,
      name: s.name,
      connected: !!s.connected,
      joinedAt: Number.isFinite(s.__monitorJoinedAt) ? s.__monitorJoinedAt : null,
      roomTimeSec: Number.isFinite(s.__monitorJoinedAt)
        ? Math.max(0, Math.round((now - s.__monitorJoinedAt) / 1000))
        : null,
    })),
    };
  });

  const sessions = [...srv.registry.all()].map((s) => {
    const connected = !!s.connected;
    const roomCode = s.roomCode && srv.lobby.rooms.has(s.roomCode) ? s.roomCode : null;
    const connectedAt = connected && Number.isFinite(s.__monitorConnectedAt)
      ? s.__monitorConnectedAt
      : null;

    return {
      playerId: s.playerId,
      name: s.name,
      connected,
      roomCode,
      connectedAt,
      onlineSec: connectedAt == null
        ? null
        : Math.max(0, Math.round((now - connectedAt) / 1000)),
      firstSeenAt: Number.isFinite(s.__monitorFirstSeenAt) ? s.__monitorFirstSeenAt : null,
      lastSeen: Number.isFinite(s.lastSeen) ? s.lastSeen : null,
    };
  });

  const onlineSessions = sessions.filter((s) => s.connected);
  const identifiedSockets = onlineSessions.length;
  const sockets = srv.network.connectionCount;

  return {
    ok: true,
    time: now,
    build,
    sockets,
    identifiedSockets,
    unidentifiedSockets: Math.max(0, sockets - identifiedSockets),
    lobbyOnline: onlineSessions.filter((s) => !s.roomCode).length,
    roomOnline: onlineSessions.filter((s) => !!s.roomCode).length,
    sessions: srv.registry.size,
    ...base,
    monitorActions:{messages:true,chat:true,kick:true,clearRooms:true,roomControl:!!(srv.lobby.MatchClass?.prototype?.adminControlVersion>=1)},
    onlineSessions,
    roomsDetail: rooms,
    ...serverExtra(srv),
  };
}

export async function startAdminServer(srv) {
  srv.monitorControlValidate=validateC2S;
  const host = '127.0.0.1';

  // Default: game port + 1. Override with SP_ADMIN_PORT.
  const envPort = process.env.SP_ADMIN_PORT;
  const port = envPort == null || envPort === ''
    ? srv.port + 1
    : Number(envPort);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid SP_ADMIN_PORT: ${envPort}`);
  }

  if (port === 0) return null;

  let lastMessage=0;
  const admin = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){
      res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'});res.end('Invalid host');return;
    }

    let pathname = '/';

    try {
      pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if(pathname==='/admin/room-control'){
      const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      if(req.method==='GET'){try{return reply(200,roomControlSnapshot(srv,{roomCode:new URL(req.url,'http://127.0.0.1').searchParams.get('roomCode')}));}catch(error){return reply(400,{error:error.message});}}
      if(req.method!=='POST')return reply(405,{error:'method not allowed'});
      if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin||req.headers['x-stronghold-command']!=='local-monitor-room-control'||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'local monitor required'});
      try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)return reply(413,{error:'request too large'});}return reply(200,applyRoomControl(srv,JSON.parse(body)));}
      catch(error){return reply(400,{error:error.message});}
    }
    if(pathname==='/admin/clear-room'&&req.method==='POST'){
      const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin||req.headers['x-stronghold-command']!=='local-monitor-clear-room'||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'local monitor required'});
      try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return reply(413,{error:'request too large'});}return reply(200,clearMonitorRoom(srv,JSON.parse(body)));}
      catch(error){return reply(400,{error:error.message});}
    }
    if(pathname==='/admin/kick'&&req.method==='POST'){
      const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin||req.headers['x-stronghold-command']!=='local-monitor-kick'||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'local monitor required'});
      try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return reply(413,{error:'request too large'});}return reply(200,kickMonitorPlayer(srv,JSON.parse(body)));}
      catch(error){return reply(400,{error:error.message});}
    }
    if(pathname==='/admin/message'&&req.method==='POST'){
      const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin||req.headers['x-stronghold-command']!=='local-monitor-message'||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'local monitor required'});
      try{
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return reply(413,{error:'message too large'});}
        if(Date.now()-lastMessage<1000)return reply(429,{error:'please wait before sending again'});
        const result=sendMonitorMessage(srv,JSON.parse(body));lastMessage=Date.now();return reply(200,result);
      }catch(error){return reply(400,{error:error.message});}
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        Allow: 'GET, HEAD',
      });
      res.end('Method Not Allowed');
      return;
    }

    if(pathname==='/admin/traffic-history'&&req.method==='GET'){
      const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      try{const ledger=trafficLedgerFor(srv);if(!ledger)return reply(409,{error:'traffic ledger unavailable'});ledger.flush();
        const q=new URL(req.url,'http://127.0.0.1').searchParams;
        return reply(200,await readTrafficHistory(ledger.directory,{day:q.get('day')||undefined,kind:q.get('kind')||'usage',cursor:Number(q.get('cursor')||0),limit:Number(q.get('limit')||200)}));
      }catch(error){return reply(400,{error:error.message});}
    }
    if (pathname === '/admin/status.json') {
      const body = JSON.stringify(adminSnapshot(srv));

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });

      if (req.method === 'HEAD') res.end();
      else res.end(body);

      return;
    }

    if (pathname === '/' || pathname === '/admin/status') {
      const info = detectBuild();
      const body = [
        'Stronghold local admin endpoint is running.',
        '',
        `Build: ${info.variant}`,
        `Version: ${info.appVersion}`,
        `MAX_SEATS: ${info.maxSeats}`,
        '',
        `JSON: http://${host}:${port}/admin/status.json`,
      ].join('\n');

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
      });

      if (req.method === 'HEAD') res.end();
      else res.end(body);

      return;
    }

    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Not Found');
  });

  await new Promise((resolve, reject) => {
    const onError = (e) => reject(e);

    admin.once('error', onError);
    admin.listen(port, host, () => {
      admin.off('error', onError);
      resolve();
    });
  });

  return {
    host,
    port,
    close: () => new Promise((resolve) => {
      admin.close(() => resolve());
      admin.closeAllConnections?.();
    }),
  };
}

export async function runMain(start) {
  process.on('unhandledRejection', (e) => {
    console.error('[process] unhandled rejection', e);
  });

  process.on('uncaughtException', (e) => {
    console.error('[process] uncaught exception', e);
  });

  if (applyPendingUpdate(ROOT).state === 'failed') {
    process.exitCode = 1;
    return;
  }

  let srv;

  try {
    srv = await start();
  } catch (e) {
    if (e && e.code === 'EADDRINUSE') {
      console.error(
        `端口已被占用 / port in use: ${e.port ?? process.env.PORT ?? 3000}. Try PORT=3001 npm start`
      );
    } else {
      console.error('[boot] failed to start', e);
    }

    process.exit(1);
  }

  installMonitorTimestamps(srv);
  installMonitorV6(srv, ROOT);
  printBanner(srv);

  let admin = null;

  try {
    admin = await startAdminServer(srv);

    if (admin) {
      const build = detectBuild();

      console.log(`  Monitor:  http://${admin.host}:${admin.port}/admin/status.json`);
      console.log(`  Build:    ${build.variant}`);
      console.log(`  Version:  ${build.appVersion} · MAX_SEATS=${build.maxSeats}`);
      console.log('  Monitor is LOCAL-ONLY and is not exposed on the game port.\n');
    }
  } catch (e) {
    console.error(
      '[monitor] local status endpoint failed:',
      e?.message || e
    );
    console.error(
      '[monitor] the game server will continue without detailed room monitoring.\n'
    );
  }

  let stopping = false;

  const stop = (signal) => {
    if (stopping) {
      console.log('forced exit');
      process.exit(1);
    }

    stopping = true;
    console.log(`\n[${signal}] shutting down…`);

    setTimeout(() => process.exit(0), 5000).unref();

    Promise.allSettled([
      admin?.close(),
      srv.close(),
    ]).then(
      () => process.exit(0),
      () => process.exit(1)
    );
  };

  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}
