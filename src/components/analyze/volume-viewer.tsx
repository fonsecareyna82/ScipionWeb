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
  Tooltip,
  Slider,
  IconButton,
  Popover,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import {
  BarChart3,
  ZoomIn,
  Layers3,
  HelpCircle,
  SlidersHorizontal,
} from "lucide-react";
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
  axis: "Slice axis. Z/Y/X correspond to the 3D volume axes.",
  sliceIndex: "Slice index along the selected axis.",
  colormap2d: "Colormap used for 2D slice rendering.",
  histogram: "Shows the intensity distribution of the selected volume.",
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

  // ---------- Slices controls ----------
  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState<string>("viridis");

  // ---------- Slices image ----------
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [loadingSlice, setLoadingSlice] = useState(false);
  const [frontOpacity, setFrontOpacity] = useState(1);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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

  // 3D controls (data-affecting)
  const [maxDim3d, setMaxDim3d] = useState(96);
  const [method3d, setMethod3d] = useState<"binning" | "stride" | "none">(
    "binning",
  );

  // 3D controls (appearance-only)
  const [surfaceCount, setSurfaceCount] = useState(3);
  const [opacity3d, setOpacity3d] = useState(0.2);
  const [colormap3d, setColormap3d] = useState<string>("viridis");

  const [thrMode, setThrMode] = useState<ThrMode>("percentile");
  const [thrPct, setThrPct] = useState<[number, number]>([55, 98]);
  const [thrAbs, setThrAbs] = useState<[number, number]>([0, 1]);

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

  // Load histogram (only if panel visible)
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
        if (!cancelled) {
          setHistLoading(false);
        }
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

  // Fetch current slice
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

    const useImage = (url: string) => {
      setFrontOpacity(0);
      setFrontUrl(url);
      setTimeout(() => setFrontOpacity(1), 0);
    };

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
        useImage(url);
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

  // When switching to Map3D, auto-load ONCE if never loaded for this volume
  useEffect(() => {
    if (viewMode !== "map3d") return;
    if (selectedId == null) return;

    const last = lastLoadedRef.current;
    if (last.volumeId !== selectedId) {
      load3d();
    }
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
    const vmin = sortedValues[0];
    const vmax = sortedValues[sortedValues.length - 1];
    return { min: vmin, max: vmax };
  }, [sortedValues]);

  // Initialize thresholds ONCE per volume load
  useEffect(() => {
    if (!sortedValues || selectedId == null) return;
    if (lastThrVolumeRef.current === selectedId) return;

    const loAbs = percentileFromSorted(sortedValues, 55);
    const hiAbs = percentileFromSorted(sortedValues, 98);

    setThrPct([55, 98]);
    setThrAbs([loAbs, hiAbs]);

    lastThrVolumeRef.current = selectedId;
  }, [sortedValues, selectedId]);

  // Convert percentile to absolute when needed
  const thrPctAbs = useMemo(() => {
    if (!sortedValues) return null;
    const lo = percentileFromSorted(sortedValues, thrPct[0]);
    const hi = percentileFromSorted(sortedValues, thrPct[1]);
    return [lo, hi] as [number, number];
  }, [sortedValues, thrPct]);

  const isoRange3d = useMemo(() => {
    if (!stats3d) return null;
    if (thrMode === "percentile") {
      if (!thrPctAbs) return null;
      return thrPctAbs;
    }
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
  const MAX_MUL = 1;

  const { width: vw, height: vh } = useElementSize(viewerRef);

  const fitScale = useMemo(() => {
    if (!naturalW || !naturalH || !vw || !vh) return 1;
    const sx = vw / naturalW;
    const sy = vh / naturalH;
    return Math.min(sx, sy);
  }, [naturalW, naturalH, vw, vh]);

  const renderedWidth = useMemo(() => {
    if (!naturalW) return undefined;
    return naturalW * fitScale * zoomMul;
  }, [naturalW, fitScale, zoomMul]);

  const applyZoom = (mul: number) =>
    setZoomMul(() => Math.min(MAX_MUL, Math.max(MIN_MUL, mul)));
  const stepZoom = (factor: number) => applyZoom(zoomMul * factor);
  const fitZoom = () => applyZoom(1);

  // Use native wheel listener (non-passive) to avoid warnings
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

  // ---------- UI ----------
  const showRightPanel = showHistogram || viewMode === "map3d";

  return (
    <Box sx={{ display: "flex", minHeight: 650 }}>
      {/* Left: list */}
      <Box
        sx={{
          width: 270,
          borderRight: "1px solid #eee",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ p: 1.5 }}>
          <Typography variant="subtitle2">Volumes</Typography>
          <Typography variant="caption" color="text.secondary">
            {loadingList ? "" : `${volumes.length} item(s)`}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflow: "auto" }}>
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
                      primaryTypographyProps={{ variant: "body2" }}
                      primary={v.label || `Volume ${String(v.id)}`}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      {/* Right: viewer + optional side panel */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar (short) */}
        <Paper elevation={0} square sx={{ p: 0.75, borderBottom: "1px solid #eee" }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              columnGap: 1.5,
              rowGap: 0.75,
            }}
          >
            {/* Left slot */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={viewMode}
                onChange={(_, v) => v && setViewMode(v)}
              >
                <ToggleButton value="slices">Slices</ToggleButton>
                <ToggleButton value="map3d">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <Layers3 size={14} />
                    3D Map
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>

              {viewMode === "slices" && (
                <>
                  <ParamLabel label="Axis" helpKey="axis" onHelp={openHelp} />
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

                  <Box
                    sx={{
                      minWidth: 290,
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      alignItems: "center",
                      columnGap: 1,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      1
                    </Typography>
                    <SliceSlider
                      size="small"
                      value={Math.min(sliceIndex, maxSlice)}
                      min={0}
                      max={maxSlice}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${(v as number) + 1}`}
                      onChange={(_, v) => setSliceIndex(v as number)}
                      disabled={!readySlices}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {maxSlice + 1}
                    </Typography>
                  </Box>

                  <TextField
                    size="small"
                    select
                    label="Colormap"
                    value={colormap}
                    onChange={(e) => setColormap(e.target.value)}
                    sx={{ width: 155 }}
                    SelectProps={{ MenuProps: { disablePortal: true } }}
                  >
                    {CMAP_OPTIONS.map((cm) => (
                      <MenuItem key={cm} value={cm}>
                        {cm}
                      </MenuItem>
                    ))}
                  </TextField>
                  <IconButton size="small" onClick={openHelp("colormap2d")}>
                    <HelpCircle size={14} />
                  </IconButton>
                </>
              )}

              
            </Box>

            {/* Right slot */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                justifyContent: "flex-end",
              }}
            >
              {/* Hide this button in map3d (hist toggle is inside right panel) */}
              {viewMode === "slices" && (
                <Tooltip
                  title={
                    showHistogram
                      ? "Hide intensity histogram"
                      : "Show intensity histogram"
                  }
                >
                  <span>
                    <Button
                      size="small"
                      variant={showHistogram ? "contained" : "outlined"}
                      startIcon={<BarChart3 size={16} />}
                      onClick={() => setShowHistogram((prev) => !prev)}
                      disabled={selectedId == null}
                      sx={{
                        textTransform: "none",
                        borderRadius: 999,
                        px: 1.5,
                        py: 0.25,
                        minHeight: 0,
                      }}
                    >
                      Histogram
                    </Button>
                  </span>
                </Tooltip>
              )}

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
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    minWidth: "5ch",
                    textAlign: "right",
                  }}
                >
                  {Math.round(zoomMul * 100)}%
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Main content */}
        <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Viewer column */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Canvas */}
            <Box
              ref={viewerRef}
              onDoubleClick={fitZoom}
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 1.25,
                overflow: "hidden",
                position: "relative",
                cursor: "default",
              }}
              title={viewMode === "slices" ? "Double-click to fit" : undefined}
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
                  <img
                    src={frontUrl}
                    alt="slice"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setNaturalW(img.naturalWidth);
                        setNaturalH(img.naturalHeight);
                      }
                    }}
                    style={{
                      width:
                        naturalW && renderedWidth ? `${renderedWidth}px` : undefined,
                      height: "auto",
                      display: "block",
                      transition: "opacity 140ms ease",
                      opacity: frontOpacity,
                      imageRendering: "auto",
                    }}
                  />
                ) : loadingSlice ? (
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2"></Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No image
                  </Typography>
                )
              ) : (
                // 3D view
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
                    onError={(msg) => setGpuError(msg)}
                  />
                ) : mapData && stats3d && isoRange3d ? (
                  // Fallback to Plotly if GPU fails
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
                            caps: {
                              x: { show: false },
                              y: { show: false },
                              z: { show: false },
                            },
                            opacity: opacity3d,
                            colorscale: toPlotlyColorscale(colormap3d),
                            showscale: false,
                          },
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
                        config: {
                          displaylogo: false,
                          responsive: true,
                          scrollZoom: true,
                        },
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

            {/* Meta */}
            <Divider />
            <Box sx={{ p: 1.0, display: "flex", gap: 3, flexWrap: "wrap" }}>
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

          {/* Right panel */}
          {showRightPanel && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box
                sx={{
                  flexBasis: 340,
                  flexShrink: 0,
                  minWidth: 300,
                  maxWidth: 420,
                  p: 1.25,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "background.paper",
                  gap: 1,
                }}
              >
                {/* Panel header */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {viewMode === "map3d" && (
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={showHistogram ? "hist" : "ctrl"}
                      onChange={(_, v) => {
                        if (v === "hist") setShowHistogram(true);
                        if (v === "ctrl") setShowHistogram(false);
                      }}
                    >
                      <ToggleButton value="ctrl">Controls</ToggleButton>
                      <ToggleButton value="hist">Histogram</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                  {viewMode !== "map3d" && (
                    <Typography variant="subtitle2">Histogram</Typography>
                  )}
                </Box>

                {/* Controls (map3d only, when hist off) */}
                {viewMode === "map3d" && !showHistogram && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
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
                          onChange={(e) =>
                            setMaxDim3d(clampInt(e.target.value, 48, 256))
                          }
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
                            <MenuItem key={cm} value={cm}>
                              {cm}
                            </MenuItem>
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
                          onChange={(e) =>
                            setOpacity3d(clampFloat(e.target.value, 0.05, 1))
                          }
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
                          onChange={(e) =>
                            setSurfaceCount(clampInt(e.target.value, 1, 8))
                          }
                          inputProps={{ min: 1, max: 8, step: 1 }}
                        />
                      }
                    />

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
                              const hiAdj = Math.max(lo + 1, hi);
                              setThrPct([lo, hiAdj] as [number, number]);
                            }}
                            valueLabelDisplay="auto"
                            disabled={!sortedValues}
                          />
                          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">
                              {thrPct[0]}%
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {thrPct[1]}%
                            </Typography>
                          </Box>
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
                            step={
                              stats3d
                                ? (stats3d.max - stats3d.min) / 400
                                : 0.001
                            }
                            onChange={(_, v) => {
                              const [lo, hi] = v as number[];
                              const lo2 = Math.min(lo, hi);
                              const hi2 = Math.max(lo, hi);
                              setThrAbs([lo2, hi2] as [number, number]);
                            }}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(v) => formatSci(v as number)}
                            disabled={!stats3d}
                          />
                          {stats3d && (
                            <Typography variant="caption" color="text.secondary">
                              {formatSci(thrAbs[0])} – {formatSci(thrAbs[1])}
                            </Typography>
                          )}
                        </>
                      )}
                    </Box>
                  </Box>
                )}

                {/* Histogram */}
                {(showHistogram || viewMode !== "map3d") && (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      minHeight: 0,
                      flex: 1,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Intensity histogram
                    </Typography>

                    {selectedId == null ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                      >
                        Select a volume to see the histogram.
                      </Typography>
                    ) : histLoading ? (
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          alignItems: "center",
                          mt: 1,
                        }}
                      >
                        <CircularProgress size={16} />
                        <Typography variant="caption">
                          Loading histogram…
                        </Typography>
                      </Box>
                    ) : histError ? (
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{ mt: 1 }}
                      >
                        {histError}
                      </Typography>
                    ) : histogram && histogram.binEdges.length > 1 ? (
                      <Box sx={{ mt: 1, flex: 1, minHeight: 0 }}>
                        <Plot
                          data={[
                            {
                              type: "bar",
                              x: histogram.binEdges
                                .slice(0, -1)
                                .map(
                                  (b, i) =>
                                    0.5 * (b + histogram.binEdges[i + 1]),
                                ),
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
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                      >
                        No histogram data.
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </>
          )}
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

/** Small label with optional help icon for toolbar. */
function ParamLabel({
  label,
  helpKey,
  onHelp,
}: {
  label: string;
  helpKey?: string;
  onHelp: (key: string) => (e: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {helpKey && (
        <IconButton size="small" onClick={onHelp(helpKey)}>
          <HelpCircle size={14} />
        </IconButton>
      )}
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

/** Observe a DOM element size */
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

/** Interpret backend dims as Z,Y,X and expose as {x,y,z} */
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

/** Normalize different possible payloads for 3D data. */
function normalize3dPayload(raw: any): {
  dims: { x: number; y: number; z: number };
  values: number[];
  order: "zyx" | "xyz";
  min?: number;
  max?: number;
} {
  const dimsRaw = raw?.dims;
  const shapeRaw = raw?.shape ?? raw?.size;

  let x = 0,
    y = 0,
    z = 0;

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

  return {
    dims: { x, y, z },
    values,
    order,
    min: raw?.min,
    max: raw?.max,
  };
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

/** Fast percentile lookup from pre-sorted array. */
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

/** Map internal names to Plotly colorscales. */
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
