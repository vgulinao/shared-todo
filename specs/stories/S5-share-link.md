# S5 — Share a list via unique link

Status: approved

## User story

As a user I can share my list with a link, so that others can view it or collaborate on it. I decide
which by choosing which link to send.

## Acceptance criteria

- **AC1** Given I opened the list with the edit link, when I click "Share", then I see two links with
  a Copy button each: "Can edit" (the URL I am on) and "Can view". Clicking Copy puts the link on
  the clipboard and the button reads "Copied" for a moment.
- **AC2** Given I open the view link, then I see the list and every live change to it, but no editing
  controls: no add input, checkboxes are disabled, titles are not clickable, no delete, no rename,
  no Share button. A "View only" badge is shown next to the title.
- **AC3** Given a view-link client sends an operation anyway (a modified client), then the server
  rejects it, nothing is persisted or broadcast, and the client's state is corrected by the snapshot
  that follows the rejection.
- **AC4** Given the view link, the edit link cannot be derived from anything the client receives.
  The server never sends the edit token over the socket to anyone; the view token is sent only to
  edit-role connections (a viewer already has it in the URL).
- **AC5** Given I hold the edit link, when I click the list title, then I can rename it. Enter
  saves, Escape cancels, empty keeps the old title. The new title appears for everyone live and
  survives a reload.
- **AC6** Given I create a list from the home page, I land on the edit link, so I can share from there.

## UX notes

- The Share control is a button in the header; it toggles a small panel under the header with the
  two rows. No modal.
- "Can view" is the link to send to people who should not change the list. Say so in one line of
  helper text, because the difference between two random-looking URLs is not self-evident.
- View-only rendering reuses the same components with an `editable` flag. Disabled checkboxes keep
  the done state visible without inviting a click.
- The document title becomes the list title.

## Data / API / protocol changes

- `ListInfo` gains `viewToken: string | null`: the view token for edit-role connections, `null` for
  view-role ones. The edit token is never sent; the edit-role client already has it in its URL.
- `renameList` is already in the protocol, the database, and the client engine (title updates live
  since review round 1). This story adds the UI.
- Server-side role enforcement exists; this story adds the test that pins it.

## Out of scope

Revoking or rotating links, link expiry, passwords, presence indicators, per-item permissions,
multiple edit links.

## Test plan

| AC                      | Test                                                                                                   | Where  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| AC3                     | Op over a view-token socket → `rejected` then `snapshot`; an edit-role peer receives nothing           | server |
| AC4                     | Snapshot on the view token has `role: "view"`, `viewToken: null`; on the edit token has the view token | server |
| AC5                     | `renameList` over WS: peer receives it; reconnect snapshot carries the new title                       | server |
| AC1, AC2, AC5 (UI), AC6 | By hand on the live URL, in two browsers                                                               | manual |
