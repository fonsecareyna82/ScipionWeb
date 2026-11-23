// The MUI theme of the app, following the light/dark theme of ThemeContext and the user's display preferences.
import type React from "react";
import { useMemo } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";

import { useTheme } from "@/context/ThemeContext";
import { useDisplayPreferences } from "./displayPreferences";
import { createAppTheme } from "./muiTheme";

export function AppMuiThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // Rebuilt when the user changes their text size or density
  const display = useDisplayPreferences();
  const muiTheme = useMemo(() => createAppTheme(theme), [theme, display]);
  return <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>;
}
