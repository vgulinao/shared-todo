# Shared To-Do

A to-do list you share with a link and edit together in real time. Built for the Ubiquiti
full-stack assignment: TypeScript end to end, React on the client, Node on the server.

**Live:** https://shared-todo-production-f252.up.railway.app

There are no accounts. A list is reached only through its link; whoever holds the edit link can
change it, whoever holds the view link can watch it. Nothing on the server lists lists.

## Try it in two minutes

1. Open the live URL and click **New list**. You land on the list's edit link.
2. Add a few items. Open the same URL in a second window or on your phone: changes appear on both
   sides as you make them.
3. Click **Share** and open the **Can view** link in a private window: the list is live but
   read-only.
4. Drag an item by its handle. Tick one. Add a sub-task with **+ Sub-task**. Set a **cost** and
   watch the total. Add **notes** in Markdown.
5. DevTools → Network → **Offline**. Keep editing; the badge counts your unsynced changes. Reload:
   the list is still there. Go back online: everything syncs.

## Stories

All nine optional stories plus the required one are implemented. Each has a spec with acceptance
criteria that the tests are named after, and each shipped as its own reviewed pull request.

| ID  | Story                                                          | Spec                                   | Tests                                                                                      |
| --- | -------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| S1  | Create to-do items _(required)_                                | [S1](specs/stories/S1-create-items.md) | `shared/apply.test.ts`, `server/app.test.ts`                                               |
| S2  | Mark items as done                                             | [S2](specs/stories/S2-mark-done.md)    | `shared/apply.test.ts`, `server/app.test.ts`                                               |
| S3  | Items persist across server restarts                           | [S3](specs/stories/S3-persistence.md)  | `server/persistence.test.ts`                                                               |
| S4  | Real-time collaboration                                        | [S4](specs/stories/S4-realtime.md)     | `server/collaboration.test.ts` (real client engine against a real server)                  |
| S5  | Share via unique link, view-only or edit                       | [S5](specs/stories/S5-share-link.md)   | `server/app.test.ts`, `server/collaboration.test.ts`                                       |
| S6  | Reorder via drag & drop                                        | [S6](specs/stories/S6-reorder.md)      | `shared/order.test.ts`, `server/app.test.ts`, `server/collaboration.test.ts`               |
| S7  | Sub-tasks with progress                                        | [S7](specs/stories/S7-subtasks.md)     | `shared/subtasks.test.ts`, `server/app.test.ts`, `server/collaboration.test.ts`            |
| S8  | Cost per task and sub-task, with totals                        | [S8](specs/stories/S8-cost.md)         | `shared/cost.test.ts`, `server/app.test.ts`                                                |
| S9  | Markdown descriptions, rendered when not editing               | [S9](specs/stories/S9-markdown.md)     | `shared/apply.test.ts`, `client/src/components/Description.test.tsx`, `server/app.test.ts` |
| S10 | Keep editing offline, sync when back online                    | [S10](specs/stories/S10-offline.md)    | `client/src/lib/cache.test.ts`, `server/app.test.ts`, `server/collaboration.test.ts`       |
| X1  | UX pass: touch controls, recent lists, keyboard, small screens | [X1](specs/stories/X1-ux-pass.md)      | `client/src/lib/recent.test.ts`                                                            |
| X2  | Hardening: limits, security headers, graceful shutdown         | [X2](specs/stories/X2-hardening.md)    | `server/hardening.test.ts`                                                                 |

The whole suite — pure-function tests in `shared/`, protocol tests over real WebSockets, the client
engine driven against a real server, and render-to-string component tests — runs on every push in
CI. Merges to `main` require the CI check and deploy automatically.

## How it works

**The sync protocol in three sentences.** Every change is a small operation (`createItem`,
`updateItem`, `moveItem`, `deleteItem`, `renameList`) that the client applies to its own copy of the
list immediately and sends to the server. The server is the source of truth: it validates the
operation, runs one SQL statement, and broadcasts the operation to every connected client of that
list, the sender included, whose echo is the acknowledgement. Every client runs the same pure
`apply` function on the same operations in the same order, so they converge; operations are
idempotent by construction (client-generated ids, insert-or-ignore, absolute values), so retries
and offline replay are safe without any bookkeeping.

```
 browser A ──┐                        ┌── SQLite file on a persistent volume
             │  WebSocket (/ws)       │
 browser B ──┼──────────────►  Node server (Fastify)
             │                 - serves the built React app
 browser C ──┘  HTTP (/api)    - REST: create a list
                               - WS: one room per list, validate → apply → broadcast
```

- `shared/` — types, the operation protocol and its validator, the pure `apply`, ordering,
  sub-task and cost helpers. Used by both sides.
- `server/` — `Db` (SQLite, a dozen hand-written statements), the Fastify app with the WebSocket rooms,
  and the tests.
- `client/` — React 19 with Vite. `SyncClient` owns the socket, the pending queue, reconnection with
  backoff, and the offline cache; React mirrors its state. A hand-written service worker keeps the
  app shell available offline.

The full design is in [`specs/010-sync-and-data.md`](specs/010-sync-and-data.md). Every
non-obvious choice, and what was not chosen, is in [`docs/decisions.md`](docs/decisions.md):
why an operation protocol and not a CRDT library, why SQLite, why snapshots instead of an op log,
why float positions, why `localStorage` plus a service worker for offline, and so on.

## Principle

Simplest design that meets every acceptance criterion. Readable over clever. Sophistication only
where a requirement demands it: the real-time reconciliation and the offline replay are the two
places that got it. Every "why not X?" should have the answer "we did not need it, and here is what
we would do if we did" — the decisions log tries to give exactly that.

## Known limitations

- **Concurrent edits to the same field resolve last-write-wins** in the order the server receives
  them. Two people renaming the same item at the same moment both end up with the later value.
- **Offline edits replay on reconnect and can overwrite a newer edit** someone else made while you
  were offline (the same rule, reached across a reload). Fine for a shopping list; a document editor
  would need per-field timestamps or a CRDT.
- **One server instance.** Rooms live in process memory and the database is a local file. Scaling
  out means Postgres plus a fan-out channel between instances; the protocol would not change
  (decision D10).
- **Share links cannot be revoked.** Anyone who has ever had the edit link can edit; there is no
  rotation, expiry, or list deletion.
- **The snapshot on connect is the whole list.** Right for a few kilobytes, wrong for large
  documents; the delta design is described in the spec but was not needed.
- **No per-IP rate limit**, only per connection. A real deployment would put that at the edge.

## What a production version would add

Written down rather than built, because none of it was needed to meet the stories: Postgres and
Redis pub/sub for horizontal scale; OIDC sign-in with roles per list replacing the token-as-credential
model; share link revocation and expiry; an append-only operations table as audit log and as the
delta-sync source; metrics and tracing on the op path; backups; dependency and image scanning in
CI. Each attaches at a seam the current code already has.

## Running locally

Requires Node 22 or newer.

```bash
npm install
npm run dev          # server on :3000 (tsx watch) + client on :5173 (Vite, proxies /api and /ws)
npm run check        # typecheck, lint, format check, tests
npm run build        # client → dist/client, server → dist/server
npm start            # the built app on :3000, serving the client itself
```

The development database is `data/shared-todo.db`, created on first start. Environment variables:
`PORT` (default 3000), `DB_PATH` (default `data/shared-todo.db`), `LOG_LEVEL` (default `info`).

The service worker registers only in the production build, so offline behaviour is tested against
`npm start`, not the Vite dev server.

With Docker, the same image Railway runs:

```bash
docker build -t shared-todo .
docker run -p 3000:3000 -v shared-todo-data:/data -e DB_PATH=/data/shared-todo.db shared-todo
```

## Deployment

One Docker image on Railway, EU West, with a persistent volume mounted at `/data` for the SQLite
file. Railway builds from the `main` branch on every merge; `main` is protected and requires the CI
check. Health check on `/healthz`. Deploys send SIGTERM; the server closes open sockets with
"going away" and clients reconnect to the new instance.

## How this was built

Spec-driven, with an AI coding agent (Claude Code) doing the typing and me doing the deciding and
the reviewing. The flow for every story: write the spec with acceptance criteria and approve it;
implement against it with tests named after the criteria; open a pull request; review it on GitHub,
line by line; fix and reply on each thread; merge. The pull requests carry that conversation.
[`CLAUDE.md`](CLAUDE.md) holds the working rules the agent followed, including what it was not
allowed to do.

My day-to-day framework is Vue; this is my first React project. The React surface here is small by
design, and the parts that carry the weight, the protocol, the sync engine, the permission model,
are framework-independent.

## Repository map

```
CLAUDE.md               working rules for anyone changing the repo, human or agent
specs/000-product.md    scope, stories, non-goals
specs/010-sync-and-data.md   the protocol, the data model, conflict rules
specs/stories/          one spec per story, acceptance criteria and test plan
docs/decisions.md       D1–D13: each choice, alternatives, cost
shared/  server/  client/
.github/workflows/ci.yml     typecheck, lint, format, test, build
Dockerfile  railway.json
```
