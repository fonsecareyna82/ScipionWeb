// src/components/analyze/analyze-output-dialog.tsx
import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
  Chip,
} from "@mui/material";
import { CloseIcon } from "@/icons";
import { MetadataViewer } from "./metadata-viewer";
import VolumeViewer from "./volume-viewer";
import Coords3dViewer from "./coords3d-viewer";

type AnalyzeOutputDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string | number;
  protocolId: string | number;
  protocolLabel: string;
  outputName: string;
  outputRaw: any;
};

function isVolumeKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  return (
    s === "volume" ||
    s === "volumemask" ||
    s === "setofvolumes" ||
    s === "setoftomograms"
  );
}

function isCoords3dKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  // Match típico: "SetOfCoordinates3D"
  return s.includes("setofcoordinates3d");
}

function isSetOfMetadataKind(k?: string) {
  if (!k) return false;
  const trimmed = k.replace(/\s+/g, "");
  if (!/^SetOf/i.test(trimmed)) return false;
  if (isVolumeKind(k)) return false;
  if (isCoords3dKind(k)) return false;
  return true;
}

const dialogPaperSx = {
  borderRadius: 2,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow:
    "0 10px 20px rgba(0,0,0,0.15), 0 6px 10px rgba(0,0,0,0.08)",

  display: "flex",
  flexDirection: "column",
  height: "97vh",
  maxHeight: "97vh",
  minHeight: 650,
};

const headerSx = {
  px: 2,
  py: 1.25,
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  background: "linear-gradient(180deg, #0b1220 0%, #0a0f1e 100%)",
  color: "#e5e7eb",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  flexShrink: 0,
};

const titleWrapSx = {
  display: "flex",
  flexDirection: "column" as const,
  minWidth: 0,
  gap: 0.25,
  flex: 1,
};

const titleRowSx = {
  display: "flex",
  alignItems: "baseline",
  gap: 1,
  minWidth: 0,
};

const titleTextSx = {
  color: "#f3f4f6",
  fontWeight: 600,
  letterSpacing: 0.2,
  overflow: "hidden",
  whiteSpace: "nowrap" as const,
  textOverflow: "ellipsis",
};

const subtitleSx = {
  color: "rgba(229,231,235,0.78)",
  overflow: "hidden",
  whiteSpace: "nowrap" as const,
  textOverflow: "ellipsis",
};

const closeBtnSx = {
  ml: "auto",
  color: "#e5e7eb",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  "&:hover": {
    background: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.28)",
  },
};

export default function AnalyzeOutputDialog({
  open,
  onClose,
  projectId,
  protocolId,
  protocolLabel,
  outputName,
  outputRaw,
}: AnalyzeOutputDialogProps) {
  const outputClass = useMemo(
    () =>
      (
        outputRaw?._class ||
        outputRaw?.class ||
        outputRaw?.type ||
        ""
      ).toString(),
    [outputRaw]
  );

  const projectIdNum = useMemo(() => Number(projectId), [projectId]);
  const protocolIdNum = useMemo(() => Number(protocolId), [protocolId]);

  const body = useMemo(() => {
    if (isVolumeKind(outputClass)) {
      return (
        <VolumeViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          protocolLabel={protocolLabel}
          outputName={outputName}
        />
      );
    }

    if (isCoords3dKind(outputClass)) {
      return (
        <Coords3dViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          protocolLabel={protocolLabel}
          outputName={outputName}
        />
      );
    }

    if (isSetOfMetadataKind(outputClass)) {
      return (
        <MetadataViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
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
      </Box>
    );
  }, [
    outputClass,
    outputName,
    projectIdNum,
    protocolIdNum,
    protocolLabel,
  ]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: dialogPaperSx }}
    >
      <DialogTitle component="div" sx={headerSx}>
        <Box sx={titleWrapSx}>
          <Box sx={titleRowSx}>
            <Typography variant="subtitle1" sx={titleTextSx}>
              Analyze Result — {outputName}
            </Typography>
            {outputClass ? (
              <Chip
                size="small"
                label={outputClass}
                sx={{
                  height: 22,
                  color: "#e5e7eb",
                  bgcolor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  "& .MuiChip-label": { px: 1, py: 0.25 },
                }}
              />
            ) : null}
          </Box>
          <Typography variant="caption" sx={subtitleSx}>
            Protocol: {String(protocolLabel)}
          </Typography>
        </Box>

        <IconButton
          onClick={onClose}
          aria-label="Close analyze dialog"
          size="small"
          sx={closeBtnSx}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers={false}
        sx={{
          p: 0,
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          {body}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
