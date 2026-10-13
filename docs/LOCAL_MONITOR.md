# Optional local monitoring

This contribution keeps `server/http/boot.js` unchanged. Monitoring is disabled by default.
Start the usual server with `SP_MONITOR=1` to enable the read-only loopback endpoint;
`SP_ADMIN_PORT` defaults to game port + 1, and `0` disables it. Programmatic callers
can pass `localMonitor: true, adminPort: 3001` to `startServer`.

Run `node monitor/server.mjs` separately and open http://127.0.0.1:3010.
The dashboard stores its local settings and journals in `monitor/data/`; the game
stores traffic history in `runtime/monitor-traffic/`. Neither directory belongs in Git or releases.
Dashboard game/admin ports can be changed on its settings page. Do not expose the
administrator or dashboard port through a public tunnel. These endpoints are for
the local server operator, without a remote authentication system.

Optional SakuraFRP quota polling is also disabled by default; enable it only explicitly
with `MONITOR_SAKURA_ENABLED=1` if you already operate SakuraFRP on this machine.

The dashboard shows rooms, players, match progress and roster/economy diagnostics.
The durable ledger separates bytes into pre-room, room, and in-match contexts,
records room closure and match outcomes, and attributes WebSocket traffic to the
known player session. HTTP requests without a linked browser identifier remain
unattributed. No browser identifier is added by this contribution.

The ledger measures Node socket `bytesRead` / `bytesWritten` deltas, including HTTP
headers and compressed WebSocket frames. It complements the existing
`/healthz?traffic=1` category counters; do not add their totals together. It excludes
dashboard polling marked with `X-Stronghold-Monitor`. It cannot measure Ethernet,
TLS at an external proxy, Tailscale, FRP transport overhead or a tunnel provider's
billable quota. Local TCP bytes and provider quota are distinct figures.

The endpoint accepts only GET/HEAD and checks the loopback Host header. Messages,
chat access and gameplay modifications from the downstream entertainment fork are
not enabled here. Failure to bind the optional monitor does not stop the game.
Closing the game closes the endpoint and flushes the ledger.

Source: adapted from resilenceljp/Stronghold-Protocol-20p's local monitor, under
the repository's GPL-3.0-or-later code license. No game art is included.
This is an administrator convenience, not a change to official gameplay rules.
The attribution of ambiguous HTTP requests is intentionally left unknown.

Validation: new lifecycle/loopback tests pass. Full local CI was run on Windows/Node 24;
it reported environment and wall-clock benchmark failures (directory symlink
privilege, proxy environment and loaded-machine network/performance timing).
The new integration and packaging checks are separately verified.
