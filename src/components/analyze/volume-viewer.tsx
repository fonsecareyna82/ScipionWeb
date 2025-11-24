// src/components/analyze/volume-viewer.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  MenuItem,
  Button,
  Paper,
  Slider,
  IconButton,
  Popover,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import { ZoomIn, Layers3, HelpCircle, BoxIcon } from "lucide-react";
import GpuVolumeView from "./gpu-volume-view";

type VolumeViewerProps = {
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
  protocolLabel?: string;
};

type VolumeLite = { id: string | number; label?: string; name?: string };

type HistogramData = {
  binEdges: number[];
  counts: number[];
};

type ViewMode = "slices" | "map3d";
type ThrMode = "percentile" | "absolute";
type RightTab = "ctrl" | "hist";
type Interp2d = "nearest" | "linear" | "high";
type RenderMode3d = "surface" | "volume";

const DEFAULT_AXIS: "z" | "y" | "x" = "z";
const CMAP_OPTIONS = [
  "viridis",
  "gray",
  "magma",
  "plasma",
  "inferno",
  "cividis",
  "turbo",
];

const HELP_TEXT: Record<string, string> = {
  maxDim3d:
    "Maximum dimension used for the downsampled 3D volume. Higher values look better but are slower.",
  method3d:
    "Downsampling method. Binning averages blocks. Stride skips voxels. None keeps original size (can be heavy).",
  colormap3d: "Colormap applied to the rendered 3D volume.",
  opacity3d:
    "Opacity of the volume along the ray. Higher values make the map more solid.",
  thrMode:
    "Threshold mode. Percentile uses histogram percentiles; Absolute uses real intensity values.",
  thrPct:
    "Percentile threshold range (0–100). The map is rendered between these percentiles.",
  thrAbs:
    "Absolute intensity threshold range. Voxels outside this range are suppressed.",
  surfaceCount:
    "Number of isosurfaces in Plotly fallback. Does not affect GPU raycasting.",
  isoRenderMode3d:
    "How the iso band is visualized in GPU mode. Surface mimics ChimeraX-like solid shells; Volume renders the full band.",
  surfaceThickness3d:
    "Thickness of the surface shell as a fraction of the iso band width.",
  axis: "Slice axis. Z/Y/X correspond to the 3D volume axes.",
  sliceIndex: "Slice index along the selected axis.",
  colormap2d: "Colormap used for 2D slice rendering.",
  histogram: "Shows the intensity distribution of the selected volume.",
  interp2d:
    "Interpolation when zooming slices. Nearest for pixel look, Linear for smooth, High for best smoothing.",
  sharpen2d:
    "Applies a light 3×3 sharpening filter to the current slice (frontend only).",
  brightness2d:
    "Adjust brightness for slice display only. Does not refetch the slice.",
  contrast2d:
    "Adjust contrast for slice display only. Does not refetch the slice.",
  pan2d:
    "Pan slices with Ctrl+drag or middle mouse. Reset with Fit.",
  zoom2d:
    "Mouse wheel zooms slices. Double-click fits and resets pan.",
};

const SliceSlider = styled(Slider)(({ theme }) => ({
  height: 4,
  paddingTop: 14,
  paddingBottom: 30,
  "& .MuiSlider-thumb": { width: 14, height: 14 },
  "& .MuiSlider-valueLabel": {
    top: "unset",
    bottom: -26,
    transform: "translateY(0) scale(1)",
    background: "transparent",
    color: theme.palette.text.secondary,
    fontSize: "0.75rem",
    fontWeight: 500,
    "&:before": { display: "none" },
  },
  "& .MuiSlider-valueLabel.MuiSlider-valueLabelOpen": {
    transform: "translateY(0) scale(1)",
  },
}));

export default function VolumeViewer({
  projectId,
  protocolId,
  outputName,
}: VolumeViewerProps) {
  const svc = useProjectService();

  // ---------- List & selection ----------
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<VolumeLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // ---------- Meta ----------
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // ---------- Histogram ----------
  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);
  const [showHistogram, setShowHistogram] = useState(false);

  // ---------- View mode ----------
  const [viewMode, setViewMode] = useState<ViewMode>("slices");
  const [rightTab, setRightTab] = useState<RightTab>("ctrl");

  // ---------- Slices controls ----------
  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState<string>("viridis");
  const [interp2d, setInterp2d] = useState<Interp2d>("linear");
  const [sharpen2d, setSharpen2d] = useState(false);
  const [brightness2d, setBrightness2d] = useState(0);
  const [contrast2d, setContrast2d] = useState(1);

  const [pan2d, setPan2d] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ---------- Slices image ----------
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [loadingSlice, setLoadingSlice] = useState(false);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [sliceReloadNonce, setSliceReloadNonce] = useState(0);
  const bumpSliceReload = useCallback(() => {
    setSliceReloadNonce((n) => n + 1);
  }, []);

  // ---------- 3D data ----------
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<{
    dims: { x: number; y: number; z: number };
    values: number[];
    order: "zyx" | "xyz";
    min?: number;
    max?: number;
  } | null>(null);

  const [maxDim3d, setMaxDim3d] = useState(96);
  const [method3d, setMethod3d] = useState<"binning" | "stride" | "none">(
    "binning",
  );

  const [surfaceCount, setSurfaceCount] = useState(3);
  const [opacity3d, setOpacity3d] = useState(1);
  const [colormap3d, setColormap3d] = useState<string>("viridis");

  const [thrMode, setThrMode] = useState<ThrMode>("percentile");
  const [thrPct, setThrPct] = useState<[number, number]>([55, 98]);
  const [thrAbs, setThrAbs] = useState<[number, number]>([0, 1]);

  const [renderMode3d, setRenderMode3d] =
    useState<RenderMode3d>("surface");
  const [surfaceThickness3d, setSurfaceThickness3d] = useState(0.12);

  const lastLoadedRef = useRef<{
    volumeId: string | number | null;
    maxDim: number;
    method: "binning" | "stride" | "none";
  }>({ volumeId: null, maxDim: 96, method: "binning" });

  const lastThrVolumeRef = useRef<string | number | null>(null);

  // ---------- Help popover ----------
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const [helpKey, setHelpKey] = useState<string | null>(null);

  const openHelp = (key: string) => (e: React.MouseEvent<HTMLElement>) => {
    setHelpKey(key);
    setHelpAnchor(e.currentTarget);
  };
  const closeHelp = () => {
    setHelpAnchor(null);
    setHelpKey(null);
  };

  useEffect(() => {
    setRightTab("ctrl");
    setShowHistogram(false);
  }, [viewMode]);

  // Load list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        setListError(null);
        const items = await svc.listOutputVolumes(
          projectId,
          protocolId,
          outputName,
        );
        if (cancelled) return;
        const mapped: VolumeLite[] = (items || []).map((v: any, i: number) => ({
          id: v?.id ?? i,
          label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`,
          name: v?.name,
        }));
        setVolumes(mapped);
        setSelectedId((prev) => {
          const exists = mapped.find(
            (m) => String(m.id) === String(prev ?? -999),
          );
          return exists ? (prev as any) : mapped[0]?.id ?? null;
        });
      } catch (e: any) {
        if (!cancelled) setListError(e?.message || "Failed to list volumes");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, svc]);

  // Load meta
  useEffect(() => {
    if (selectedId == null) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setMetaLoading(true);
        setMetaError(null);
        const info = await svc.getVolumeInfo(
          projectId,
          protocolId,
          outputName,
          selectedId,
        );
        if (cancelled) return;
        setMeta(info || null);
      } catch (e: any) {
        if (!cancelled)
          setMetaError(e?.message || "Failed to fetch volume info");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, projectId, protocolId, outputName, svc]);

  // Load histogram (only if tab visible)
  useEffect(() => {
    if (!showHistogram || selectedId == null) {
      setHistogram(null);
      setHistError(null);
      setHistLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setHistLoading(true);
        setHistError(null);

        const h = await svc.getVolumeHistogram(
          projectId,
          protocolId,
          outputName,
          selectedId,
        );
        if (cancelled) return;

        const raw: any = h ?? {};
        const binEdges: number[] =
          raw.binEdges ?? raw.bin_edges ?? raw.bins ?? [];
        const counts: number[] = raw.counts ?? raw.values ?? [];

        setHistogram({ binEdges, counts });
      } catch (e: any) {
        if (!cancelled) {
          setHistError(e?.message || "Failed to load histogram");
          setHistogram(null);
        }
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showHistogram, selectedId, projectId, protocolId, outputName, svc]);

  // Dims
  const dims = useMemo(() => getDimsZYXtoXYZ(meta), [meta]);
  const maxSlice = Math.max(0, dims[axis] - 1);

  // Recenter slice on axis/volume change
  useEffect(() => {
    const mid = Math.max(0, Math.floor(maxSlice / 2));
    setSliceIndex(mid);
  }, [selectedId, axis, maxSlice]);

  const readySlices = selectedId != null && !!meta && dims[axis] > 0;

  // Force slice reload when entering slices AND ready
  useEffect(() => {
    if (viewMode === "slices" && readySlices) bumpSliceReload();
  }, [viewMode, readySlices, bumpSliceReload]);

  // Reset zoom/pan on new volume or axis
  useEffect(() => {
    setZoomMul(1);
    setPan2d({ x: 0, y: 0 });
  }, [selectedId, axis]);

  // Fetch current slice (NO fade-out, never clears old until new is ready)
  useEffect(() => {
    if (!readySlices || viewMode !== "slices") {
      setImgError(null);
      return;
    }

    const idx = Math.max(0, Math.min(sliceIndex, maxSlice));

    abortRef.current?.abort();
    const myAbort = new AbortController();
    abortRef.current = myAbort;

    const myReq = ++reqIdRef.current;
    setImgError(null);

    (async () => {
      try {
        setLoadingSlice(true);
        const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
          projectId,
          protocolId,
          outputName,
          selectedId!,
          idx,
          { axis, cmap: colormap, signal: myAbort.signal },
        );

        if (reqIdRef.current !== myReq) {
          revoke();
          return;
        }

        setFrontUrl((prev) => {
          if (prev && prev !== url) {
            // keep old pixels visible until new url is ready
          }
          return url;
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (reqIdRef.current === myReq) {
          setImgError(e?.message || "Failed to render slice");
        }
      } finally {
        if (reqIdRef.current === myReq) setLoadingSlice(false);
      }
    })();

    return () => {
      myAbort.abort();
    };
  }, [
    readySlices,
    viewMode,
    sliceIndex,
    axis,
    colormap,
    selectedId,
    maxSlice,
    projectId,
    protocolId,
    outputName,
    svc,
    sliceReloadNonce,
  ]);

  // ---------- 3D data fetch (ONLY on Reload) ----------
  const load3d = useCallback(async () => {
    if (selectedId == null) return;
    setMapLoading(true);
    setMapError(null);
    setGpuError(null);

    try {
      const raw = await svc.getVolumeData3d(
        projectId,
        protocolId,
        outputName,
        selectedId,
        { maxDim: maxDim3d, method: method3d },
      );

      const parsed = normalize3dPayload(raw);
      setMapData(parsed);

      lastLoadedRef.current = {
        volumeId: selectedId,
        maxDim: maxDim3d,
        method: method3d,
      };
    } catch (e: any) {
      setMapError(e?.message || "Failed to load 3D data");
      setMapData(null);
    } finally {
      setMapLoading(false);
    }
  }, [
    selectedId,
    svc,
    projectId,
    protocolId,
    outputName,
    maxDim3d,
    method3d,
  ]);

  useEffect(() => {
    if (viewMode !== "map3d") return;
    if (selectedId == null) return;

    const last = lastLoadedRef.current;
    if (last.volumeId !== selectedId) load3d();
  }, [viewMode, selectedId, load3d]);

  const dataDirty = useMemo(() => {
    const last = lastLoadedRef.current;
    return (
      viewMode === "map3d" &&
      selectedId != null &&
      (last.volumeId !== selectedId ||
        last.maxDim !== maxDim3d ||
        last.method !== method3d)
    );
  }, [viewMode, selectedId, maxDim3d, method3d]);

  // ---------- 3D stats ----------
  const sortedValues = useMemo(() => {
    if (!mapData?.values?.length) return null;
    const clean = mapData.values.filter((n) => Number.isFinite(n));
    if (clean.length === 0) return null;
    clean.sort((a, b) => a - b);
    return clean;
  }, [mapData]);

  const stats3d = useMemo(() => {
    if (!sortedValues || sortedValues.length === 0) return null;
    return { min: sortedValues[0], max: sortedValues[sortedValues.length - 1] };
  }, [sortedValues]);

  useEffect(() => {
    if (!sortedValues || selectedId == null) return;
    if (lastThrVolumeRef.current === selectedId) return;

    const loAbs = percentileFromSorted(sortedValues, 55);
    const hiAbs = percentileFromSorted(sortedValues, 98);

    setThrPct([55, 98]);
    setThrAbs([loAbs, hiAbs]);
    lastThrVolumeRef.current = selectedId;
  }, [sortedValues, selectedId]);

  const thrPctAbs = useMemo(() => {
    if (!sortedValues) return null;
    const lo = percentileFromSorted(sortedValues, thrPct[0]);
    const hi = percentileFromSorted(sortedValues, thrPct[1]);
    return [lo, hi] as [number, number];
  }, [sortedValues, thrPct]);

  const isoRange3d = useMemo(() => {
    if (!stats3d) return null;
    if (thrMode === "percentile") return thrPctAbs;
    const lo = Math.min(thrAbs[0], thrAbs[1]);
    const hi = Math.max(thrAbs[0], thrAbs[1]);
    return [lo, hi] as [number, number];
  }, [thrMode, thrPctAbs, thrAbs, stats3d]);

  // ---------- Preserve Plotly camera ----------
  const plotlyCameraRef = useRef<any>(null);
  const handleRelayout = useCallback((ev: any) => {
    const cam = ev?.["scene.camera"] ?? ev?.scene?.camera;
    if (cam) plotlyCameraRef.current = cam;
  }, []);

  // ---------- Fit-aware zoom (slices) ----------
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [naturalW, setNaturalW] = useState<number | null>(null);
  const [naturalH, setNaturalH] = useState<number | null>(null);
  const [zoomMul, setZoomMul] = useState(1);
  const MIN_MUL = 0.25;
  const MAX_MUL = 4;

  const { width: vw, height: vh } = useElementSize(viewerRef);

  const fitScale = useMemo(() => {
    if (!naturalW || !naturalH || !vw || !vh) return 1;
    const sx = vw / naturalW;
    const sy = vh / naturalH;
    return Math.min(sx, sy);
  }, [naturalW, naturalH, vw, vh]);

  const renderScale = useMemo(() => fitScale * zoomMul, [fitScale, zoomMul]);

  const applyZoom = (mul: number) =>
    setZoomMul(() => Math.min(MAX_MUL, Math.max(MIN_MUL, mul)));
  const stepZoom = (factor: number) => applyZoom(zoomMul * factor);
  const fitZoom = () => {
    applyZoom(1);
    setPan2d({ x: 0, y: 0 });
  };

  // Wheel in slices: ONLY zoom
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (viewMode !== "slices" || !frontUrl) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      stepZoom(factor);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewMode, frontUrl, zoomMul]);

  // Ctrl+drag / middle pan
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    let panning = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (viewMode !== "slices" || !frontUrl) return;
      const isMiddle = e.button === 1;
      if (!e.ctrlKey && !isMiddle) return;

      panning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      (el as any).setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      setPan2d((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!panning) return;
      panning = false;
      (el as any).releasePointerCapture?.(e.pointerId);
      el.style.cursor = "default";
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("pointerleave", onPointerUp);
    };
  }, [viewMode, frontUrl]);

  // ---------- UI layout (no global scroll, stable size) ----------
  const panelBasis = 340; // fixed width to avoid resizing on view change

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden", // never create page scrollbars
      }}
    >
      {/* Left list */}
      <Box
        sx={{
          width: 270,
          borderRight: "1px solid #eee",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: 1.5, flexShrink: 0 }}>
          <Typography variant="subtitle2">Volumes</Typography>
          <Typography variant="caption" color="text.secondary">
            {loadingList ? "" : `${volumes.length} item(s)`}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {loadingList ? (
            <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2"></Typography>
            </Box>
          ) : listError ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="error">
                {listError}
              </Typography>
            </Box>
          ) : volumes.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No volumes in this output.
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {volumes.map((v) => {
                const selected = String(selectedId) === String(v.id);
                return (
                  <ListItemButton
                    key={String(v.id)}
                    selected={selected}
                    onClick={() => setSelectedId(v.id)}
                    sx={{ px: 1.5, py: 1 }}
                  >
                    <ListItemText
                      primaryTypographyProps={{
                        variant: "body2",
                        noWrap: true,
                      }}
                      primary={v.label || `Volume ${String(v.id)}`}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      {/* Right */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Toolbar (fixed height) */}
        <Paper elevation={0} square sx={{ p: 0.75, borderBottom: "1px solid #eee", flexShrink: 0 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              columnGap: 1.5,
              rowGap: 0.75,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={viewMode}
                onChange={(_, v) => v && setViewMode(v)}
              >
                <ToggleButton value="slices">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <Layers3 size={14} />
                    Slices
                  </Box>
                </ToggleButton>
                <ToggleButton value="map3d">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <BoxIcon size={14} />
                    3D Map
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "default",
                  opacity: viewMode === "slices" ? 1 : 0.4,
                }}
              >
                <ZoomIn size={14} style={{ opacity: 0.6 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: "tabular-nums", minWidth: "5ch", textAlign: "right" }}
                >
                  {Math.round(zoomMul * 100)}%
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Main (fills remaining space, no overflow outside) */}
        <Box sx={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          {/* Viewer column */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            {/* Viewer (fills) */}
            <Box
              ref={viewerRef}
              onDoubleClick={fitZoom}
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 1.0,
                overflow: "hidden",
                position: "relative",
                cursor: "default",
                bgcolor: "background.default",
              }}
              title={
                viewMode === "slices"
                  ? "Wheel: zoom | Ctrl+drag: pan | Double-click: fit"
                  : undefined
              }
            >
              {metaLoading ? (
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2"></Typography>
                </Box>
              ) : metaError ? (
                <Typography variant="body2" color="error">
                  {metaError}
                </Typography>
              ) : selectedId == null ? (
                <Typography variant="body2" color="text.secondary">
                  Select a volume
                </Typography>
              ) : viewMode === "slices" ? (
                imgError ? (
                  <Typography variant="body2" color="error">
                    {imgError}
                  </Typography>
                ) : frontUrl ? (
                  <>
                    <SlicesCanvas
                      url={frontUrl}
                      containerW={vw}
                      containerH={vh}
                      scale={renderScale}
                      pan={pan2d}
                      interp={interp2d}
                      sharpen={sharpen2d}
                      brightness={brightness2d}
                      contrast={contrast2d}
                      onNaturalSize={(w, h) => {
                        setNaturalW(w);
                        setNaturalH(h);
                      }}
                    />
                    <SlicesStatusBar
                      axis={axis}
                      sliceIndex={sliceIndex}
                      maxSlice={maxSlice}
                      zoomMul={zoomMul}
                      colormap={colormap}
                      interp={interp2d}
                      sharpen={sharpen2d}
                      brightness={brightness2d}
                      contrast={contrast2d}
                    />
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No image
                  </Typography>
                )
              ) : (
                mapLoading ? (
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2">Loading 3D volume…</Typography>
                  </Box>
                ) : mapError ? (
                  <Typography variant="body2" color="error">
                    {mapError}
                  </Typography>
                ) : mapData && stats3d && isoRange3d && !gpuError ? (
                  <GpuVolumeView
                    values={mapData.values}
                    dims={mapData.dims}
                    order={mapData.order}
                    spacing={meta?.spacing}
                    rangeMin={stats3d.min}
                    rangeMax={stats3d.max}
                    isoMin={isoRange3d[0]}
                    isoMax={isoRange3d[1]}
                    opacity={opacity3d}
                    colormap={colormap3d}
                    renderMode={renderMode3d}
                    shell={surfaceThickness3d}
                    onError={(msg) => setGpuError(msg)}
                  />
                ) : mapData && stats3d && isoRange3d ? (
                  <Box sx={{ width: "100%", height: "100%" }}>
                    {(() => {
                      const plotProps: any = {
                        data: [
                          {
                            type: "isosurface",
                            value: mapData.values,
                            isomin: isoRange3d[0],
                            isomax: isoRange3d[1],
                            surface: { count: surfaceCount },
                            caps: { x: { show: false }, y: { show: false }, z: { show: false } },
                            opacity: opacity3d,
                            colorscale: toPlotlyColorscale(colormap3d),
                            showscale: false,
                          } as any,
                        ],
                        layout: {
                          autosize: true,
                          margin: { l: 0, r: 0, t: 0, b: 0 },
                          scene: {
                            aspectmode: "data",
                            xaxis: { visible: false },
                            yaxis: { visible: false },
                            zaxis: { visible: false },
                            camera: plotlyCameraRef.current ?? undefined,
                          },
                          showlegend: false,
                        },
                        style: { width: "100%", height: "100%" },
                        useResizeHandler: true,
                        config: { displaylogo: false, responsive: true, scrollZoom: true },
                        onRelayout: handleRelayout,
                      };
                      return <Plot {...plotProps} />;
                    })()}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No 3D data. Press Reload.
                  </Typography>
                )
              )}
            </Box>

            {/* Meta bar (fixed height, never pushes layout) */}
            <Divider />
            <Box sx={{ p: 1.0, display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
              <MetaItem label="Dims" value={dimsToStringXYZ(dims)} />
              {"min" in (meta || {}) && <MetaItem label="Min" value={num(meta?.min)} />}
              {"max" in (meta || {}) && <MetaItem label="Max" value={num(meta?.max)} />}
              {"mean" in (meta || {}) && <MetaItem label="Mean" value={num(meta?.mean)} />}
              {"std" in (meta || {}) && <MetaItem label="Std" value={num(meta?.std)} />}
              {viewMode === "map3d" && mapData?.dims && (
                <MetaItem
                  label="Downsampled"
                  value={`${mapData.dims.x} × ${mapData.dims.y} × ${mapData.dims.z}`}
                />
              )}
            </Box>
          </Box>

          {/* Right panel (fixed width, internal scroll) */}
          <>
            <Divider orientation="vertical" flexItem />
            <Box
              sx={{
                flexBasis: panelBasis,
                flexShrink: 0,
                minWidth: panelBasis,
                maxWidth: panelBasis,
                p: 1.25,
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.paper",
                gap: 1,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <ToggleButtonGroup
                size="small"
                exclusive
                value={rightTab}
                onChange={(_, v) => {
                  if (!v) return;
                  setRightTab(v);
                  setShowHistogram(v === "hist");
                }}
                sx={{ flexShrink: 0}}
              >
                <ToggleButton value="ctrl" >Controls</ToggleButton>
                <ToggleButton value="hist">Histogram</ToggleButton>
              </ToggleButtonGroup>

              {/* Content area scrolls internally only */}
              <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", pr: 0.5, marginTop: "8px" }}>
                {rightTab === "ctrl" && viewMode === "slices" && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                    <SectionTitle title="Slices" />

                    <ParamRow
                      label="Axis"
                      helpKey="axis"
                      onHelp={openHelp}
                      control={
                        <ToggleButtonGroup
                          size="small"
                          value={axis}
                          exclusive
                          onChange={(_, v) => v && setAxis(v)}
                        >
                          <ToggleButton value="z">Z</ToggleButton>
                          <ToggleButton value="y">Y</ToggleButton>
                          <ToggleButton value="x">X</ToggleButton>
                        </ToggleButtonGroup>
                      }
                    />

                    <Box sx={{ mt: 0.5 }}>
                      <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          Slice
                        </Typography>
                        <IconButton size="small" onClick={openHelp("sliceIndex")}>
                          <HelpCircle size={14} />
                        </IconButton>
                      </Box>

                      <SliceSlider
                        size="small"
                        value={Math.min(sliceIndex, maxSlice)}
                        min={0}
                        max={maxSlice}
                        step={1}
                        onChange={(_, v) => setSliceIndex(v as number)}
                        disabled={!readySlices}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => `${(v as number) + 1}`}
                      />
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="caption" color="text.secondary">1</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {maxSlice + 1}
                        </Typography>
                      </Box>
                    </Box>

                    <ParamRow
                      label="Colormap"
                      helpKey="colormap2d"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          select
                          value={colormap}
                          onChange={(e) => setColormap(e.target.value)}
                          SelectProps={{ MenuProps: { disablePortal: true } }}
                        >
                          {CMAP_OPTIONS.map((cm) => (
                            <MenuItem key={cm} value={cm}>{cm}</MenuItem>
                          ))}
                        </TextField>
                      }
                    />

                    <ParamRow
                      label="Interpolation"
                      helpKey="interp2d"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          select
                          value={interp2d}
                          onChange={(e) => setInterp2d(e.target.value as Interp2d)}
                          SelectProps={{ MenuProps: { disablePortal: true } }}
                        >
                          <MenuItem value="nearest">nearest</MenuItem>
                          <MenuItem value="linear">linear</MenuItem>
                          <MenuItem value="high">high</MenuItem>
                        </TextField>
                      }
                    />

                    <ParamRow
                      label="Sharpen"
                      helpKey="sharpen2d"
                      onHelp={openHelp}
                      control={
                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={sharpen2d ? "on" : "off"}
                          onChange={(_, v) => {
                            if (v === "on") setSharpen2d(true);
                            if (v === "off") setSharpen2d(false);
                          }}
                        >
                          <ToggleButton value="off">off</ToggleButton>
                          <ToggleButton value="on">on</ToggleButton>
                        </ToggleButtonGroup>
                      }
                    />

                    <Divider />

                    <SectionTitle title="Display" />

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                      <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          Brightness
                        </Typography>
                        <IconButton size="small" onClick={openHelp("brightness2d")}>
                          <HelpCircle size={14} />
                        </IconButton>
                      </Box>
                      <Slider
                        size="small"
                        value={brightness2d}
                        min={-1}
                        max={1}
                        step={0.02}
                        onChange={(_, v) => setBrightness2d(v as number)}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => (v as number).toFixed(2)}
                      />
                    </Box>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                      <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          Contrast
                        </Typography>
                        <IconButton size="small" onClick={openHelp("contrast2d")}>
                          <HelpCircle size={14} />
                        </IconButton>
                      </Box>
                      <Slider
                        size="small"
                        value={contrast2d}
                        min={0.5}
                        max={2}
                        step={0.02}
                        onChange={(_, v) => setContrast2d(v as number)}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => (v as number).toFixed(2)}
                      />
                    </Box>

                    <Divider />

                    <Button
                      size="small"
                      variant="outlined"
                      onClick={fitZoom}
                      sx={{ textTransform: "none" }}
                    >
                      Fit + reset pan
                    </Button>

                    <Typography variant="caption" color="text.secondary">
                      Pan: Ctrl+drag or middle mouse
                    </Typography>
                  </Box>
                )}

                {rightTab === "ctrl" && viewMode === "map3d" && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, marginRight: "12px" }}>
                    <SectionTitle title="Data" />
                    <ParamRow
                      label="maxDim"
                      helpKey="maxDim3d"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          type="number"
                          value={maxDim3d}
                          onChange={(e) => setMaxDim3d(clampInt(e.target.value, 48, 256))}
                          inputProps={{ min: 48, max: 256, step: 8 }}
                        />
                      }
                    />
                    <ParamRow
                      label="Method"
                      helpKey="method3d"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          select
                          value={method3d}
                          onChange={(e) => setMethod3d(e.target.value as any)}
                          SelectProps={{ MenuProps: { disablePortal: true } }}
                        >
                          <MenuItem value="binning">binning</MenuItem>
                          <MenuItem value="stride">stride</MenuItem>
                          <MenuItem value="none">none</MenuItem>
                        </TextField>
                      }
                    />
                    <Button
                      size="small"
                      variant={dataDirty ? "contained" : "outlined"}
                      onClick={load3d}
                      disabled={selectedId == null || mapLoading}
                      sx={{ textTransform: "none", borderRadius: 1.5 }}
                    >
                      Reload data
                    </Button>

                    <Divider />

                    <SectionTitle title="Appearance" />
                    <ParamRow
                      label="Colormap"
                      helpKey="colormap3d"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          select
                          value={colormap3d}
                          onChange={(e) => setColormap3d(e.target.value)}
                          SelectProps={{ MenuProps: { disablePortal: true } }}
                        >
                          {CMAP_OPTIONS.map((cm) => (
                            <MenuItem key={cm} value={cm}>{cm}</MenuItem>
                          ))}
                        </TextField>
                      }
                    />

                    <ParamRow
                      label="Opacity"
                      helpKey="opacity3d"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          type="number"
                          value={opacity3d}
                          onChange={(e) => setOpacity3d(clampFloat(e.target.value, 0.05, 1))}
                          inputProps={{ min: 0.05, max: 1, step: 0.05 }}
                        />
                      }
                    />

                    <ParamRow
                      label="Surfaces"
                      helpKey="surfaceCount"
                      onHelp={openHelp}
                      control={
                        <TextField
                          size="small"
                          type="number"
                          value={surfaceCount}
                          onChange={(e) => setSurfaceCount(clampInt(e.target.value, 1, 8))}
                          inputProps={{ min: 1, max: 8, step: 1 }}
                        />
                      }
                    />

                    <Divider />

                    <SectionTitle title="Iso rendering" />
                    <ParamRow
                      label="Iso mode"
                      helpKey="isoRenderMode3d"
                      onHelp={openHelp}
                      control={
                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={renderMode3d}
                          onChange={(_, v) => v && setRenderMode3d(v)}
                        >
                          <ToggleButton value="surface">surface</ToggleButton>
                          <ToggleButton value="volume">volume</ToggleButton>
                        </ToggleButtonGroup>
                      }
                    />

                    {renderMode3d === "surface" && (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                          <Typography variant="caption" color="text.secondary">
                            Surface thickness
                          </Typography>
                          <IconButton size="small" onClick={openHelp("surfaceThickness3d")}>
                            <HelpCircle size={14} />
                          </IconButton>
                        </Box>
                        <Slider
                          size="small"
                          value={surfaceThickness3d}
                          min={0.02}
                          max={0.6}
                          step={0.01}
                          onChange={(_, v) => setSurfaceThickness3d(v as number)}
                          valueLabelDisplay="auto"
                          valueLabelFormat={(v) => (v as number).toFixed(2)}
                        />
                      </Box>
                    )}

                    <Box sx={{ mt: 0.5 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Threshold
                        </Typography>
                        <IconButton size="small" onClick={openHelp("thrMode")}>
                          <HelpCircle size={14} />
                        </IconButton>
                      </Box>

                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={thrMode}
                        onChange={(_, v) => v && setThrMode(v)}
                        sx={{ mb: 0.75 }}
                      >
                        <ToggleButton value="percentile">Percentile</ToggleButton>
                        <ToggleButton value="absolute">Absolute</ToggleButton>
                      </ToggleButtonGroup>

                      {thrMode === "percentile" && (
                        <>
                          <Slider
                            size="small"
                            value={thrPct}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(_, v) => {
                              const arr = v as number[];
                              const lo = Math.min(arr[0], arr[1]);
                              const hi = Math.max(arr[0], arr[1]);
                              setThrPct([lo, Math.max(lo + 1, hi)] as [number, number]);
                            }}
                            valueLabelDisplay="auto"
                            disabled={!sortedValues}
                          />
                          {thrPctAbs && (
                            <Typography variant="caption" color="text.secondary">
                              ≈ {formatSci(thrPctAbs[0])} – {formatSci(thrPctAbs[1])}
                            </Typography>
                          )}
                        </>
                      )}

                      {thrMode === "absolute" && (
                        <>
                          <Slider
                            size="small"
                            value={thrAbs}
                            min={stats3d?.min ?? 0}
                            max={stats3d?.max ?? 1}
                            step={stats3d ? (stats3d.max - stats3d.min) / 400 : 0.001}
                            onChange={(_, v) => {
                              const [lo, hi] = v as number[];
                              setThrAbs([Math.min(lo, hi), Math.max(lo, hi)] as [number, number]);
                            }}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(v) => formatSci(v as number)}
                            disabled={!stats3d}
                            className="mr-4"
                          />
                        </>
                      )}
                    </Box>
                  </Box>
                )}

                {rightTab === "hist" && (
                  <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Intensity histogram
                    </Typography>

                    {selectedId == null ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                        Select a volume to see the histogram.
                      </Typography>
                    ) : histLoading ? (
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant="caption">Loading histogram…</Typography>
                      </Box>
                    ) : histError ? (
                      <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                        {histError}
                      </Typography>
                    ) : histogram && histogram.binEdges.length > 1 ? (
                      <Box sx={{ mt: 1, flex: 1, minHeight: 240 }}>
                        <Plot
                          data={[
                            {
                              type: "bar",
                              x: histogram.binEdges
                                .slice(0, -1)
                                .map((b, i) => 0.5 * (b + histogram.binEdges[i + 1])),
                              y: histogram.counts,
                            },
                          ]}
                          layout={{
                            margin: { l: 40, r: 10, t: 10, b: 30 },
                            autosize: true,
                            showlegend: false,
                            xaxis: { title: "Intensity" },
                            yaxis: { title: "Count" },
                          }}
                          style={{ width: "100%", height: "100%" }}
                          useResizeHandler
                          config={{ displaylogo: false, responsive: true }}
                        />
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                        No histogram data.
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          </>
        </Box>
      </Box>

      {/* Help popover */}
      <Popover
        open={Boolean(helpAnchor && helpKey)}
        anchorEl={helpAnchor}
        onClose={closeHelp}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        disableRestoreFocus
        PaperProps={{ sx: { p: 1.25, maxWidth: 320 } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {helpKey}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {helpKey ? HELP_TEXT[helpKey] ?? "No help available." : ""}
        </Typography>
      </Popover>
    </Box>
  );
}

/** Canvas slice rendering */
function SlicesCanvas({
  url,
  containerW,
  containerH,
  scale,
  pan,
  interp,
  sharpen,
  brightness,
  contrast,
  onNaturalSize,
}: {
  url: string;
  containerW: number;
  containerH: number;
  scale: number;
  pan: { x: number; y: number };
  interp: Interp2d;
  sharpen: boolean;
  brightness: number;
  contrast: number;
  onNaturalSize: (w: number, h: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const processedRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      onNaturalSize(img.naturalWidth, img.naturalHeight);
      prepareProcessed(img, sharpen, processedRef);
      scheduleDraw();
    };
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    prepareProcessed(img, sharpen, processedRef);
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharpen]);

  useEffect(() => {
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerW, containerH, scale, pan.x, pan.y, interp, brightness, contrast]);

  const scheduleDraw = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, containerW);
    const h = Math.max(1, containerH);

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (interp === "nearest") {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality =
        interp === "high" ? "high" : "medium";
    }

    const src = sharpen && processedRef.current ? processedRef.current : img;

    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    const cx = w / 2 + pan.x;
    const cy = h / 2 + pan.y;
    const x0 = cx - drawW / 2;
    const y0 = cy - drawH / 2;

    const b = 1 + brightness;
    const c = contrast;

    ctx.filter = `brightness(${b}) contrast(${c})`;
    ctx.globalAlpha = 1;
    ctx.drawImage(src, x0, y0, drawW, drawH);
    ctx.filter = "none";
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
      }}
    />
  );
}

function prepareProcessed(
  img: HTMLImageElement,
  sharpen: boolean,
  processedRef: React.MutableRefObject<HTMLCanvasElement | null>,
) {
  if (!sharpen) {
    processedRef.current = null;
    return;
  }

  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const ctx = off.getContext("2d");
  if (!ctx) {
    processedRef.current = null;
    return;
  }
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, off.width, off.height);
  const out = sharpenImageData(id);
  ctx.putImageData(out, 0, 0);
  processedRef.current = off;
}

function sharpenImageData(src: ImageData): ImageData {
  const { width, height, data } = src;
  const out = new ImageData(width, height);
  const dst = out.data;

  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const idx = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let ki = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++, ki++) {
          const xx = Math.max(0, Math.min(width - 1, x + i));
          const yy = Math.max(0, Math.min(height - 1, y + j));
          const p = idx(xx, yy);
          const w = k[ki];
          r += data[p] * w;
          g += data[p + 1] * w;
          b += data[p + 2] * w;
          a += data[p + 3] * w;
        }
      }

      const o = idx(x, y);
      dst[o] = clampByte(r);
      dst[o + 1] = clampByte(g);
      dst[o + 2] = clampByte(b);
      dst[o + 3] = clampByte(a);
    }
  }
  return out;
}

function clampByte(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function SlicesStatusBar({
  axis,
  sliceIndex,
  maxSlice,
  zoomMul,
  colormap,
  interp,
  sharpen,
  brightness,
  contrast,
}: {
  axis: "x" | "y" | "z";
  sliceIndex: number;
  maxSlice: number;
  zoomMul: number;
  colormap: string;
  interp: Interp2d;
  sharpen: boolean;
  brightness: number;
  contrast: number;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 8,
        right: 8,
        bgcolor: "rgba(0,0,0,0.55)",
        color: "white",
        px: 1,
        py: 0.5,
        borderRadius: 1,
        fontSize: 12,
        display: "flex",
        gap: 1.0,
        alignItems: "center",
        pointerEvents: "none",
        flexWrap: "wrap",
        maxWidth: "90%",
      }}
    >
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {axis.toUpperCase()} {sliceIndex + 1}/{maxSlice + 1}
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {Math.round(zoomMul * 100)}%
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {colormap}
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {interp}
      </Typography>
      {sharpen && (
        <Typography variant="caption" sx={{ color: "inherit" }}>
          sharpen
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: "inherit" }}>
        b {brightness.toFixed(2)}
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        c {contrast.toFixed(2)}
      </Typography>
    </Box>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontWeight: 700 }}
    >
      {title}
    </Typography>
  );
}

function ParamRow({
  label,
  helpKey,
  onHelp,
  control,
}: {
  label: string;
  helpKey: string;
  onHelp: (key: string) => (e: React.MouseEvent<HTMLElement>) => void;
  control: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1.2fr",
        gap: 1,
        alignItems: "center",
      }}
    >
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <IconButton size="small" onClick={onHelp(helpKey)}>
          <HelpCircle size={14} />
        </IconButton>
      </Box>
      {control}
    </Box>
  );
}

function useElementSize<T extends Element>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function getDimsZYXtoXYZ(info: any): Record<"x" | "y" | "z", number> {
  const raw = info?.dims || info?.shape || info?.size || [];
  if (Array.isArray(raw) && raw.length >= 3) {
    const z = Number(raw[0]) || 0;
    const y = Number(raw[1]) || 0;
    const x = Number(raw[2]) || 0;
    return { x, y, z };
  }
  return {
    x: Number(info?.width ?? 0),
    y: Number(info?.height ?? 0),
    z: Number(info?.depth ?? info?.slices ?? 0),
  };
}

function dimsToStringXYZ(d: Record<"x" | "y" | "z", number>) {
  return d.x && d.y && d.z ? `${d.x} × ${d.y} × ${d.z}` : "–";
}

function num(n: any) {
  return Number.isFinite(n) ? Number(n).toFixed(3) : "–";
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="caption">{value}</Typography>
    </Box>
  );
}

function normalize3dPayload(raw: any): {
  dims: { x: number; y: number; z: number };
  values: number[];
  order: "zyx" | "xyz";
  min?: number;
  max?: number;
} {
  const dimsRaw = raw?.dims;
  const shapeRaw = raw?.shape ?? raw?.size;

  let x = 0, y = 0, z = 0;

  if (Array.isArray(dimsRaw) && dimsRaw.length >= 3) {
    x = Number(dimsRaw[0]) || 0;
    y = Number(dimsRaw[1]) || 0;
    z = Number(dimsRaw[2]) || 0;
  } else if (Array.isArray(shapeRaw) && shapeRaw.length >= 3) {
    z = Number(shapeRaw[0]) || 0;
    y = Number(shapeRaw[1]) || 0;
    x = Number(shapeRaw[2]) || 0;
  }

  let values: number[] = [];
  const vRaw = raw?.values ?? raw?.data ?? raw?.volume;
  if (Array.isArray(vRaw)) {
    if (Array.isArray(vRaw[0])) {
      values = flatten3dNested(vRaw as any);
      if (!x || !y || !z) {
        z = vRaw.length;
        y = (vRaw[0] as any).length;
        x = ((vRaw[0] as any)[0] as any).length;
      }
    } else {
      values = (vRaw as any[]).map((n) => Number(n) || 0);
    }
  }

  const orderRaw = (raw?.order ?? raw?.dimsOrder ?? "zyx").toLowerCase();
  const order: "zyx" | "xyz" = orderRaw === "xyz" ? "xyz" : "zyx";

  return { dims: { x, y, z }, values, order, min: raw?.min, max: raw?.max };
}

function flatten3dNested(v: number[][][]): number[] {
  const out: number[] = [];
  for (let k = 0; k < v.length; k++) {
    const yz = v[k] || [];
    for (let j = 0; j < yz.length; j++) {
      const row = yz[j] || [];
      for (let i = 0; i < row.length; i++) out.push(Number(row[i]) || 0);
    }
  }
  return out;
}

function percentileFromSorted(sorted: number[], pct: number): number {
  const p = clampFloat(pct, 0, 100) / 100;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
}

function clampInt(v: any, lo: number, hi: number) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function clampFloat(v: any, lo: number, hi: number) {
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function formatSci(v: number) {
  if (!Number.isFinite(v)) return "–";
  const av = Math.abs(v);
  if (av >= 1000 || (av > 0 && av < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

function toPlotlyColorscale(name: string) {
  const n = (name || "viridis").toLowerCase();
  if (n === "gray" || n === "grey") return "Greys";
  if (n === "turbo") return "Turbo";
  if (n === "cividis") return "Cividis";
  if (n === "inferno") return "Inferno";
  if (n === "plasma") return "Plasma";
  if (n === "magma") return "Magma";
  return "Viridis";
}
