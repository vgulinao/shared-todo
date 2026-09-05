import { apply, type Items } from "../../../shared/apply.ts";
import type { Op, ServerMessage } from "../../../shared/protocol.ts";
import type { ListInfo } from "../../../shared/types.ts";

export type ListState = {
  status: "connecting" | "online" | "offline" | "not-found";
  list: ListInfo | null;
  items: Items;
  /** Reason of the most recent rejected operation, if any. */
  error: string | null;
};

const NOT_FOUND_CLOSE_CODE = 4004;
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

/**
 * Owns the WebSocket for one list and the list state derived from it. Implements the client
 * algorithm in specs/010: apply locally first, keep the op pending until the server echoes it,
 * and on every (re)connect replace the state with the snapshot, re-apply pending ops, resend them.
 */
export class SyncClient {
  private state: ListState = { status: "connecting", list: null, items: new Map(), error: null };
  private readonly pending = new Map<string, Op>();
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = MIN_RETRY_MS;
  private closed = false;
  private readonly url: string;
  private readonly onChange: (state: ListState) => void;

  constructor(url: string, onChange: (state: ListState) => void) {
    this.url = url;
    this.onChange = onChange;
    this.connect();
  }

  /** Applies the op locally right away and sends it. The echo from the server confirms it. */
  dispatch(op: Op): void {
    this.pending.set(op.opId, op);
    this.update({ items: apply(this.state.items, op), error: null });
    this.sendPending([op]);
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  private connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.retryMs = MIN_RETRY_MS;
      this.update({ status: "online" });
    };
    socket.onmessage = (event) => {
      this.receive(JSON.parse(String(event.data)) as ServerMessage);
    };
    socket.onclose = (event) => {
      if (this.closed) return;
      if (event.code === NOT_FOUND_CLOSE_CODE) {
        this.update({ status: "not-found" });
        return;
      }
      this.update({ status: "offline" });
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    };
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "snapshot": {
        let items: Items = new Map(message.items.map((item) => [item.id, item]));
        for (const op of this.pending.values()) items = apply(items, op);
        this.update({ list: message.list, items });
        this.sendPending([...this.pending.values()]);
        return;
      }
      case "op":
        this.pending.delete(message.op.opId);
        this.update({ items: apply(this.state.items, message.op) });
        return;
      case "rejected":
        this.pending.delete(message.opId);
        this.update({ error: message.reason });
        return;
    }
  }

  private sendPending(ops: Op[]): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (const op of ops) this.socket.send(JSON.stringify({ type: "op", op }));
  }

  private update(patch: Partial<ListState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}
