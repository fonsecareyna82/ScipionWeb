import { useEffect, useState } from "react";
import { monitorViewStorageKey, VIEW_STORAGE_KEY, type MonitorMode } from "./monitor-view-preferences";

export const CARD_ORDER_STORAGE_KEY = "scipionweb.monitor.cardOrder.v1";

/** The ids of the plot cards of each monitor, in the order the user dragged them to. */
export type CardOrder = Record<MonitorMode, string[]>;

export function readCardOrder(key: string): CardOrder {
  const order: CardOrder = { spa: [], tomo: [] };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    for (const mode of ["spa", "tomo"] as const) {
      const ids = stored?.[mode];
      if (Array.isArray(ids)) order[mode] = [...new Set(ids.filter((id): id is string => typeof id === "string"))];
    }
  } catch {
    // Invalid or unavailable storage falls back to the standard order.
  }
  return order;
}

/** The items in the saved order; those it does not name keep their place after them. */
export function sortByCardOrder<T>(items: T[], idOf: (item: T) => string, order: string[]): T[] {
  const position = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index, saved: position.get(idOf(item)) }))
    .sort((a, b) => (a.saved ?? Infinity) - (b.saved ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
}

export function useCardOrder() {
  const [key] = useState(() => monitorViewStorageKey().replace(VIEW_STORAGE_KEY, CARD_ORDER_STORAGE_KEY));
  const [order, setOrder] = useState(() => readCardOrder(key));
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(order)); } catch {
      // The order still works for this monitor without persistent storage.
    }
  }, [key, order]);
  return {
    order,
    // The cards on screen in their new order; hidden ones keep their saved place behind them
    setShownOrder: (mode: MonitorMode, shown: string[]) => setOrder((previous) => ({
      ...previous, [mode]: [...shown, ...previous[mode].filter((id) => !shown.includes(id))],
    })),
    restore: (mode: MonitorMode) => setOrder((previous) => ({ ...previous, [mode]: [] })),
  };
}
