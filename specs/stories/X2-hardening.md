# X2 — Hardening

Status: approved

## Purpose

Not a story from the brief: the small production-readiness items a reviewer with a platform
background will look for, each cheap because the design already leaves room for it. Anything that
would change the protocol or add infrastructure is out (see `docs/decisions.md` D10 and the
"would add" lists in the README).

## Acceptance criteria

- **AC1 Oversized frames are refused.** A WebSocket message larger than 64 KB closes the connection
  with code 1009 (message too big) instead of being parsed. Legitimate ops are well under 10 KB.
- **AC2 Per-connection op rate limit.** More than 60 operations in any 10-second window from one
  socket are rejected with reason "too many changes, slow down" (and the usual snapshot). Typing,
  ticking, and dragging by a person stay far below this; a runaway client cannot flood a room.
- **AC3 Items per list are capped** at 2 000. A `createItem` beyond the cap is rejected with
  "this list is full". Sub-tasks count. The cap is a constant in the shared protocol so the client can
  show it.
- **AC4 Security headers** on every response: a Content-Security-Policy that allows only same-origin
  scripts, styles, images (plus `data:` for the favicon), and same-origin WebSocket connections;
  `Referrer-Policy: no-referrer` so share tokens never leak through the Referer header;
  `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`. The app must still work under the policy
  (drag transforms and the progress bar use inline style attributes; the policy allows attribute
  styles, not inline `<style>` or `<script>`).
- **AC5 Graceful shutdown.** On SIGTERM/SIGINT the server stops accepting connections, closes open
  sockets with code 1001 (going away), closes the database, and exits. Clients see "Offline ·
  reconnecting…" and reconnect to the new instance. Railway's deploys already send SIGTERM.
- **AC6 Operational logging.** One structured log line per applied op at `debug` level (list id, kind,
  client id, milliseconds from receipt to broadcast) and one per rejected op at `info` with the
  reason. Never a token, never a title.
- **AC7 Nothing regresses.** All tests pass; the S1–S10 manual checklists still hold on the live URL.

## Out of scope

Per-IP limits (needs a trusted proxy header story), authentication, audit log persistence (the ops
table from the interview notes: a seam, not this week's work), backups, metrics endpoint, dependency
scanning in CI (a one-line addition, but a separate PR if at all).

## Data / API / protocol changes

- `MAX_ITEMS_PER_LIST = 2000` and `MAX_MESSAGE_BYTES = 65536` in `shared/protocol.ts`.
- Server: `@fastify/websocket` `maxPayload`; a per-socket sliding-window counter in the message
  handler; a `countItems(listId)` query; `@fastify/helmet` for the headers; a shutdown hook in
  `server/index.ts`.
- Rejections reuse the existing `rejected` + snapshot path; the client needs no change beyond
  showing the reason it already shows.

## Test plan

| AC  | Test                                                                                                                 | Where  |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | Send a 70 KB frame → socket closes with 1009; a normal op afterwards on a new socket works                           | server |
| AC2 | Send 61 ops in a burst → the 61st is `rejected: "too many changes, slow down"`; 60 were echoed                       | server |
| AC3 | With the cap lowered via a test hook to 3, the 4th `createItem` is rejected "this list is full"                      | server |
| AC4 | `GET /healthz` and `GET /` carry the four headers; CSP contains `connect-src 'self' wss: ws:`                        | server |
| AC5 | Start on a temp DB, open a socket, send SIGTERM to the process → client sees close code 1001 and the process exits 0 | server |
| AC6 | Reading the code; log lines visible in `railway logs` after deploy                                                   | manual |
