# S9 — Markdown descriptions

Status: approved

## User story

As a user I can add a longer description to a task in Markdown, and read it as formatted text when I
am not editing it.

## Acceptance criteria

- **AC1** Given an item (top-level or sub-task), when I choose "+ notes" and type, then the text is
  saved as the item's description on Ctrl/Cmd+Enter or when I leave the field, for everyone, and
  survives a reload. Escape cancels the edit.
- **AC2** When not editing, the description renders as formatted text under the title: paragraphs,
  emphasis, inline code and code blocks, links, bullet and numbered lists, headings.
- **AC3** Choosing "notes" on the row (edit role) opens the editor with the raw Markdown. The
  rendered text itself is not a control, so links inside it work as links.
- **AC4** Saving an empty description removes it (`null`). Rows without a description show the
  "+ notes" control on hover; rows with one show the text.
- **AC5** Raw HTML inside the Markdown is never rendered as HTML (it shows as text), links open in a
  new tab with `rel="noopener noreferrer"`, and Markdown images render as their alt text, never as an
  `<img>` (no third-party fetch from a shared list). This is the XSS and privacy boundary of the feature.
- **AC6** A description is at most 5 000 characters; longer text is refused by the editor and, if a
  modified client sends it anyway, rejected by the server.
- **AC7** Given the view link, descriptions render, nothing is editable.

## UX notes

- "+ notes" sits with the other row controls (cost, sub-tasks), muted, visible on hover and focus;
  it reads "notes" once a description exists and opens the editor either way.
- The draft being typed is page state, not row state: if another user ticks the item while you type,
  the row moves to Completed and your text is still in the editor when you expand it.
- The editor is a textarea that grows with its content, monospace, placeholder "Notes — Markdown is
  supported". A one-line hint under it: "Ctrl+Enter to save, Esc to cancel".
- Rendered text is slightly smaller and muted, indented to align with the title. Headings render at
  most one step larger than body text so a `#` does not shout inside a to-do row.
- Struck-through (done) items keep their description readable; only the title is struck.

## Data / API / protocol changes

- `description` has been on `Item`, in the schema, in `updateItem`'s patch, and in `apply` since S1.
- Validation tightens: `description` must be `null` or a string of at most 5 000 characters
  (`parseClientMessage`). Spec 010 updated.
- Rendering: `react-markdown`, which builds React elements (no `innerHTML`) and does not render raw
  HTML by default. Decision D12.

## Out of scope

Live preview while typing, a formatting toolbar, images, task-list checkboxes inside descriptions,
mentions, attachments, GitHub-flavoured extensions (tables, strikethrough, autolinks).

## Test plan

| AC         | Test                                                                                                                                                                                                                | Where  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC6        | `parseClientMessage` accepts `null` and a 5 000-char string, rejects 5 001 chars and non-strings                                                                                                                    | shared |
| AC1/AC4    | `updateItem { description }` round-trips through the database; `null` clears it                                                                                                                                     | server |
| AC5        | Render-to-string test: `<script>` and `<img onerror>` in Markdown render as text; a link has `target=_blank` and `rel=noopener noreferrer`; `javascript:` is not linked; `![alt](url)` renders alt text, no `<img>` | client |
| AC1–AC7 UI | By hand on the live URL, two windows                                                                                                                                                                                | manual |
