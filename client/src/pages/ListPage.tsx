import { useEffect, useState } from "react";
import { childrenOf } from "../../../shared/apply.ts";
import type { Item } from "../../../shared/types.ts";
import { useList } from "../lib/useList.ts";
import { createItem, deleteItem, renameList, updateItem } from "../lib/ops.ts";
import { AddItem } from "../components/AddItem.tsx";
import { ItemRow } from "../components/ItemRow.tsx";
import { ListTitle } from "../components/ListTitle.tsx";
import { ShareLinks } from "../components/ShareLinks.tsx";
import { NotFound } from "./NotFound.tsx";

export function ListPage({ token }: { token: string }) {
  const { state, dispatch } = useList(token);
  const [showDone, setShowDone] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const title = state.list?.title;
  useEffect(() => {
    document.title = title ? `${title} · Shared To-Do` : "Shared To-Do";
    return () => {
      document.title = "Shared To-Do";
    };
  }, [title]);

  // A rejection message is informative for a few seconds, then noise.
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  useEffect(() => {
    if (!state.error) return;
    const timer = setTimeout(() => setDismissedError(state.error), 4000);
    return () => clearTimeout(timer);
  }, [state.error]);
  const visibleError = state.error !== dismissedError ? state.error : null;

  if (state.status === "not-found") return <NotFound />;
  if (!state.list) {
    return (
      <main className="app">
        <p className="muted">Connecting…</p>
      </main>
    );
  }

  const editable = state.list.role === "edit";
  const items = childrenOf(state.items, null);
  const pending = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done);

  const row = (item: Item) => (
    <ItemRow
      key={item.id}
      item={item}
      editable={editable}
      onToggleDone={(value) => dispatch(updateItem(item.id, { done: value }))}
      onRename={(text) => dispatch(updateItem(item.id, { title: text }))}
      onDelete={() => dispatch(deleteItem(item.id))}
    />
  );

  return (
    <main className="app">
      <header className="list-header">
        <ListTitle
          title={state.list.title}
          editable={editable}
          onRename={(text) => dispatch(renameList(text))}
        />
        {!editable && <span className="badge">View only</span>}
        {state.status !== "online" && <span className="badge">{state.status}</span>}
        {editable && (
          <button
            className="secondary share-toggle"
            aria-expanded={showShare}
            onClick={() => setShowShare((v) => !v)}
          >
            Share
          </button>
        )}
      </header>

      {showShare && editable && state.list.viewToken && (
        <ShareLinks editToken={token} viewToken={state.list.viewToken} />
      )}

      {editable && <AddItem onAdd={(text) => dispatch(createItem(state.items, text))} />}

      {items.length === 0 ? (
        <p className="muted empty">
          {editable ? "Nothing here yet. Add your first item above." : "Nothing here yet."}
        </p>
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

      {visibleError && <p className="error">{visibleError}</p>}
    </main>
  );
}
