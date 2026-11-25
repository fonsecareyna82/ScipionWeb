// The frame of every wizard dialog, in the web's dialog look: a dark header with the wand, what the wizard is
// for and an X, then its content and, at the foot, its buttons.
import { useId, type ReactNode } from "react";
import { Box, Button, Dialog, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import { Wand2, X } from "lucide-react";

const HEADER_BACKGROUND = "#333d49";

export const WIZARD_TEXT = { body: 15, note: 13.5 } as const;

/** The wizard's main button (Select, Apply, Yes). */
export const WIZARD_PRIMARY_SX = {
  textTransform: "none", borderRadius: 3, boxShadow: "none", px: 2.25, fontWeight: 600, bgcolor: HEADER_BACKGROUND,
  "&:hover": { bgcolor: "#25303b", boxShadow: "none" },
} as const;

/** Its other buttons (Cancel, No, the choices). */
export const WIZARD_SECONDARY_SX = { textTransform: "none", borderRadius: 3, px: 2, fontWeight: 600 } as const;

export function WizardButton({ primary = false, children, ...props }: {
  primary?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <Button variant={primary ? "contained" : "outlined"} sx={primary ? WIZARD_PRIMARY_SX : WIZARD_SECONDARY_SX} {...props}>
      {children}
    </Button>
  );
}

export default function WizardShell({
  title, subtitle, children, actions, onClose, busy = false, closable = true, maxWidth = "sm", height, contentSx,
  inFrontOfResults = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  /** A bar under the header while the wizard works on the server. */
  busy?: boolean;
  closable?: boolean;
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl";
  height?: string;
  contentSx?: Record<string, unknown>;
  /** Results it opens go in floating windows in front of it (see FloatingWindow.css). */
  inFrontOfResults?: boolean;
}) {
  // Its own id: a wizard's dialog may follow another one before the first has gone
  const titleId = `wizard-title-${useId()}`;
  return (
    <Dialog open onClose={closable ? onClose : undefined} maxWidth={maxWidth} fullWidth aria-labelledby={titleId}
      className={inFrontOfResults ? "sfw-launcher-dialog" : undefined}
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", boxShadow: 12, display: "flex", flexDirection: "column",
                          maxHeight: "calc(100% - 48px)", ...(height ? { height } : {}) } }}>
      <Box sx={{ bgcolor: HEADER_BACKGROUND, color: "white", px: 2, py: 1.75, flexShrink: 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                     borderRadius: 2, bgcolor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <Wand2 size={20} color="white" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography id={titleId} sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>{title}</Typography>
            {subtitle && <Typography noWrap sx={{ fontSize: 14, color: "rgb(229,231,235)" }}>{subtitle}</Typography>}
          </Box>
          {closable && onClose && (
            <Tooltip arrow title="Close">
              <span>
                <IconButton aria-label="Close" disabled={busy} onClick={onClose}
                  sx={{ color: "rgb(229,231,235)", "&:hover": { bgcolor: "rgba(255,255,255,0.1)" } }}>
                  <X size={20} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Box>
      <Box sx={{ height: 4, flexShrink: 0 }}>{busy && <LinearProgress aria-label="The wizard is working" />}</Box>
      <Box sx={{ px: 2.5, pt: 1.75, pb: 2.5, flex: "1 1 auto", minHeight: 0, overflowY: "auto", ...contentSx }}>
        {children}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center"
          sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Dialog>
  );
}
