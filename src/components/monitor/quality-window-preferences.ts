import { useEffect, useState } from "react";
import { monitorViewStorageKey, VIEW_STORAGE_KEY, type MonitorMode } from "./monitor-view-preferences";

export const QUALITY_WINDOW_STORAGE_KEY = "scipionweb.monitor.qualityWindow.v1";
export const DEFAULT_QUALITY_WINDOWS = { spa: 100, tomo: 20 };
export const MAX_QUALITY_WINDOW = 5000;
export const isQualityWindowSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_QUALITY_WINDOW;

export function readQualityWindows(key: string): Record<MonitorMode, number> {
  const sizes = { ...DEFAULT_QUALITY_WINDOWS };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    for (const mode of ["spa", "tomo"] as const) {
      if (isQualityWindowSize(stored?.[mode])) sizes[mode] = stored[mode];
    }
  } catch {
    // Invalid or unavailable storage falls back to the standard windows.
  }
  return sizes;
}

export function useQualityWindows() {
  const [key] = useState(() => monitorViewStorageKey().replace(VIEW_STORAGE_KEY, QUALITY_WINDOW_STORAGE_KEY));
  const [sizes, setSizes] = useState(() => readQualityWindows(key));
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(sizes)); } catch {
      // The selected windows still work for this monitor without persistent storage.
    }
  }, [key, sizes]);
  return {
    sizes,
    setSize: (mode: MonitorMode, value: number) => {
      if (isQualityWindowSize(value)) setSizes((previous) => ({ ...previous, [mode]: value }));
    },
  };
}
