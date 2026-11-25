// The frame of the web's dialogs opened from inside a viewer or a wizard: a dark header with an icon, a title,
// what the dialog is for and an X, then its content and, at its foot, its buttons. The same look as the
// settings and project dialogs (SettingsDialog), for dialogs whose content and buttons vary.
import { useId, type ReactNode } from "react";
import { Box, Button, Dialog, IconButton, LinearProgress, Stack, Tooltip, Typography, type DialogProps } from "@mui/material";
import { X } from "lucide-react";

const HEADER_BACKGROUND = "#333d49";

export const DIALOG_TEXT = { body: 15, note: 13.5 } as const;

const PRIMARY_SX = {
  textTransform: "none", borderRadius: 3, boxShadow: "none", px: 2.25, fontWeight: 600, bgcolor: HEADER_BACKGROUND,
  "&:hover": { bgcolor: "#25303b", boxShadow: "none" },
} as const;

const SECONDARY_SX = { textTransform: "none", borderRadius: 3, px: 2, fontWeight: 600 } as const;

// The red of the web's delete buttons (from red through rose to orange)
const DANGER_SX = {
  ...SECONDARY_SX, color: "white", backgroundImage: "linear-gradient(90deg, #dc2626, #e11d48, #ea580c)", boxShadow: "none",
  "&:hover": { filter: "brightness(0.98)", boxShadow: 3 },
} as const;

/** A button of a dialog's foot: the main one, a destructive one, or the others (Cancel, Close). */
export function DialogButton({ kind = "secondary", children, startIcon, onClick, disabled, type }: {
  kind?: "primary" | "secondary" | "danger";
  children: ReactNode;
  startIcon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <Button variant={kind === "secondary" ? "outlined" : "contained"} startIcon={startIcon} onClick={onClick}
      disabled={disabled} type={type}
      sx={kind === "primary" ? PRIMARY_SX : kind === "danger" ? DANGER_SX : SECONDARY_SX}>
      {children}
    </Button>
  );
}

export default function DialogFrame({
  open = true, icon, title, subtitle, children, actions, footerNote, onClose, busy = false, closable = true,
  closeLabel = "Close", maxWidth = "sm", height, contentSx, paperSx, headerExtra, className, container, dialogProps,
}: {
  open?: boolean;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Something at the left of the foot: a count, a note. */
  footerNote?: ReactNode;
  onClose?: () => void;
  /** A bar under the header while something runs. */
  busy?: boolean;
  closable?: boolean;
  /** The accessible name of the header's X. */
  closeLabel?: string;
  /** false: the paper sets its own width (paperSx). */
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
  height?: string;
  contentSx?: Record<string, unknown>;
  paperSx?: Record<string, unknown>;
  /** Controls in the header, before its X (a tool's own buttons). */
  headerExtra?: ReactNode;
  className?: string;
  container?: HTMLElement | null;
  /** What else the dialog needs (its backdrop, focus handling…). */
  dialogProps?: Partial<DialogProps>;
}) {
  // Its own id: a dialog may open over another
  const titleId = `dialog-frame-title-${useId()}`;
  return (
    <Dialog open={open} onClose={closable ? onClose : undefined} maxWidth={maxWidth} fullWidth aria-labelledby={titleId}
      className={className} container={container ?? undefined} {...dialogProps}
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", boxShadow: 12, display: "flex", flexDirection: "column",
                          maxHeight: "calc(100% - 48px)", ...(height ? { height } : {}), ...paperSx } }}>
      <Box sx={{ bgcolor: HEADER_BACKGROUND, color: "white", px: 2, py: 1.75, flexShrink: 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                     borderRadius: 2, bgcolor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                     color: "white" }}>
            {icon}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography id={titleId} component="h2" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, wordBreak: "break-word" }}>
              {title}
            </Typography>
            {subtitle && <Typography sx={{ fontSize: 14, color: "rgb(229,231,235)", wordBreak: "break-word" }}>{subtitle}</Typography>}
          </Box>
          {headerExtra}
          {closable && onClose && (
            <Tooltip arrow title="Close">
              <span>
                <IconButton aria-label={closeLabel} disabled={busy} onClick={onClose}
                  sx={{ color: "rgb(229,231,235)", "&:hover": { bgcolor: "rgba(255,255,255,0.1)" } }}>
                  <X size={20} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Box>
      <Box sx={{ height: 4, flexShrink: 0 }}>{busy && <LinearProgress aria-label="Working" />}</Box>
      <Box sx={{ px: 2.5, pt: 1.75, pb: 2.5, flex: "1 1 auto", minHeight: 0, overflowY: "auto", ...contentSx }}>
        {children}
      </Box>
      {(actions || footerNote) && (
        <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center"
          sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
          {footerNote && (
            <Box sx={{ mr: "auto", minWidth: 0, fontSize: DIALOG_TEXT.note, color: "var(--app-n-600)" }}>{footerNote}</Box>
          )}
          {actions}
        </Stack>
      )}
    </Dialog>
  );
}
