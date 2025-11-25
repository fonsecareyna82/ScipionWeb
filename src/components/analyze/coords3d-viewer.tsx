// src/components/analyze/coords3d-viewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import { HelpCircle, Layers as Layers3, Box as BoxIcon } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type {
  Id,
  Coordinates3dTomogramPoints,
} from "@/services/ProjectService";

type Coords3dViewerProps = {
  projectId: Id;
  protocolId: Id;
  /** Output name of the SetOfCoordinates3D. */
  outputName: string;
  protocolLabel?: string;
};

type Coords3dPoint = Coordinates3dTomogramPoints["coords"][number];

type TomogramItem = {
  tomoId: Id;
  label: string;
  name?: string;
  dims?: [number, number, number]; // [X, Y, Z]
  voxelSize?: [number, number, number];
  nCoords?: number;
};

type ViewMode = "slice" | "map3d";

const MAX_POINTS_DEFAULT = 50000;
const NEARBY_SLICE_RANGE = 10; // slices above/below current slice to show
const MIN_NEARBY_SLICE_FACTOR = 0.25; // minimal radius/opacity factor for far slices

const HELP_TEXT: Record<string, string> = {
  sliceIndex:
    "Select the tomogram slice along Z. The slider runs from 1 to the total number of slices reported for this tomogram.",
  classFilter:
    "Filter coordinates by their assigned class. Use 'All' to show all classes together.",
  scoreFilter:
    "Filter coordinates by their numeric score or confidence. Points without a score are always included.",
  maxPoints:
    "Limit the number of points sent to the viewer. If there are more points, a strided downsampling is applied to keep interactivity.",
};

export default function Coords3dViewer({
  projectId,
  protocolId,
  outputName,
}: Coords3dViewerProps) {
  const svc = useProjectService();

  const [tomos, setTomos] = useState<TomogramItem[]>([]);
  const [tomosLoading, setTomosLoading] = useState(false);
  const [tomosError, setTomosError] = useState<string | null>(null);
  const [selectedTomoId, setSelectedTomoId] = useState<Id | null>(null);

  const [pointsData, setPointsData] = useState<Coordinates3dTomogramPoints | null>(
    null,
  );
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("slice");

  const [maxPoints, setMaxPoints] = useState<number>(MAX_POINTS_DEFAULT);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [scoreRange, setScoreRange] = useState<[number, number] | null>(null);

  const [helpKey, setHelpKey] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Slice view state
  const [sliceIndex, setSliceIndex] = useState<number | null>(null);
  const [sliceImageUrl, setSliceImageUrl] = useState<string | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const sliceAbortRef = useRef<AbortController | null>(null);
  const sliceReqIdRef = useRef(0);

  const openHelp = (key: string) => {
    setHelpKey(key);
    setHelpOpen(true);
  };
  const closeHelp = () => {
    setHelpOpen(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Load tomogram list for this SetOfCoordinates3D output
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setTomosLoading(true);
        setTomosError(null);
        setTomos([]);
        setSelectedTomoId(null);

        const raw = await (svc as any).listCoords3dTomograms(
          projectId,
          protocolId,
          outputName,
        );
        if (cancelled) return;

        const items: TomogramItem[] = (raw || []).map((t: any) => {
          const id = t.tomoId ?? t.id;
          return {
            tomoId: id,
            label: String(id),
            name: t.name,
            dims: t.dims,
            voxelSize: t.voxelSize,
            nCoords: t.nCoords ?? t.n ?? t.count,
          };
        });

        setTomos(items);
        if (items.length > 0) {
          setSelectedTomoId(items[0].tomoId);
        }
      } catch (e: any) {
        if (!cancelled) {
          setTomosError(e?.message || "Failed to load tomograms for coordinates");
        }
      } finally {
        if (!cancelled) setTomosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, svc]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load coordinates for selected tomogram
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedTomoId == null) {
      setPointsData(null);
      setPointsError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setPointsLoading(true);
        setPointsError(null);
        setPointsData(null);

        const data = await (svc as any).fetchCoords3dForTomogram(
          projectId,
          protocolId,
          outputName,
          selectedTomoId,
        );

        if (cancelled) return;

        let tomoIdOut: Id = selectedTomoId;
        let rawPoints: any[] = [];

        if (Array.isArray(data)) {
          rawPoints = data;
          if (data.length > 0 && data[0].tomoId != null) {
            tomoIdOut = data[0].tomoId;
          }
        } else if (data && typeof data === "object") {
          const d: any = data;
          if (d.tomoId != null || d.tomogramId != null) {
            tomoIdOut = d.tomoId ?? d.tomogramId;
          }
          if (Array.isArray(d.coords)) {
            rawPoints = d.coords;
          } else if (Array.isArray(d.points)) {
            rawPoints = d.points;
          }
        }

        const coordsNorm = rawPoints
          .map((p: any, idx: number) => {
            const x = Number(p.x ?? p.X);
            const y = Number(p.y ?? p.Y);
            const z = Number(p.z ?? p.Z);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
              return null;
            }
            const scoreVal =
              typeof p.score === "number" && Number.isFinite(p.score)
                ? p.score
                : typeof p.weight === "number" && Number.isFinite(p.weight)
                ? p.weight
                : typeof p.prob === "number" && Number.isFinite(p.prob)
                ? p.prob
                : undefined;

            const radius =
              typeof p.radius === "number" && Number.isFinite(p.radius)
                ? p.radius
                : undefined;

            return {
              id: p.id ?? idx,
              x,
              y,
              z,
              classId: p.classId ?? p.class ?? p.class_id,
              score: scoreVal,
              radius,
            } as Coords3dPoint & { radius?: number };
          })
          .filter((p): p is Coords3dPoint & { radius?: number } => p !== null);

        const normalized: Coordinates3dTomogramPoints = {
          tomoId: tomoIdOut,
          coords: coordsNorm,
        };

        setPointsData(normalized);

        const scores = (normalized.coords || [])
          .map((p: any) => p.score)
          .filter((v: any): v is number => typeof v === "number" && Number.isFinite(v));
        if (scores.length > 0) {
          const min = Math.min(...scores);
          const max = Math.max(...scores);
          setScoreRange([min, max]);
        } else {
          setScoreRange(null);
        }

        setSelectedClass("all");
      } catch (e: any) {
        if (!cancelled) {
          setPointsError(e?.message || "Failed to load coordinates");
        }
      } finally {
        if (!cancelled) setPointsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTomoId, projectId, protocolId, outputName, svc]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived data: classes, score ranges, filtered points, etc
  // ─────────────────────────────────────────────────────────────────────────────
  const classes = useMemo(() => {
    if (!pointsData?.coords?.length) return [];
    const set = new Set<string>();
    for (const p of pointsData.coords as any[]) {
      const key =
        p.classId === null || p.classId === undefined
          ? "unclassified"
          : String(p.classId);
      set.add(key);
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [pointsData]);

  const scoreMinMax = useMemo(() => {
    if (!pointsData?.coords?.length) return null;
    const scores = (pointsData.coords as any[])
      .map((p) => p.score)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (scores.length === 0) return null;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    return [min, max] as [number, number];
  }, [pointsData]);

  const filteredPoints = useMemo(() => {
    if (!pointsData?.coords) return [];
    let pts = pointsData.coords as (Coords3dPoint & { radius?: number })[];

    if (selectedClass !== "all") {
      pts = pts.filter((p) => {
        const key =
          (p as any).classId === null || (p as any).classId === undefined
            ? "unclassified"
            : String((p as any).classId);
        return key === selectedClass;
      });
    }

    if (scoreRange && scoreMinMax) {
      const [lo, hi] = scoreRange;
      pts = pts.filter((p: any) => {
        if (typeof p.score !== "number" || !Number.isFinite(p.score)) {
          return true;
        }
        return p.score >= lo && p.score <= hi;
      });
    }

    if (pts.length <= maxPoints || maxPoints <= 0) return pts;

    const step = Math.ceil(pts.length / maxPoints);
    const down: (Coords3dPoint & { radius?: number })[] = [];
    for (let i = 0; i < pts.length; i += step) {
      down.push(pts[i]);
    }
    return down;
  }, [pointsData, selectedClass, scoreRange, scoreMinMax, maxPoints]);

  const classesWithCounts = useMemo(() => {
    if (!pointsData?.coords?.length) return [];
    const map = new Map<string, number>();
    for (const p of pointsData.coords as any[]) {
      const key =
        p.classId === null || p.classId === undefined
          ? "unclassified"
          : String(p.classId);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [pointsData]);

  const tomoMeta = useMemo(() => {
    if (!selectedTomoId) return null;
    return tomos.find((t) => String(t.tomoId) === String(selectedTomoId)) || null;
  }, [tomos, selectedTomoId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Tomogram dims + slice range (dims as [X, Y, Z])
  // ─────────────────────────────────────────────────────────────────────────────
  const tomoDims = useMemo<[number, number, number] | null>(() => {
    const t = tomos.find((tt) => String(tt.tomoId) === String(selectedTomoId));
    if (t?.dims && Array.isArray(t.dims) && t.dims.length >= 3) {
      const x = Number(t.dims[0]) || 0;
      const y = Number(t.dims[1]) || 0;
      const z = Number(t.dims[2]) || 0;
      if (x > 0 && y > 0 && z > 0) {
        return [x, y, z];
      }
    }
    return null;
  }, [tomos, selectedTomoId]);

  const tomoDimsX = tomoDims ? tomoDims[0] : null;
  const tomoDimsY = tomoDims ? tomoDims[1] : null;
  const tomoDimsZ = tomoDims ? tomoDims[2] : null;

  const maxSlice = useMemo(() => {
    if (tomoDimsZ == null) return null;
    const zInt = Math.floor(Number(tomoDimsZ));
    if (!Number.isFinite(zInt) || zInt <= 0) return null;
    return Math.max(0, zInt - 1);
  }, [tomoDimsZ]);

  // Initialize sliceIndex whenever a new tomogram or dims arrive
  useEffect(() => {
    if (maxSlice == null) {
      setSliceIndex(null);
      return;
    }
    const mid = Math.round(maxSlice / 2);
    setSliceIndex(mid);
  }, [selectedTomoId, maxSlice]);

  // Points that lie in the current Z slice (exact slice)
  const slicePoints = useMemo(() => {
    if (!filteredPoints.length || sliceIndex == null) return [];
    const target = sliceIndex;
    return filteredPoints.filter((p: any) => {
      if (typeof p.z !== "number" || !Number.isFinite(p.z)) return false;
      const zInt = Math.round(p.z);
      return zInt === target;
    });
  }, [filteredPoints, sliceIndex]);

  // Points mapped to SVG with Napari-like behavior across nearby slices
  const slicePointsSvg = useMemo(() => {
    if (
      !filteredPoints.length ||
      sliceIndex == null ||
      tomoDimsX == null ||
      tomoDimsY == null
    ) {
      return [];
    }

    const maxDim = Math.max(tomoDimsX, tomoDimsY);
    const baseR = maxDim > 0 ? Math.max(1, maxDim * 0.003) : 2;

    const radiiRaw = filteredPoints
      .map((p: any) => Number(p.radius))
      .filter((v) => Number.isFinite(v) && v > 0);

    let minR = 0;
    let maxR = 0;
    if (radiiRaw.length > 0) {
      minR = Math.min(...radiiRaw);
      maxR = Math.max(...radiiRaw);
    }
    const hasVar =
      radiiRaw.length > 0 &&
      maxR > minR &&
      Number.isFinite(maxR) &&
      Number.isFinite(minR);

    const mapRadius = (raw?: number) => {
      if (!hasVar || raw === undefined || !Number.isFinite(raw) || raw <= 0) {
        return baseR;
      }
      const t = (raw - minR) / (maxR - minR);
      const tClamped = Math.max(0, Math.min(1, t));
      return baseR * (0.7 + 1.3 * tClamped);
    };

    const neighbors: {
      key: string;
      x: number;
      y: number;
      radius: number;
      opacity: number;
      strokeWidth: number;
      dz: number;
    }[] = [];

    for (let idx = 0; idx < filteredPoints.length; idx++) {
      const p: any = filteredPoints[idx];
      const zVal = Number(p.z);
      if (!Number.isFinite(zVal)) continue;

      const zInt = Math.round(zVal);
      const dz = Math.abs(zInt - sliceIndex);
      if (dz > NEARBY_SLICE_RANGE) continue;

      const zNorm = 1 - dz / (NEARBY_SLICE_RANGE + 1); // 1 for dz=0, ~0 near the limit
      const factor =
        MIN_NEARBY_SLICE_FACTOR +
        zNorm * (1 - MIN_NEARBY_SLICE_FACTOR); // between MIN_NEARBY_SLICE_FACTOR and 1

      const rBase = mapRadius(p.radius);
      const rFinal = rBase * factor;

      const opacity = 0.3 + zNorm * 0.7; // 0.3..1
      const strokeWidth = 0.6 + zNorm * 1.4; // thinner for far slices

      neighbors.push({
        key: String(p.id ?? `${idx}-${p.x}-${p.y}-${p.z}`),
        x: p.x,
        y: p.y,
        radius: rFinal,
        opacity,
        strokeWidth,
        dz,
      });
    }

    // Draw farther slices first so points in the current slice appear on top
    neighbors.sort((a, b) => b.dz - a.dz);

    return neighbors;
  }, [filteredPoints, sliceIndex, tomoDimsX, tomoDimsY]);

  const totalCoords = pointsData?.coords?.length ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch slice image for slice view (keep previous image to avoid flicker)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "slice") {
      return;
    }

    if (
      selectedTomoId == null ||
      sliceIndex == null ||
      maxSlice == null ||
      maxSlice < 0
    ) {
      setSliceError(null);
      setSliceLoading(false);
      return;
    }

    const clamped = Math.max(0, Math.min(sliceIndex, maxSlice));

    sliceAbortRef.current?.abort();
    const controller = new AbortController();
    sliceAbortRef.current = controller;
    const reqId = ++sliceReqIdRef.current;

    (async () => {
      try {
        setSliceLoading(true);
        setSliceError(null);

        const result = await (svc as any).fetchCoords3dTomogramSliceObjectUrl(
          projectId,
          protocolId,
          outputName,
          selectedTomoId,
          clamped,
          {
            axis: "z",
            format: "webp",
            normalize: "minmax",
            scale: 1,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted || sliceReqIdRef.current !== reqId) {
          if (result?.revoke) {
            try {
              result.revoke();
            } catch {
              // ignore
            }
          }
          return;
        }

        setSliceImageUrl(result?.url ?? null);
      } catch (e: any) {
        if (controller.signal.aborted || sliceReqIdRef.current !== reqId) {
          return;
        }
        setSliceError(e?.message || "Failed to load tomogram slice");
      } finally {
        if (sliceReqIdRef.current === reqId) {
          setSliceLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    viewMode,
    selectedTomoId,
    sliceIndex,
    maxSlice,
    projectId,
    protocolId,
    outputName,
    svc,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Box
        sx={{
          display: "flex",
          height: "100%",
          width: "100%",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Left: tomograms list */}
        <Box
          sx={{
            width: 270,
            borderRight: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <Box sx={{ p: 1.5, flexShrink: 0 }}>
            <Typography variant="subtitle2">Tomograms</Typography>
            <Typography variant="caption" color="text.secondary">
              {tomosLoading ? "" : `${tomos.length} item(s)`}
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            {tomosLoading ? (
              <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
                <CircularProgress size={18} />
                <Typography variant="body2">Loading tomograms…</Typography>
              </Box>
            ) : tomosError ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="error">
                  {tomosError}
                </Typography>
              </Box>
            ) : tomos.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No tomograms for this coordinates set.
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {tomos.map((t) => {
                  const selected =
                    selectedTomoId != null &&
                    String(selectedTomoId) === String(t.tomoId);
                  const secondary =
                    t.nCoords != null ? `${t.nCoords} coords` : undefined;
                  return (
                    <ListItemButton
                      key={String(t.tomoId)}
                      selected={selected}
                      onClick={() => setSelectedTomoId(t.tomoId)}
                      sx={{ px: 1.5, py: 1 }}
                    >
                      <ListItemText
                        primaryTypographyProps={{
                          variant: "body2",
                          noWrap: true,
                        }}
                        secondaryTypographyProps={{
                          variant: "caption",
                          color: "text.secondary",
                          noWrap: true,
                        }}
                        primary={t.label}
                        secondary={secondary}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Box>
        </Box>

        {/* Right: viewer + controls */}
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
          <Paper
            elevation={0}
            square
            sx={{
              p: 0.75,
              borderBottom: "1px solid #e5e7eb",
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                columnGap: 1.5,
                rowGap: 0.75,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={viewMode}
                  onChange={(_, v) => v && setViewMode(v)}
                >
                  <ToggleButton value="slice">
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      <Layers3 size={14} />
                      Slices
                    </Box>
                  </ToggleButton>
                  <ToggleButton value="map3d">
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      <BoxIcon size={14} />
                      3D Map
                    </Box>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  justifyContent: "flex-end",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  Coordinates:{" "}
                  <strong>
                    {totalCoords.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  </strong>
                </Typography>
                {filteredPoints.length !== totalCoords && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    Showing:{" "}
                    <strong>
                      {filteredPoints.length.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </strong>
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>

          <Box
            sx={{
              flex: 1,
              display: "flex",
              minHeight: 0,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {/* Main viewer */}
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "stretch",
                  justifyContent: "stretch",
                  p: 1,
                  bgcolor: "background.default",
                }}
              >
                {pointsLoading ? (
                  <Box
                    sx={{
                      m: "auto",
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                    }}
                  >
                    <CircularProgress size={18} />
                    <Typography variant="body2">Loading coordinates…</Typography>
                  </Box>
                ) : pointsError ? (
                  <Box sx={{ m: "auto" }}>
                    <Typography variant="body2" color="error">
                      {pointsError}
                    </Typography>
                  </Box>
                ) : selectedTomoId == null ? (
                  <Box sx={{ m: "auto" }}>
                    <Typography variant="body2" color="text.secondary">
                      Select a tomogram to view its coordinates.
                    </Typography>
                  </Box>
                ) : !pointsData || totalCoords === 0 ? (
                  <Box sx={{ m: "auto" }}>
                    <Typography variant="body2" color="text.secondary">
                      No coordinates for this tomogram.
                    </Typography>
                  </Box>
                ) : viewMode === "map3d" ? (
                  <Box sx={{ m: "auto" }}>
                    <Typography variant="body2" color="text.secondary">
                      3D map view is not implemented yet.
                    </Typography>
                  </Box>
                ) : (
                  // Slice view
                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {sliceLoading && !sliceImageUrl ? (
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          alignItems: "center",
                        }}
                      >
                        <CircularProgress size={18} />
                        <Typography variant="body2">
                          Loading tomogram slice…
                        </Typography>
                      </Box>
                    ) : sliceError ? (
                      <Typography variant="body2" color="error">
                        {sliceError}
                      </Typography>
                    ) : maxSlice == null ||
                      sliceIndex == null ||
                      !tomoDimsX ||
                      !tomoDimsY ? (
                      <Typography variant="body2" color="text.secondary">
                        Tomogram dimensions are not available. Make sure dims are
                        provided as [X, Y, Z].
                      </Typography>
                    ) : !sliceImageUrl ? (
                      <Typography variant="body2" color="text.secondary">
                        No slice image.
                      </Typography>
                    ) : (
                      <Box
                        sx={{
                          width: "100%",
                          height: "100%",
                          maxWidth: "100%",
                          maxHeight: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          viewBox={`0 0 ${tomoDimsX} ${tomoDimsY}`}
                          preserveAspectRatio="xMidYMid meet"
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "block",
                            backgroundColor: "transparent",
                          }}
                        >
                          <image
                            href={sliceImageUrl}
                            x={0}
                            y={0}
                            width={tomoDimsX}
                            height={tomoDimsY}
                            preserveAspectRatio="none"
                          />
                          {slicePointsSvg.map((p) => (
                            <circle
                              key={p.key}
                              cx={p.x}
                              cy={p.y}
                              r={p.radius * 2.2}
                              fill="none"
                              stroke="red"
                              strokeWidth={p.strokeWidth}
                              opacity={p.opacity}
                            />
                          ))}
                        </svg>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>

              <Divider />
              <Box
                sx={{
                  p: 1,
                  display: "flex",
                  gap: 2,
                  flexWrap: "wrap",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {tomoMeta && (
                  <MetaItem
                    label="Tomogram"
                    value={tomoMeta.label ?? String(selectedTomoId)}
                  />
                )}
                {tomoDims && (
                  <MetaItem
                    label="Dims"
                    value={`${tomoDims[0]} × ${tomoDims[1]} × ${tomoDims[2]}`}
                  />
                )}
                <MetaItem
                  label="Points"
                  value={totalCoords.toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                />
                {filteredPoints.length !== totalCoords && (
                  <MetaItem
                    label="Shown"
                    value={filteredPoints.length.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  />
                )}
                {viewMode === "slice" && sliceIndex != null && maxSlice != null && (
                  <MetaItem
                    label="Slice (Z)"
                    value={`${sliceIndex + 1} / ${maxSlice + 1}`}
                  />
                )}
                {viewMode === "slice" && slicePoints.length > 0 && (
                  <MetaItem
                    label="Slice points"
                    value={slicePoints.length.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  />
                )}
              </Box>
            </Box>

            {/* Right panel: summary + filters */}
            <>
              <Divider orientation="vertical" flexItem />
              <Box
                sx={{
                  flexBasis: 320,
                  flexShrink: 0,
                  minWidth: 320,
                  maxWidth: 320,
                  p: 1.25,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "background.paper",
                  gap: 1,
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    pr: 1,
                    pb: 2,
                    mt: 0.5,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                  }}
                >
                  <Divider />
                  {/* Filters */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      marginLeft: 1,
                    }}
                  >
                    <Typography variant="subtitle2">Filters</Typography>

                    {viewMode === "slice" && (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.5,
                        }}
                      >
                        <Box
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Slice (Z)
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => openHelp("sliceIndex")}
                          >
                            <HelpCircle size={14} />
                          </IconButton>
                        </Box>
                        {maxSlice != null && sliceIndex != null ? (
                          <>
                            <Slider
                              size="small"
                              value={Math.min(sliceIndex, maxSlice)}
                              min={0}
                              max={maxSlice}
                              step={1}
                              onChange={(_, v) => setSliceIndex(v as number)}
                              valueLabelDisplay="auto"
                              valueLabelFormat={(v) => String((v as number) + 1)}
                            />
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                1
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {maxSlice + 1}
                              </Typography>
                            </Box>
                          </>
                        ) : (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Slice range not available. Tomogram dims are missing.
                          </Typography>
                        )}
                      </Box>
                    )}

                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                    >
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Score range
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => openHelp("scoreFilter")}
                        >
                          <HelpCircle size={14} />
                        </IconButton>
                      </Box>

                      {scoreMinMax ? (
                        <>
                          <Slider
                            size="small"
                            value={scoreRange ?? [scoreMinMax[0], scoreMinMax[1]]}
                            min={scoreMinMax[0]}
                            max={scoreMinMax[1]}
                            step={(scoreMinMax[1] - scoreMinMax[0]) / 200}
                            onChange={(_, v) =>
                              setScoreRange(v as [number, number])
                            }
                            valueLabelDisplay="auto"
                            valueLabelFormat={(v) => (v as number).toFixed(3)}
                          />
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {scoreMinMax[0].toFixed(3)}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {scoreMinMax[1].toFixed(3)}
                            </Typography>
                          </Box>
                        </>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No numeric scores available.
                        </Typography>
                      )}
                    </Box>

                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                    >
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Max points
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => openHelp("maxPoints")}
                        >
                          <HelpCircle size={14} />
                        </IconButton>
                      </Box>
                      <Slider
                        size="small"
                        value={maxPoints}
                        min={1000}
                        max={200000}
                        step={1000}
                        onChange={(_, v) => setMaxPoints(v as number)}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) =>
                          (v as number).toLocaleString("en-US", {
                            maximumFractionDigits: 0,
                          })
                        }
                      />
                      <Typography variant="caption" color="text.secondary">
                        Downsampling by stride if the total number of filtered
                        points exceeds this limit.
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </>
          </Box>
        </Box>
      </Box>

      {/* Help dialog */}
      <Dialog open={helpOpen} onClose={closeHelp} maxWidth="xs" fullWidth>
        <DialogTitle>
          {helpKey === "sliceIndex"
            ? "Slice index"
            : helpKey === "classFilter"
            ? "Class filter"
            : helpKey === "scoreFilter"
            ? "Score range"
            : helpKey === "maxPoints"
            ? "Max points"
            : "Help"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {helpKey ? HELP_TEXT[helpKey] ?? "No help available." : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeHelp} autoFocus>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5, alignItems: "baseline" }}>
      <Typography variant="caption" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="caption">{value}</Typography>
    </Box>
  );
}
