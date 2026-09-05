import { useCallback, useEffect, useRef, useState } from "react";
import type { Op } from "../../../shared/protocol.ts";
import { SyncClient, type ListState } from "./SyncClient.ts";

const initialState: ListState = { status: "connecting", list: null, items: new Map(), error: null };

/** Connects to one list for the lifetime of the component and exposes its state and a dispatcher. */
export function useList(token: string) {
  const [state, setState] = useState<ListState>(initialState);
  const client = useRef<SyncClient | null>(null);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const sync = new SyncClient(`${protocol}://${location.host}/ws?token=${token}`, setState);
    client.current = sync;
    return () => {
      sync.close();
      client.current = null;
    };
  }, [token]);

  const dispatch = useCallback((op: Op) => client.current?.dispatch(op), []);

  return { state, dispatch };
}
