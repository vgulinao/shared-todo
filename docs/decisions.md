# Decisions

Short records of the choices a reviewer is most likely to ask about. Each one: the situation, what
we chose, what we did not choose, and what it costs us.

## D1 — Own operation-based protocol over WebSocket, not a CRDT library

**Context.** Real-time collaboration is the core of the assignment, and the brief asks us not to use
libraries that solve the core challenge.
**Decision.** Clients send small operations; an authoritative server applies them to SQLite and
broadcasts them; a pure `apply` function shared by all clients keeps them consistent.
**Not chosen.** Yjs / Automerge (would solve the problem for us and hide the design), Liveblocks /
Firebase / Supabase Realtime (same, plus a hosted dependency), polling (simple but not "real-time").
**Cost.** Concurrent edits of the same field resolve as last-write-wins rather than merging
character by character. Fine for a to-do list, not for a document editor.

## D2 — SQLite on a persistent volume

**Context.** Items must survive server restarts. The app runs as one instance on Railway.
**Decision.** `better-sqlite3`, WAL mode, hand-written SQL in one module, database file on a Railway
volume. Schema created with `CREATE TABLE IF NOT EXISTS` at startup.
**Not chosen.** Postgres (another service to run and pay for; no benefit at one instance), an ORM
(hides the ten queries we have), a JSON file (no transactions, no cascade).
**Cost.** Single writer, single instance. Moving to Postgres later means swapping the driver and the
ten SQL statements in `db.ts`; nothing else knows about SQLite.

## D3 — Full snapshot on connect, no version numbers, no op log

**Context.** A reconnecting client needs to catch up.
**Decision.** The server sends the whole list on every connect. The client replaces its state, then
re-applies and resends its unconfirmed operations.
**Not chosen.** Per-list version counter with an operation log and delta sync on reconnect.
**Cost.** Bandwidth proportional to list size on each connect. A to-do list is a few kilobytes, so
this is not measurable. The delta design is described in `specs/010-sync-and-data.md` for when it is.

## D4 — Client-generated IDs and idempotent operations, no deduplication table

**Context.** Retries and offline replay must not duplicate or corrupt data.
**Decision.** The client chooses item IDs (uuid). Create is insert-or-ignore, update and move set
absolute values, delete is delete-if-exists. Any operation can be applied any number of times.
**Not chosen.** A server-side table of seen `(clientId, opId)` pairs.
**Cost.** None in practice. The one behaviour to know: a replayed `updateItem` overwrites a newer
edit by someone else with the replaying client's older value. Documented as a limitation.

## D5 — Float positions for ordering

**Context.** Drag & drop reordering, possibly by two people at once.
**Decision.** Each item has a float `position`; a move sets it to the midpoint of its new neighbours.
**Not chosen.** Integer positions with renumbering on every move (one move rewrites many rows and
races with concurrent moves), fractional string indexing (correct but more code than the problem needs).
**Cost.** Precision runs out after about 50 consecutive inserts at the same spot; a client-side
renumber handles it. Tested, never expected in normal use.

## D6 — Anonymous identity and two share tokens per list

**Context.** Share a list so others can view or collaborate, with no accounts in scope.
**Decision.** Each list has an edit token and a view token, both random 128-bit. The URL carries one
of them. The server derives the role from the token and enforces it on every write.
**Not chosen.** Accounts with login (out of scope and would dominate the week), a single token with
a client-side "read-only" flag (not enforceable).
**Cost.** Anyone with the edit link can edit; there is no revocation. Real accounts, roles, and
audit logging would layer on top without changing the sync design.

## D7 — One package, three folders

**Context.** Client, server, and shared code in one repo.
**Decision.** A single `package.json` with `client/`, `server/`, and `shared/` folders and two
`tsconfig`s. Shared code is imported directly with `.ts` extensions.
**Not chosen.** npm workspaces or a monorepo tool (more configuration than code for a project this size).
**Cost.** Client and server dependencies share one `node_modules`. The production image prunes dev
dependencies, so this does not affect the runtime.

## D8 — Fastify with `@fastify/websocket` and `@fastify/static`

**Context.** One HTTP endpoint, one WebSocket endpoint, static files.
**Decision.** Fastify. Small, typed, fast, and the WebSocket and static plugins are first-party.
**Not chosen.** Express (equally fine, weaker typing), raw `http` + `ws` (would mean writing our own
static serving and routing for no benefit).
**Cost.** None worth noting.

## D9 — No state-management or routing library on the client

**Context.** The client has two routes (home, `/l/:token`) and one piece of state (the list).
**Decision.** One `SyncClient` class owns the socket, the pending queue, and the list state, and
calls back with the new state on every change. One `useList` hook creates it for the lifetime of the
page and puts the state in React with `useState`. Routing is a `usePath` hook over `history.pushState`.
**Not chosen.** Redux / Zustand / React Query, React Router, a `useReducer` inside React (the
reconnect-and-replay logic has to run whether or not React is rendering, so it lives in the class).
**Cost.** If the app grew more routes or unrelated state, a router would be the first thing to add.

## D10 — One server instance, no horizontal scaling

**Context.** Real-time rooms live in server memory and the database is a local SQLite file. Both
assume a single process.
**Decision.** Run exactly one instance. Railway restarts it on failure; the volume keeps the data.
**Not chosen.** Multiple instances behind a load balancer. That needs a shared database (Postgres)
and a way for an operation received by one instance to reach clients connected to another
(Redis pub/sub or Postgres `LISTEN/NOTIFY`), plus sticky or stateless WebSocket handling.
**Cost.** Capacity is bounded by one Node process, which is thousands of concurrent sockets and far
more than a take-home needs. A deploy causes a few seconds of downtime while the new container starts;
clients reconnect automatically and resend anything unconfirmed. The scale-out path is known and does
not change the protocol, only where the state and the fan-out live.

## D11 — `@dnd-kit` for drag & drop mechanics; ordering logic stays ours

**Context.** S6 needs pointer, touch, and keyboard drag with screen-reader announcements. The brief
forbids libraries that solve the core challenge; ordering under concurrent edits is part of that core.
**Decision.** `@dnd-kit/core` + `@dnd-kit/sortable` for the interaction layer only: sensors, collision
detection, transforms, focus management, announcements. Everything that decides _what to send_ is
ours in `shared/order.ts` (`positionBetween`, `planMove`) with its own tests. The library never sees
positions; it reports "X was dropped on Y's spot" and we compute the rest.
**Not chosen.** Hand-rolled pointer events (a week of accessibility work to reach parity, and not the
skill under test), `react-beautiful-dnd` (unmaintained), the HTML5 drag-and-drop API (poor touch and
keyboard support).
**Cost.** Three runtime dependencies, about 18 kB gzipped added to the bundle, React-coupled. If the
library were removed, `shared/order.ts` and its tests would not change.

## D12 — `react-markdown` for descriptions

**Context.** S9 renders user-written Markdown inside a page other users see: the one place in the
app where untrusted text becomes markup.
**Decision.** `react-markdown`. It parses Markdown into React elements — there is no `innerHTML` step —
and it does not render raw HTML in the source by default, so `<script>` in a description shows as
text. Links get `target="_blank" rel="noopener noreferrer"` through one component override.
CommonMark only; no extension plugins.
**Not chosen.** `marked` or `markdown-it` plus `DOMPurify` (two libraries and an `innerHTML` we would
have to defend in review), writing a Markdown parser (not the skill under test, and a security surface).
**Cost.** About 40 kB gzipped added to the bundle for the parser pipeline. The render-to-string test
in `Description.test.tsx` pins the safety properties so an upgrade cannot silently change them.
