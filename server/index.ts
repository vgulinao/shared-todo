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
const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
