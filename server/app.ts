import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import {
  normalizeTitle,
  parseClientMessage,
  type Op,
  type ServerMessage,
} from "../shared/protocol.ts";
import type { Db } from "./db.ts";

const DEFAULT_LIST_TITLE = "Untitled list";

/** `clientDir` is the built React app; omitted in development (Vite serves it) and in tests. */
export async function buildApp(db: Db, clientDir?: string, logger = false) {
  const app = Fastify({ logger });
  await app.register(fastifyWebsocket);

  // One room per list: the sockets currently viewing it. Nothing else lives in memory.
  const rooms = new Map<string, Set<WebSocket>>();

  app.get("/healthz", async () => "ok");

  app.post<{ Body: { title?: unknown } | null }>("/api/lists", async (req, reply) => {
    const raw = typeof req.body?.title === "string" ? normalizeTitle(req.body.title) : null;
    const tokens = db.createList(raw ?? DEFAULT_LIST_TITLE);
    return reply.code(201).send(tokens);
  });

  app.get<{ Querystring: { token?: string } }>("/ws", { websocket: true }, (socket, req) => {
    const list = req.query.token ? db.findListByToken(req.query.token) : null;
    if (!list) {
      socket.close(4004, "unknown list");
      return;
    }

    const room = rooms.get(list.id) ?? new Set();
    rooms.set(list.id, room);
    room.add(socket);

    send(socket, { type: "snapshot", list, items: db.listItems(list.id) });

    socket.on("message", (data) => {
      const parsed = parseClientMessage(parseJson(data.toString()));
      if (!parsed.ok) {
        send(socket, { type: "rejected", opId: "", reason: parsed.reason });
        return;
      }
      const op = parsed.value;
      const rejection =
        list.role !== "edit" ? "read-only link" : invalidParentReason(db, list.id, op);
      if (rejection) {
        send(socket, { type: "rejected", opId: op.opId, reason: rejection });
        return;
      }
      db.applyOp(list.id, op);
      // Everyone in the room, sender included: the echo is the sender's acknowledgement.
      for (const peer of room) send(peer, { type: "op", op });
    });

    socket.on("close", () => {
      room.delete(socket);
      if (room.size === 0) rooms.delete(list.id);
    });
  });

  if (clientDir && existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    // Single-page app: unknown GET paths serve index.html and the client routes them.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
  }

  return app;
}

/** A sub-task's parent must be a top-level item of the same list: one level deep, no cross-list. */
function invalidParentReason(db: Db, listId: string, op: Op): string | null {
  const parentId =
    op.kind === "createItem" ? op.item.parentId : op.kind === "moveItem" ? op.parentId : null;
  if (parentId !== null && !db.isTopLevelItem(listId, parentId)) return "invalid parent";
  return null;
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
