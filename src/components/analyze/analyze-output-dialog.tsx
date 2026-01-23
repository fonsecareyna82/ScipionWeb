// src/components/analyze/analyze-output-dialog.tsx
import { useMemo, useEffect, useRef, memo } from "react";
import type { IframeHTMLAttributes } from "react";
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
import TiltSeriesViewer from "./tiltseries-viewer";
import CTFTomoViewer from "./ctftomo-viewer";

type AnalyzeOutputRef = {
  paramClass: string;
  value: string;
  info: string;
};

type AnalyzeViewerContext = {
  projectId: number;
  protocolId: number;
  protocolLabel: string;
  outputName: string;
  pointerClass: string;
  paramClass: string;
  value: string;
  info: string;
};

type ExternalAnalyzeViewer =
  | {
      kind: "iframe";
      src: string;
      title?: string;
      iframeProps?: IframeHTMLAttributes<HTMLIFrameElement>;
    }
  | {
      kind: "customElement";
      tag: string;
      attrs?: Record<string, string>;
    };

declare global {
  interface Window {
    externalViewers?: {
      resolveAnalyzeViewer?: (ctx: AnalyzeViewerContext) => ExternalAnalyzeViewer | null;
    };
  }
}

type AnalyzeOutputDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string | number;
  protocolId: string | number;
  protocolLabel: string;
  outputName: string;
  outputRaw: any | null;
};

function resolveExternalAnalyzeViewer(ctx: AnalyzeViewerContext): ExternalAnalyzeViewer | null {
  const resolver = window.externalViewers?.resolveAnalyzeViewer;
  if (typeof resolver !== "function") return null;

  try {
    return resolver(ctx) ?? null;
  } catch {
    return null;
  }
}

function isVolumeKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  return s === "volume" || s === "volumemask" || s === "setofvolumes" || s === "setoftomograms";
}

function isCoords3dKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  return s.includes("setofcoordinates3d");
}

function isSetOfMetadataKind(k?: string) {
  if (!k) return false;
  const trimmed = k.replace(/\s+/g, "");
  if (!/^SetOf/i.test(trimmed) && !/^RelionSetOf/i.test(trimmed)) return false;
  if (isVolumeKind(k)) return false;
  if (isCoords3dKind(k)) return false;
  return true;
}

function isTiltSeriesKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  return s.includes("setoftiltseries") && s !== "setoftiltseriesm";
}

function isCTFTomoSeriesKind(k?: string) {
  if (!k) return false;
  const s = k.replace(/\s+/g, "").toLowerCase();
  return s.includes("setofctftomoseries");
}

const dialogPaperSx = {
  borderRadius: 2,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 10px 20px rgba(0,0,0,0.15), 0 6px 10px rgba(0,0,0,0.08)",
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

function toStringSafe(v: unknown): string {
  // toStringSafe
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
}

function stableAttrsKey(attrs?: Record<string, string>) {
  // stableAttrsKey
  if (!attrs) return "";
  const keys = Object.keys(attrs).sort();
  return keys.map((k) => `${k}=${attrs[k] ?? ""}`).join("&");
}

function ExternalViewerHost({ spec }: { spec: ExternalAnalyzeViewer }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const attrsKey = useMemo(() => {
    // attrsKey
    if (spec.kind !== "customElement") return "";
    return stableAttrsKey(spec.attrs);
  }, [spec.kind, spec.kind === "customElement" ? spec.tag : "", spec.kind === "customElement" ? spec.attrs : undefined]);

  useEffect(() => {
    // mountCustomElementIntoHost
    if (spec.kind !== "customElement") return;
    if (!hostRef.current) return;

    hostRef.current.innerHTML = "";

    const el = document.createElement(spec.tag);
    const attrs = spec.attrs ?? {};
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));

    (el as HTMLElement).style.width = "100%";
    (el as HTMLElement).style.height = "100%";
    (el as HTMLElement).style.display = "block";

    hostRef.current.appendChild(el);

    return () => {
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [spec.kind, spec.kind === "customElement" ? spec.tag : "", attrsKey]);

  if (spec.kind === "iframe") {
    return (
      <iframe
        title={spec.title || "Analyze viewer"}
        src={spec.src}
        style={{ width: "100%", height: "100%", border: 0 }}
        {...(spec.iframeProps ?? {})}
      />
    );
  }

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
}

function unwrapOutputRaw(raw: any): any {
  // unwrapLegacySingleKeyObject
  if (!raw || typeof raw !== "object") return raw;

  if (raw.pointerClass || raw._class || raw.class || raw.type) return raw;

  const entries = Object.entries(raw);
  if (entries.length === 1) {
    const maybeInner = entries[0][1];
    if (maybeInner && typeof maybeInner === "object") return maybeInner;
  }

  return raw;
}

function buildOutputRef(raw: any): AnalyzeOutputRef {
  // buildOutputRef
  const r = unwrapOutputRaw(raw);

  return {
    paramClass: toStringSafe(r?.paramClass),
    value: toStringSafe(r?.value ?? r?._objValue ?? ""),
    info: toStringSafe(r?.info),
  };
}

function AnalyzeOutputDialog({
  open,
  onClose,
  projectId,
  protocolId,
  protocolLabel,
  outputName,
  outputRaw,
}: AnalyzeOutputDialogProps) {
  const pointerClass = useMemo(() => {
    const r = unwrapOutputRaw(outputRaw);
    return (r?._class || r?.pointerClass || r?.class || r?.type || "").toString();
  }, [outputRaw]);

  //console.log(outputRaw)
  const outputRef = useMemo(() => {
    // outputRef
    return buildOutputRef(outputRaw);
  }, [outputRaw]);

  const projectIdNum = useMemo(() => Number(projectId), [projectId]);
  const protocolIdNum = useMemo(() => Number(protocolId), [protocolId]);

  useEffect(() => {
    // debugRenderChanges
    if (!open) return;
  }, [open, projectIdNum, protocolIdNum, outputName, pointerClass]);

  const body = useMemo(() => {
    // internalViewerDispatch
    if (isVolumeKind(pointerClass)) {
      return (
        <VolumeViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          protocolLabel={protocolLabel}
          outputName={outputName}
        />
      );
    }

    if (isCoords3dKind(pointerClass)) {
      return (
        <Coords3dViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          protocolLabel={protocolLabel}
          outputName={outputName}
        />
      );
    }

    if (isTiltSeriesKind(pointerClass)) {
      return (
        <TiltSeriesViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          outputName={outputName}
        />
      );
    }

    if (isCTFTomoSeriesKind(pointerClass)) {
      return (
        <CTFTomoViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          outputName={outputName}
        />
      );
    }

    if (isSetOfMetadataKind(pointerClass)) {
      return (
        <MetadataViewer
          projectId={projectIdNum}
          protocolId={protocolIdNum}
          outputName={outputName}
        />
      );
    }

    // externalViewerFallback
    const externalSpec = resolveExternalAnalyzeViewer({
      projectId: projectIdNum,
      protocolId: protocolIdNum,
      protocolLabel,
      outputName,
      pointerClass,
      paramClass: outputRef.paramClass,
      value: outputRef.value,
      info: outputRef.info,
    });

    if (externalSpec) {
      return <ExternalViewerHost spec={externalSpec} />;
    }

    // noViewerFallback
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          No specialized viewer yet for this output type.
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Output: <strong>{outputName}</strong>
          <br />
          Class: <code>{pointerClass || "(unknown)"}</code>
        </Typography>
      </Box>
    );
  }, [pointerClass, outputName, projectIdNum, protocolIdNum, protocolLabel, outputRef]);

  const handleDialogClose = (_event: object, reason: "backdropClick" | "escapeKeyDown") => {
    // preventBackdropClose
    if (reason === "backdropClick") return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
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
            {pointerClass ? (
              <Chip
                size="small"
                label={pointerClass}
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

        <IconButton onClick={onClose} aria-label="Close analyze dialog" size="small" sx={closeBtnSx}>
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
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>{body}</Box>
      </DialogContent>
    </Dialog>
  );
}

export default memo(AnalyzeOutputDialog);
