// src/components/analyze/analyze-output-dialog.tsx
import {
  memo,
  useMemo,
} from "react";

import {
  Box,
  Chip,
  Typography,
} from "@mui/material";

import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
} from "@mui/material/styles";

import {
  useTheme as useScipionTheme,
} from "@/context/ThemeContext";

import FloatingWindow from "@/components/ui/floating-window/FloatingWindow";
import { MetadataViewer } from "./metadata-viewer";
import VolumeViewer from "./volume-viewer";
import Coords2dViewer from "./coords2d-viewer";
import IntegratedTomographyViewer from "./integrated-tomography-viewer";
import FscViewer from "./fsc-viewer";

type AnalyzeOutputRef = { paramClass: string; value: string; info: string };

type AnalyzeOutputDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string | number;
  protocolId: string | number;
  protocolLabel: string;
  outputName: string;
  outputRaw: any | null;
};

function normalizedKind(k?: string) {
  return (k ?? "").replace(/\s+/g, "").toLowerCase();
}

function isVolumeKind(k?: string) {
  const s = normalizedKind(k);
  return s === "volume" || s === "volumemask" || s === "setofvolumes";
}

function isCoords2dKind(k?: string) {
  const s = normalizedKind(k);
  return s.includes("setofcoordinates") && !s.includes("setofcoordinates3d");
}

function isCoords3dKind(k?: string) {
  return normalizedKind(k).includes("setofcoordinates3d");
}

function isTiltSeriesKind(k?: string) {
  const s = normalizedKind(k);
  return s.includes("setoftiltseries") && s !== "setoftiltseriesm";
}

function isCTFTomoSeriesKind(k?: string) {
  return normalizedKind(k).includes("setofctftomoseries");
}


function isTomographyIntegratedKind(k?: string) {
  return isCoords3dKind(k) || isTiltSeriesKind(k) || isCTFTomoSeriesKind(k) || normalizedKind(k) === "setoftomograms";
}

function isSetOfFSCsKind(k?: string) {
  return normalizedKind(k).includes("setoffsc");
}

function isSetOfMetadataKind(k?: string) {
  if (!k) return false;
  const trimmed = k.replace(/\s+/g, "");
  if (!/^SetOf/i.test(trimmed) && !/^RelionSetOf/i.test(trimmed)) return false;
  return (
    !isVolumeKind(k) &&
    !isCoords2dKind(k) &&
    !isCoords3dKind(k) &&
    !isTiltSeriesKind(k) &&
    !isCTFTomoSeriesKind(k) &&
    !isSetOfFSCsKind(k)
  );
}

function toStringSafe(v: unknown): string {
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
}

function unwrapOutputRaw(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.pointerClass || raw._class || raw.class || raw.type) return raw;
  const entries = Object.entries(raw);
  if (entries.length === 1 && entries[0][1] && typeof entries[0][1] === "object") return entries[0][1];
  return raw;
}

function buildOutputRef(raw: any): AnalyzeOutputRef {
  const r = unwrapOutputRaw(raw);
  return {
    paramClass: toStringSafe(r?.paramClass),
    value: toStringSafe(r?.value ?? r?._objValue ?? ""),
    info: toStringSafe(r?.info),
  };
}

function AnalyzeOutputDialog({ open, onClose, projectId, protocolId, protocolLabel, outputName, outputRaw }: AnalyzeOutputDialogProps) {
  const { theme: appTheme } = useScipionTheme();

  const muiTheme = useMemo(
    () => createTheme({ palette: { mode: appTheme } }),
    [appTheme],
  );

  const pointerClass = useMemo(() => {
    const r = unwrapOutputRaw(outputRaw);
    return toStringSafe(r?._class || r?.pointerClass || r?.class || r?.type);
  }, [outputRaw]);

  const outputRef = useMemo(() => buildOutputRef(outputRaw), [outputRaw]);
  const projectIdNum = useMemo(() => Number(projectId), [projectId]);
  const protocolIdNum = useMemo(() => Number(protocolId), [protocolId]);

  const body = useMemo(() => {

    if (isTomographyIntegratedKind(pointerClass)) {
      return (
        <IntegratedTomographyViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          protocolLabel={protocolLabel}
          outputName={outputName}
          pointerClass={pointerClass}
        />
      );
    }

    if (isVolumeKind(pointerClass)) {
      return <VolumeViewer
        projectId={projectIdNum}
        protocolId={protocolIdNum}
        protocolLabel={protocolLabel}
        outputName={outputName}
        pointerClass={pointerClass} />;
    }

    if (isCoords2dKind(pointerClass)) {
      return (
        <Coords2dViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          protocolLabel={protocolLabel}
          outputName={outputName}
          onClose={onClose}
        />
      );
    }

    if (isSetOfMetadataKind(pointerClass)) {
      return <MetadataViewer projectId={projectIdNum} protocolId={protocolIdNum} outputName={outputName} onClose={onClose} />;
    }

    if (isSetOfFSCsKind(pointerClass)) {
      return <FscViewer projectId={projectIdNum} protocolId={protocolIdNum} outputName={outputName} />;
    }

    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>No specialized viewer yet for this output type.</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Output: <strong>{outputName}</strong><br />
          Class: <code>{pointerClass || "(unknown)"}</code><br />
          ParamClass: <code>{outputRef.paramClass || "(unknown)"}</code>
        </Typography>
      </Box>
    );
  }, [pointerClass, outputName, projectIdNum, protocolIdNum, protocolLabel, outputRef.paramClass, onClose]);


  return (
    <MuiThemeProvider
      theme={
        muiTheme
      }
    >
      <FloatingWindow
        open={
          open
        }
        onClose={
          onClose
        }
        ariaLabel={
          `Analyze result ${outputName}`
        }
        closeAriaLabel="Close analyze dialog"
        initialWidth="70vw"
        initialHeight="78vh"
        minWidth={
          680
        }
        minHeight={
          520
        }
        title={
          <Box
            sx={{
              minWidth: 0,

              display:
                "flex",

              flexDirection:
                "column",

              gap:
                0.25,
            }}
          >
            <Box
              sx={{
                minWidth: 0,

                display:
                  "flex",

                alignItems:
                  "baseline",

                gap:
                  1,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  minWidth: 0,

                  overflow:
                    "hidden",

                  whiteSpace:
                    "nowrap",

                  textOverflow:
                    "ellipsis",

                  color:
                    "#f3f4f6",

                  fontWeight:
                    600,

                  letterSpacing:
                    0.2,
                }}
              >
                Analyze Result -{" "}
                {outputName}
              </Typography>

              {pointerClass
                ? (
                  <Chip
                    size="small"
                    label={
                      pointerClass
                    }
                    sx={{
                      height:
                        22,

                      flex:
                        "0 0 auto",

                      color:
                        "#e5e7eb",

                      bgcolor:
                        "rgba(255,255,255,0.08)",

                      border:
                        "1px solid rgba(255,255,255,0.18)",

                      "& .MuiChip-label":
                      {
                        px: 1,
                        py: 0.25,
                      },
                    }}
                  />
                )
                : null}
            </Box>

            <Typography
              variant="caption"
              sx={{
                overflow:
                  "hidden",

                whiteSpace:
                  "nowrap",

                textOverflow:
                  "ellipsis",

                color:
                  "rgba(229,231,235,0.78)",
              }}
            >
              Protocol:{" "}
              {String(
                protocolLabel,
              )}
            </Typography>
          </Box>
        }
      >
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,

            flex:
              1,

            display:
              "flex",

            overflow:
              "hidden",

            bgcolor:
              "background.paper",
          }}
        >
          <Box
            sx={{
              minWidth:
                0,

              minHeight:
                0,

              flex:
                1,

              overflow:
                "hidden",
            }}
          >
            {body}
          </Box>
        </Box>
      </FloatingWindow>
    </MuiThemeProvider>
  );
}

export default memo(AnalyzeOutputDialog);
