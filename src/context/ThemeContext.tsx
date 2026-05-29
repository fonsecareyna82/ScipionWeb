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

function stripSystemDarkMediaRules() {
  if (typeof document === "undefined") return;

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;

    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const rule = rules[index];
      const mediaRule = rule as CSSMediaRule;
      const conditionText = String(mediaRule?.conditionText ?? "").toLowerCase();

      if (
        conditionText.includes("prefers-color-scheme") &&
        conditionText.includes("dark")
      ) {
        try {
          sheet.deleteRule(index);
        } catch {
          // Ignore stylesheet mutation errors.
        }
      }
    }
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
        scheduleThemeApply();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
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

    return () => {
      observer.disconnect();
      if (pendingFrame != null) {
        window.cancelAnimationFrame(pendingFrame);
      }
    };
  }, [theme]);

  const setThemeMode = useCallback((nextTheme: Theme) => {
    writeStoredTheme(nextTheme);
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      const nextTheme: Theme = prevTheme === "dark" ? "light" : "dark";

      writeStoredTheme(nextTheme);
      applyTheme(nextTheme);

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
