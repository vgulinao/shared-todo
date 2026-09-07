# shared-todo

A collaborative to-do list. Work in progress.

Live: https://shared-todo-production-f252.up.railway.app

## Development

```
npm install
npm run dev        # server on :3000 (tsx watch) + client on :5173 (vite, proxies /api and /ws)
npm run check      # typecheck, lint, format check, tests
```

Read `CLAUDE.md` for the working rules and `specs/` for what is being built.

## Known limitations

- **Concurrent edits to the same field resolve last-write-wins** in the order the server receives
  them. Two people renaming the same item at the same moment both end up with the later value.
- **Offline edits replay on reconnect and can overwrite a newer edit** someone else made while you
  were offline (the same rule, reached across a reload). Fine for a shopping list; a document editor
  would need per-field timestamps or a CRDT.
