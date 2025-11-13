// src/components/analyze/analyze-output-dialog.tsx
import { useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Divider,
} from "@mui/material";
import VolumeViewer from "./volume-viewer";
import { CloseIcon } from "@/icons";

type AnalyzeOutputDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string | number;
  protocolId: string | number;
  /** Output name as appears in data.outputs (e.g., "outputVolume", "outputMask"…) */
  outputName: string;
  /** Raw payload of the selected output (the object behind the output key) */
  outputRaw: any;
};

function isVolumeKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  // Matches Volume, VolumeMask, SetOfVolumes
  return s === "volume" || s === "volumemask" || s === "setofvolumes" || s === "setoftomograms";
}

export default function AnalyzeOutputDialog({
  open,
  onClose,
  projectId,
  protocolId,
  outputName,
  outputRaw,
}: AnalyzeOutputDialogProps) {
  const outputClass = useMemo(
    () => (outputRaw?._class || outputRaw?.class || outputRaw?.type || "").toString(),
    [outputRaw]
  );

  const body = useMemo(() => {
    if (isVolumeKind(outputClass)) {
      return (
        <VolumeViewer
          projectId={projectId}
          protocolId={protocolId}
          outputName={outputName}
        />
      );
    }

    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          No specialized viewer yet for this output type.
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Output: <strong>{outputName}</strong>
          <br />
          Class: <code>{outputClass || "(unknown)"}</code>
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2">
          Tip: we can plug a dedicated viewer component here later (image/table/sqlite/archive…).
        </Typography>
      </Box>
    );
  }, [outputClass, outputName, projectId, protocolId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 5 }}>
        Analyze Result — {outputName}
        <IconButton
          onClick={onClose}
          sx={{ ml: "auto" }}
          aria-label="Close analyze dialog"
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>{body}</DialogContent>
    </Dialog>
  );
}
