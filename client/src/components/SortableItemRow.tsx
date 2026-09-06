import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ItemRow, type ItemRowProps } from "./ItemRow.tsx";

/** An ItemRow that can be dragged by its handle within a SortableContext. */
export function SortableItemRow(props: ItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id });

  const handle = (
    <button
      ref={setActivatorNodeRef}
      className="drag-handle"
      aria-label={`Reorder ${props.item.title}`}
      {...attributes}
      {...listeners}
    >
      ⋮⋮
    </button>
  );

  return (
    <ItemRow
      {...props}
      handle={handle}
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragging={isDragging}
    />
  );
}
