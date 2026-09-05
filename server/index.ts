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

const app = await buildApp(new Db(dbPath), clientDir, true);
await app.listen({ port, host: "0.0.0.0" });
