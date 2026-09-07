import { apply, type Items } from "../../../shared/apply.ts";
import type { Op, ServerMessage } from "../../../shared/protocol.ts";
import type { ListInfo } from "../../../shared/types.ts";
import type { ListCache } from "./cache.ts";

export type ListState = {
  status: "connecting" | "online" | "offline" | "not-found";
  list: ListInfo | null;
  items: Items;
  /** Reason of the most recent rejected operation, if any. */
  error: string | null;
  /** Operations applied locally that the server has not acknowledged yet (spec S10 AC3). */
  pending: number;
};

const NOT_FOUND_CLOSE_CODE = 4004;
const RATE_LIMITED_CLOSE_CODE = 4029;
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;
const MAX_ACKED = 500;

/**
 * Owns the WebSocket for one list and the list state derived from it. Implements the client
 * algorithm in specs/010: apply locally first, keep the op pending until the server echoes it,
 * and on every (re)connect replace the state with the snapshot, re-apply pending ops, resend them.
 * With a cache (spec S10) the state and the pending queue also survive a page reload while offline.
 */
export class SyncClient {
  private state: ListState = {
    status: "connecting",
    list: null,
    items: new Map(),
    error: null,
    pending: 0,
  };
  private readonly pending = new Map<string, Op>();
  /**
   * Ids of this client's own ops settled in this session; used to prune what an earlier session
   * stored. Only ops that were pending count, and the set is bounded (oldest dropped first).
   */
  private readonly acked = new Set<string>();
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = MIN_RETRY_MS;
  private closed = false;
  private readonly url: string;
  private readonly onChange: (state: ListState) => void;
  private readonly cache: ListCache | null;
  private readonly stopWatchingNetwork: () => void;

  constructor(url: string, onChange: (state: ListState) => void, cache: ListCache | null = null) {
    this.url = url;
    this.onChange = onChange;
    this.cache = cache;

    const cached = cache?.load() ?? null;
    if (cached) {
      try {
        for (const op of cached.pending) this.pending.set(op.opId, op);
        this.state = {
          status: "connecting",
          list: cached.list,
          items: new Map(cached.items.map((item) => [item.id, item])),
          error: null,
          pending: this.pending.size,
        };
        this.onChange(this.state); // render the cached list now, not after the first connection attempt
      } catch {
        // A malformed entry (old app version, truncated write) must cost one reload, not the app.
        this.pending.clear();
        cache?.clear();
      }
    }
    this.stopWatchingNetwork = this.watchNetwork();
    this.connect();
  }

  /** Applies the op locally right away and sends it. The echo from the server confirms it. */
  dispatch(op: Op): void {
    this.pending.set(op.opId, op);
    this.update({ ...this.applied(this.state, op), error: null });
    this.persist();
    this.sendPending([op]);
  }

  close(): void {
    this.closed = true;
    this.stopWatchingNetwork();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  /**
   * An open WebSocket does not notice a lost network until a send fails or TCP gives up, which can
   * take minutes (and DevTools' offline emulation never severs it). The browser's own events are
   * quicker: going offline closes the socket now; coming back reconnects now instead of after backoff.
   */
  private watchNetwork(): () => void {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function")
      return () => {};
    const onOffline = () => {
      this.update({ status: "offline" }); // do not wait for a close event that may never come
      this.socket?.close();
    };
    const onOnline = () => {
      if (this.closed || this.state.status === "online") return;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryMs = MIN_RETRY_MS;
      this.connect();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }

  private connect(): void {
    // Only one live socket at a time: a previous attempt (still connecting, or dead but not yet
    // closed) must not deliver a second snapshot or flip the status later.
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.close();
    }
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
        this.cache?.clear();
        return;
      }
      // A rate-limited close (X2) is just an early offline: the queue is intact and replays after the
      // backoff, which is the throttle.
      this.update({
        status: "offline",
        error:
          event.code === RATE_LIMITED_CLOSE_CODE
            ? "too many changes at once, reconnecting"
            : this.state.error,
      });
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    };
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "snapshot": {
        let next: Pick<ListState, "list" | "items"> = {
          list: message.list,
          items: new Map(message.items.map((item) => [item.id, item])),
        };
        for (const op of this.pending.values()) next = this.applied(next, op);
        this.update(next);
        this.persist();
        this.sendPending([...this.pending.values()]);
        return;
      }
      case "op":
        this.settle(message.op.opId);
        this.update(this.applied(this.state, message.op));
        this.persist();
        return;
      case "rejected":
        // The server follows a rejection with a snapshot, which undoes the optimistic change.
        if (message.opId !== null) this.settle(message.opId);
        this.update({ error: message.reason });
        this.persist();
        return;
    }
  }

  /** The op is no longer pending; the next update() carries the new count. */
  private settle(opId: string): void {
    if (!this.pending.delete(opId)) return; // someone else's op: nothing of ours to settle
    this.acked.add(opId);
    if (this.acked.size > MAX_ACKED) {
      const oldest = this.acked.values().next().value;
      if (oldest !== undefined) this.acked.delete(oldest);
    }
  }

  /** One op applied to items, plus the list title for `renameList`, which `apply` does not cover. */
  private applied(
    state: Pick<ListState, "list" | "items">,
    op: Op,
  ): Pick<ListState, "list" | "items"> {
    const items = apply(state.items, op);
    const list =
      op.kind === "renameList" && state.list ? { ...state.list, title: op.title } : state.list;
    return { list, items };
  }

  private sendPending(ops: Op[]): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (const op of ops) this.socket.send(JSON.stringify({ type: "op", op }));
  }

  /** Writes list, items, and queue to the cache, if there is one and there is a list to write. */
  private persist(): void {
    if (!this.cache || !this.state.list) return;
    this.cache.save(
      {
        list: this.state.list,
        items: [...this.state.items.values()],
        pending: [...this.pending.values()],
      },
      this.acked,
    );
  }

  /**
   * Notifies React only when something actually changed, so a no-op op costs no render. The pending
   * count is always part of the comparison, so an acknowledgement that changes nothing else still
   * reaches the badge.
   */
  private update(patch: Partial<ListState>): void {
    const next: Partial<ListState> = { ...patch, pending: this.pending.size };
    const keys = Object.keys(next) as Array<keyof ListState>;
    if (keys.every((key) => next[key] === this.state[key])) return;
    this.state = { ...this.state, ...next };
    this.onChange(this.state);
  }
}
