# S7 — Sub-tasks with progress

Status: done

## User story

As a user I can add sub-tasks to an item, so that I can group related steps under one task and see
how far along the group is.

## Acceptance criteria

- **AC1** Given a top-level item, when I choose "Add sub-task" on it and type a title, then the
  sub-task appears indented under the item, at the bottom of its sub-tasks, for everyone.
- **AC2** Given an item has sub-tasks, then it shows a progress indicator "done / total" (e.g. "2 / 5")
  with a thin bar, updated live as sub-tasks are ticked anywhere.
- **AC3** Given I tick a sub-task, then it is struck through in place under its parent. Sub-tasks
  never move to the list's Completed section; only top-level items do.
- **AC4** Given I tick a parent, then all its sub-tasks are ticked too, and the parent moves to the
  Completed section with its sub-tasks. Unticking the parent reopens the parent only: the sub-tasks stay done (there is no memory of
  their earlier state; reopen them one by one if needed). Ticking the last open sub-task does not
  tick the parent by itself. Every one of these done flags is a persisted, broadcast operation.
- **AC5** Given I delete a parent, then its sub-tasks are deleted with it (already guaranteed by the
  server and `apply`); the UI asks nothing.
- **AC6** Sub-tasks can be renamed and deleted like any item, and reordered among their siblings by
  drag & drop with the same handle and keyboard controls as S6. Done sub-tasks are draggable too:
  they stay inline under their parent, so excluding them would leave gaps in the sortable list.
- **AC7** A sub-task cannot have sub-tasks: there is no "Add sub-task" on a sub-task, and the server
  rejects an attempt (already enforced since review round 1).
- **AC8** Sub-tasks are collapsible per parent with a small chevron; collapsed state is component
  state, not shared or persisted. A collapsed parent still shows its progress. Ticking a parent moves
  it to the Completed section, which remounts it expanded; the collapse is not remembered across that.

## UX notes

- "Add sub-task" is a small control at the right of a top-level row, visible on hover and focus
  alongside delete. Choosing it opens an inline input under the item's existing sub-tasks; Enter
  adds and keeps the input open for the next one. Escape clears a non-empty draft first and closes
  the input on an empty one (two presses with text, one without), the same as the main input.
- Progress reads "2 / 5" next to the title in muted text, with a 2px bar under the row. When
  everything is done the bar is full and the text stays; no confetti.
- Indentation: one level, about 1.75rem. Sub-task rows are slightly smaller.
- In the view link, sub-tasks and progress are visible; no controls, as everywhere else.

## Data / API / protocol changes

None. `parentId` has been in the schema, the protocol, the validation, and `apply` since S1. Ticking a
parent is the client dispatching one `updateItem { done: true }` per open sub-task plus one for the
parent: several ordinary absolute operations, no new op kind, idempotent, converging like any other.
Progress is computed on the client from `childrenOf(items, parentId)`.

## Out of scope

Nesting deeper than one level, moving an item into or out of a parent by drag, auto-completing a
parent when its sub-tasks are all done, per-parent persisted collapse state, sub-task cost roll-up
(S8 decides).

## Test plan

| AC           | Test                                                                                                                                                        | Where  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC2          | `progressOf(items, parentId)` → `{ done, total }` for none / some / all sub-tasks done                                                                      | shared |
| AC4          | `idsToToggle(items, id, done, isParent)`: ticking a parent → open sub-tasks then the parent; unticking a parent → the parent only; a sub-task → itself only |
| AC1/AC3      | createItem with parentId over WS reaches the peer; snapshot lists the sub-task under its parent in position order                                           | server |
| AC7          | createItem with a sub-task as parent → rejected (exists from round 1; referenced, not duplicated)                                                           | server |
| AC5          | deleteItem on a parent removes children on a peer's state (engine)                                                                                          | server |
| AC6, AC8, UI | By hand on the live URL, two windows                                                                                                                        | manual |
