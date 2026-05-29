"use client";

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
  setThemeMode: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const defaultTheme: Theme = "light";
const themeStorageKey = "theme";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return defaultTheme;

  try {
    const savedTheme = localStorage.getItem(themeStorageKey);
    return isTheme(savedTheme) ? savedTheme : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function writeStoredTheme(theme: Theme) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(themeStorageKey, theme);
    localStorage.removeItem("scipion.theme.preference");
  } catch {
    // Ignore storage errors.
  }
}

function removeAllDarkClasses() {
  if (typeof document === "undefined") return;

  document.querySelectorAll(".dark").forEach((element) => {
    element.classList.remove("dark");
  });
}

function isSystemDarkMediaRule(rule: CSSRule): boolean {
  const conditionText = String((rule as CSSMediaRule)?.conditionText ?? "").toLowerCase();
  return conditionText.includes("prefers-color-scheme") && conditionText.includes("dark");
}

function getNestedRules(rule: CSSRule): CSSRuleList | null {
  try {
    const candidate = rule as CSSGroupingRule;
    return candidate.cssRules ?? null;
  } catch {
    return null;
  }
}

function deleteRuleAt(owner: CSSStyleSheet | CSSGroupingRule, index: number) {
  try {
    owner.deleteRule(index);
  } catch {
    // Ignore stylesheet mutation errors.
  }
}

function stripSystemDarkMediaRulesFromOwner(owner: CSSStyleSheet | CSSGroupingRule) {
  let rules: CSSRuleList;

  try {
    rules = owner.cssRules;
  } catch {
    return;
  }

  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];

    if (isSystemDarkMediaRule(rule)) {
      deleteRuleAt(owner, index);
      continue;
    }

    const nestedRules = getNestedRules(rule);
    if (nestedRules && nestedRules.length > 0) {
      stripSystemDarkMediaRulesFromOwner(rule as CSSGroupingRule);
    }
  }
}

function stripSystemDarkMediaRules() {
  if (typeof document === "undefined") return;

  for (const sheet of Array.from(document.styleSheets)) {
    stripSystemDarkMediaRulesFromOwner(sheet);
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  stripSystemDarkMediaRules();

  const isDark = theme === "dark";

  if (!isDark) {
    removeAllDarkClasses();
  }

  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.toggle("dark", isDark);

  const appRoot = document.getElementById("root");
  appRoot?.classList.toggle("dark", isDark);

  document.querySelectorAll(".projectpage-widget-root").forEach((root) => {
    root.classList.toggle("dark", isDark);
  });

  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.body.style.colorScheme = theme;
}

function scheduleLazyCssThemeApply(theme: Theme) {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => applyTheme(theme));
  window.setTimeout(() => applyTheme(theme), 50);
  window.setTimeout(() => applyTheme(theme), 250);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let pendingFrame: number | null = null;

    const scheduleThemeApply = () => {
      if (pendingFrame != null) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = null;
        applyTheme(theme);
      });
    };

    applyTheme(theme);

    const observer = new MutationObserver((mutations) => {
      const shouldReapplyTheme = mutations.some((mutation) => {
        if (mutation.type === "childList") return mutation.addedNodes.length > 0;
        return mutation.type === "attributes" && mutation.attributeName === "class";
      });

      if (shouldReapplyTheme) {
        scheduleLazyCssThemeApply(theme);
        scheduleThemeApply();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
    });

    const observeRoot = document.getElementById("root") ?? document.body;
    observer.observe(observeRoot, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });

    if (observeRoot !== document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
      });
    }

    const handleLoad = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const tagName = target.tagName.toLowerCase();
      if (tagName === "link" || tagName === "style") {
        scheduleLazyCssThemeApply(theme);
      }
    };

    document.head.addEventListener("load", handleLoad, true);
    scheduleLazyCssThemeApply(theme);

    return () => {
      observer.disconnect();
      document.head.removeEventListener("load", handleLoad, true);
      if (pendingFrame != null) {
        window.cancelAnimationFrame(pendingFrame);
      }
    };
  }, [theme]);

  const setThemeMode = useCallback((nextTheme: Theme) => {
    writeStoredTheme(nextTheme);
    setTheme(nextTheme);
    applyTheme(nextTheme);
    scheduleLazyCssThemeApply(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      const nextTheme: Theme = prevTheme === "dark" ? "light" : "dark";

      writeStoredTheme(nextTheme);
      applyTheme(nextTheme);
      scheduleLazyCssThemeApply(nextTheme);

      return nextTheme;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
