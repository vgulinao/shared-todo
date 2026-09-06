# S8 — Cost per task and sub-task, with totals

Status: approved

## User story

As a user I can put a cost on a task or a sub-task, so that the list also tracks what a project or a
shopping trip will cost.

## Acceptance criteria

- **AC1** Given an item (top-level or sub-task), when I choose its cost control and enter a number,
  then the cost shows right-aligned on the row, formatted with two decimals, for everyone, and
  survives a reload.
- **AC2** Given an item has a cost, when I clear the field and press Enter, then the cost is removed
  (not set to zero). Escape cancels without changes.
- **AC3** A cost is a non-negative number. Anything else (text, a negative, a half-typed value the
  browser cannot parse) keeps the editor open and marked invalid; Enter does not save it, and leaving
  the field cancels the edit rather than saving or clearing. If a modified client sends an invalid
  cost anyway, the server rejects it.
- **AC4** Given a parent has sub-tasks with costs, then the parent row shows the group subtotal:
  its own cost plus its sub-tasks' costs. The parent's own cost is still editable through the same
  control; the subtotal is display only.
- **AC5** The list shows a total at the bottom: the sum of every item's cost, top-level and sub-tasks,
  done or not. It updates live and is hidden while no item has a cost.
- **AC6** Given the view link, costs, subtotals, and the total are visible and not editable.
- **AC7** No currency symbol or setting. Numbers are formatted with the browser's locale
  (e.g. `1,250.00` or `1 250,00`).

## UX notes

- The cost control sits at the right of the row, before delete: a muted "+ cost" on hover when
  empty, or the formatted number when set; click to edit inline in a small numeric input. Enter
  saves, Escape cancels, a deliberately emptied field saves as "no cost". Scrolling over the field
  never changes its value. A parent's control is named after what it edits: "own 15.00, sub-tasks
  30.00, total 45.00".
- Parent subtotal reads like `45.00` with a title attribute "own 15.00 + sub-tasks 30.00" for anyone
  who wonders. Struck-through items keep their cost; the total counts them (it is a cost, not a
  budget of remaining work).
- The total line reads "Total 1,250.00" in the same muted style as the Completed header.

## Data / API / protocol changes

- `cost` has been on `Item`, in the schema, in `updateItem`'s patch, and in `apply` since S1.
- Validation tightens: `cost` must be `null` or a finite number `>= 0` (`parseClientMessage`).
  Spec 010 updated accordingly.
- Pure helpers in `shared/cost.ts`: `subtotalOf(parent, children)` and `totalOf(items)`.

## Out of scope

Currency selection or conversion, budgets and "remaining" amounts, per-person split, quantities and
unit prices, cost history.

## Test plan

| AC         | Test                                                                                                | Where  |
| ---------- | --------------------------------------------------------------------------------------------------- | ------ |
| AC4/AC5    | `subtotalOf` with own cost, without own cost, with no children; `totalOf` across levels and `null`s | shared |
| AC3        | `parseClientMessage` rejects a negative cost and a non-numeric cost; accepts `null` and `0`         | shared |
| AC1/AC2    | `updateItem { cost }` round-trips through the database; `{ cost: null }` clears it                  | server |
| AC1–AC7 UI | By hand on the live URL, two windows                                                                | manual |
