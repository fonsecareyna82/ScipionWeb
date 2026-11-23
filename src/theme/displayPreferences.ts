// The user's display preferences (text size, density, time zone), applied to the whole app.
//
// - Text size: every font size of the app's CSS (see postcss.config.js) and of MUI's sx and theme is multiplied by
//   the CSS variable --sw-font-scale, set here on <html>.
// - Density: MUI's spacing unit (paddings, margins and gaps of MUI components and sx) and the size of its
//   controls; read by createAppTheme.
// - Time zone: dates written with toLocaleString / toLocaleDateString / toLocaleTimeString, or with
//   formatInTimeZone, use it.
import { useSyncExternalStore } from "react";

export type Density = "comfortable" | "compact";

export type DisplayPreferences = {
  fontScale: number;
  density: Density;
  /** undefined: the browser's own. */
  timeZone?: string;
};

export const FONT_SCALE_VARIABLE = "--sw-font-scale";
const STORAGE_KEY = "scipion.display";
const DEFAULTS: DisplayPreferences = { fontScale: 1, density: "comfortable" };

let current: DisplayPreferences = readStored();
const listeners = new Set<() => void>();

function validTimeZone(zone: unknown): string | undefined {
  if (typeof zone !== "string" || !zone.trim()) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

function sanitize(raw: Partial<DisplayPreferences> | null | undefined): DisplayPreferences {
  const scale = Number(raw?.fontScale);
  return {
    fontScale: Number.isFinite(scale) ? Math.min(1.25, Math.max(0.85, scale)) : DEFAULTS.fontScale,
    density: raw?.density === "compact" ? "compact" : "comfortable",
    timeZone: validTimeZone(raw?.timeZone),
  };
}

function readStored(): DisplayPreferences {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored ? sanitize(JSON.parse(stored)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function applyToDocument(prefs: DisplayPreferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (prefs.fontScale === 1) root.style.removeProperty(FONT_SCALE_VARIABLE);
  else root.style.setProperty(FONT_SCALE_VARIABLE, String(prefs.fontScale));
  root.dataset.density = prefs.density;
}

export function getDisplayPreferences(): DisplayPreferences {
  return current;
}

/** Applies (and remembers on this browser, for the next page load) the user's display preferences. */
export function setDisplayPreferences(next: Partial<DisplayPreferences>) {
  const merged = sanitize({ ...current, ...next });
  if (merged.fontScale === current.fontScale && merged.density === current.density
      && merged.timeZone === current.timeZone) return;
  current = merged;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private mode or storage off: the preferences still apply until the page is left
  }
  applyToDocument(current);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplayPreferences(): DisplayPreferences {
  return useSyncExternalStore(subscribe, getDisplayPreferences, getDisplayPreferences);
}

/** A CSS font size multiplied by the user's text size (numbers are pixels). */
export function scaledFontSize(value: unknown): unknown {
  if (typeof value === "number") return `calc(${value}px * var(${FONT_SCALE_VARIABLE}, 1))`;
  if (typeof value === "string" && /^-?\d*\.?\d+(px|rem)$/.test(value.trim())) {
    return `calc(${value.trim()} * var(${FONT_SCALE_VARIABLE}, 1))`;
  }
  return value;
}

/** The options with the user's time zone, unless they name one. */
export function withDisplayTimeZone<T extends Intl.DateTimeFormatOptions | undefined>(options: T): T {
  const zone = current.timeZone;
  if (!zone || (options && options.timeZone)) return options;
  return { ...(options ?? {}), timeZone: zone } as T;
}

export function formatInTimeZone(date: Date | number, options?: Intl.DateTimeFormatOptions,
                                 locales?: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locales, withDisplayTimeZone(options)).format(date);
}

/** Year, month (1–12), day, hours and minutes of a date in the user's time zone. */
export function zonedParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", withDisplayTimeZone({
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  })).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// Dates written with Date's locale methods follow the chosen time zone, everywhere, without changing each caller.
// Without a chosen zone they behave as always.
let patched = false;
function patchDateLocaleMethods() {
  if (patched || typeof Date === "undefined") return;
  patched = true;
  const proto = Date.prototype as any;
  for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"] as const) {
    const original = proto[name];
    proto[name] = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      return original.call(this, locales, withDisplayTimeZone(options));
    };
  }
}

patchDateLocaleMethods();
applyToDocument(current);
