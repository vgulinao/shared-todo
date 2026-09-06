# S6 — Reorder items via drag & drop

Status: done

## User story

As a user I can change the order of my to-do items by dragging them, so that the list reflects my
priorities or the route through the shop.

## Acceptance criteria

- **AC1** Given pending items, when I drag one by its handle and drop it at another spot in the
  list, then the list shows the new order immediately and everyone else sees the same order within
  one round trip.
- **AC2** Given I reordered items, when I reload, then the order is preserved.
- **AC3** A move changes the position of the moved item only. Nothing else is renumbered, so a
  move is one operation and never conflicts with a concurrent move of a different item.
- **AC4** Given two people move different items at the same time, then both screens end up with
  the same order. Given two people move the same item at the same time, both screens still end up
  App with the same order (the later arrival wins). Given two people add an item at the same time (same
  computed position), both screens still show the same order: ties are broken by item id, on the
  client and in the database.
- **AC5** Given many moves have squeezed two neighbouring positions so close that no float fits
  between them, then the client renumbers the siblings to whole numbers before placing the item,
  preserving their order. This is covered by a test, not expected in real use.
- **AC6** Given I focus an item's handle, when I press Space, move with the arrow keys, and press
  Space again, then the item moves; Escape cancels. Keyboard reordering is announced to screen
  readers.
- **AC7** Done items are not draggable. Unticking a done item returns it to its place among the
  pending items, as S2 already guarantees, because ordering and done state are independent.
- **AC8** Given the view link, no drag handles are shown and nothing can be dragged.

## UX notes

- A grip handle at the left of each pending row, visible on hover and on focus; dragging works
  only from the handle, so clicking a title still edits it and ticking still works.
- The dragged row lifts slightly (shadow) and a placeholder shows where it will land. Drop animates
  into place; remote reorders appear in place without animation.
- Touch: a short press-and-hold on the handle starts a drag, so the page can still scroll.
- Reordering is within one level only: top-level items among top-level items. Sub-tasks (S7) reorder
  among their siblings. Dragging an item into or out of a parent is not part of this story.

## Data / API / protocol changes

None to the protocol: `moveItem { id, parentId, position }` exists end to end, and the server already
validates the parent rules. Additions are pure functions in `shared/`:

- `positionBetween(before, after)` → the midpoint, or the end positions (`min - 1`, `max + 1`), or
  `null` when no float fits between the two neighbours.
- `planMove(siblings, itemId, toIndex)` → the placements (`{ id, position }`) that put the item in that
  slot among its siblings: one placement in the normal case. When no float fits between the new
  neighbours it returns a placement per sibling (whole numbers, order preserved) plus the moved item.
  That fallback is the one case where a move is more than one operation (AC3): the placements travel
  as separate `moveItem` ops, so peers may briefly see an intermediate order, and a disconnect
  mid-sequence leaves positions half-renumbered until the client reconnects and replays. Accepted:
  it takes ~50 consecutive drops into the same gap to reach it.

Client: `@dnd-kit/core` + `@dnd-kit/sortable` for pointer, touch, and keyboard mechanics and the
accessibility announcements. The ordering logic (which position to send) is ours.

## Out of scope

Dragging between levels (making an item a sub-task by dropping it on another), multi-select drag,
reordering done items inside the Completed section, undo.

## Test plan

| AC      | Test                                                                                                      | Where  |
| ------- | --------------------------------------------------------------------------------------------------------- | ------ |
| AC3/AC5 | `positionBetween`: midpoint, ends, `null` when neighbours are adjacent floats; `renumbered` keeps order   | shared |
| AC1/AC2 | `moveItem` over WS reaches the peer; reconnect snapshot returns items in the new order                    | server |
| AC4     | Two clients move different items concurrently → identical order on both; same item → identical order      | server |
| AC7     | `apply(moveItem)` on a done item changes position only; done items excluded from the sortable list        | shared |
| AC6/AC8 | By hand: keyboard reorder with a screen reader announcement visible in DevTools; view link has no handles | manual |
