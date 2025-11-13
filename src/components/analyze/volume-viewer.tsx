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
  Slider,
  TextField,
  MenuItem,
  Paper,
} from "@mui/material";
import { useProjectService } from "@/ProjectServiceContext";

type VolumeViewerProps = {
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
};

type VolumeLite = { id: string | number; label?: string; name?: string };

const DEFAULT_AXIS: "z" | "y" | "x" = "z";

// Debounce sencillo
function useDebouncedValue<T>(value: T, delay = 60): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type CacheEntry = { url: string; revoke: () => void };
class Lru {
  private max: number;
  private map = new Map<string, CacheEntry>();
  constructor(max = 24) { this.max = max; }
  get(key: string) {
    const v = this.map.get(key);
    if (!v) return undefined;
    this.map.delete(key); this.map.set(key, v);
    return v;
  }
  set(key: string, val: CacheEntry) {
    if (this.map.has(key)) {
      const old = this.map.get(key)!; old.revoke(); this.map.delete(key);
    }
    this.map.set(key, val);
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value as string;
      const first = this.map.get(firstKey)!;
      first.revoke();
      this.map.delete(firstKey);
    }
  }
  clear() {
    for (const [, v] of this.map) v.revoke();
    this.map.clear();
  }
}

// Colormaps comunes
const CMAP_OPTIONS = ["viridis", "gray", "magma", "plasma", "inferno", "cividis", "turbo"];

export default function VolumeViewer({ projectId, protocolId, outputName }: VolumeViewerProps) {
  const svc = useProjectService();

  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<VolumeLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [colormap, setColormap] = useState<string>("viridis");

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // Scrub & debounce
  const [isScrubbing, setIsScrubbing] = useState(false);
  const debouncedSliceIndex = useDebouncedValue(sliceIndex, isScrubbing ? 30 : 80);

  // Request gating
  const reqIdRef = useRef(0);

  // Cache + prefetch
  const cacheRef = useRef(new Lru(28));

  // Spinner deflicker
  const spinnerTimerRef = useRef<number | null>(null);
  const startSpinner = () => {
    if (spinnerTimerRef.current != null) return;
    spinnerTimerRef.current = window.setTimeout(() => {
      setImgLoading(true);
      spinnerTimerRef.current = null;
    }, isScrubbing ? 60 : 120);
  };
  const stopSpinner = () => {
    if (spinnerTimerRef.current != null) {
      clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }
    setImgLoading(false);
  };

  // --------- Lista de volúmenes ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        setListError(null);
        const items: any[] = await svc.listOutputVolumes(projectId, protocolId, outputName);
        if (cancelled) return;
        const mapped: VolumeLite[] = (items || []).map((v: any, i: number) => ({
          id: v?.id ?? i, label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`, name: v?.name,
        }));
        setVolumes(mapped);
        setSelectedId((prev) => {
          const exists = mapped.find((m) => String(m.id) === String(prev ?? -1));
          return exists ? (prev as any) : mapped[0]?.id ?? null;
        });
      } catch (err: any) {
        if (!cancelled) setListError(err?.message || "Failed to list volumes");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, protocolId, outputName, svc]);

  // --------- Metadata del volumen seleccionado ----------
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
      } catch (err: any) {
        if (!cancelled) setMetaError(err?.message || "Failed to fetch volume info");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, projectId, protocolId, outputName, svc]);

  const dims = useMemo(() => getDims(meta), [meta]);
  const maxSlice = Math.max(0, dims[axis] - 1);

  // --------- Slider siempre al centro al cambiar eje/volumen/dims ----------
  useEffect(() => {
    const mid = Math.floor(maxSlice / 2);
    setSliceIndex(isFinite(mid) ? mid : 0);
  }, [selectedId, axis, maxSlice]);

  const readyForSlice = selectedId != null && !!meta && dims[axis] > 0;

  // --------- Caché key (incluye colormap para no mezclar) ----------
  const keyFor = (idx: number) =>
    `${selectedId}|${axis}|${idx}|${colormap}`;

  // --------- Prefetch vecinos ----------
  const prefetchNeighbor = async (idx: number) => {
    if (!readyForSlice || idx < 0 || idx > maxSlice) return;
    const k = keyFor(idx);
    if (cacheRef.current.get(k)) return;
    try {
      const opts: any = { axis, cmap: colormap || undefined };
      const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
        projectId, protocolId, outputName, selectedId!, idx, opts
      );
      cacheRef.current.set(k, { url, revoke });
    } catch { /* ignore */ }
  };

  // --------- Carga de slice ----------
  useEffect(() => {
    if (!readyForSlice) { setImgUrl(null); setImgError(null); return; }

    const myReq = ++reqIdRef.current;
    const k = keyFor(debouncedSliceIndex);
    const cached = cacheRef.current.get(k);
    if (cached) {
      setImgUrl(cached.url);
      setImgError(null);
      prefetchNeighbor(debouncedSliceIndex - 1);
      prefetchNeighbor(debouncedSliceIndex + 1);
      return;
    }

    setImgError(null);
    setImgUrl(null);
    startSpinner();

    (async () => {
      try {
        // IMPORTANTE: usar 'cmap' para que el cambio de colormap tenga efecto
        const opts: any = { axis, cmap: colormap || undefined };
        const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
          projectId, protocolId, outputName, selectedId!, debouncedSliceIndex, opts
        );

        if (reqIdRef.current !== myReq) { revoke(); return; }
        cacheRef.current.set(k, { url, revoke });
        setImgUrl(url);

        prefetchNeighbor(debouncedSliceIndex - 1);
        prefetchNeighbor(debouncedSliceIndex + 1);
      } catch (err: any) {
        if (reqIdRef.current === myReq) {
          setImgError(err?.message || "Failed to render slice");
        }
      } finally {
        if (reqIdRef.current === myReq) stopSpinner();
      }
    })();

    return () => { /* gated by reqIdRef */ };
  }, [
    readyForSlice,
    svc,
    projectId,
    protocolId,
    outputName,
    selectedId,
    debouncedSliceIndex,
    axis,
    colormap,
    isScrubbing,
    maxSlice,
  ]);

  // --------- Limpieza caché ----------
  useEffect(() => () => cacheRef.current.clear(), []);

  // --------- Zoom con rueda ----------
  const [zoom, setZoom] = useState(1);
  const imgWrapperRef = useRef<HTMLDivElement | null>(null);

  const onWheelZoom: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!imgUrl) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => {
      const next = Math.min(8, Math.max(0.25, z * factor));
      return Number.isFinite(next) ? next : z;
    });
  };

  return (
    <Box sx={{ display: "flex", minHeight: 700 }}>
      {/* Izquierda: lista */}
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
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="error">{listError}</Typography>
            </Box>
          ) : volumes.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">No volumes in this output.</Typography>
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
                      secondary={v.name}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      {/* Derecha: visor */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Toolbar */}
        <Paper elevation={0} square sx={{ p: 1, borderBottom: "1px solid #eee" }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Axis</Typography>
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

            <Box sx={{ minWidth: 240 }}>
              <Typography variant="caption" color="text.secondary">
                Slice (0–{maxSlice})
              </Typography>
              <Slider
                size="small"
                value={Math.min(sliceIndex, maxSlice)}
                min={0}
                max={maxSlice}
                onMouseDownCapture={() => setIsScrubbing(true)}
                onTouchStartCapture={() => setIsScrubbing(true)}
                onChange={(_, v) => setSliceIndex(v as number)}
                onChangeCommitted={() => setIsScrubbing(false)}
                disabled={!readyForSlice}
              />
            </Box>

            {/* Colormap dropdown */}
            <TextField
              size="small"
              select
              label="Colormap"
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              sx={{ width: 180 }}
            >
              {CMAP_OPTIONS.map((cm) => (
                <MenuItem key={cm} value={cm}>{cm}</MenuItem>
              ))}
            </TextField>

            {/* Zoom actual */}
            <Typography variant="caption" color="text.secondary">
              Zoom: {Math.round(zoom * 100)}%
            </Typography>
          </Box>
        </Paper>

        {/* Canvas con zoom por rueda */}
        <Box
          ref={imgWrapperRef}
          onWheel={onWheelZoom}
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            overflow: "auto",
          }}
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
          ) : imgLoading ? (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2"></Typography>
            </Box>
          ) : imgError ? (
            <Typography variant="body2" color="error">{imgError}</Typography>
          ) : imgUrl ? (
            <img
              key={`${selectedId}-${axis}-${debouncedSliceIndex}-${colormap}`}
              src={imgUrl}
              alt={`slice-${debouncedSliceIndex}-${axis}`}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                imageRendering: "auto", // o "crisp-edges"/"pixelated" si lo prefieres
              }}
            />
          ) : (
            <Typography variant="body2" color="text.secondary"></Typography>
          )}
        </Box>

        {/* Meta (sin voxel) */}
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

function getDims(info: any): Record<"x" | "y" | "z", number> {
  const d = info?.dims || info?.shape || info?.size || [];
  if (Array.isArray(d) && d.length >= 3) {
    const [x, y, z] = normalizeDimsArray(d);
    return { x, y, z };
  }
  return { x: info?.width ?? 0, y: info?.height ?? 0, z: info?.depth ?? info?.slices ?? 0 };
}
function normalizeDimsArray(arr: number[]) {
  if (arr.length < 3) return [0, 0, 0];
  if (arr[0] > 0 && arr[1] > 0 && arr[2] > 0) return [arr[0], arr[1], arr[2]];
  return [arr[0] || 0, arr[1] || 0, arr[2] || 0];
}
function dimsToString(info: any) {
  const d = getDims(info);
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
