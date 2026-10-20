// src/components/tags/tagStyles.ts
// Colours of the tag dialogs and lists, from the theme tokens, so they follow
// the light and dark theme without branching. Tag colours are user data.
export const tagPalette = {
  panel: "var(--app-surface)",
  panelSubtle: "var(--app-surface-2)",
  row: "var(--app-surface-2)",
  rowHover: "var(--app-hover)",
  // The dark title bar of the app's dialogs, with white text in both themes.
  header: "#333d49",
  border: "var(--app-border-strong)",
  borderSoft: "var(--app-border)",
  text: "var(--app-text)",
  textMuted: "var(--app-text-subtle)",
  inputBg: "var(--app-surface)",
  accent: "var(--app-accent)",
  danger: "var(--app-danger)",
  dangerHover: "var(--app-red-50)",
  shadow: "var(--app-shadow)",
  backdrop: "rgba(15,23,42,0.32)",
} as const;

export const tagTextFieldSx = {
  "& .MuiInputBase-root": {
    borderRadius: 2,
    backgroundColor: tagPalette.inputBg,
    color: tagPalette.text,
  },
  "& .MuiInputBase-input, & .MuiInputBase-inputMultiline": {
    color: tagPalette.text,
  },
  "& .MuiInputBase-input::placeholder": {
    color: tagPalette.textMuted,
    opacity: 0.8,
  },
  "& .MuiInputLabel-root": {
    color: tagPalette.textMuted,
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: tagPalette.accent,
  },
  "& .MuiFormHelperText-root": {
    color: tagPalette.textMuted,
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: tagPalette.border,
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: tagPalette.accent,
  },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: tagPalette.accent,
  },
  "& .Mui-error .MuiOutlinedInput-notchedOutline": {
    borderColor: tagPalette.danger,
  },
} as const;

export const tagDialogPaperSx = {
  borderRadius: 4,
  overflow: "hidden",
  border: `1px solid ${tagPalette.border}`,
  backgroundImage: "none",
  backgroundColor: tagPalette.panel,
  color: tagPalette.text,
  boxShadow: tagPalette.shadow,
} as const;

export const tagOutlinedButtonSx = {
  textTransform: "none",
  minWidth: 112,
  borderRadius: 2,
  color: tagPalette.text,
  borderColor: tagPalette.border,
  backgroundColor: tagPalette.inputBg,
  "&:hover": { backgroundColor: tagPalette.rowHover, borderColor: tagPalette.accent },
} as const;
