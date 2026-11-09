import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { HardDrive, Pencil } from "lucide-react";
import toast from "react-hot-toast";

import { saveNodeScratch, type NodeScratch as Scratch } from "@/api/settings";
import SettingsDialog from "./SettingsDialog";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

/**
 * A machine's scratch: the fast local disk (an SSD) where its protocols put their temporary files and where Relion
 * copies particles. Shown as that machine sees it; who manages the settings sets or unsets it.
 */
export default function NodeScratch({ hostname, scratch, canEdit, onSaved }: {
  hostname: string;
  scratch?: Scratch;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState(scratch?.path ?? "");
  const [busy, setBusy] = useState(false);
  const current = scratch?.path ?? null;

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

      {editing && (
        <SettingsDialog
          title={`Scratch of ${hostname}`}
          description="A folder on a fast disk local to this machine (an SSD). The protocols that run here put their temporary files there, and Relion can copy the particles there to read them faster. Empty: none."
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
