// src/components/analyze/volume-viewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@mui/material";
import { styled } from "@mui/material/styles";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import { BarChart3, ZoomIn, Layers3 } from "lucide-react";
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

const SliceSlider = styled(Slider)(({ theme }) => ({
  height: 4,
  paddingTop: 16,
  paddingBottom: 36,
  "& .MuiSlider-thumb": { width: 14, height: 14 },
  "& .MuiSlider-valueLabel": {
    top: "unset",
    bottom: -30,
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

  // Thr two modes
  const [thrMode, setThrMode] = useState<"pct" | "abs">("pct");
  const [thrPct, setThrPct] = useState<[number, number]>([55, 98]);
  const [thrAbs, setThrAbs] = useState<[number, number]>([0, 1]);

  const lastLoadedRef = useRef<{
    volumeId: string | number | null;
    maxDim: number;
    method: "binning" | "stride" | "none";
  }>({ volumeId: null, maxDim: 96, method: "binning" });

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
  const load3d = async () => {
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
  };

  // When switching to Map3D, auto-load once per volume
  useEffect(() => {
    if (viewMode !== "map3d") return;
    if (selectedId == null) return;

    const last = lastLoadedRef.current;
    if (last.volumeId !== selectedId) {
      load3d();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedId]);

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

  const robustRange = useMemo(() => {
    if (!sortedValues || sortedValues.length === 0) return null;
    const lo = percentileFromSorted(sortedValues, 0.5);
    const hi = percentileFromSorted(sortedValues, 99.5);
    return { lo, hi };
  }, [sortedValues]);

  useEffect(() => {
    if (!sortedValues) return;
    const isoMin0 = percentileFromSorted(sortedValues, thrPct[0]);
    const isoMax0 = percentileFromSorted(sortedValues, thrPct[1]);
    setThrAbs([isoMin0, isoMax0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedValues]);

  const stats3d = useMemo(() => {
    if (!sortedValues || sortedValues.length === 0) return null;

    const vmin = sortedValues[0];
    const vmax = sortedValues[sortedValues.length - 1];

    let isoMin: number;
    let isoMax: number;

    if (thrMode === "abs") {
      isoMin = thrAbs[0];
      isoMax = thrAbs[1];
    } else {
      isoMin = percentileFromSorted(sortedValues, thrPct[0]);
      isoMax = percentileFromSorted(sortedValues, thrPct[1]);
    }

    isoMin = Math.max(vmin, Math.min(vmax, isoMin));
    isoMax = Math.max(isoMin, Math.min(vmax, isoMax));

    return { min: vmin, max: vmax, isoMin, isoMax };
  }, [sortedValues, thrPct, thrAbs, thrMode]);

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

  // Native wheel listener to avoid passive warning
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
  return (
    <Box sx={{ display: "flex", minHeight: 650 }}>
      {/* Left: list */}
      <Box
        sx={{
          width: 280,
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

      {/* Right: viewer + optional histogram panel */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar */}
        <Paper
          elevation={0}
          square
          sx={{
            p: 0.75,
            borderBottom: "1px solid #eee",
            zIndex: (theme) => theme.zIndex.appBar,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              columnGap: 1.5,
              rowGap: 0.75,
            }}
          >
            {/* Left slot */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
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
                      minWidth: 300,
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
                    sx={{ width: 160 }}
                    SelectProps={{
                      MenuProps: { disablePortal: true },
                    }}
                  >
                    {CMAP_OPTIONS.map((cm) => (
                      <MenuItem key={cm} value={cm}>
                        {cm}
                      </MenuItem>
                    ))}
                  </TextField>
                </>
              )}

              {viewMode === "map3d" && (
                <>
                  {/* Data params */}
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <TextField
                      size="small"
                      label="maxDim"
                      type="number"
                      value={maxDim3d}
                      onChange={(e) => setMaxDim3d(clampInt(e.target.value, 48, 256))}
                      sx={{ width: 110 }}
                      inputProps={{ min: 48, max: 256, step: 8 }}
                    />
                    <HelpMini title="maxDim">
                      Maximum dimension for downsampled 3D data. Higher = better quality but slower.
                    </HelpMini>
                  </Box>

                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <TextField
                      size="small"
                      select
                      label="Method"
                      value={method3d}
                      onChange={(e) => setMethod3d(e.target.value as any)}
                      sx={{ width: 120 }}
                      SelectProps={{
                        MenuProps: { disablePortal: true },
                      }}
                    >
                      <MenuItem value="binning">binning</MenuItem>
                      <MenuItem value="stride">stride</MenuItem>
                      <MenuItem value="none">none</MenuItem>
                    </TextField>
                    <HelpMini title="Method">
                      Downsampling method. Binning averages voxels; stride skips voxels; none uses full data.
                    </HelpMini>
                  </Box>

                  <Button
                    size="small"
                    variant={dataDirty ? "contained" : "outlined"}
                    onClick={load3d}
                    disabled={selectedId == null || mapLoading}
                    sx={{ textTransform: "none", borderRadius: 999, px: 1.5 }}
                  >
                    Reload
                  </Button>

                  {/* Appearance params */}
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <TextField
                      size="small"
                      select
                      label="Colormap"
                      value={colormap3d}
                      onChange={(e) => setColormap3d(e.target.value)}
                      sx={{ width: 140 }}
                      SelectProps={{
                        MenuProps: { disablePortal: true },
                      }}
                    >
                      {CMAP_OPTIONS.map((cm) => (
                        <MenuItem key={cm} value={cm}>
                          {cm}
                        </MenuItem>
                      ))}
                    </TextField>
                    <HelpMini title="Colormap">
                      Color palette for the 3D rendering.
                    </HelpMini>
                  </Box>

                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <TextField
                      size="small"
                      label="Surfaces"
                      type="number"
                      value={surfaceCount}
                      onChange={(e) => setSurfaceCount(clampInt(e.target.value, 1, 8))}
                      sx={{ width: 100 }}
                      inputProps={{ min: 1, max: 8, step: 1 }}
                    />
                    <HelpMini title="Surfaces">
                      Number of iso-surfaces for Plotly fallback. GPU view ignores this.
                    </HelpMini>
                  </Box>

                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                    <TextField
                      size="small"
                      label="Opacity"
                      type="number"
                      value={opacity3d}
                      onChange={(e) => setOpacity3d(clampFloat(e.target.value, 0.05, 1))}
                      sx={{ width: 100 }}
                      inputProps={{ min: 0.05, max: 1, step: 0.05 }}
                    />
                    <HelpMini title="Opacity">
                      Overall transparency of the 3D volume.
                    </HelpMini>
                  </Box>

                  {/* Thr block */}
                  <Box sx={{ minWidth: 260 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Thr
                      </Typography>

                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={thrMode}
                        onChange={(_, v) => v && setThrMode(v)}
                      >
                        <ToggleButton value="pct">Percentile</ToggleButton>
                        <ToggleButton value="abs">Absolute</ToggleButton>
                      </ToggleButtonGroup>

                      <HelpMini title="Thr">
                        Percentile selects iso range from histogram percentiles (robust).
                        Absolute sets iso range in density units, like CryoSPARC.
                      </HelpMini>
                    </Box>

                    {thrMode === "pct" ? (
                      <>
                        <Slider
                          size="small"
                          value={thrPct}
                          min={0}
                          max={100}
                          onChange={(_, v) => {
                            const [lo, hi] = v as number[];
                            setThrPct([Math.min(lo, hi - 1), hi]);
                          }}
                          valueLabelDisplay="auto"
                          disabled={!sortedValues}
                        />
                        {stats3d && (
                          <Typography variant="caption" color="text.secondary">
                            isoMin={stats3d.isoMin.toFixed(3)} / isoMax={stats3d.isoMax.toFixed(3)}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <>
                        <Slider
                          size="small"
                          value={thrAbs}
                          min={robustRange?.lo ?? stats3d?.min ?? 0}
                          max={robustRange?.hi ?? stats3d?.max ?? 1}
                          step={
                            robustRange
                              ? (robustRange.hi - robustRange.lo) / 200
                              : undefined
                          }
                          onChange={(_, v) => {
                            const [lo, hi] = v as number[];
                            setThrAbs([Math.min(lo, hi), Math.max(lo, hi)]);
                          }}
                          valueLabelDisplay="auto"
                          disabled={!sortedValues}
                        />

                        <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                          <TextField
                            size="small"
                            label="isoMin"
                            type="number"
                            value={thrAbs[0]}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) {
                                setThrAbs(([_, hi]) => [v, Math.max(v, hi)]);
                              }
                            }}
                            sx={{ width: 120 }}
                          />
                          <TextField
                            size="small"
                            label="isoMax"
                            type="number"
                            value={thrAbs[1]}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) {
                                setThrAbs(([lo, _]) => [Math.min(lo, v), v]);
                              }
                            }}
                            sx={{ width: 120 }}
                          />
                        </Box>
                      </>
                    )}
                  </Box>
                </>
              )}
            </Box>

            <Box />

            {/* Right slot */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                justifyContent: "flex-end",
              }}
            >
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
                p: 1.5,
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
                // --- 3D view ---
                mapLoading ? (
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2">Loading 3D volume…</Typography>
                  </Box>
                ) : mapError ? (
                  <Typography variant="body2" color="error">
                    {mapError}
                  </Typography>
                ) : mapData && stats3d && !gpuError ? (
                  <GpuVolumeView
                    values={mapData.values}
                    dims={mapData.dims}
                    order={mapData.order}
                    spacing={meta?.spacing}
                    rangeMin={stats3d.min}
                    rangeMax={stats3d.max}
                    isoMin={stats3d.isoMin}
                    isoMax={stats3d.isoMax}
                    opacity={opacity3d}
                    colormap={colormap3d}
                    onError={(msg) => setGpuError(msg)}
                  />
                ) : mapData && stats3d ? (
                  // Fallback to Plotly if GPU fails
                  <Box sx={{ width: "100%", height: "100%" }}>
                    <Plot
                      data={[
                        {
                          type: "isosurface",
                          value: mapData.values,
                          isomin: stats3d.isoMin,
                          isomax: stats3d.isoMax,
                          surface: { count: surfaceCount },
                          caps: {
                            x: { show: false },
                            y: { show: false },
                            z: { show: false },
                          },
                          opacity: opacity3d,
                          colorscale: toPlotlyColorscale(colormap3d),
                          showscale: false,
                        } as any,
                      ]}
                      layout={{
                        autosize: true,
                        margin: { l: 0, r: 0, t: 0, b: 0 },
                        scene: {
                          aspectmode: "data",
                          xaxis: { visible: false },
                          yaxis: { visible: false },
                          zaxis: { visible: false },
                        },
                        showlegend: false,
                      }}
                      style={{ width: "100%", height: "100%" }}
                      useResizeHandler
                      config={{
                        displaylogo: false,
                        responsive: true,
                        scrollZoom: true,
                      }}
                    />
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
            <Box sx={{ p: 1.25, display: "flex", gap: 3, flexWrap: "wrap" }}>
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

          {/* Histogram side panel */}
          {showHistogram && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box
                sx={{
                  flexBasis: 360,
                  flexShrink: 0,
                  minWidth: 320,
                  maxWidth: 480,
                  p: 1.25,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "background.paper",
                }}
              >
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
                  <Box sx={{ mt: 1, flex: 1, minHeight: 0 }}>
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
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** Help button as local tooltip (no parent rerender). */
function HelpMini({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <IconButton
        ref={anchorRef}
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        sx={{
          width: 20,
          height: 20,
          fontSize: 12,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        ?
      </IconButton>

      <Tooltip
        open={open}
        onClose={() => setOpen(false)}
        title={
          <Box sx={{ p: 0.5, maxWidth: 280 }}>
            {title && (
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {title}
              </Typography>
            )}
            <Typography variant="body2">{children}</Typography>
          </Box>
        }
        placement="bottom-start"
        arrow
        PopperProps={{
          anchorEl: anchorRef.current,
          disablePortal: false,
        }}
      >
        <span />
      </Tooltip>
    </>
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
