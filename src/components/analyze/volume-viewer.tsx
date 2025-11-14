// volume-viewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Typography, CircularProgress, List, ListItemButton, ListItemText,
  Divider, ToggleButtonGroup, ToggleButton, TextField, MenuItem, Paper,
} from "@mui/material";
import Slider from "@mui/material/Slider";
import { styled } from "@mui/material/styles";
import { useProjectService } from "@/ProjectServiceContext";

type VolumeViewerProps = { projectId: string | number; protocolId: string | number; outputName: string; };
type VolumeLite = { id: string | number; label?: string; name?: string };

const DEFAULT_AXIS: "z" | "y" | "x" = "z";
const CMAP_OPTIONS = ["viridis", "gray", "magma", "plasma", "inferno", "cividis", "turbo"];

function useDebounced<T>(value: T, delay = 80): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id); }, [value, delay]);
  return debounced;
}

type CacheEntry = { url: string; revoke: () => void };
class Lru {
  private max: number; private map = new Map<string, CacheEntry>();
  constructor(max = 28) { this.max = max; }
  get(k: string) { const v = this.map.get(k); if (!v) return undefined; this.map.delete(k); this.map.set(k, v); return v; }
  set(k: string, v: CacheEntry) {
    if (this.map.has(k)) { this.map.get(k)!.revoke(); this.map.delete(k); }
    this.map.set(k, v);
    if (this.map.size > this.max) { const fk = this.map.keys().next().value as string; const f = this.map.get(fk)!; f.revoke(); this.map.delete(fk); }
  }
  clear() { for (const [, v] of this.map) v.revoke(); this.map.clear(); }
}

const SliceSlider = styled(Slider)(({ theme }) => ({
  height: 4, paddingTop: 16, paddingBottom: 28,
  "& .MuiSlider-thumb": { width: 14, height: 14 },
  "& .MuiSlider-valueLabel": {
    top: "unset", bottom: -28, transform: "none",
    background: "transparent", color: theme.palette.text.secondary,
    fontSize: "0.75rem", fontWeight: 500, "&:before": { display: "none" },
  },
}));

export default function VolumeViewer({ projectId, protocolId, outputName }: VolumeViewerProps) {
  const svc = useProjectService();

  // Left list
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<VolumeLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // Meta
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // Controls
  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState("viridis");

  // Two-layer image cross-fade
  const [currUrl, setCurrUrl] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [currOpacity, setCurrOpacity] = useState(1);
  const [nextOpacity, setNextOpacity] = useState(0);

  const [imgError, setImgError] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const debouncedSliceIndex = useDebounced(sliceIndex, isScrubbing ? 40 : 90);

  const reqIdRef = useRef(0);
  const cacheRef = useRef(new Lru(32));

  // Spinner with deflicker and hard stop
  const spinnerTimerRef = useRef<number | null>(null);
  const spinnerHardStopRef = useRef<number | null>(null);
  const startSpinner = () => {
    if (spinnerTimerRef.current == null) {
      spinnerTimerRef.current = window.setTimeout(() => { setImgLoading(true); spinnerTimerRef.current = null; }, isScrubbing ? 50 : 120);
    }
    if (spinnerHardStopRef.current == null) {
      spinnerHardStopRef.current = window.setTimeout(() => { setImgLoading(false); spinnerHardStopRef.current = null; }, 6000);
    }
  };
  const stopSpinner = () => {
    if (spinnerTimerRef.current != null) { clearTimeout(spinnerTimerRef.current); spinnerTimerRef.current = null; }
    if (spinnerHardStopRef.current != null) { clearTimeout(spinnerHardStopRef.current); spinnerHardStopRef.current = null; }
    setImgLoading(false);
  };

  // Load volumes list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true); setListError(null);
        const items: any[] = await svc.listOutputVolumes(projectId, protocolId, outputName);
        if (cancelled) return;
        const mapped: VolumeLite[] = (items || []).map((v: any, i: number) => ({
          id: v?.id ?? i, label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`, name: v?.name,
        }));
        setVolumes(mapped);
        setSelectedId(prev => {
          const exists = mapped.find(m => String(m.id) === String(prev ?? -1));
          return exists ? (prev as any) : mapped[0]?.id ?? null;
        });
      } catch (e: any) {
        if (!cancelled) setListError(e?.message || "Failed to list volumes");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, protocolId, outputName, svc]);

  // Hard reset on volume change
  useEffect(() => {
    stopSpinner();
    setIsScrubbing(false);
    setImgError(null);
    setCurrUrl(null);
    setNextUrl(null);
    setCurrOpacity(1);
    setNextOpacity(0);
    setZoom(1);
    cacheRef.current.clear();
  }, [selectedId]);

  // Fetch metadata
  useEffect(() => {
    if (selectedId == null) { setMeta(null); return; }
    let cancelled = false;
    (async () => {
      try {
        setMetaLoading(true); setMetaError(null);
        const info = await svc.getVolumeInfo(projectId, protocolId, outputName, selectedId);
        if (cancelled) return;
        setMeta(info || null);
      } catch (e: any) {
        if (!cancelled) setMetaError(e?.message || "Failed to fetch volume info");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, projectId, protocolId, outputName, svc]);

  // Dims with order awareness
  const dims = useMemo(() => getDims(meta), [meta, axis]);
  const maxSlice = Math.max(0, dims[axis] - 1);

  // Center slice when axis/volume/dims change
  useEffect(() => {
    const mid = Math.max(0, Math.floor(maxSlice / 2));
    setSliceIndex(mid);
  }, [selectedId, axis, maxSlice]);

  const readyForSlice = selectedId != null && !!meta && dims[axis] > 0;
  const keyFor = (idx: number) => `${selectedId}|${axis}|${idx}|${colormap}`;

  // Prefetch neighbors
  const prefetchNeighbor = async (idx: number) => {
    if (!readyForSlice || idx < 0 || idx > maxSlice) return;
    const k = keyFor(idx);
    if (cacheRef.current.get(k)) return;
    try {
      const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
        projectId, protocolId, outputName, selectedId!, idx, { axis, cmap: colormap }
      );
      cacheRef.current.set(k, { url, revoke });
    } catch { /* ignore prefetch errors */ }
  };

  // Fetch current slice (ALWAYS, even while scrubbing; debounced)
  useEffect(() => {
    if (!readyForSlice) { setImgError(null); return; }
    const idx = Math.max(0, Math.min(debouncedSliceIndex, maxSlice));
    const k = keyFor(idx);
    const cached = cacheRef.current.get(k);

    const myReq = ++reqIdRef.current;
    const ac = new AbortController();

    if (cached) {
      setImgError(null);
      // Cross-fade into cached
      setNextUrl(cached.url);
      setNextOpacity(0);
      // trigger fade
      requestAnimationFrame(() => setNextOpacity(1));
      prefetchNeighbor(idx - 1);
      prefetchNeighbor(idx + 1);
      return () => { ac.abort(); stopSpinner(); };
    }

    setImgError(null);
    startSpinner();
    setNextOpacity(0);

    (async () => {
      try {
        const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
          projectId, protocolId, outputName, selectedId!, idx, { axis, cmap: colormap, signal: ac.signal as any }
        );
        if (reqIdRef.current !== myReq) { revoke(); return; }
        cacheRef.current.set(k, { url, revoke });
        setNextUrl(url);
        requestAnimationFrame(() => setNextOpacity(1)); // start fade-in
        prefetchNeighbor(idx - 1);
        prefetchNeighbor(idx + 1);
      } catch (e: any) {
        if (reqIdRef.current === myReq && e?.name !== "AbortError") {
          setImgError(e?.message || "Failed to render slice");
        }
      } finally {
        if (reqIdRef.current === myReq) stopSpinner();
      }
    })();

    return () => { ac.abort(); stopSpinner(); };
  }, [
    readyForSlice, svc, projectId, protocolId, outputName, selectedId,
    debouncedSliceIndex, axis, colormap, maxSlice
  ]);

  // When next image finishes loading → swap to current and hide next
  const onNextLoad = () => {
    setCurrUrl(nextUrl);
    setCurrOpacity(1);
    setNextOpacity(0);
  };

  // Clear cache on key changes
  useEffect(() => { cacheRef.current.clear(); }, [colormap, axis, selectedId]);
  useEffect(() => () => cacheRef.current.clear(), []);

  // Zoom
  const [zoom, setZoom] = useState(1);
  const imgWrapperRef = useRef<HTMLDivElement | null>(null);
  const onWheelZoom: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!currUrl && !nextUrl) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(z => Math.min(8, Math.max(0.25, z * factor)));
  };

  return (
    <Box sx={{ display: "flex", minHeight: 700 }}>
      {/* Left list */}
      <Box sx={{ width: 280, borderRight: "1px solid #eee", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 1.5 }}>
          <Typography variant="subtitle2">Volumes</Typography>
          <Typography variant="caption" color="text.secondary">
            {loadingList ? "Loading…" : `${volumes.length} item(s)`}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {loadingList ? (
            <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading list…</Typography>
            </Box>
          ) : listError ? (
            <Box sx={{ p: 2 }}><Typography variant="body2" color="error">{listError}</Typography></Box>
          ) : volumes.length === 0 ? (
            <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">No volumes in this output.</Typography></Box>
          ) : (
            <List dense disablePadding>
              {volumes.map(v => {
                const selected = String(selectedId) === String(v.id);
                return (
                  <ListItemButton key={String(v.id)} selected={selected} onClick={() => setSelectedId(v.id)} sx={{ px: 1.5, py: 1 }}>
                    <ListItemText primaryTypographyProps={{ variant: "body2" }} primary={v.label || `Volume ${String(v.id)}`} />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      {/* Viewer */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar */}
        <Paper elevation={0} square sx={{ p: 1, borderBottom: "1px solid #eee" }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Axis</Typography>
              <ToggleButtonGroup size="small" value={axis} exclusive onChange={(_, v) => v && setAxis(v)} sx={{ ml: 1 }}>
                <ToggleButton value="z">Z</ToggleButton>
                <ToggleButton value="y">Y</ToggleButton>
                <ToggleButton value="x">X</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Slider */}
            <Box sx={{ minWidth: 320, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", columnGap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ pr: 1, minWidth: 18, textAlign: "left" }}>1</Typography>
              <SliceSlider
                size="small"
                value={Math.min(sliceIndex, maxSlice)}
                min={0}
                max={maxSlice}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${(v as number) + 1}`}
                getAriaValueText={(v) => `slice ${(v as number) + 1} of ${maxSlice + 1}`}
                onMouseDownCapture={() => setIsScrubbing(true)}
                onTouchStartCapture={() => setIsScrubbing(true)}
                onChange={(_, v) => setSliceIndex(v as number)}
                onChangeCommitted={() => setIsScrubbing(false)}
                disabled={!readyForSlice}
                aria-label="slice-index"
              />
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1, minWidth: 24, textAlign: "right" }}>{maxSlice + 1}</Typography>
            </Box>

            {/* Colormap */}
            <TextField size="small" select label="Colormap" value={colormap} onChange={(e) => setColormap(e.target.value)} sx={{ width: 180 }}>
              {CMAP_OPTIONS.map(cm => <MenuItem key={cm} value={cm}>{cm}</MenuItem>)}
            </TextField>

            <Typography variant="caption" color="text.secondary">Zoom: {Math.round(zoom * 100)}%</Typography>
          </Box>
        </Paper>

        {/* Canvas with cross-fade */}
        <Box
          ref={imgWrapperRef}
          onWheel={onWheelZoom}
          sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", p: 2, overflow: "auto", position: "relative" }}
        >
          {metaLoading ? (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2"></Typography>
            </Box>
          ) : metaError ? (
            <Typography variant="body2" color="error">{metaError}</Typography>
          ) : selectedId == null ? (
            <Typography variant="body2" color="text.secondary">Select a volume</Typography>
          ) : (
            <>
              {/* Current image (below) */}
              {currUrl && (
                <img
                  src={currUrl}
                  alt="current-slice"
                  style={{
                    maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block",
                    transform: `scale(${zoom})`, transformOrigin: "center center",
                    position: "absolute", inset: 16, margin: "auto", opacity: currOpacity, transition: "opacity 160ms ease-in-out",
                  }}
                />
              )}
              {/* Incoming image (above) */}
              {nextUrl && (
                <img
                  src={nextUrl}
                  alt="next-slice"
                  onLoad={onNextLoad}
                  style={{
                    maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block",
                    transform: `scale(${zoom})`, transformOrigin: "center center",
                    position: "absolute", inset: 16, margin: "auto", opacity: nextOpacity, transition: "opacity 160ms ease-in-out",
                  }}
                />
              )}
              {!currUrl && !nextUrl && (
                imgLoading ? (
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2"></Typography>
                  </Box>
                ) : imgError ? (
                  <Typography variant="body2" color="error">{imgError}</Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary"></Typography>
                )
              )}
            </>
          )}
        </Box>

        {/* Meta footer */}
        <Divider />
        <Box sx={{ p: 1.5, display: "flex", gap: 3, flexWrap: "wrap" }}>
          <MetaItem label="Dims" value={dimsToString(meta)} />
          {"min" in (meta || {}) && <MetaItem label="Min" value={num(meta?.min)} />}
          {"max" in (meta || {}) && <MetaItem label="Max" value={num(meta?.max)} />}
          {"mean" in (meta || {}) && <MetaItem label="Mean" value={num(meta?.mean)} />}
          {"std" in (meta || {}) && <MetaItem label="Std" value={num(meta?.std)} />}
        </Box>
      </Box>
    </Box>
  );
}

// ----- dims helpers (respect dimsOrder) -----
function getDims(info: any): Record<"x" | "y" | "z", number> {
  const arr = (info?.dims || info?.shape || info?.size) as number[] | undefined;
  const order = (info?.dimsOrder || "").toLowerCase(); // e.g., "zyx"
  if (Array.isArray(arr) && arr.length >= 3) {
    if (order === "zyx") { const [z, y, x] = arr as number[]; return { x, y, z }; }
    if (order === "yzx") { const [y, z, x] = arr as number[]; return { x, y, z }; }
    // default assume xyz
    const [x, y, z] = arr as number[];
    return { x, y, z };
  }
  return { x: info?.width ?? 0, y: info?.height ?? 0, z: info?.depth ?? info?.slices ?? 0 };
}
function dimsToString(info: any) { const d = getDims(info); return d.x && d.y && d.z ? `${d.x} × ${d.y} × ${d.z}` : "–"; }
function num(n: any) { return Number.isFinite(n) ? Number(n).toFixed(3) : "–"; }
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}:</Typography>
      <Typography variant="caption">{value}</Typography>
    </Box>
  );
}
