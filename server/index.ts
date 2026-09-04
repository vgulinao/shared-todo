import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

const port = Number(process.env.PORT ?? 3000);

// In production the built React app sits next to the compiled server in dist/.
// In development Vite serves the client itself, so the folder does not exist.
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

const app = Fastify({ logger: true });

app.get("/healthz", async () => "ok");

if (existsSync(clientDir)) {
  await app.register(fastifyStatic, { root: clientDir, wildcard: false });
  // Single-page app: any unknown GET path serves index.html and the client routes it.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });
}

await app.listen({ port, host: "0.0.0.0" });
