import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { Brush, HardDrive, Pencil } from "lucide-react";
import toast from "react-hot-toast";

import { cleanNodeScratch, saveNodeScratch, type NodeScratch as Scratch } from "@/api/settings";
import SettingsDialog from "./SettingsDialog";

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
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
        <HardDrive size={14} />
        <Typography variant="caption" color="text.secondary">Scratch (fast local disk)</Typography>
        {canEdit && (
          <Button size="small" variant="text" startIcon={<Pencil size={12} />} onClick={() => { setPath(current ?? ""); setEditing(true); }}
                  sx={{ textTransform: "none", minWidth: 0, py: 0, ml: "auto !important" }} aria-label={`Change the scratch of ${hostname}`}>
            Change
          </Button>
        )}
      </Stack>
      {!current ? (
        <Typography variant="caption" color="text.secondary">
          None: the protocols' temporary files stay in the project.
        </Typography>
      ) : scratch?.error ? (
        <Alert severity="warning" sx={{ py: 0 }}>{current}: {scratch.error}</Alert>
      ) : (
        <Typography sx={{ fontSize: 13.5 }}>
          <Box component="span" sx={{ fontFamily: "monospace" }}>{current}</Box>
          {scratch?.freeBytes != null ? ` · ${formatBytes(scratch.freeBytes)} free of ${formatBytes(scratch.totalBytes)}` : ""}
        </Typography>
      )}
      {current && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary" data-testid={`scratch-last-${hostname}`}>
            {last
              ? `Cleaned ${ago(last.at)}: ${last.removed.length} folder${last.removed.length === 1 ? "" : "s"} removed`
                + (last.freedBytes ? `, ${formatBytes(last.freedBytes)} freed` : "")
                + (last.errors.length ? ` · ${last.errors.join("; ")}` : "")
              : "Cleaned every hour: what crashed or deleted protocols left there."}
          </Typography>
          {canClean && (
            <Button size="small" variant="outlined" startIcon={<Brush size={12} />} disabled={busy}
                    onClick={() => void clean()} sx={{ textTransform: "none", py: 0 }}
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
          onConfirm={() => void save()}
          onClose={() => setEditing(false)}
        >
          <Stack spacing={1.25}>
            <TextField size="small" fullWidth label="Folder" value={path} placeholder="/scratch/scipion"
                       onChange={(e) => setPath(e.target.value)} />
            <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
              The folder must exist on this machine and the protocols must be able to write in it. The change takes
              effect once this machine's protocol worker is restarted.
            </Typography>
          </Stack>
        </SettingsDialog>
      )}
    </Box>
  );
}
