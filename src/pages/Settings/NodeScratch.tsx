import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Brush, HardDrive, Pencil } from "lucide-react";
import toast from "react-hot-toast";

import { cleanNodeScratch, saveNodeScratch, type NodeScratch as Scratch } from "@/api/settings";
import SettingsDialog from "./SettingsDialog";
import { useSettingsStyles } from "./useSettingsStyles";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

/**
 * A machine's scratch: the fast local disk (an SSD) where its protocols put their temporary files, and where those that
 * can copy their input to read it faster. Shown as that machine sees it; who manages the settings sets or unsets it.
 */
function ago(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

export default function NodeScratch({ hostname, scratch, canEdit, canClean = false, onSaved }: {
  hostname: string;
  scratch?: Scratch;
  canEdit: boolean;
  // Who manages the jobs may ask for a cleaning now
  canClean?: boolean;
  onSaved?: () => void;
}) {
  const { actionButtonSx, colors } = useSettingsStyles(useTheme().palette.mode === "dark");
  const note = { fontSize: 13.5, color: colors.muted } as const;
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState(scratch?.path ?? "");
  const [busy, setBusy] = useState(false);
  const current = scratch?.path ?? null;
  const last = scratch?.lastCleanup ?? null;

  const clean = async () => {
    setBusy(true);
    try {
      await cleanNodeScratch(hostname);
      toast.success(`${hostname} is cleaning its scratch: the result shows here in a moment.`);
      window.setTimeout(() => onSaved?.(), 4000);
    } catch (e: any) {
      toast.error(String(e?.message || "The machine could not be asked to clean its scratch"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveNodeScratch(hostname, path.trim());
      toast.success(`${saved.path ? `Scratch set to ${saved.path}` : "Scratch removed"} on ${hostname}. Restart its protocol worker for it to take effect.`,
        { duration: 9000 });
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to save the scratch"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid={`scratch-${hostname}`}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
        <HardDrive size={15} />
        <Typography sx={note}>Scratch (fast local disk)</Typography>
        {canEdit && (
          <Button size="small" startIcon={<Pencil size={14} />} onClick={() => { setPath(current ?? ""); setEditing(true); }}
                  sx={{ ...actionButtonSx, ml: "auto !important" }} aria-label={`Change the scratch of ${hostname}`}>
            Change
          </Button>
        )}
      </Stack>
      {!current ? (
        <Typography sx={note}>
          None: the protocols' temporary files stay in the project.
        </Typography>
      ) : scratch?.error ? (
        <Alert severity="warning" sx={{ py: 0 }}>{current}: {scratch.error}</Alert>
      ) : (
        <Typography sx={{ fontSize: 14, color: colors.text }}>
          <Box component="span" sx={{ fontFamily: "monospace" }}>{current}</Box>
          {scratch?.freeBytes != null ? ` · ${formatBytes(scratch.freeBytes)} free of ${formatBytes(scratch.totalBytes)}` : ""}
        </Typography>
      )}
      {current && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
          <Typography sx={note} data-testid={`scratch-last-${hostname}`}>
            {last
              ? `Cleaned ${ago(last.at)}: ${last.removed.length} folder${last.removed.length === 1 ? "" : "s"} removed`
                + (last.freedBytes ? `, ${formatBytes(last.freedBytes)} freed` : "")
                + (last.errors.length ? ` · ${last.errors.join("; ")}` : "")
              : "Cleaned every hour: what crashed or deleted protocols left there."}
          </Typography>
          {canClean && (
            <Button size="small" startIcon={<Brush size={14} />} disabled={busy}
                    onClick={() => void clean()} sx={actionButtonSx}
                    aria-label={`Clean the scratch of ${hostname} now`}>
              Clean now
            </Button>
          )}
        </Stack>
      )}

      {editing && (
        <SettingsDialog
          title={`Scratch of ${hostname}`}
          description="A folder on a fast disk local to this machine (an SSD). The protocols that run here put their temporary files there, and those that can copy their input data there to read it faster. Empty: none."
          icon={<HardDrive size={20} color="#93c5fd" />}
          confirmLabel="Save"
          busyLabel="Saving…"
          busy={busy}
          maxWidth="sm"
          actionButtonSx={actionButtonSx}
          closeButton
          onConfirm={() => void save()}
          onClose={() => setEditing(false)}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center"
                   sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, px: 1.5, py: 1 }}>
              <HardDrive size={16} style={{ color: colors.muted, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13.5, color: colors.muted }}>Now</Typography>
              <Typography sx={{ fontSize: 14, fontFamily: "monospace", color: colors.text, wordBreak: "break-all" }}>
                {current || "no scratch"}
              </Typography>
            </Stack>
            <TextField size="small" fullWidth label="Folder" value={path} placeholder="/scratch/scipion"
                       inputProps={{ style: { fontFamily: "monospace" } }}
                       helperText="Empty: this machine has no scratch."
                       FormHelperTextProps={{ sx: { fontSize: 13.5 } }}
                       onChange={(e) => setPath(e.target.value)} />
            <Alert severity="info" sx={{ fontSize: 13.5 }}>
              The folder must exist on this machine and the protocols must be able to write in it. The change takes
              effect once this machine's protocol worker is restarted.
            </Alert>
          </Stack>
        </SettingsDialog>
      )}
    </Box>
  );
}
