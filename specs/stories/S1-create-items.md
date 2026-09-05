# S1 — Create to-do items

Status: done

## User story

As a user I can create a list and add to-do items to it, such as a grocery list, and find them
again when I come back.

## Acceptance criteria

- **AC1** Given I open the home page, when I click "New list", then a list is created and I land on
  `/l/<editToken>` showing an empty list with the "Add an item" input focused.
- **AC2** Given I am on a list page, when I type a title and press Enter, then the item appears at
  the bottom of the list immediately, the input clears, and keeps focus so I can add the next one.
- **AC3** Given I press Enter with an empty or whitespace-only title, then nothing is added. Titles
  are trimmed. Titles longer than 500 characters are rejected by the server.
- **AC4** Given I have added items, when I reload the page, then the same items are shown in the
  same order.
- **AC5** Given I click an item's title, when I change the text and press Enter, then the title is
  updated. Escape cancels. Saving an empty title keeps the old one.
- **AC6** Given I hover an item, when I click its delete control, then the item disappears.
- **AC7** Given I open `/l/<token>` with a token that matches no list, then I see "This list does
  not exist" and a link to create a new one.

## UX notes

- One column, max width ~640px, the list title at the top, the add input directly under it,
  items below. Nothing else on the page yet.
- New items go to the bottom (`position = max + 1`), the natural order for a grocery list.
- Optimistic: the item shows before the server confirms. No spinners for the happy path.
- The list gets the default title "Untitled list". Renaming it is out of scope for S1.

## Data / API / protocol changes

This story carries the plumbing that every later story uses. Everything is already designed in
`specs/010-sync-and-data.md`; S1 implements this subset:

- Schema: both tables in full, so no later migration.
- `POST /api/lists` → `201 { editToken, viewToken }`.
- `GET /ws?token=` → `snapshot` on connect; accepts `createItem`, `updateItem`, `deleteItem`.
  Unknown token → close `4004`.
- Shared: `Item`, `Op`, message types, and `apply(items, op)`.
- Client: `useList(token)` hook with optimistic apply and pending ops; reconnect with backoff.
  Home page and list page; routing by `location.pathname`.

Not in S1 even though the plumbing allows it: broadcasting to _other_ clients is verified in S4,
the view role in S5, `moveItem` in S6, `renameList` in S5 (a shared list needs a name).

## Out of scope

Marking done (S2), sharing UI (S5), reordering (S6), sub-tasks (S7), cost (S8), descriptions (S9),
list renaming (S5), keyboard navigation between items.

## Test plan

| AC  | Test                                                                                | Where          |
| --- | ----------------------------------------------------------------------------------- | -------------- |
| AC1 | `POST /api/lists` returns two distinct 22-char tokens and the list exists           | server         |
| AC2 | `apply(createItem)` adds the item; `apply` twice adds it once                       | shared         |
| AC3 | Server rejects empty and >500-char titles with `rejected`; `apply` ignores them too | server, shared |
| AC4 | Create items over WS, reconnect, snapshot contains them in position order           | server         |
| AC5 | `apply(updateItem)` changes the title; update of a missing item is a no-op          | shared         |
| AC6 | `apply(deleteItem)` removes it; delete twice is a no-op                             | shared         |
| AC7 | WS with an unknown token closes with code 4004                                      | server         |

Client behaviour (focus, Enter, Escape, hover) is verified by hand on the live URL and covered by
the Playwright test if we add one on Tuesday.
