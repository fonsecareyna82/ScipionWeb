import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";

export const MONITOR_SECTIONS = {
  spa: [
    ["summary", "Quality summary"],
    ["pipeline", "Pipeline"], ["resolution", "CTF resolution"], ["defocus", "Defocus"],
    ["astigmatism", "Astigmatism"], ["drift", "Drift"], ["dose", "Dose stability"],
    ["particles", "Particles per micrograph"], ["classes", "2D classes"],
    ["latest", "Latest micrographs"], ["distributions", "Distributions"],
  ],
  tomo: [
    ["tomoSummary", "Tomography summary"],
    ["angular", "Angular coverage"],
    ["summary", "Quality summary"],
    ["pipeline", "Pipeline"], ["defocus", "Mean defocus"], ["tilts", "Tilts kept"],
    ["residual", "Alignment residual"], ["particles", "Particles per tomogram"], ["tiltSeries", "Tilt series table"],
  ],
} as const;

export type MonitorMode = keyof typeof MONITOR_SECTIONS;
export type MonitorSection = (typeof MONITOR_SECTIONS)[MonitorMode][number][0];
export type SectionVisibility = Partial<Record<MonitorSection, boolean>>;
type Preferences = Record<MonitorMode, SectionVisibility>;
export const VIEW_STORAGE_KEY = "scipionweb.monitor.sections.v1";

/** Account-scoped preferences; refreshing a token keeps the same subject and storage key. */
export function monitorViewStorageKey(): string {
  try {
    const token = localStorage.getItem("accessToken");
    const subject = token ? jwtDecode<{ sub?: string }>(token).sub : null;
    return subject ? `${VIEW_STORAGE_KEY}:${encodeURIComponent(subject)}` : VIEW_STORAGE_KEY;
  } catch {
    return VIEW_STORAGE_KEY;
  }
}

export function readMonitorViewPreferences(key: string): Preferences {
  const result: Preferences = { spa: {}, tomo: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    for (const mode of ["spa", "tomo"] as const) {
      for (const [id] of MONITOR_SECTIONS[mode]) {
        if (typeof raw?.[mode]?.[id] === "boolean") result[mode][id] = raw[mode][id];
      }
    }
  } catch {
    // Invalid or unavailable storage falls back to the complete view.
  }
  return result;
}

export function useMonitorViewPreferences() {
  const [key] = useState(monitorViewStorageKey);
  const [preferences, setPreferences] = useState(() => readMonitorViewPreferences(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {
      // The choice still works for this monitor when storage is unavailable.
    }
  }, [key, preferences]);
  return {
    preferences,
    setVisible: (mode: MonitorMode, section: MonitorSection, visible: boolean) =>
      setPreferences((previous) => ({ ...previous, [mode]: { ...previous[mode], [section]: visible } })),
    restore: (mode: MonitorMode) => setPreferences((previous) => ({ ...previous, [mode]: {} })),
  };
}
