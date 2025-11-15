// volume-viewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Typography, CircularProgress, List, ListItemButton, ListItemText,
  Divider, ToggleButtonGroup, ToggleButton, TextField, MenuItem, Paper,
} from "@mui/material";
import Slider from "@mui/material/Slider";
import { styled } from "@mui/material/styles";
import { useProjectService } from "@/ProjectServiceContext";

type VolumeViewerProps = { projectId: string | number; protocolId: string | number; protocolLabel: string; outputName: string; };
type VolumeLite = { id: string | number; label?: string; name?: string };

const DEFAULT_AXIS: "z" | "y" | "x" = "z";
const CMAP_OPTIONS = ["viridis", "gray", "magma", "plasma", "inferno", "cividis", "turbo"];

/** Small debounce */
function useDebounced<T>(value: T, delay = 50): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id); }, [value, delay]);
  return debounced;
}

type CacheEntry = { url: string; revoke: () => void };
class Lru {
  private max: number; private map = new Map<string, CacheEntry>();
  constructor(max = 32) { this.max = max; }
  get(k: string) { const v = this.map.get(k); if (!v) return undefined; this.map.delete(k); this.map.set(k, v); return v; }
  set(k: string, v: CacheEntry) {
    if (this.map.has(k)) { this.map.get(k)!.revoke(); this.map.delete(k); }
    this.map.set(k, v);
    if (this.map.size > this.max) { const fk = this.map.keys().next().value as string; const f = this.map.get(fk)!; f.revoke(); this.map.delete(fk); }
  }
  clear() { for (const [, v] of this.map) v.revoke(); this.map.clear(); }
}

const SliceSlider = styled(Slider)(({ theme }) => ({
  height: 4,
  paddingTop: 16,
  paddingBottom: 36,

  "& .MuiSlider-thumb": {
    width: 14,
    height: 14,
  },
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

export default function VolumeViewer({ projectId, protocolId, outputName }: VolumeViewerProps) {
  const svc = useProjectService();

  // List & selection
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
  const [sliceIndex, setSliceIndex] = useState(0); // 0-based
  const [colormap, setColormap] = useState<string>("viridis");

  // Images (double-buffered)
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
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
          id: v?.id ?? i, label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`, name: v?.name,
        }));
        setVolumes(mapped);
        setSelectedId(prev => {
          const exists = mapped.find(m => String(m.id) === String(prev ?? -999));
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

  // Hard reset on volume/colormap change
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setImgError(null);
    setFrontUrl(null);
    setBackUrl(null);
    setFrontOpacity(1);
    cacheRef.current.clear();
  }, [selectedId, colormap, axis]);

  // Load meta
  useEffect(() => {
    if (selectedId == null) { setMeta(null); return; }
    let cancelled = false;
    (async () => {
      try {
        setMetaLoading(true);
        setMetaError(null);
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

  // Dims (interpret backend dims = Z,Y,X)
  const dims = useMemo(() => getDimsZYXtoXYZ(meta), [meta]);   // <= FIX principal
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
        projectId, protocolId, outputName, selectedId!, idx,
        { axis, cmap: colormap, signal: ac.signal }
      );
      cacheRef.current.set(k, { url, revoke });
    } catch { /* ignore prefetch errors */ }
  };

  // Fetch current slice (live while scrubbing, with abort)
  // Fetch current slice (live while scrubbing, with abort)
  useEffect(() => {
    if (!ready) { setImgError(null); return; }

    // CLAMP: nunca salgas del rango [0, maxSlice]
    const idx = Math.max(0, Math.min(debouncedIndex, maxSlice));

    const k = keyFor(idx);
    const cached = cacheRef.current.get(k);

    // Abortar cualquier request anterior
    abortRef.current?.abort();
    const myAbort = new AbortController();
    abortRef.current = myAbort;

    const myReq = ++reqIdRef.current;
    setImgError(null);

    const useImage = (url: string) => {
      setBackUrl(frontUrl);
      setFrontOpacity(0);
      setFrontUrl(url);
      setTimeout(() => setFrontOpacity(1), 0);
    };

    (async () => {
      try {
        setLoading(!cached);
        if (cached) {
          useImage(cached.url);
          prefetch(idx - 1); prefetch(idx + 1);
          return;
        }
        const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
          projectId, protocolId, outputName, selectedId!, idx,
          { axis, cmap: colormap, signal: myAbort.signal }
        );
        if (reqIdRef.current !== myReq) { revoke(); return; }
        cacheRef.current.set(k, { url, revoke });
        useImage(url);
        prefetch(idx - 1); prefetch(idx + 1);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (reqIdRef.current === myReq) setImgError(e?.message || "Failed to render slice");
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    })();

    return () => { myAbort.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, debouncedIndex, axis, colormap, selectedId]);


  // Zoom
  const [zoom, setZoom] = useState(1);
  const onWheelZoom: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!frontUrl && !backUrl) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(z => Math.min(8, Math.max(0.25, z * factor)));
  };

  return (
    <Box sx={{ display: "flex", minHeight: 700 }}>
      {/* Left: list */}
      <Box sx={{ width: 280, borderRight: "1px solid #eee", display: "flex", flexDirection: "column" }}>
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

      {/* Right: viewer */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar */}
        <Paper elevation={0} square sx={{ p: 1, borderBottom: "1px solid #eee" }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            {/* Axis */}
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
                onChange={(_, v) => setSliceIndex(v as number)}
                disabled={!ready}
                aria-label="slice-index"
              />
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1, minWidth: 24, textAlign: "right" }}>
                {maxSlice + 1}
              </Typography>
            </Box>

            {/* Colormap */}
            <TextField size="small" select label="Colormap" value={colormap} onChange={(e) => setColormap(e.target.value)} sx={{ width: 180 }}>
              {CMAP_OPTIONS.map(cm => <MenuItem key={cm} value={cm}>{cm}</MenuItem>)}
            </TextField>

            <Typography variant="caption" color="text.secondary">Zoom: {Math.round(zoom * 100)}%</Typography>
          </Box>
        </Paper>

        {/* Canvas with crossfade */}
        <Box
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
          ) : imgError ? (
            <Typography variant="body2" color="error">{imgError}</Typography>
          ) : (frontUrl || backUrl) ? (
            <Box sx={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
              {/* front image (fades in) */}
              {frontUrl && (
                <img
                  src={frontUrl}
                  alt="slice"
                  style={{
                    position: "relative",
                    maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                    transform: `scale(${zoom})`, transformOrigin: "center",
                    transition: "opacity 140ms ease",
                    opacity: frontOpacity,
                  }}
                />
              )}
              {/* tiny spinner overlay if cold cache */}

            </Box>
          ) : (
            loading ? (
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <CircularProgress size={18} />
                <Typography variant="body2"></Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">No image</Typography>
            )
          )}
        </Box>

        {/* Meta */}
        <Divider />
        <Box sx={{ p: 1.5, display: "flex", gap: 3, flexWrap: "wrap" }}>
          <MetaItem label="Dims" value={dimsToStringXYZ(dims)} />
          {"min" in (meta || {}) && <MetaItem label="Min" value={num(meta?.min)} />}
          {"max" in (meta || {}) && <MetaItem label="Max" value={num(meta?.max)} />}
          {"mean" in (meta || {}) && <MetaItem label="Mean" value={num(meta?.mean)} />}
          {"std" in (meta || {}) && <MetaItem label="Std" value={num(meta?.std)} />}
        </Box>
      </Box>
    </Box>
  );
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
function num(n: any) { return Number.isFinite(n) ? Number(n).toFixed(3) : "–"; }
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}:</Typography>
      <Typography variant="caption">{value}</Typography>
    </Box>
  );
}
