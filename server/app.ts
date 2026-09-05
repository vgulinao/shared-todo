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
import type { ListInfo } from "../shared/types.ts";
import type { Db } from "./db.ts";

const DEFAULT_LIST_TITLE = "Untitled list";

// Share tokens travel in the /ws query string and are the credential, so requests are logged as
// method + path only. Nothing else in this app uses a query string.
const logger = {
  serializers: {
    req: (req: { method: string; url: string }) => ({
      method: req.method,
      url: req.url.split("?")[0],
    }),
  },
};

/** `clientDir` is the built React app; omitted in development (Vite serves it) and in tests. */
export async function buildApp(db: Db, clientDir?: string, log = false) {
  const app = Fastify({ logger: log ? logger : false });
  await app.register(fastifyWebsocket);

  // One room per list: the sockets currently viewing it. Nothing else lives in memory.
  const rooms = new Map<string, Set<WebSocket>>();

  const snapshot = (list: ListInfo): ServerMessage => ({
    type: "snapshot",
    list,
    items: db.listItems(list.id),
  });

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
    send(socket, snapshot(list));

    // A rejection is followed by a snapshot so the client can undo its optimistic change.
    const reject = (opId: string | null, reason: string) => {
      send(socket, { type: "rejected", opId, reason });
      if (opId !== null) send(socket, snapshot(list));
    };

    socket.on("message", (data) => {
      const parsed = parseClientMessage(parseJson(data.toString()));
      if (!parsed.ok) return reject(null, parsed.reason);

      const op = parsed.value;
      if (list.role !== "edit") return reject(op.opId, "read-only link");
      const invalid = invalidParentReason(db, list.id, op);
      if (invalid) return reject(op.opId, invalid);

      if (db.applyOp(list.id, op)) {
        // Everyone in the room, sender included: the echo is the sender's acknowledgement.
        for (const peer of room) send(peer, { type: "op", op });
      } else if (op.kind === "createItem") {
        reject(op.opId, "item id already exists");
      } else {
        // The item is already gone for everyone; acknowledge the sender, broadcast nothing.
        send(socket, { type: "op", op });
      }
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

/**
 * Sub-tasks are one level deep (specs/010): a parent must be a top-level item of the same list, an
 * item cannot be its own parent, and an item that has sub-tasks cannot become one.
 */
function invalidParentReason(db: Db, listId: string, op: Op): string | null {
  if (op.kind === "createItem") {
    if (op.item.parentId !== null && !db.isTopLevelItem(listId, op.item.parentId)) {
      return "invalid parent";
    }
    return null;
  }
  if (op.kind === "moveItem" && op.parentId !== null) {
    if (op.parentId === op.id) return "an item cannot be its own parent";
    if (!db.isTopLevelItem(listId, op.parentId)) return "invalid parent";
    if (db.hasChildren(listId, op.id)) return "an item with sub-tasks cannot become a sub-task";
  }
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
