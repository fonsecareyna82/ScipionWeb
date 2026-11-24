// src/components/projects/ProtocolActionDialogs.tsx
// The look of the dialogs the project's graph asks with (rename, reset, restart, continue, stop, delete): the
// protocols they act on, each with its state, and those after them that the action reaches.
import { useState, type ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import SettingsDialog from "@/pages/Settings/SettingsDialog";

export type ProtocolRef = { id: string; label: string; status?: string };

const STATUS_COLORS: Record<string, string> = {
  running: "#a16207",
  saved: "#2563eb",
  launched: "#2563eb",
  finished: "#16a34a",
  failed: "#dc2626",
  aborted: "#dc2626",
  interactive: "#b45309",
  scheduled: "#a16207",
  new: "#2563eb",
};

const SHOWN_AT_ONCE = 6;

export function useDialogColors() {
  const isDark = useIsDark();
  return isDark
    ? { border: "rgba(255,255,255,0.14)", text: "#f1f5f9", muted: "#94a3b8", soft: "rgba(255,255,255,0.04)" }
    : { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", soft: "#f8fafc" };
}

/** A protocol in a line: its id, its name and its state. */
export function ProtocolLine({ protocol }: { protocol: ProtocolRef }) {
  const colors = useDialogColors();
  const status = String(protocol.status ?? "").toLowerCase();
  const color = STATUS_COLORS[status] ?? colors.muted;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, py: 0.6 }}>
      <Box component="span" sx={{ flexShrink: 0, px: 0.9, borderRadius: 10, fontFamily: "monospace", fontSize: 12.5, fontWeight: 700,
                                  lineHeight: 1.8, color: colors.muted, border: `1px solid ${colors.border}` }}>
        {protocol.id}
      </Box>
      <Typography sx={{ fontSize: 14.5, color: colors.text, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap" }} title={protocol.label}>
        {protocol.label}
      </Typography>
      {status && (
        <Box component="span" sx={{ flexShrink: 0, px: 1, borderRadius: 10, fontSize: 12.5, fontWeight: 700, lineHeight: 1.8,
                                    textTransform: "capitalize", color, bgcolor: `${color}1f` }}>
          {status}
        </Box>
      )}
    </Stack>
  );
}

/** Protocols in a box with a coloured band: those the action is on, or those it reaches. */
export function ProtocolBox({ title, protocols, band, note, collapsible = false }: {
  title: string;
  protocols: ProtocolRef[];
  band: string;
  note?: ReactNode;
  collapsible?: boolean;
}) {
  const colors = useDialogColors();
  const [open, setOpen] = useState(!collapsible);
  const [all, setAll] = useState(false);
  const shown = all ? protocols : protocols.slice(0, SHOWN_AT_ONCE);
  return (
    <Box role="group" aria-label={title}
         sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${band}`, borderRadius: 2, px: 1.5, py: 1 }}>
      <Stack direction="row" alignItems="center" spacing={0.75}
             sx={{ cursor: collapsible ? "pointer" : "default" }}
             onClick={() => collapsible && setOpen((value) => !value)}>
        {collapsible && (open ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />)}
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{title}</Typography>
      </Stack>
      {note && <Typography component="div" sx={{ fontSize: 13.5, color: colors.muted, mt: 0.25 }}>{note}</Typography>}
      {open && (
        <Box sx={{ mt: 0.5 }}>
          {shown.map((protocol) => <ProtocolLine key={protocol.id} protocol={protocol} />)}
          {protocols.length > SHOWN_AT_ONCE && (
            <Button size="small" sx={{ textTransform: "none", fontSize: 13.5, px: 0.5, minWidth: 0 }}
                    onClick={() => setAll((value) => !value)}>
              {all ? "Show fewer" : `Show all ${protocols.length}`}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

/** One of the graph's dialogs: in the page's layer, and its clicks kept away from the graph under it. */
export function ProtocolActionDialog({
  container, title, description, icon, confirmLabel, busyLabel, busy, destructive, confirmDisabled, saveColor, onConfirm,
  onClose, children,
}: {
  container?: HTMLElement | null;
  title: string;
  description?: string;
  icon: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy: boolean;
  destructive?: boolean;
  confirmDisabled?: boolean;
  /** The colour of the confirm button, when it is neither the usual one nor a deletion. */
  saveColor?: string;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    // A dialog's events go up the page's tree: the graph must not take its clicks as its own
    <div onClick={(e) => e.stopPropagation()} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
         onKeyDown={(e) => e.stopPropagation()} style={{ display: "contents" }}>
      <SettingsDialog
        container={container}
        title={title}
        description={description}
        icon={icon}
        confirmLabel={confirmLabel}
        busyLabel={busyLabel}
        busy={busy}
        destructive={destructive}
        confirmDisabled={confirmDisabled}
        saveButtonSx={saveColor ? { textTransform: "none", borderRadius: 3, boxShadow: "none", bgcolor: saveColor,
                                    "&:hover": { bgcolor: saveColor, filter: "brightness(0.92)", boxShadow: "none" } } : undefined}
        maxWidth="sm"
        closeButton
        onConfirm={onConfirm}
        onClose={onClose}
      >
        <Stack spacing={1.5}>{children}</Stack>
      </SettingsDialog>
    </div>
  );
}
