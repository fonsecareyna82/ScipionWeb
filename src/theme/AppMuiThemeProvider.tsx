// The MUI theme of the app, following the light/dark theme of ThemeContext.
import type React from "react";
import { useMemo } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";

import { useTheme } from "@/context/ThemeContext";
import { createAppTheme } from "./muiTheme";

export function AppMuiThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const muiTheme = useMemo(() => createAppTheme(theme), [theme]);
  return <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>;
}
