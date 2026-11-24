// src/components/projects/ProjectDialogs.tsx
// Renaming and deleting a project, the same from its card and from its row in the list.
import type { ReactElement } from "react";
import { Alert, Box, Stack, TextField, Typography } from "@mui/material";
import { FolderKanban, HardDrive, Pencil, Play, Trash2 } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import SettingsDialog from "@/pages/Settings/SettingsDialog";

function useColors() {
  return useIsDark()
    ? { border: "rgba(255,255,255,0.14)", text: "#f1f5f9", muted: "#94a3b8" }
    : { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };
}

export function RenameProjectDialog({ open, name, description, error, busy = false, onName, onDescription, onSave, onClose }: {
  open: boolean;
  name: string;
  description: string;
  error?: string;
  busy?: boolean;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <SettingsDialog
      title="Rename project"
      description="Its name and description in the list. Its folder on disk keeps its name."
      icon={<Pencil size={20} color="white" />}
      confirmLabel="Save changes"
      busyLabel="Saving…"
      busy={busy}
      confirmDisabled={!name.trim()}
      maxWidth="sm"
      closeButton
      onConfirm={onSave}
      onClose={onClose}
    >
      <Stack spacing={2}>
        <TextField size="small" fullWidth autoFocus label="Name" value={name} disabled={busy}
                   onChange={(e) => onName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSave(); } }} />
        <TextField size="small" fullWidth multiline minRows={3} label="Description" value={description} disabled={busy}
                   placeholder="What the project is for (optional, at least 3 characters)"
                   onChange={(e) => onDescription(e.target.value)} />
        {error ? <Alert severity="error" sx={{ fontSize: 13.5 }}>{error}</Alert> : null}
      </Stack>
    </SettingsDialog>
  );
}

export function DeleteProjectDialog({ open, name, protocols, diskUsage, statusCounts, busy = false, onConfirm, onClose }: {
  open: boolean;
  name: string;
  protocols?: string | number | null;
  diskUsage?: string | number | null;
  statusCounts?: Record<string, number> | null;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  if (!open) return null;
  const running = (statusCounts?.running ?? 0) + (statusCounts?.launched ?? 0) + (statusCounts?.scheduled ?? 0);
  const count = protocols == null || protocols === "" ? null : Number(protocols);
  const facts: [ReactElement, string][] = [
    ...(count != null && Number.isFinite(count) ? [[<FolderKanban size={15} />, `${count} protocol${count === 1 ? "" : "s"}`] as [ReactElement, string]] : []),
    ...(diskUsage != null && diskUsage !== "" ? [[<HardDrive size={15} />, String(diskUsage)] as [ReactElement, string]] : []),
  ];
  return (
    <SettingsDialog
      title="Delete project?"
      description="Its folder, every protocol and every result go with it. This cannot be undone."
      icon={<Trash2 size={20} color="#fca5a5" />}
      confirmLabel="Delete"
      busyLabel="Deleting…"
      busy={busy}
      destructive
      maxWidth="xs"
      closeButton
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <Stack spacing={1.25}>
        <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
          <Typography sx={{ fontSize: 15.5, fontWeight: 800, color: colors.text, wordBreak: "break-word" }}>{name}</Typography>
          {facts.length > 0 && (
            <Stack direction="row" spacing={2} sx={{ mt: 0.5, color: colors.muted }}>
              {facts.map(([icon, text]) => (
                <Stack key={text} direction="row" spacing={0.6} alignItems="center">
                  {icon}
                  <Typography sx={{ fontSize: 13.5, color: colors.text }}>{text}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
        {running > 0 && (
          <Alert severity="warning" icon={<Play size={18} />} sx={{ fontSize: 13.5 }}>
            {running === 1 ? "One of its protocols is" : `${running} of its protocols are`} running or waiting to run.
          </Alert>
        )}
      </Stack>
    </SettingsDialog>
  );
}
