import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { Op, ServerMessage } from "../shared/protocol.ts";
import type { Item } from "../shared/types.ts";
import type { buildApp } from "./app.ts";

export type App = Awaited<ReturnType<typeof buildApp>>;

/** Listens on a random port and returns the host:port to connect to. */
export async function listen(app: App): Promise<string> {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return `127.0.0.1:${address.port}`;
}

export async function createList(app: App, title?: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/lists",
    payload: title ? { title } : {},
  });
  if (res.statusCode !== 201) throw new Error(`create list: ${res.statusCode}`);
  return res.json() as { editToken: string; viewToken: string };
}

/** Opens a socket and returns helpers that resolve with the next message or the close code. */
export function connect(baseUrl: string, token: string) {
  const socket = new WebSocket(`ws://${baseUrl}/ws?token=${token}`);
  const inbox: ServerMessage[] = [];
  const waiting: Array<(m: ServerMessage) => void> = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else inbox.push(message);
  });
  return {
    socket,
    next(): Promise<ServerMessage> {
      const queued = inbox.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve) => waiting.push(resolve));
    },
    send(op: Op) {
      socket.send(JSON.stringify({ type: "op", op }));
    },
    closed(): Promise<number> {
      return new Promise((resolve) => socket.on("close", (code) => resolve(code)));
    },
  };
}

export function item(overrides: Partial<Item> & { id: string; position: number }): Item {
  return {
    parentId: null,
    title: overrides.id,
    description: null,
    done: false,
    cost: null,
    ...overrides,
  };
}

/** Item ids are unique across all lists, like the UUIDs the client generates. */
export function uid(): string {
  return randomUUID();
}

export const base = { clientId: "client-a" };
