// volume-viewer.tsx
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
  Paper,
} from "@mui/material";
import Slider from "@mui/material/Slider";
import { styled } from "@mui/material/styles";
import { useProjectService } from "@/ProjectServiceContext";

type VolumeViewerProps = {
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
};

type VolumeLite = { id: string | number; label?: string; name?: string };

const DEFAULT_AXIS: "z" | "y" | "x" = "z";

// Simple debounce hook to soften rapid updates while scrubbing.
function useDebouncedValue<T>(value: T, delay = 60): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type CacheEntry = { url: string; revoke: () => void };

// Tiny LRU to hold a few ObjectURLs so scrubbing feels instant.
class Lru {
  private max: number;
  private map = new Map<string, CacheEntry>();
  constructor(max = 24) { this.max = max; }
  get(key: string) {
    const v = this.map.get(key);
    if (!v) return undefined;
    // Mark-as-recent by re-inserting.
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key: string, val: CacheEntry) {
    // Replace existing (revoke old blob URL to avoid leaks).
    if (this.map.has(key)) {
      const old = this.map.get(key)!;
      old.revoke();
      this.map.delete(key);
    }
    this.map.set(key, val);
    // Evict if over capacity (revoke URL on eviction).
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value as string;
      const first = this.map.get(firstKey)!;
      first.revoke();
      this.map.delete(firstKey);
    }
  }
  clear() {
    // Revoke all cached blob URLs.
    for (const [, v] of this.map) v.revoke();
    this.map.clear();
  }
}

// Common colormap options.
const CMAP_OPTIONS = ["viridis", "gray", "magma", "plasma", "inferno", "cividis", "turbo"];

/** Styled slider to place the value label BELOW the thumb. */
const SliceSlider = styled(Slider)(({ theme }) => ({
  // Provide vertical room for the label underneath.
  height: 4,
  paddingTop: 16,
  paddingBottom: 28,

  "& .MuiSlider-thumb": {
    // Slightly larger thumb for better handling (optional).
    width: 14,
    height: 14,
  },

  "& .MuiSlider-valueLabel": {
    // Position the label below the thumb instead of the default "above".
    top: "unset",
    bottom: -28,
    transform: "none",
    background: "transparent",
    color: theme.palette.text.secondary,
    fontSize: "0.75rem",
    fontWeight: 500,
    // Remove the default little caret.
    "&:before": { display: "none" },
  },
}));

export default function VolumeViewer({ projectId, protocolId, outputName }: VolumeViewerProps) {
  const svc = useProjectService();

  // List & selection state.
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<VolumeLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // Metadata for current volume.
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // Viewer controls.
  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0); // 0-based internal index.
  const [colormap, setColormap] = useState<string>("viridis");

  // Current image URL (ObjectURL), loading & error.
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // Scrubbing state + debounced index for smoother requests.
  const [isScrubbing, setIsScrubbing] = useState(false);
  const debouncedSliceIndex = useDebouncedValue(sliceIndex, isScrubbing ? 30 : 80);

  // Request gating to discard stale responses.
  const reqIdRef = useRef(0);

  // Cache + prefetch.
  const cacheRef = useRef(new Lru(28));

  // Spinner deflicker (avoid flashing spinner on ultra-fast loads).
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

  // ---------- Load list of volumes for the given output ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        setListError(null);
        const items: any[] = await svc.listOutputVolumes(projectId, protocolId, outputName);
        if (cancelled) return;
        const mapped: VolumeLite[] = (items || []).map((v: any, i: number) => ({
          id: v?.id ?? i,
          label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`,
          name: v?.name,
        }));
        setVolumes(mapped);
        // Keep selection if still present, or select first.
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

  // ---------- Load metadata for selected volume ----------
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

  // Dimensions and bounds.
  const dims = useMemo(() => getDims(meta), [meta]);
  const maxSlice = Math.max(0, dims[axis] - 1);

  // ---------- Keep slider pinned at the middle when axis/volume/dims change ----------
  useEffect(() => {
    // Always compute the true middle index in 0-based space.
    // IMPORTANT: avoid "+1" which would bias the initial position.
    const mid0 = Math.max(0, Math.floor(maxSlice / 2));
    setSliceIndex(mid0);
  }, [selectedId, axis, maxSlice]);

  const readyForSlice = selectedId != null && !!meta && dims[axis] > 0;

  // ---------- Cache key (include colormap so color variants are distinct) ----------
  const keyFor = (idx: number) => `${selectedId}|${axis}|${idx}|${colormap}`;

  // ---------- Prefetch neighbors to make scrubbing feel instant ----------
  const prefetchNeighbor = async (idx: number) => {
    if (!readyForSlice || idx < 0 || idx > maxSlice) return;
    const k = keyFor(idx);
    if (cacheRef.current.get(k)) return;
    try {
      // IMPORTANT: send 'cmap' (backend expects this query key).
      const opts: any = { axis, cmap: colormap || undefined };
      const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
        projectId, protocolId, outputName, selectedId!, idx, opts
      );
      cacheRef.current.set(k, { url, revoke });
    } catch {
      // Prefetch is best-effort; ignore failures.
    }
  };

  // ---------- Fetch current slice (debounced) ----------
  useEffect(() => {
    if (!readyForSlice) { setImgUrl(null); setImgError(null); return; }

    const myReq = ++reqIdRef.current;
    const k = keyFor(debouncedSliceIndex);

    // Serve from cache if available.
    const cached = cacheRef.current.get(k);
    if (cached) {
      setImgUrl(cached.url);
      setImgError(null);
      // Opportunistically prefetch neighbors.
      prefetchNeighbor(debouncedSliceIndex - 1);
      prefetchNeighbor(debouncedSliceIndex + 1);
      return;
    }

    setImgError(null);
    setImgUrl(null);
    startSpinner();

    (async () => {
      try {
        // IMPORTANT: send 'cmap' so the backend honors the selected colormap.
        const opts: any = { axis, cmap: colormap || undefined };
        const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
          projectId, protocolId, outputName, selectedId!, debouncedSliceIndex, opts
        );

        // Drop stale responses (if the user moved on).
        if (reqIdRef.current !== myReq) { revoke(); return; }

        cacheRef.current.set(k, { url, revoke });
        setImgUrl(url);

        // Prefetch neighbors to keep scrubbing smooth.
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

    // No cleanup needed; gating happens via reqIdRef.
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

  // Clear all blob URLs on unmount.
  useEffect(() => () => cacheRef.current.clear(), []);

  // Clear cache when colormap/axis/volume changes to avoid stale images.
  useEffect(() => { cacheRef.current.clear(); }, [colormap, axis, selectedId]);

  // ---------- Wheel zoom (client-side) ----------
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
      {/* Left: volumes list */}
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
                    />
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
            {/* Axis toggle */}
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

            {/* Slider with side labels and value label below the thumb */}
            <Box
              sx={{
                minWidth: 320,
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                columnGap: 1,
              }}
            >
              {/* Left label: start (human 1-based) */}
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
                // Show label on hover/focus/drag; label appears **below** via styled() above.
                valueLabelDisplay="auto"
                // IMPORTANT: present 1-based index to the user.
                valueLabelFormat={(v) => `${(v as number) + 1}`}
                // Also expose 1-based text for screen readers.
                getAriaValueText={(v) => `slice ${(v as number) + 1} of ${maxSlice + 1}`}
                onMouseDownCapture={() => setIsScrubbing(true)}
                onTouchStartCapture={() => setIsScrubbing(true)}
                onChange={(_, v) => setSliceIndex(v as number)}
                onChangeCommitted={() => setIsScrubbing(false)}
                disabled={!readyForSlice}
                aria-label="slice-index"
              />

              {/* Right label: end (human 1-based max) */}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ pl: 1, minWidth: 24, textAlign: "right" }}
              >
                {maxSlice + 1}
              </Typography>
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

            {/* Zoom indicator */}
            <Typography variant="caption" color="text.secondary">
              Zoom: {Math.round(zoom * 100)}%
            </Typography>
          </Box>
        </Paper>

        {/* Canvas area with wheel zoom */}
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
              // Keep internal index 0-based, but alt text human-friendly (1-based).
              alt={`slice-${debouncedSliceIndex + 1}-${axis}`}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                imageRendering: "auto",
              }}
            />
          ) : (
            <Typography variant="body2" color="text.secondary"></Typography>
          )}
        </Box>

        {/* Meta (voxel intentionally removed as requested) */}
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

// -------------------- helpers --------------------

function getDims(info: any): Record<"x" | "y" | "z", number> {
  const d = info?.dims || info?.shape || info?.size || [];
  if (Array.isArray(d) && d.length >= 3) {
    const [x, y, z] = normalizeDimsArray(d);
    return { x, y, z };
  }
  // Fallbacks in case the backend exposes alternative fields.
  return {
    x: info?.width ?? 0,
    y: info?.height ?? 0,
    z: info?.depth ?? info?.slices ?? 0,
  };
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

function num(n: any) {
  return Number.isFinite(n) ? Number(n).toFixed(3) : "–";
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}:</Typography>
      <Typography variant="caption">{value}</Typography>
    </Box>
  );
}
