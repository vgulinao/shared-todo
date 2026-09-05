import { childrenOf } from "../../../shared/apply.ts";
import { useList } from "../lib/useList.ts";
import { createItem, deleteItem, updateItem } from "../lib/ops.ts";
import { AddItem } from "../components/AddItem.tsx";
import { ItemRow } from "../components/ItemRow.tsx";
import { NotFound } from "./NotFound.tsx";

export function ListPage({ token }: { token: string }) {
  const { state, dispatch } = useList(token);

  if (state.status === "not-found") return <NotFound />;
  if (!state.list) {
    return (
      <main className="app">
        <p className="muted">Connecting…</p>
      </main>
    );
  }

  const items = childrenOf(state.items, null);

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
        <ul className="items">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onRename={(title) => dispatch(updateItem(item.id, { title }))}
              onDelete={() => dispatch(deleteItem(item.id))}
            />
          ))}
        </ul>
      )}

      {state.error && <p className="error">{state.error}</p>}
    </main>
  );
}
