# S10 — Keep editing offline, sync when back online

Status: approved

## User story

As a user I can keep editing the list when I lose my connection, and expect it to sync up with the
server when I regain it.

## What already works (S4, tested)

While the page stays open, a client that loses its socket keeps applying edits locally, queues them,
and on reconnect replaces its state with the server snapshot, re-applies the queue on top, and
resends it. Idempotent operations make the replay safe. What does **not** survive today is a page
reload while offline: the queue and the last known list live only in memory.

## Acceptance criteria

- **AC1** Given I am offline with unsent edits, when I reload the page (or close and reopen the tab),
  then I see the list as I last had it, including my unsent edits, and I can keep editing. This needs
  the app itself to load without a network: a service worker keeps the page and its assets available
  after the first online visit. A device that has never loaded the app online cannot open it offline.
- **AC2** Given I come back online after AC1, then my unsent edits are sent and appear for everyone,
  and I receive whatever others changed meanwhile. Nothing is sent twice in a way that changes state
  (idempotency, as before).
- **AC3** Given I am offline, the badge reads "Offline · reconnecting…" and, when I have unsent edits,
  "Offline · 3 unsynced changes". When online with nothing queued there is no badge.
- **AC4** Given I open a list I have never opened on this device while offline, then I see the
  "Connecting…" state as today. Nothing is invented.
- **AC5** Given a view-only link, offline reload shows the last known list read-only; nothing can be
  queued (no controls), so nothing is replayed.
- **AC6** Given the same list is open in two tabs of one browser while offline, edits from both tabs
  survive a reload of either: the cache merges unsent operations by id rather than overwriting.
- **AC7** Given I forget a list on the home page, its offline cache is removed too.

## UX notes

- A cached list renders immediately on load; the badge shows the connection state on top of it.
  No "loading" flash when the cache exists.
- The unsynced count is the size of the pending queue. It is shown only while offline: online, the
  queue drains within a round trip and a counter would flicker.
- No manual "sync now" button; reconnection is automatic with the existing backoff.

## Data / API / protocol changes

- **No protocol or server change.** The server already treats a reconnecting client's replayed ops
  as ordinary ops.
- Offline is detected two ways: the socket closing (server restart, network error) and the browser's
  own `offline` event, on which the client closes its socket at once. An open socket does not notice a
  lost network by itself for a long time, and DevTools' offline emulation never severs it. The
  browser's `online` event triggers an immediate reconnect instead of waiting for the backoff.
- Client: `SyncClient` gains an optional cache, `{ load(): Cached | null; save(c: Cached): void }`,
  with `Cached = { list: ListInfo; items: Item[]; pending: Op[] }`. On construction it starts from the
  cache if present (status "connecting", list rendered). On every state change it writes the cache,
  merging `pending` with what is already stored (by `opId`) so two tabs do not clobber each other's
  queues. The production cache is `localStorage` under `shared-todo.cache.<token>`; tests inject an
  in-memory one.
- `ListState` gains `pending: number`, kept in step with the queue, so the badge is ordinary React
  state. Consequence for S4 AC2: the echo of your own op now causes exactly one state callback
  (pending 1 → 0) while the items Map stays the same instance; S4's spec and test say so.
- A service worker (`client/public/sw.js`, plain JavaScript, ~40 lines, no library) makes the app
  shell available offline: the page is fetched network-first with the cached copy as fallback, so a
  deploy is picked up on the next online load; the hashed asset files are cache-first because their
  names change with their content. `/api`, `/ws`, and `/healthz` are never touched. Registered only
  in the production build (Vite's dev server has its own module graph). Old caches are deleted when a
  new worker activates.
- Decision D13 records the storage choices: `localStorage` for data, a hand-written service worker
  for the shell, nothing installable.

## Out of scope

Offline creation of new lists (needs the server), an installable app (manifest, home-screen icon,
push), conflict UI
(last write wins remains, see spec 010), cache expiry (lists are small; `forget` removes it),
encrypting the cache (the token in the URL is already the credential the cache would protect).

## Known limitation to state in the README

A replayed edit can overwrite a newer edit someone else made while you were offline (per-field last
write wins). Already documented as D4; S10 makes it reachable across reloads, so it is restated here.

## Test plan

| AC                | Test                                                                                                                                                                                             | Where  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AC1/AC2           | Engine: A edits offline (server stopped); a **new** SyncClient with the same cache object starts, shows cached items + pending; server restarts; edits reach a fresh client; pending drains to 0 | server |
| AC6               | `mergeCache`: pending from two caches merged by opId, no duplicates, order preserved                                                                                                             | client |
| AC4               | Engine: no cache + server down → state has no list (Connecting), status "offline" after the failed attempt                                                                                       | server |
| AC1 shell         | By hand on the built app (`npm run build && npm start`, or the live URL): visit online once, DevTools → Network → Offline, reload → the app loads and shows the cached list                      | manual |
| AC3, AC5, AC7, UI | By hand: DevTools → Network → Offline; edit; reload; go online; two tabs; view link; forget                                                                                                      | manual |
