# 000 — Product

## What this is

A shared to-do list. Someone creates a list, gets a link, and sends it to the people they share the
list with. Everyone with the edit link sees each other's changes as they happen. The canonical
example is a family grocery list.

There are no accounts. The link is the identity and the permission.

## Stories

| ID  | Story                                                        | Status  |
| --- | ------------------------------------------------------------ | ------- |
| S1  | Create to-do items (required)                                | done    |
| S2  | Mark items as done                                           | done    |
| S3  | Items persist across server restarts                         | done    |
| S4  | Real-time collaboration between users                        | planned |
| S5  | Share a list via unique link (view-only or edit)             | planned |
| S6  | Reorder items via drag & drop                                | planned |
| S7  | Sub-tasks with overall progress on the parent                | planned |
| S8  | Cost per task or sub-task, with totals                       | planned |
| S9  | Markdown descriptions rendered as rich text when not editing | planned |
| S10 | Keep editing offline, sync when back online                  | stretch |

Each story has its own spec in `specs/stories/` with acceptance criteria and a test plan. The README
lists what shipped.

## Non-goals

- Accounts, login, or user profiles. A share link is the only access model.
- Multiple lists per person, list discovery, or a dashboard. One URL is one list.
- Rich text editing. Markdown is edited as plain text and rendered when not editing.
- Notifications, due dates, reminders, assignees, attachments.
- Horizontal scaling beyond one server instance (see `docs/decisions.md`).

## Architecture in one picture

```
 browser A ──┐                        ┌── SQLite file on a persistent volume
             │  WebSocket (/ws)        │
 browser B ──┼──────────────►  Node server (Fastify)
             │                 - serves the built React app
 browser C ──┘  HTTP (/api)    - REST: create a list
                               - WS: one room per list, applies ops, broadcasts
```

- The **client** keeps the list in memory, applies the user's changes immediately, and sends each
  change as an _operation_ to the server.
- The **server** is the source of truth. It applies each operation to SQLite and broadcasts it to
  every client on that list, including the sender.
- On connect (or reconnect) the server sends the whole list as a snapshot. Lists are small.

Details: `specs/010-sync-and-data.md`.

## Glossary

- **List** — one to-do list, identified by its tokens.
- **Item** — a to-do entry. An item with a `parentId` is a sub-task.
- **Operation (op)** — one user change (create, update, move, delete), the unit of sync.
- **Room** — the set of WebSocket connections currently viewing one list.
- **Edit token / view token** — random strings in the share URL that grant edit or read-only access.
