# S3 — Items persist across server restarts

Status: approved

## User story

As a user I can be sure my to-dos are persisted, so that nothing is lost when the server restarts or
is redeployed.

## Acceptance criteria

- **AC1** Given a list with items, when the server process stops and a new one starts against the
  same database file, then a client connecting to the new process receives exactly the same items,
  in the same order, with the same done state.
- **AC2** Given the app is redeployed on Railway (a new container replaces the old one), then a
  list created before the deploy is intact after it. The database file lives on the persistent
  volume, not inside the container.
- **AC3** Given a client is connected when the server restarts, then it shows the "offline" badge,
  reconnects on its own within about ten seconds of the server being back, the badge disappears,
  and the list is intact without a manual reload.
- **AC4** Every operation is committed to the database before it is broadcast, so an operation a
  client has seen acknowledged is never lost by a crash that follows.

## UX notes

- No new UI. The "offline" badge from S1 is the only visible part.
- Nothing is cached client-side across reloads in this story; a reload during downtime shows
  "Connecting…" until the server is back. Client-side caching is S10's concern.

## Data / API / protocol changes

None. The design already provides this: SQLite in WAL mode on a Railway volume (`DB_PATH`), one
synchronous statement per op executed before the broadcast, snapshot on every connect, client
reconnect with exponential backoff.

## Out of scope

Backups, point-in-time recovery, schema migrations, graceful shutdown (draining sockets on deploy),
client-side offline cache (S10).

## Test plan

| AC  | Test                                                                                                                                    | Where  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | Start app on a temp DB file, create items over WS, close the app, start a new app on the same file, connect: snapshot equals            | server |
| AC4 | Reading the code path: `db.applyOp` (synchronous, autocommit) precedes the broadcast loop in `server/app.ts`; covered implicitly by AC1 | review |
| AC2 | Manual on Railway: note a list's items, `railway redeploy`, reload the list URL                                                         | manual |
| AC3 | Manual on Railway: keep the tab open during the redeploy, watch the badge, confirm the list returns                                     | manual |
