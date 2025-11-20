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
} from "@mui/material";
import Slider from "@mui/material/Slider";
import { styled } from "@mui/material/styles";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import { BarChart3, ZoomIn } from "lucide-react";

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

const DEFAULT_AXIS: "z" | "y" | "x" = "z";
const CMAP_OPTIONS = ["viridis", "gray", "magma", "plasma", "inferno", "cividis", "turbo"];

/** Debounce tiny scrubs. */
function useDebounced<T>(value: T, delay = 50): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Observe a DOM element size (content box). Generic to accept any Element. */
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

type CacheEntry = { url: string; revoke: () => void };
class Lru {
  private max: number;
  private map = new Map<string, CacheEntry>();
  constructor(max = 32) {
    this.max = max;
  }
  get(k: string) {
    const v = this.map.get(k);
    if (!v) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: string, v: CacheEntry) {
    if (this.map.has(k)) {
      this.map.get(k)!.revoke();
      this.map.delete(k);
    }
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const fk = this.map.keys().next().value as string;
      const f = this.map.get(fk)!;
      f.revoke();
      this.map.delete(fk);
    }
  }
  clear() {
    for (const [, v] of this.map) v.revoke();
    this.map.clear();
  }
}

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

  // ---------- Histogram (volume-level intensity distribution) ----------
  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);
  const [showHistogram, setShowHistogram] = useState(false);

  // ---------- Controls ----------
  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0); // 0-based
  const [colormap, setColormap] = useState<string>("viridis");

  // ---------- Image ----------
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [frontOpacity, setFrontOpacity] = useState(1);

  const debouncedIndex = useDebounced(sliceIndex, 40);
  const reqIdRef = useRef(0);
  const cacheRef = useRef(new Lru(32));
  const abortRef = useRef<AbortController | null>(null);

  // Load list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        setListError(null);
        const items = await svc.listOutputVolumes(projectId, protocolId, outputName);
        if (cancelled) return;
        const mapped: VolumeLite[] = (items || []).map((v: any, i: number) => ({
          id: v?.id ?? i,
          label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`,
          name: v?.name,
        }));
        setVolumes(mapped);
        setSelectedId((prev) => {
          const exists = mapped.find((m) => String(m.id) === String(prev ?? -999));
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

  // Hard reset on volume/colormap/axis change
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setImgError(null);
    setFrontUrl(null);
    setFrontOpacity(1);
    cacheRef.current.clear();
  }, [selectedId, colormap, axis]);

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
        if (!cancelled) setMetaError(e?.message || "Failed to fetch volume info");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, projectId, protocolId, outputName, svc]);

  // Load histogram for the selected volume (only if panel is visible)
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

        if (!h) {
          setHistogram(null);
          return;
        }

        const raw: any = h;
        const binEdges: number[] =
          raw.binEdges ??
          raw.bin_edges ??
          raw.bins ??
          [];
        const counts: number[] =
          raw.counts ??
          raw.values ??
          [];

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

  // Dims (backend dims = Z,Y,X -> expose {x,y,z})
  const dims = useMemo(() => getDimsZYXtoXYZ(meta), [meta]);
  const maxSlice = Math.max(0, dims[axis] - 1);

  // Recenter on axis/volume change
  useEffect(() => {
    const mid = Math.max(0, Math.floor(maxSlice / 2));
    setSliceIndex(mid);
  }, [selectedId, axis, maxSlice]);

  const ready = selectedId != null && !!meta && dims[axis] > 0;
  const keyFor = (idx: number) => `${selectedId}|${axis}|${idx}|${colormap}`;

  // Prefetch neighbors
  const prefetch = async (idx: number) => {
    if (!ready || idx < 0 || idx > maxSlice) return;
    const k = keyFor(idx);
    if (cacheRef.current.get(k)) return;
    try {
      const ac = new AbortController();
      const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
        projectId,
        protocolId,
        outputName,
        selectedId!,
        idx,
        { axis, cmap: colormap, signal: ac.signal },
      );
      cacheRef.current.set(k, { url, revoke });
    } catch {
      // ignore
    }
  };

  // Fetch current slice (live while scrubbing, with abort)
  useEffect(() => {
    if (!ready) {
      setImgError(null);
      return;
    }

    const idx = Math.max(0, Math.min(debouncedIndex, maxSlice));
    const k = keyFor(idx);
    const cached = cacheRef.current.get(k);

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
        setLoading(!cached);
        if (cached) {
          useImage(cached.url);
          prefetch(idx - 1);
          prefetch(idx + 1);
          return;
        }
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
        cacheRef.current.set(k, { url, revoke });
        useImage(url);
        prefetch(idx - 1);
        prefetch(idx + 1);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (reqIdRef.current === myReq) {
          setImgError(e?.message || "Failed to render slice");
        }
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    })();

    return () => {
      myAbort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, debouncedIndex, axis, colormap, selectedId]);

  // ---------- Fit-aware zoom (100% == fit; cap at 100%) ----------
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const { width: vw, height: vh } = useElementSize(viewerRef);

  const [naturalW, setNaturalW] = useState<number | null>(null);
  const [naturalH, setNaturalH] = useState<number | null>(null);

  // zoomMul relative to fit (cap at 1 == 100%)
  const [zoomMul, setZoomMul] = useState(1);
  const MIN_MUL = 0.25;
  const MAX_MUL = 1;

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

  const onWheelZoom: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!frontUrl) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    stepZoom(factor);
  };

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
        <Paper elevation={0} square sx={{ p: 1, borderBottom: "1px solid #eee" }}>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {/* Axis */}
            <Box>
              <Typography variant="caption" color="text.secondary">
                Axis
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={axis}
                exclusive
                onChange={(_, v) => v && setAxis(v)}
                sx={{ ml: 1 }}
              >
                <ToggleButton value="z">Z</ToggleButton>
                <ToggleButton value="y">Y</ToggleButton>
                <ToggleButton value="x">X</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Slider */}
            <Box
              sx={{
                minWidth: 320,
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                columnGap: 1,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ pr: 1, minWidth: 18, textAlign: "left" }}
              >
                1
              </Typography>
              <SliceSlider
                size="small"
                value={Math.min(sliceIndex, maxSlice)}
                min={0}
                max={maxSlice}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${(v as number) + 1}`}
                getAriaValueText={(v) =>
                  `slice ${(v as number) + 1} of ${maxSlice + 1}`
                }
                onChange={(_, v) => setSliceIndex(v as number)}
                disabled={!ready}
                aria-label="slice-index"
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ pl: 1, minWidth: 24, textAlign: "right" }}
              >
                {maxSlice + 1}
              </Typography>
            </Box>

            {/* Colormap */}
            <TextField
              size="small"
              select
              label="Colormap"
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              sx={{ width: 180 }}
            >
              {CMAP_OPTIONS.map((cm) => (
                <MenuItem key={cm} value={cm}>
                  {cm}
                </MenuItem>
              ))}
            </TextField>

            {/* Right side: histogram toggle + fit/zoom */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                ml: "auto",
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
                      marginRight: 2
                    }}
                  >
                    Histogram
                  </Button>
                </span>
              </Tooltip>

              {/* Zoom display, ancho fijo para que no “baile” */}
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "default",
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

        {/* Main content: viewer + optional side panel */}
        <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Viewer column */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {/* Canvas (fit; capped at 100%) */}
            <Box
              ref={viewerRef}
              onWheel={onWheelZoom}
              onDoubleClick={fitZoom}
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 2,
                overflow: "hidden",
                position: "relative",
                cursor: "default",
              }}
              title="Double-click to fit"
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
              ) : imgError ? (
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
              ) : loading ? (
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2"></Typography>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No image
                </Typography>
              )}
            </Box>

            {/* Meta */}
            <Divider />
            <Box sx={{ p: 1.5, display: "flex", gap: 3, flexWrap: "wrap" }}>
              <MetaItem label="Dims" value={dimsToStringXYZ(dims)} />
              {"min" in (meta || {}) && (
                <MetaItem label="Min" value={num(meta?.min)} />
              )}
              {"max" in (meta || {}) && (
                <MetaItem label="Max" value={num(meta?.max)} />
              )}
              {"mean" in (meta || {}) && (
                <MetaItem label="Mean" value={num(meta?.mean)} />
              )}
              {"std" in (meta || {}) && (
                <MetaItem label="Std" value={num(meta?.std)} />
              )}
            </Box>
          </Box>

          {/* Histogram side panel */}
          {showHistogram && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box
                sx={{
                  flexBasis: 420,
                  flexShrink: 0,
                  minWidth: 360,
                  maxWidth: 520,
                  p: 1.5,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "background.paper",
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
                    <Typography variant="caption">Loading histogram…</Typography>
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
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** Interpret backend dims as Z,Y,X and expose as {x,y,z} */
function getDimsZYXtoXYZ(
  info: any,
): Record<"x" | "y" | "z", number> {
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
