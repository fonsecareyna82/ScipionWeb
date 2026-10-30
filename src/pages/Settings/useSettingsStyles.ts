import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";

// Settings' own sizes; other pages built like it (Facility) ask for bigger ones
export type SettingsFontSizes = { field: number; helper: number; button: number };
export const SETTINGS_FONT_SIZES: SettingsFontSizes = { field: 14, helper: 12.75, button: 12 };

/** The look of the Settings panels (cards, fields, menus, tabs, buttons), shared by the pages built like them. */
export function useSettingsStyles(isDarkMode: boolean, fontSizes: SettingsFontSizes = SETTINGS_FONT_SIZES) {
  const muiTheme = useTheme();
  const { field: fieldFontSize, helper: helperFontSize, button: buttonFontSize } = fontSizes;

  const colors = useMemo(() => {
    // colors
    const border = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)";
    const text = isDarkMode ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.92)";
    const muted = isDarkMode ? "rgba(255,255,255,0.62)" : "rgba(17,24,39,0.62)";
    const surface = isDarkMode ? "rgba(255,255,255,0.03)" : "#ffffff";
    const card = isDarkMode ? "rgba(255,255,255,0.02)" : "#ffffff";
    const hover = isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)";
    const menu = isDarkMode ? "#0b1220" : "#ffffff";
    const primary = muiTheme.palette.primary.main;

    return {
      border,
      text,
      muted,
      surface,
      card,
      hover,
      menu,
      primary,
      primaryContrast: muiTheme.palette.getContrastText(primary),
    } as const;
  }, [isDarkMode, muiTheme.palette.primary.main, muiTheme.palette.getContrastText]);
  const fieldSx = useMemo(() => {
    // fieldSx
    return {
      "& .MuiInputLabel-root": {
        fontSize: fieldFontSize,
        color: colors.muted,
      },

      "& .MuiInputBase-input": {
        fontSize: fieldFontSize,
        color: colors.text,
      },

      "& .MuiFormHelperText-root": {
        fontSize: helperFontSize,
        color: colors.muted,
      },

      "& .MuiInputAdornment-root": {
        fontSize: helperFontSize,
        color: colors.muted,
      },
      "& .MuiOutlinedInput-notchedOutline": { borderColor: colors.border },
      "& .MuiOutlinedInput-root": {
        bgcolor: isDarkMode ? "rgba(255,255,255,0.02)" : "transparent",
        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : colors.border },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: colors.primary },
      },
      "& .MuiSvgIcon-root": { color: colors.muted },
    } as const;
  }, [colors.border, colors.muted, colors.primary, colors.text, isDarkMode, fieldFontSize, helperFontSize]);
  const selectSx = useMemo(() => {
    // selectSx
    return {
      ...fieldSx,
      "& .MuiSelect-select": { fontSize: fieldFontSize, color: colors.text },
    } as const;
  }, [colors.text, fieldSx, fieldFontSize]);
  const menuPaperSx = useMemo(() => {
    // menuPaperSx
    return {
      bgcolor: colors.menu,
      color: colors.text,
      border: "1px solid",
      borderColor: colors.border,
      "& .MuiMenuItem-root": { fontSize: fieldFontSize },
    } as const;
  }, [colors.border, colors.menu, colors.text, fieldFontSize]);
  const cardHeaderSx = useMemo(() => {
    // cardHeaderSx
    return {
      pb: 0,
      "& .MuiCardHeader-title": {
        fontSize: 17,
        fontWeight: 900,
        lineHeight: 1.25,
        color: colors.text,
      },

      "& .MuiCardHeader-subheader": {
        fontSize: 13.5,
        lineHeight: 1.45,
        color: colors.muted,
        mt: 0.4,
      },
    } as const;
  }, [colors.muted, colors.text]);
  const cardSx = useMemo(() => {
    // cardSx
    return {
      borderRadius: 2,
      bgcolor: colors.card,
      borderColor: colors.border,
      color: colors.text,
    } as const;
  }, [colors.border, colors.card, colors.text]);
  const dividerSx = useMemo(() => {
    // dividerSx
    return { borderColor: colors.border, opacity: 1 } as const;
  }, [colors.border]);
  const tabsSx = useMemo(() => {
    // tabsSx
    return {
      px: 1,
      bgcolor: "transparent",
      "& .MuiTab-root": {
        minHeight: 46,
        fontSize: 14,
        textTransform: "none",
        fontWeight: 800,
        color: colors.muted,
        // An icon at the start keeps the tab as low as one with text only
        gap: 0.75,
        "& .MuiTab-iconWrapper": { m: 0 },
      },
      "& .MuiTab-root.Mui-selected": {
        color: colors.text,
      },
      "& .MuiTabs-indicator": {
        height: 3,
        borderRadius: 999,
        backgroundColor: colors.primary,
      },
    } as const;
  }, [colors.muted, colors.primary, colors.text]);
  const actionButtonSx = useMemo(() => {
    // actionButtonSx
    const bg = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(17,24,39,0.03)";
    const bgHover = isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
    const inset = isDarkMode ? "0 1px 0 rgba(255,255,255,0.06) inset" : "0 1px 0 rgba(255,255,255,0.7) inset";
    const shadow = isDarkMode ? "0 8px 18px rgba(0,0,0,0.28)" : "0 10px 22px rgba(17,24,39,0.10)";

    return {
      textTransform: "none",
      fontSize: buttonFontSize,
      color: colors.text,
      borderColor: colors.border,
      borderRadius: 3,
      bgcolor: bg,
      backgroundImage: isDarkMode
        ? "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.00))"
        : "linear-gradient(180deg, rgba(255,255,255,0.80), rgba(255,255,255,0.10))",
      boxShadow: `${inset}, ${shadow}`,
      "&:hover": {
        borderColor: isDarkMode ? "rgba(255,255,255,0.22)" : colors.border,
        bgcolor: bgHover,
        boxShadow: `${inset}, ${isDarkMode ? "0 10px 22px rgba(0,0,0,0.34)" : "0 12px 26px rgba(17,24,39,0.14)"}`,
      },
    } as const;
  }, [colors.border, colors.text, isDarkMode, buttonFontSize]);
  const saveButtonSx = useMemo(() => {
    // saveButtonSx
    const inset = "0 1px 0 rgba(255,255,255,0.18) inset";
    const shadow = isDarkMode ? "0 12px 26px rgba(0,0,0,0.30)" : "0 12px 26px rgba(17,24,39,0.16)";

    return {
      textTransform: "none",
      fontSize: buttonFontSize,
      borderRadius: 3,
      bgcolor: colors.primary,
      color: colors.primaryContrast,
      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.00))",
      boxShadow: `${inset}, ${shadow}`,
      "&:hover": {
        bgcolor: colors.primary,
        filter: "brightness(0.96)",
        boxShadow: `${inset}, ${isDarkMode ? "0 14px 30px rgba(0,0,0,0.36)" : "0 14px 30px rgba(17,24,39,0.20)"}`,
      },
    } as const;
  }, [colors.primary, colors.primaryContrast, isDarkMode, buttonFontSize]);

  return { colors, fieldSx, selectSx, menuPaperSx, cardHeaderSx, cardSx, dividerSx, tabsSx, actionButtonSx,
           saveButtonSx };
}
