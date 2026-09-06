import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { childrenOf } from "../../../shared/apply.ts";
import { planMove } from "../../../shared/order.ts";
import { totalOf } from "../../../shared/cost.ts";
import { formatCost } from "../lib/format.ts";
import type { Item } from "../../../shared/types.ts";
import { useList } from "../lib/useList.ts";
import { createItem, moveItem, renameList } from "../lib/ops.ts";
import { AddItem } from "../components/AddItem.tsx";
import { ItemGroup, type NotesDraft } from "../components/ItemGroup.tsx";
import { ListTitle } from "../components/ListTitle.tsx";
import { ShareLinks } from "../components/ShareLinks.tsx";
import { Connecting } from "../components/Connecting.tsx";
import { loadRecent, remember, retitle, saveRecent } from "../lib/recent.ts";
import { NotFound } from "./NotFound.tsx";

export function ListPage({ token }: { token: string }) {
  const { state, dispatch } = useList(token);
  const [showDone, setShowDone] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // The notes draft is page state: a group remounts when another client ticks it (pending → Completed),
  // and the text being typed must survive that.
  const [notesDraft, setNotesDraft] = useState<NotesDraft | null>(null);

  const title = state.list?.title;
  const role = state.list?.role;
  useEffect(() => {
    document.title = title ? `${title} · Shared To-Do` : "Shared To-Do";
    return () => {
      document.title = "Shared To-Do";
    };
  }, [title]);

  // Remember this list on this device (spec X1 AC2). The open is stamped once per visit; a later
  // title change (someone renamed it) updates the stored title without moving the entry.
  const stamped = useRef<string | null>(null);
  useEffect(() => {
    if (!title || !role) return;
    if (stamped.current === token) {
      saveRecent(retitle(loadRecent(), token, title));
    } else {
      stamped.current = token;
      saveRecent(remember(loadRecent(), { token, title, role, at: Date.now() }));
    }
  }, [token, title, role]);

  // Escape closes the share panel from anywhere on the page.
  useEffect(() => {
    if (!showShare) return;
    // Inline editors stop propagation of the Escape they consume, so this only sees the rest.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowShare(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showShare]);

  // A rejection message is informative for a few seconds, then noise.
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  useEffect(() => {
    if (!state.error) return;
    const timer = setTimeout(() => setDismissedError(state.error), 4000);
    return () => clearTimeout(timer);
  }, [state.error]);
  const visibleError = state.error !== dismissedError ? state.error : null;

  // Drag starts after a small pointer movement (so clicks still click) or a short touch hold (so the
  // page still scrolls). Keyboard: Space to pick up, arrows to move, Space to drop.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (state.status === "not-found") return <NotFound />;
  if (!state.list) {
    return (
      <main className="app">
        <Connecting />
      </main>
    );
  }

  const editable = state.list.role === "edit";
  const topLevel = childrenOf(state.items, null);
  const pending = topLevel.filter((item) => !item.done);
  const done = topLevel.filter((item) => item.done);
  const total = totalOf(state.items);

  /** Items reorder among their siblings only: top-level pending items, or one parent's sub-tasks. */
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const moved = state.items.get(String(active.id));
    const target = state.items.get(String(over.id));
    if (!moved || !target || moved.parentId !== target.parentId) return;
    const siblings = moved.parentId === null ? pending : childrenOf(state.items, moved.parentId);
    const toIndex = siblings.findIndex((item) => item.id === target.id);
    for (const { id, position } of planMove(siblings, moved.id, toIndex)) {
      dispatch(moveItem(id, moved.parentId, position));
    }
  }

  // Screen-reader announcements name the item instead of dnd-kit's default, which reads out the id.
  const titleOf = (id: unknown) => state.items.get(String(id))?.title ?? "item";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ over }) => (over ? `Over ${titleOf(over.id)}.` : "No longer over an item."),
    onDragEnd: ({ active, over }) =>
      over
        ? `Moved ${titleOf(active.id)} to the spot of ${titleOf(over.id)}.`
        : `Dropped ${titleOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelled moving ${titleOf(active.id)}.`,
  };

  const group = (item: Item, sortable: boolean) => (
    <ItemGroup
      key={item.id}
      parent={item}
      items={state.items}
      editable={editable}
      sortable={sortable}
      notesDraft={notesDraft}
      onNotesDraft={setNotesDraft}
      dispatch={dispatch}
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
        {state.status === "offline" && <span className="badge">Offline · reconnecting…</span>}
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

      {topLevel.length === 0 ? (
        <p className="muted empty">
          {editable ? "Nothing here yet. Add your first item above." : "Nothing here yet."}
        </p>
      ) : (
        <>
          {pending.length > 0 &&
            (editable ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
                accessibility={{ announcements }}
              >
                <SortableContext
                  items={pending.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="items">{pending.map((item) => group(item, true))}</ul>
                </SortableContext>
              </DndContext>
            ) : (
              <ul className="items">{pending.map((item) => group(item, false))}</ul>
            ))}
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
              {showDone && <ul className="items">{done.map((item) => group(item, false))}</ul>}
            </section>
          )}
        </>
      )}

      {total !== null && (
        <p className="total">
          Total <strong>{formatCost(total)}</strong>
        </p>
      )}

      {visibleError && <p className="error">{visibleError}</p>}
    </main>
  );
}
