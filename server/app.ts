import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyHelmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import {
  MAX_ITEMS_PER_LIST,
  MAX_MESSAGE_BYTES,
  normalizeTitle,
  parseClientMessage,
  type Op,
  type ServerMessage,
} from "../shared/protocol.ts";
import type { ListInfo } from "../shared/types.ts";
import type { Db } from "./db.ts";

const DEFAULT_LIST_TITLE = "Untitled list";

/**
 * Per connection: more than this many frames inside the window is a runaway client, not a person.
 * Over the limit the socket is closed (code 4029), never individual ops rejected: a rejection would
 * ship a snapshot and settle the op, while a close keeps the client's queue intact and its reconnect
 * backoff becomes the throttle. Bulk gestures (a renumber, a cascade) that exceed it complete after
 * the reconnect because their ops are still pending.
 */
const RATE_LIMIT = { frames: 600, windowMs: 10_000 };
export const RATE_LIMITED_CLOSE_CODE = 4029;

// Share tokens travel in the /ws query string and are the credential, so requests are logged as
// method + path only. Nothing else in this app uses a query string.
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const logLevel = LOG_LEVELS.includes(process.env.LOG_LEVEL ?? "") ? process.env.LOG_LEVEL : "info";

const logger = {
  level: logLevel,
  serializers: {
    req: (req: { method: string; url: string }) => ({
      method: req.method,
      url: req.url.split("?")[0],
    }),
  },
};

// Same-origin everything. Attribute styles are allowed (drag transforms, progress bar); inline
// <style> and <script> are not. `data:` images cover the favicon. Tokens never leak via Referer.
const headers = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
  referrerPolicy: { policy: "no-referrer" as const },
  frameguard: { action: "deny" as const },
  crossOriginEmbedderPolicy: false,
};

type Limits = { maxItems: number };

/**
 * `clientDir` is the built React app; omitted in development (Vite serves it) and in tests.
 * `limits` exists so a test can lower the item cap without creating two thousand items.
 */
export async function buildApp(
  db: Db,
  clientDir?: string,
  log = false,
  limits: Limits = { maxItems: MAX_ITEMS_PER_LIST },
) {
  const app = Fastify({ logger: log ? logger : false });
  await app.register(fastifyHelmet, headers);

  // One room per list: the sockets currently viewing it. Nothing else lives in memory.
  const rooms = new Map<string, Set<WebSocket>>();

  // Graceful shutdown (spec X2 AC5): tell every client we are going away so it reconnects at once.
  // Registered before the websocket plugin, whose own preClose hook would otherwise close the sockets
  // first with no status code (hooks run in registration order).
  app.addHook("preClose", async () => {
    for (const room of rooms.values()) {
      for (const socket of room) socket.close(1001, "server going away");
    }
  });
  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

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

    // Sliding window of receipt times for the rate limit (spec X2 AC2).
    const recent: number[] = [];

    // A rejection is followed by a snapshot so the client can undo its optimistic change.
    const reject = (opId: string | null, reason: string, kind?: string) => {
      app.log.info({ listId: list.id, kind, reason }, "op rejected");
      send(socket, { type: "rejected", opId, reason });
      if (opId !== null) send(socket, snapshot(list));
    };

    socket.on("message", (data) => {
      const received = Date.now();
      // Every frame counts, whatever it turns out to be: read-only and malformed floods included.
      if (overLimit(recent, received)) {
        app.log.info({ listId: list.id }, "socket closed: too many messages");
        socket.close(RATE_LIMITED_CLOSE_CODE, "too many messages");
        return;
      }
      const parsed = parseClientMessage(parseJson(data.toString()));
      if (!parsed.ok) return reject(null, parsed.reason);

      const op = parsed.value;
      if (list.role !== "edit") return reject(op.opId, "read-only link", op.kind);
      const invalid = invalidParentReason(db, list.id, op);
      if (invalid) return reject(op.opId, invalid, op.kind);
      // The cap refuses only creates that would add a row; a replayed create of an existing item
      // must still be acknowledged (S10).
      if (
        op.kind === "createItem" &&
        !db.hasItem(list.id, op.item.id) &&
        db.countItems(list.id) >= limits.maxItems
      ) {
        return reject(op.opId, "this list is full", op.kind);
      }

      if (db.applyOp(list.id, op)) {
        // Everyone in the room, sender included: the echo is the sender's acknowledgement.
        for (const peer of room) send(peer, { type: "op", op });
        app.log.debug(
          { listId: list.id, kind: op.kind, clientId: op.clientId, ms: Date.now() - received },
          "op applied",
        );
      } else if (op.kind === "createItem" && !db.hasItem(list.id, op.item.id)) {
        // The id belongs to another list: refuse, or this client would show a phantom item.
        reject(op.opId, "item id already exists", op.kind);
      } else {
        // Nothing to change: a replayed create (offline queue from another tab, S10) or an op on an
        // item that is already gone. Acknowledge the sender, broadcast nothing.
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

/** Records `now` and reports whether the window already held the maximum before it. */
function overLimit(recent: number[], now: number): boolean {
  while (recent.length > 0 && now - (recent[0] as number) > RATE_LIMIT.windowMs) recent.shift();
  if (recent.length >= RATE_LIMIT.frames) return true;
  recent.push(now);
  return false;
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
