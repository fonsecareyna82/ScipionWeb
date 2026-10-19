"use client";

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

/** What the page shows. */
type Theme = "light" | "dark";
/** What the user chose: a theme, or the system's. */
export type ThemePreference = Theme | "system";

type ThemeContextType = {
  /** The theme shown (the system's one when the preference is "system"). */
  theme: Theme;
  preference: ThemePreference;
  toggleTheme: () => void;
  setThemeMode: (theme: Theme) => void;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// index.html reads the same key before the page paints (no light flash in dark mode).
export const THEME_STORAGE_KEY = "theme";
const DEFAULT_PREFERENCE: ThemePreference = "light";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(saved) ? saved : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function writeStoredPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
    localStorage.removeItem("scipion.theme.preference");
  } catch {
    // Without storage the choice lasts the session.
  }
}

function systemIsDark(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.(SYSTEM_DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

// -- stylesheets ---------------------------------------------------------------
// The app chooses its theme itself: rules of stylesheets that follow the
// system's dark mode (prefers-color-scheme) would turn parts dark in the light
// theme. Each stylesheet is cleaned once, when it is added (lazy chunks too).

const cleanedSheets = new WeakSet<CSSStyleSheet>();

function stripSystemDarkRules(owner: CSSStyleSheet | CSSGroupingRule) {
  let rules: CSSRuleList;
  try {
    rules = owner.cssRules;
  } catch {
    return; // Cross-origin stylesheet.
  }
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    const condition = String((rule as CSSMediaRule).conditionText ?? "").toLowerCase();
    if (condition.includes("prefers-color-scheme") && condition.includes("dark")) {
      try {
        owner.deleteRule(index);
      } catch {
        // Read-only stylesheet.
      }
      continue;
    }
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested && nested.length > 0) stripSystemDarkRules(rule as CSSGroupingRule);
  }
}

function cleanNewStylesheets() {
  if (typeof document === "undefined") return;
  for (const sheet of Array.from(document.styleSheets)) {
    if (cleanedSheets.has(sheet)) continue;
    cleanedSheets.add(sheet);
    stripSystemDarkRules(sheet);
  }
}

// -- applying ------------------------------------------------------------------

/** Where the dark class goes: the page, and the roots of the project page widget build. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark";
  const targets: Element[] = [document.documentElement, document.body];
  const appRoot = document.getElementById("root");
  if (appRoot) targets.push(appRoot);
  document.querySelectorAll(".projectpage-widget-root").forEach((root) => targets.push(root));
  for (const element of targets) element.classList.toggle("dark", isDark);
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.body.style.colorScheme = theme;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemIsDark);
  const theme = resolveTheme(preference, systemDark);

  // The system's theme, followed live while the preference is "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    const update = () => setSystemDark(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Stylesheets added later (lazy routes) are cleaned when they arrive; only <head> is watched.
  useEffect(() => {
    if (typeof document === "undefined") return;
    cleanNewStylesheets();
    const observer = new MutationObserver(() => cleanNewStylesheets());
    observer.observe(document.head, { childList: true });
    const handleLoad = (event: Event) => {
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "link" || tag === "style") cleanNewStylesheets();
    };
    document.head.addEventListener("load", handleLoad, true);
    return () => {
      observer.disconnect();
      document.head.removeEventListener("load", handleLoad, true);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredPreference(next);
    setPreferenceState(next);
    applyTheme(resolveTheme(next, systemIsDark()));
  }, []);

  const setThemeMode = useCallback((next: Theme) => setPreference(next), [setPreference]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [setPreference, theme]);

  const value = useMemo(
    () => ({ theme, preference, toggleTheme, setThemeMode, setPreference }),
    [theme, preference, toggleTheme, setThemeMode, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

/**
 * Whether the dark theme is shown. Also outside the ThemeProvider (the project
 * page widget build), where the host page's dark class decides.
 */
export function useIsDark(): boolean {
  const context = useContext(ThemeContext);
  const [hostDark, setHostDark] = useState<boolean>(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (context || typeof document === "undefined") return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setHostDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [context]);
  return context ? context.theme === "dark" : hostDark;
}
