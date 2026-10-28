import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SortableCards from "@/components/monitor/SortableCards";
import { readCardOrder, sortByCardOrder, useCardOrder, CARD_ORDER_STORAGE_KEY } from "@/components/monitor/monitor-card-order";

const CARDS = ["a", "b", "c"].map((id) => ({ id, label: `Plot ${id}`, node: <p>{`plot ${id}`}</p> }));

function shownIds(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-card-id]")).map((node) => node.getAttribute("data-card-id"));
}

function card(container: HTMLElement, id: string) {
  return container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
}

const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" });

describe("SortableCards", () => {
  it("shows the cards in the saved order, the ones it does not name after them", () => {
    const { container } = render(<SortableCards cards={CARDS} order={["c", "a"]} onReorder={vi.fn()} />);
    expect(shownIds(container)).toEqual(["c", "a", "b"]);
  });

  it("moves a card dragged by its handle onto another", () => {
    const onReorder = vi.fn();
    const { container } = render(<SortableCards cards={CARDS} order={[]} onReorder={onReorder} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Plot c" }));
    expect(card(container, "c")).toHaveAttribute("draggable", "true");
    const transfer = dataTransfer();
    fireEvent.dragStart(card(container, "c"), { dataTransfer: transfer });
    fireEvent.dragOver(card(container, "a"), { dataTransfer: transfer });
    fireEvent.drop(card(container, "a"), { dataTransfer: transfer });

    expect(onReorder).toHaveBeenCalledWith(["c", "a", "b"]);
  });

  it("does not drag a card held anywhere but its handle, where the plot zooms and selects", () => {
    const { container } = render(<SortableCards cards={CARDS} order={[]} onReorder={vi.fn()} />);
    expect(card(container, "a")).toHaveAttribute("draggable", "false");
  });

  it("moves a card with the arrow keys from its handle", () => {
    const onReorder = vi.fn();
    render(<SortableCards cards={CARDS} order={[]} onReorder={onReorder} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Move Plot a" }), { key: "ArrowRight" });
    expect(onReorder).toHaveBeenLastCalledWith(["b", "a", "c"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Plot a" }), { key: "ArrowLeft" });
    // Already the first one
    expect(onReorder).toHaveBeenCalledTimes(1);
  });
});

describe("The saved order of the monitor cards", () => {
  beforeEach(() => localStorage.clear());

  it("ignores what is not a list of ids", () => {
    localStorage.setItem(CARD_ORDER_STORAGE_KEY, JSON.stringify({ spa: ["drift", 3, "drift", "defocus"], tomo: "x" }));
    expect(readCardOrder(CARD_ORDER_STORAGE_KEY)).toEqual({ spa: ["drift", "defocus"], tomo: [] });
    localStorage.setItem(CARD_ORDER_STORAGE_KEY, "not JSON");
    expect(readCardOrder(CARD_ORDER_STORAGE_KEY)).toEqual({ spa: [], tomo: [] });
  });

  it("keeps the place of hidden cards, and restores the standard order", () => {
    const { result } = renderHook(() => useCardOrder());
    act(() => result.current.setShownOrder("spa", ["drift", "defocus", "resolution"]));
    // Defocus hidden: the two shown ones swap
    act(() => result.current.setShownOrder("spa", ["resolution", "drift"]));
    expect(result.current.order.spa).toEqual(["resolution", "drift", "defocus"]);
    expect(JSON.parse(localStorage.getItem(CARD_ORDER_STORAGE_KEY)!).spa).toEqual(["resolution", "drift", "defocus"]);

    act(() => result.current.restore("spa"));
    expect(result.current.order.spa).toEqual([]);
  });

  it("sorts in the saved order", () => {
    expect(sortByCardOrder(["a", "b", "c", "d"], (id) => id, ["d", "b"])).toEqual(["d", "b", "a", "c"]);
  });
});
