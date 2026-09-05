# shared-todo — working rules

Rules for anyone changing this repo, human or AI coding agent. Read this first.

## Principle

Simplest design that meets every acceptance criterion. Readable over clever. Add sophistication only
where a requirement demands it, and write down why in `docs/decisions.md`.

## Before implementing anything

1. Read `specs/000-product.md` for scope and the list of stories.
2. Read the story spec in `specs/stories/`. If it does not exist, write it first and get it approved.
   Acceptance criteria are the contract; tests are named after them.
3. Read `specs/010-sync-and-data.md` before touching the protocol, the reducer, or the database.
4. Check `docs/decisions.md` before proposing a new library, layer, or abstraction. If it is not
   there, the default answer is no.

## Stack

- TypeScript everywhere, strict. One package, three folders: `client/` (React 19 + Vite),
  `server/` (Node + Fastify + ws), `shared/` (types, protocol, pure logic used by both sides).
- SQLite via `better-sqlite3`, hand-written SQL in one module, schema applied at startup.
- Tests with Vitest. CI runs typecheck, lint, format check, tests, and build on every push.
- Deployed as one Docker image on Railway; the server serves the built client.

## Conventions

- Relative imports use the `.ts` extension (`import { x } from "../shared/protocol.ts"`).
- No enums, namespaces, or parameter properties (`erasableSyntaxOnly`). Use `const` objects and unions.
- Functions by default. A class only when an object owns state that lives across calls and has a
  lifecycle (a connection, a socket, a queue): `Db`, the client sync engine. Data that travels as
  JSON stays a plain object, never a class.
- Named types are the spec's nouns and nothing else: `Item`, `Op`, `ListInfo`, `Role`, the two
  message unions. Anything a validating function can refuse returns the one `Result<T>`. Do not
  introduce a type the spec does not name unless it is private to one file. Never derive a public
  type from a function's return (`ReturnType<typeof ...>`); name the thing instead.
- Tests live next to the code as `*.test.ts`. Name them after the story and criterion:
  `describe("S4 real-time")` → `it("AC2 an op from one client reaches the other")`.
- Branch per story (`s4-realtime`), PR per story, commit messages `feat(S4): ...`, `fix(S4): ...`,
  `docs: ...`, `chore: ...`. Small commits.
- Run `npm run check` before pushing.

## Not allowed

- Libraries that implement sync, conflict resolution, ordering, or persistence logic for us
  (CRDT libraries, realtime backends, ORMs). UI mechanics libraries are fine.
- New abstractions, options, or helpers without an acceptance criterion that needs them.
- Comments that narrate what the code obviously does. Comment only the non-obvious why.
- Dead code, unused exports, commented-out code, TODOs without a story id.
- Changing behaviour without updating the spec in the same change.

## Commands

```
npm run dev        # server (tsx watch) + client (vite) with proxy
npm run check      # typecheck, lint, format check, tests
npm run build      # client to dist/client, server to dist/server
npm start          # run the built server
```
