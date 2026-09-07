import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { Db } from "./db.ts";

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? "data/shared-todo.db";
mkdirSync(path.dirname(dbPath), { recursive: true });

// In production the built client sits next to the compiled server in dist/.
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

const db = new Db(dbPath);
const app = await buildApp(db, clientDir, true);
await app.listen({ port, host: "0.0.0.0" });

// Graceful shutdown (spec X2 AC5). Railway sends SIGTERM on every deploy; clients get a 1001 close
// from the preClose hook and reconnect to the new instance instead of waiting for a timeout.
let closing = false;
const shutdown = (signal: string) => {
  if (closing) return; // a second signal must not close the app and the database twice
  closing = true;
  app.log.info({ signal }, "shutting down");
  app
    .close()
    .then(() => {
      db.close();
      process.exit(0);
    })
    .catch((err: unknown) => {
      app.log.error({ err }, "shutdown failed");
      process.exit(1);
    });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
