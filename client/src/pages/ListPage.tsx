import { useState } from "react";
import { childrenOf } from "../../../shared/apply.ts";
import type { Item } from "../../../shared/types.ts";
import { useList } from "../lib/useList.ts";
import { createItem, deleteItem, updateItem } from "../lib/ops.ts";
import { AddItem } from "../components/AddItem.tsx";
import { ItemRow } from "../components/ItemRow.tsx";
import { NotFound } from "./NotFound.tsx";

export function ListPage({ token }: { token: string }) {
  const { state, dispatch } = useList(token);
  const [showDone, setShowDone] = useState(false);

  if (state.status === "not-found") return <NotFound />;
  if (!state.list) {
    return (
      <main className="app">
        <p className="muted">Connecting…</p>
      </main>
    );
  }

  const items = childrenOf(state.items, null);
  const pending = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done);

  const row = (item: Item) => (
    <ItemRow
      key={item.id}
      item={item}
      onToggleDone={(value) => dispatch(updateItem(item.id, { done: value }))}
      onRename={(title) => dispatch(updateItem(item.id, { title }))}
      onDelete={() => dispatch(deleteItem(item.id))}
    />
  );

  return (
    <main className="app">
      <header className="list-header">
        <h1>{state.list.title}</h1>
        {state.status !== "online" && <span className="badge">{state.status}</span>}
      </header>

      <AddItem onAdd={(title) => dispatch(createItem(state.items, title))} />

      {items.length === 0 ? (
        <p className="muted empty">Nothing here yet. Add your first item above.</p>
      ) : (
        <>
          {pending.length > 0 && <ul className="items">{pending.map(row)}</ul>}
          {done.length > 0 && (
            <section className="completed">
              <button
                className="completed-toggle"
                aria-expanded={showDone}
                onClick={() => setShowDone((v) => !v)}
              >
                <span className="chevron">{showDone ? "▾" : "▸"}</span>
                Completed · {done.length}
              </button>
              {showDone && <ul className="items">{done.map(row)}</ul>}
            </section>
          )}
        </>
      )}

      {state.error && <p className="error">{state.error}</p>}
    </main>
  );
}
