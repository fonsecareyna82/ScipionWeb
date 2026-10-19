// The interface colours in TypeScript, for what needs real values (the MUI theme,
// canvases). They mirror src/styles/theme-tokens.css; a test keeps them equal.

export type ThemeMode = "light" | "dark";

export type AppTokens = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  hover: string;
  selected: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  canvas: string;
};

/** The neutral scale (--app-n-*): the light values as they were, inverted in dark. */
export const NEUTRAL_STEPS = ["0", "25", "50", "100", "150", "200", "300", "400", "500", "600", "700", "800", "900"] as const;
export type NeutralStep = (typeof NEUTRAL_STEPS)[number];

export const NEUTRALS: Record<ThemeMode, Record<NeutralStep, string>> = {
  light: { "0": "#ffffff", "25": "#fcfcfd", "50": "#f8fafc", "100": "#f1f5f9", "150": "#e9eef5", "200": "#e2e8f0", "300": "#cbd5e1", "400": "#94a3b8", "500": "#64748b", "600": "#475569", "700": "#334155", "800": "#1e293b", "900": "#0f172a" },
  dark: { "0": "#1a2231", "25": "#1c2536", "50": "#1d2939", "100": "#243145", "150": "#28354b", "200": "#2b3648", "300": "#3a4a63", "400": "#7c879a", "500": "#98a2b3", "600": "#b4bdcb", "700": "#ccd3dd", "800": "#e4e7ec", "900": "#f2f4f7" },
};

export const APP_TOKENS: Record<ThemeMode, AppTokens> = {
  light: {
    bg: "#f9fafb",
    surface: "#ffffff",
    surface2: "#f8fafc",
    surface3: "#f1f5f9",
    hover: "#f1f5f9",
    selected: "#e0e7ff",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#475569",
    textSubtle: "#64748b",
    textDisabled: "#94a3b8",
    accent: "#2563eb",
    accentSoft: "#dbeafe",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    canvas: "#e2e8f0",
  },
  dark: {
    bg: "#101828",
    surface: "#1a2231",
    surface2: "#1d2939",
    surface3: "#243145",
    hover: "#243145",
    selected: "#263a5e",
    border: "#2b3648",
    borderStrong: "#344054",
    text: "#e4e7ec",
    textMuted: "#98a2b3",
    textSubtle: "#7c879a",
    textDisabled: "#566072",
    accent: "#60a5fa",
    accentSoft: "#1e3a5f",
    success: "#4ade80",
    warning: "#fbbf24",
    danger: "#f87171",
    canvas: "#0c111d",
  },
};

/** The CSS variable of a token, for sx and inline styles: follows the theme without re-rendering. */
export const tokenVar = {
  bg: "var(--app-bg)",
  surface: "var(--app-surface)",
  surface2: "var(--app-surface-2)",
  surface3: "var(--app-surface-3)",
  hover: "var(--app-hover)",
  selected: "var(--app-selected)",
  border: "var(--app-border)",
  borderStrong: "var(--app-border-strong)",
  text: "var(--app-text)",
  textMuted: "var(--app-text-muted)",
  textSubtle: "var(--app-text-subtle)",
  textDisabled: "var(--app-text-disabled)",
  accent: "var(--app-accent)",
  accentSoft: "var(--app-accent-soft)",
  success: "var(--app-success)",
  warning: "var(--app-warning)",
  danger: "var(--app-danger)",
  shadow: "var(--app-shadow)",
  canvas: "var(--app-canvas)",
} as const;
