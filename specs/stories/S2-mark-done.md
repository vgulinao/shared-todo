# S2 — Mark items as done

Status: approved

## User story

As a user I can mark to-do items as done, so that finished things get out of the way and I can
focus on what is still pending.

## Acceptance criteria

- **AC1** Given a pending item, when I tick its checkbox, then it is immediately shown as done
  (struck through) and moves out of the pending list into a "Completed" section below it.
- **AC2** Given a done item, when I untick its checkbox, then it returns to the pending list at the
  position it had before. Its `position` never changes; only `done` does.
- **AC3** The Completed section has a header with the count, e.g. "Completed · 3", and is collapsed
  by default. Clicking the header expands or collapses it.
- **AC4** Given no done items, the Completed section is not rendered at all.
- **AC5** Given I reload the page, done items are still done, pending items still pending.
- **AC6** Editing the title and deleting work the same for done items as for pending ones.
- **AC7** The checkbox is a real, keyboard-focusable checkbox with an accessible label, so Space
  toggles it and screen readers announce the item.

## UX notes

- Pending items keep their order; done items are listed in the Completed section in the same
  relative order. Nothing is re-sorted when toggling.
- Collapsed/expanded state of the Completed section is component state: it resets to collapsed on
  reload and is not shared between users. Persisting it is not worth a feature.
- Struck-through text uses the muted colour so the eye skips it.
- No "clear completed" bulk action in this story.

## Data / API / protocol changes

None. `updateItem` with `{ done: boolean }` already exists in the protocol, the database, and
`apply`. This story is purely client rendering plus tests that pin the behaviour.

## Out of scope

Bulk "clear completed", how a parent's `done` interacts with its sub-tasks and progress (decided
in S7), persisting the collapsed state, animations.

## Test plan

| AC      | Test                                                                                            | Where  |
| ------- | ----------------------------------------------------------------------------------------------- | ------ |
| AC1/AC2 | `apply(updateItem {done:true})` sets done and leaves position untouched; toggling back restores | shared |
| AC5     | `updateItem {done:true}` over WS, reconnect, snapshot shows `done: true`                        | server |
| AC3–AC7 | By hand on the live URL                                                                         | manual |
