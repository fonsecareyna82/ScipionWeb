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
        minWidth: 0,
        px: 1.75,
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
  // Buttons: plain and flat, the same height everywhere, never smaller than 13.5 px
  const buttonBase = useMemo(() => ({
    textTransform: "none",
    fontSize: Math.max(buttonFontSize, 13.5),
    fontWeight: 600,
    lineHeight: 1.2,
    minHeight: 36,
    px: 1.75,
    borderRadius: "8px",
    boxShadow: "none",
    "& .MuiButton-startIcon": { mr: 0.75, ml: -0.25 },
  }) as const, [buttonFontSize]);

  const actionButtonSx = useMemo(() => {
    // actionButtonSx
    return {
      ...buttonBase,
      color: colors.text,
      bgcolor: isDarkMode ? "rgba(255,255,255,0.03)" : "#ffffff",
      border: "1px solid",
      borderColor: isDarkMode ? "rgba(255,255,255,0.16)" : "rgba(17,24,39,0.16)",
      boxShadow: isDarkMode ? "none" : "0 1px 2px rgba(16,24,40,0.05)",
      "&:hover": {
        bgcolor: colors.hover,
        borderColor: isDarkMode ? "rgba(255,255,255,0.28)" : "rgba(17,24,39,0.28)",
        boxShadow: isDarkMode ? "none" : "0 1px 2px rgba(16,24,40,0.05)",
      },
      "&.Mui-disabled": {
        color: colors.muted,
        borderColor: colors.border,
        bgcolor: "transparent",
        boxShadow: "none",
        opacity: 0.6,
      },
    } as const;
  }, [buttonBase, colors.border, colors.hover, colors.muted, colors.text, isDarkMode]);
  const saveButtonSx = useMemo(() => {
    // saveButtonSx
    return {
      ...buttonBase,
      bgcolor: colors.primary,
      color: colors.primaryContrast,
      border: "1px solid",
      borderColor: colors.primary,
      boxShadow: isDarkMode ? "none" : "0 1px 2px rgba(16,24,40,0.10)",
      "&:hover": { bgcolor: colors.primary, filter: "brightness(0.92)", boxShadow: "none" },
      "&.Mui-disabled": {
        bgcolor: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)",
        borderColor: "transparent",
        color: colors.muted,
      },
    } as const;
  }, [buttonBase, colors.muted, colors.primary, colors.primaryContrast, isDarkMode]);

  return { colors, fieldSx, selectSx, menuPaperSx, cardHeaderSx, cardSx, dividerSx, tabsSx, actionButtonSx,
           saveButtonSx };
}
