// The MUI theme of the whole app, from the same colours as the CSS (src/theme/tokens.ts).
import { createTheme, type Theme, type ThemeOptions } from "@mui/material/styles";

import { APP_TOKENS, type ThemeMode } from "./tokens";

function paletteFor(mode: ThemeMode): ThemeOptions["palette"] {
  const t = APP_TOKENS[mode];
  if (mode === "light") {
    // The light theme keeps MUI's own colours: only what the app sets elsewhere.
    return {
      mode,
      divider: t.border,
      background: { default: t.bg, paper: t.surface },
    };
  }
  return {
    mode,
    // Saturated mains: buttons keep white text readable on the dark panels
    // (MUI's dark defaults are pastels meant for dark text).
    primary: { main: "#3b82f6", contrastText: "#ffffff" },
    secondary: { main: "#a855f7", contrastText: "#ffffff" },
    success: { main: "#16a34a", contrastText: "#ffffff" },
    warning: { main: "#d97706", contrastText: "#ffffff" },
    error: { main: "#dc2626", contrastText: "#ffffff" },
    info: { main: "#0284c7", contrastText: "#ffffff" },
    divider: t.border,
    background: { default: t.bg, paper: t.surface },
    text: { primary: t.text, secondary: t.textMuted, disabled: t.textDisabled },
    action: {
      hover: "rgba(148, 163, 184, 0.10)",
      selected: "rgba(96, 165, 250, 0.16)",
      disabled: t.textDisabled,
      disabledBackground: "rgba(148, 163, 184, 0.12)",
    },
  };
}

/** The app theme for a mode; extra options (e.g. portal containers) are merged on top. */
export function createAppTheme(mode: ThemeMode, ...extra: ThemeOptions[]): Theme {
  const t = APP_TOKENS[mode];
  const dark = mode === "dark";
  return createTheme(
    {
      palette: paletteFor(mode),
      components: {
        // Flat panels: MUI lightens dark papers with an overlay gradient by elevation.
        MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
        MuiTooltip: dark
          ? { styleOverrides: { tooltip: { backgroundColor: t.surface3, color: t.text, border: `1px solid ${t.borderStrong}` } } }
          : {},
        MuiTableCell: { styleOverrides: { root: { borderColor: t.border } } },
        MuiDivider: { styleOverrides: { root: { borderColor: t.border } } },
        MuiOutlinedInput: dark
          ? { styleOverrides: { notchedOutline: { borderColor: t.borderStrong } } }
          : {},
        MuiMenu: dark
          ? { styleOverrides: { paper: { border: `1px solid ${t.border}` } } }
          : {},
      },
    },
    ...extra,
  );
}
