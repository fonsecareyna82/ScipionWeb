import type { ReactNode } from "react";
import { Box, Button, CircularProgress, Dialog, Stack, Typography } from "@mui/material";

// The look of the web's dialogs (see the protocol dialogs of the project page): a dark header with an icon,
// a title and what the dialog does, then its content and its actions
const HEADER_BACKGROUND = "#333d49";

// Rounded as the web's buttons, when the settings page passes no style of its own
export const ROUNDED_BUTTON_SX = { textTransform: "none", borderRadius: 3 } as const;

// The red of the web's delete buttons (from red through rose to orange)
const DANGER_BUTTON_SX = {
    ...ROUNDED_BUTTON_SX,
    color: "white",
    backgroundImage: "linear-gradient(90deg, #dc2626, #e11d48, #ea580c)",
    boxShadow: "none",
    "&:hover": { filter: "brightness(0.98)", boxShadow: 3 },
} as const;

type SettingsDialogProps = {
    title: string;
    description?: ReactNode;
    icon?: ReactNode;
    children?: ReactNode;
    confirmLabel: string;
    busyLabel?: string;
    busy?: boolean;
    confirmDisabled?: boolean;
    destructive?: boolean;
    maxWidth?: "xs" | "sm" | "md";
    // A short line beside the actions (e.g. how much is chosen)
    footerNote?: ReactNode;
    // The settings page's button styles (actionButtonSx, saveButtonSx)
    actionButtonSx?: any;
    saveButtonSx?: any;
    onConfirm: () => void;
    onClose: () => void;
};

export default function SettingsDialog({
    title, description, icon, children, confirmLabel, busyLabel, busy = false, confirmDisabled = false,
    destructive = false, maxWidth = "sm", footerNote, actionButtonSx, saveButtonSx, onConfirm, onClose,
}: SettingsDialogProps) {
    return (
        <Dialog
            open
            onClose={() => !busy && onClose()}
            maxWidth={maxWidth}
            fullWidth
            aria-labelledby="settings-dialog-title"
            // Header and actions always in view: only the content scrolls when it does not fit
            PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", boxShadow: 12, display: "flex",
                                flexDirection: "column", maxHeight: "calc(100% - 48px)" } }}
        >
            <Box sx={{ bgcolor: HEADER_BACKGROUND, color: "white", px: 2, py: 1.75, flexShrink: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    {icon && (
                        <Box sx={{
                            mt: 0.25, width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center",
                            justifyContent: "center", borderRadius: 2, bgcolor: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.15)",
                        }}>
                            {icon}
                        </Box>
                    )}
                    <Box sx={{ minWidth: 0 }}>
                        <Typography id="settings-dialog-title" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>
                            {title}
                        </Typography>
                        {description && (
                            <Typography sx={{ mt: 0.5, fontSize: 14, lineHeight: 1.45, color: "rgb(229,231,235)" }}>
                                {description}
                            </Typography>
                        )}
                    </Box>
                </Stack>
            </Box>

            {children && (
                <Box sx={{ px: 2.5, py: 2.5, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>{children}</Box>
            )}

            <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center"
                   sx={{ px: 2.5, py: 1.75, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                {footerNote && (
                    <Typography sx={{ mr: "auto", fontSize: 12.5, opacity: 0.75 }}>{footerNote}</Typography>
                )}
                <Button variant="outlined" onClick={onClose} disabled={busy} sx={actionButtonSx ?? ROUNDED_BUTTON_SX}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={onConfirm}
                    disabled={busy || confirmDisabled}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={destructive ? DANGER_BUTTON_SX : saveButtonSx ?? ROUNDED_BUTTON_SX}
                >
                    {busy ? busyLabel ?? confirmLabel : confirmLabel}
                </Button>
            </Stack>
        </Dialog>
    );
}
