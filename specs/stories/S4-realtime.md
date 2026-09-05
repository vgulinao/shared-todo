# S4 — Real-time collaboration

Status: done

## User story

As a user I can edit a list together with other people at the same time, so that our family
shopping list is one list, not three copies.

## Acceptance criteria

- **AC1** Given two people have the same list open, when one creates, renames, ticks, or deletes an
  item, then the other sees the change within one network round trip, without reloading.
- **AC2** Given I make a change, then it appears for me immediately, before the server has answered,
  and when the server's echo arrives nothing flickers, duplicates, or jumps.
- **AC3** Given my connection drops briefly (server restart, network blip) and I keep editing, then
  when the connection is back my edits are sent and appear for the others, and I receive the edits
  the others made meanwhile. The "offline" badge shows while disconnected.
- **AC4** Given two people edit different fields of the same item at the same time (one renames it,
  the other ticks it done), then both changes survive on both screens.
- **AC5** Given two people edit the same field of the same item at the same time, then both screens
  end up showing the same value: the change the server received last wins.
- **AC6** Given one person deletes an item while another is editing it, then the item disappears for
  both and the late edit is silently dropped.
- **AC7** Given a list is open in twenty tabs, every tab receives every change; the server keeps no
  per-list state in memory beyond the set of open sockets.

## UX notes

- No "someone else is editing" indicators, cursors, or presence avatars in this story. Presence is
  optional polish for the Sunday UX pass if there is time.
- Remote changes appear in place; no animation. A remote delete of the item I am currently editing
  closes my editor (the row is gone).
- The status badge already exists (S1). This story only proves it behaves.

## Data / API / protocol changes

None. This story is the reason the protocol in `specs/010-sync-and-data.md` looks the way it does.
It adds tests that exercise the client engine against the real server, and fixes anything they find.

## Out of scope

Presence and cursors, per-field conflict resolution smarter than last-write-wins, offline persistence
across page reloads (S10), read-only participants (S5).

## Test plan

Tests drive the real `SyncClient` (Node 24 has a global `WebSocket`) against an in-process server.

| AC  | Test                                                                                                                                                                                                 | Where  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | A dispatches create/update/delete; B's state reflects each                                                                                                                                           | server |
| AC2 | A's state has the item synchronously after dispatch; the echo leaves the same items Map and triggers no state callback (no re-render)                                                                | server |
| AC3 | Stop the server; A edits while "offline" (pending 1); restart on the same port; C connects and edits before A reconnects; A comes back "online" with pending 0, holding both edits; C holds both too | server |
| AC4 | A renames, B ticks, concurrently; both end with the new title and done = true                                                                                                                        | server |
| AC5 | A and B rename the same item concurrently; both end with the same title                                                                                                                              | server |
| AC6 | A deletes, B updates the same item concurrently; both end without the item, B's pending drains to 0, no error state                                                                                  | server |
| AC7 | Manual: several tabs on the live URL                                                                                                                                                                 | manual |
