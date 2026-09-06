# X1 — UX pass

Status: approved

## Purpose

Not a user story from the brief: a sweep over the nine shipped stories for the rough edges a
reviewer meets in the first five minutes, on a laptop and on a phone. Anything that needs a new
concept is out; this is about the product feeling finished.

## Acceptance criteria

- **AC1 Touch devices see the row controls.** Today delete, drag handle, "+ Sub-task", "+ cost",
  and "+ notes" appear on hover only, which does not exist on a phone. On devices without hover
  (`@media (hover: none)`) they are always visible, at reduced emphasis. This is a defect, not polish.
- **AC2 Recent lists on the home page.** The home page lists the lists this browser has opened
  (title, last opened, view/edit), newest first, from `localStorage`. Opening a list records it;
  a "Remove" control forgets it locally. No server involvement: the list is only what this browser
  already holds links to (see the note on enumeration in the interview notes).
- **AC3 Narrow screens.** At 360 px wide the list is usable: the header wraps, the share panel
  stacks, the row controls do not push the title off-screen, the total line stays visible.
- **AC4 Keyboard path through a whole session.** Tab order goes title → share → add → rows in
  order; every control has a visible focus ring; Escape closes the share panel; Enter in the add
  input keeps focus there. Verified by hand with the mouse unplugged.
- **AC5 States and wording.** "Connecting…" shows a subtle spinner after one second; the offline
  badge reads "Offline · reconnecting…"; the empty state names the action; the not-found page
  explains what a link is. The page has a favicon and a short `<meta name="description">`.
- **AC6 Motion respects preference.** Drag lift, progress bar, and Copied feedback have no
  animation under `prefers-reduced-motion: reduce`.
- **AC7 Nothing regresses.** All existing tests pass; a manual pass over the S1–S9 checklists on the
  live URL after deploy.

## UX notes

- Reduced emphasis on touch means: controls always rendered at 60 % opacity, full on press.
- Recent lists live under the "New list" button as a simple list with the title, a relative time
  ("2 hours ago"), and a small "edit" / "view" tag derived from which token the browser used.
  Removing an entry does not delete anything on the server.
- Spinner and badge stay text-first: no icon fonts, one inline SVG.

## Data / API / protocol changes

None. `localStorage` gains one key, `shared-todo.recent`, an array of `{ token, title, role, at }`.
The title is refreshed whenever a list is opened, so renames propagate on the next visit.

## Out of scope

Presence indicators (who is online), dark mode, animations beyond the existing ones, a settings page,
internationalisation, PWA install prompt.

## Test plan

| AC           | Test                                                                                                       | Where  |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ------ |
| AC2          | `recent.ts`: add/refresh/remove/order/cap at 20 entries; ignores malformed storage                         | client |
| AC1, AC3–AC6 | By hand: Chrome device toolbar at 360 px and a real phone; keyboard-only session; reduced-motion emulation | manual |
| AC7          | `npm run check`; S1–S9 manual checklists on the live URL                                                   | both   |
