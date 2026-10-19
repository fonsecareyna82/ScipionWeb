import fs from "node:fs";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, resolveTheme, useIsDark, useTheme } from "@/context/ThemeContext";
import { APP_TOKENS, NEUTRALS } from "@/theme/tokens";
import { createAppTheme } from "@/theme/muiTheme";

function cssTokens(block: "light" | "dark"): Record<string, string> {
  const css = fs.readFileSync("src/styles/theme-tokens.css", "utf8");
  const start = block === "light" ? css.indexOf(":root {") : css.indexOf(":root.dark,");
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--app-([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

const camel = (name: string) => name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

describe("theme tokens", () => {
  it.each(["light", "dark"] as const)("the CSS and TypeScript %s colours are the same", (mode) => {
    const css = cssTokens(mode);
    const ts = APP_TOKENS[mode] as Record<string, string>;
    expect(Object.keys(css).length).toBeGreaterThan(15);
    // Hue tints (--app-red-100...) live only in CSS: nothing in TypeScript needs them.
    const mirrored = Object.entries(css).filter(([name]) => !/^(red|amber|yellow|green|emerald|blue|indigo|sky)-\d+$/.test(name));
    for (const [name, value] of mirrored) {
      const expected = name.startsWith("n-") ? (NEUTRALS[mode] as Record<string, string>)[name.slice(2)] : ts[camel(name)];
      expect([name, expected?.toLowerCase()]).toEqual([name, value]);
    }
  });

  it("the MUI theme uses them, with flat dark panels", () => {
    const dark = createAppTheme("dark");
    expect(dark.palette.mode).toBe("dark");
    expect(dark.palette.background.paper).toBe(APP_TOKENS.dark.surface);
    expect(dark.palette.text.primary).toBe(APP_TOKENS.dark.text);
    // Extra options merge on top (e.g. the portals of an external window).
    const withPortal = createAppTheme("light", { components: { MuiMenu: { defaultProps: { disablePortal: true } } } });
    expect(withPortal.components?.MuiMenu?.defaultProps?.disablePortal).toBe(true);
    expect(withPortal.components?.MuiPaper).toBeDefined();
  });
});

describe("ThemeContext", () => {
  let systemDark = false;
  const listeners = new Set<() => void>();

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    systemDark = false;
    listeners.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() { return query.includes("dark") && systemDark; },
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function Probe() {
    const { theme, preference, setPreference, toggleTheme } = useTheme();
    const isDark = useIsDark();
    return (
      <div>
        <span data-testid="state">{`${theme}/${preference}/${isDark}`}</span>
        <button onClick={() => setPreference("system")}>system</button>
        <button onClick={toggleTheme}>toggle</button>
      </div>
    );
  }

  it("applies the stored theme to the page and remembers changes", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark/true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.dataset.theme).toBe("dark");
    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("state")).toHaveTextContent("light/light/false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("follows the system's theme live when the preference is system", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => screen.getByText("system").click());
    expect(screen.getByTestId("state")).toHaveTextContent("light/system/false");
    act(() => {
      systemDark = true;
      listeners.forEach((cb) => cb());
    });
    expect(screen.getByTestId("state")).toHaveTextContent("dark/system/true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("resolves preferences", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
