import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { sortByCardOrder } from "./monitor-card-order";

export type SortableCard = { id: string; label: string; node: ReactNode };

const EARLIER_KEYS = new Set(["ArrowLeft", "ArrowUp"]);
const LATER_KEYS = new Set(["ArrowRight", "ArrowDown"]);

function moved(ids: string[], id: string, to: number): string[] {
  const rest = ids.filter((other) => other !== id);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, id);
  return rest;
}

/**
 * Cards the user puts in the order they like: dragged by their handle (only by
 * it, as dragging over a plot zooms or selects a time range), or moved with
 * the arrow keys from it. The cards go straight into the parent's grid.
 */
export default function SortableCards({ cards, order, onReorder }: {
  cards: SortableCard[];
  order: string[];
  onReorder: (ids: string[]) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const sorted = sortByCardOrder(cards, (card) => card.id, order);
  const ids = sorted.map((card) => card.id);

  const endDrag = () => {
    setArmed(null);
    setDragged(null);
    setOver(null);
  };
  const onDragStart = (event: DragEvent, id: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDragged(id);
  };
  const onDragOver = (event: DragEvent, id: string) => {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (over !== id) setOver(id);
  };
  const onDrop = (event: DragEvent, id: string) => {
    event.preventDefault();
    if (dragged && dragged !== id) onReorder(moved(ids, dragged, ids.indexOf(id)));
    endDrag();
  };
  const onHandleKey = (event: KeyboardEvent, id: string) => {
    const step = EARLIER_KEYS.has(event.key) ? -1 : LATER_KEYS.has(event.key) ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = ids.indexOf(id);
    if (index + step >= 0 && index + step < ids.length) onReorder(moved(ids, id, index + step));
  };

  return (
    <>
      {sorted.map((card) => (
        <div key={card.id} data-card-id={card.id}
             className={`relative min-w-0 rounded-xl ${dragged === card.id ? "opacity-50" : ""} ${
               over === card.id && dragged !== card.id ? "ring-2 ring-app-accent" : ""}`}
             draggable={armed === card.id}
             onDragStart={(event) => onDragStart(event, card.id)}
             onDragOver={(event) => onDragOver(event, card.id)}
             onDragLeave={() => setOver((current) => (current === card.id ? null : current))}
             onDrop={(event) => onDrop(event, card.id)}
             onDragEnd={endDrag}>
          {card.node}
          <button type="button" aria-label={`Move ${card.label}`}
                  title="Drag to move this plot, or use the arrow keys"
                  onPointerDown={() => setArmed(card.id)} onPointerUp={() => setArmed(null)}
                  onKeyDown={(event) => onHandleKey(event, card.id)}
                  className="absolute right-1.5 top-1.5 z-10 cursor-grab rounded p-0.5 text-app-subtle hover:bg-app-hover hover:text-app-text active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      ))}
    </>
  );
}
