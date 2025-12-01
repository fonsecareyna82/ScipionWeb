// src/components/analyze/coords3d-viewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
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

type SliceAxis = "x" | "y" | "z";

type SliceCircle = {
  key: string;
  x: number;
  y: number;
  radius: number;
  opacity: number;
  strokeWidth: number;
  dz: number;
};

const MAX_POINTS_DEFAULT = 50000;
const NEARBY_SLICE_RANGE = 10; // slices above/below current slice to show
const MIN_NEARBY_SLICE_FACTOR = 0.25; // minimal radius/opacity factor for far slices

const HELP_TEXT: Record<string, string> = {
  sliceIndex:
    "Select the tomogram slice index along this axis. The slider runs from 1 to the total number of slices reported for this tomogram on that axis.",
  classFilter:
    "Filter coordinates by their assigned class. Use 'All' to show all classes together.",
  scoreFilter:
    "Filter coordinates by their numeric score or confidence. Points without a score are always included.",
  maxPoints:
    "Limit the number of points sent to the viewer. If there are more points, a strided downsampling is applied to keep interactivity.",
  brightness:
    "Adjust the brightness of the tomogram slice. This is applied client-side and does not modify the underlying data.",
  contrast:
    "Adjust the contrast of the tomogram slice. This is applied client-side and does not modify the underlying data.",
};

function getSlicePlaneDims(
  dims: [number, number, number] | null,
  axis: SliceAxis,
): [number, number] | null {
  if (!dims) return null;
  const [dimX, dimY, dimZ] = dims;
  if (dimX <= 0 || dimY <= 0 || dimZ <= 0) return null;

  if (axis === "z") {
    // XY plane
    return [dimX, dimY];
  }
  if (axis === "x") {
    // YZ plane (transposed to make the view more vertical: width = Z, height = Y)
    return [dimZ, dimY];
  }
  // axis === "y" -> XZ plane
  return [dimX, dimZ];
}


function computeSlicePointsSvg(
  points: (Coords3dPoint & { radius?: number })[],
  axis: SliceAxis,
  sliceIndex: number | null,
  dims: [number, number, number] | null,
): SliceCircle[] {
  if (!points.length || sliceIndex == null || !dims) {
    return [];
  }

  const planeDims = getSlicePlaneDims(dims, axis);
  if (!planeDims) {
    return [];
  }

  const [width, height] = planeDims;
  const maxDim = Math.max(width, height);
  const baseR = maxDim > 0 ? Math.max(1, maxDim * 0.003) : 2;

  const radiiRaw = points
    .map((p) => Number((p as any).radius))
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

  const neighbors: SliceCircle[] = [];

  for (let idx = 0; idx < points.length; idx++) {
    const p: any = points[idx];
    const coordVal =
      axis === "x" ? Number(p.x) : axis === "y" ? Number(p.y) : Number(p.z);
    if (!Number.isFinite(coordVal)) {
      continue;
    }

    const coordInt = Math.round(coordVal);
    const dz = Math.abs(coordInt - sliceIndex);
    if (dz > NEARBY_SLICE_RANGE) {
      continue;
    }

    const zNorm = 1 - dz / (NEARBY_SLICE_RANGE + 1); // 1 for dz=0, ~0 near the limit
    const factor =
      MIN_NEARBY_SLICE_FACTOR +
      zNorm * (1 - MIN_NEARBY_SLICE_FACTOR); // between MIN_NEARBY_SLICE_FACTOR and 1

    const rBase = mapRadius(p.radius);
    const rFinal = rBase * factor;

    const opacity = 0.3 + zNorm * 0.7; // 0.3..1
    const strokeWidth = 0.6 + zNorm * 1.4; // thinner for far slices

    let cx = 0;
    let cy = 0;
    if (axis === "z") {
      // XY plane
      cx = p.x;
      cy = p.y;
    } else if (axis === "x") {
      // YZ plane (transposed so Z is horizontal and Y is vertical)
      cx = p.z;
      cy = p.y;
    } else {
      // axis === "y" -> XZ plane
      cx = p.x;
      cy = p.z;
    }


    neighbors.push({
      key: String(p.id ?? `${idx}-${p.x}-${p.y}-${p.z}`),
      x: cx,
      y: cy,
      radius: rFinal,
      opacity,
      strokeWidth,
      dz,
    });
  }

  // Draw farther slices first so points in the current slice appear on top
  neighbors.sort((a, b) => b.dz - a.dz);

  return neighbors;
}

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
  const [multiViewMode, setMultiViewMode] = useState<"single" | "triple">("single");

  const [maxPoints, setMaxPoints] = useState<number>(MAX_POINTS_DEFAULT);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [scoreRange, setScoreRange] = useState<[number, number] | null>(null);

  // Brightness / contrast for slice view
  const [brightness, setBrightness] = useState<number>(1.0); // 1.0 = neutral
  const [contrast, setContrast] = useState<number>(1.0); // 1.0 = neutral

  const [helpKey, setHelpKey] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Slice view state (Z axis)
  const [sliceIndex, setSliceIndex] = useState<number | null>(null);
  const [sliceImageUrl, setSliceImageUrl] = useState<string | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const sliceAbortRef = useRef<AbortController | null>(null);
  const sliceReqIdRef = useRef(0);

  // Orthogonal slice state (X and Y axes)
  const [sliceIndexX, setSliceIndexX] = useState<number | null>(null);
  const [sliceIndexY, setSliceIndexY] = useState<number | null>(null);
  const [sliceXImageUrl, setSliceXImageUrl] = useState<string | null>(null);
  const [sliceYImageUrl, setSliceYImageUrl] = useState<string | null>(null);
  const [sliceXError, setSliceXError] = useState<string | null>(null);
  const [sliceYError, setSliceYError] = useState<string | null>(null);
  const [sliceXLoading, setSliceXLoading] = useState(false);
  const [sliceYLoading, setSliceYLoading] = useState(false);
  const sliceXAbortRef = useRef<AbortController | null>(null);
  const sliceYAbortRef = useRef<AbortController | null>(null);
  const sliceXReqIdRef = useRef(0);
  const sliceYReqIdRef = useRef(0);

  // Throttled slice indices: reduce backend calls while dragging slider
  const throttledSliceIndex = useThrottledValue(sliceIndex, 200);
  const throttledSliceIndexX = useThrottledValue(sliceIndexX, 200);
  const throttledSliceIndexY = useThrottledValue(sliceIndexY, 200);

  const openHelp = (key: string) => {
    setHelpKey(key);
    setHelpOpen(true);
  };
  const closeHelp = () => {
    setHelpOpen(false);
  };

  // Optional: reset brightness/contrast when tomogram or view mode changes
  useEffect(() => {
    setBrightness(1.0);
    setContrast(1.0);
  }, [selectedTomoId, viewMode]);

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
          .filter(
            (p): p is Coords3dPoint & { radius?: number } => p !== null,
          );

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

  const filteredPoints = useMemo<
    (Coords3dPoint & { radius?: number })[]
  >(() => {
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

  const tomoMeta = useMemo(() => {
    if (!selectedTomoId) return null;
    return tomos.find((t) => String(t.tomoId) === String(selectedTomoId)) || null;
  }, [tomos, selectedTomoId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Tomogram dims + slice ranges (dims as [X, Y, Z])
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

  const maxSliceZ = useMemo(() => {
    if (tomoDimsZ == null) return null;
    const zInt = Math.floor(Number(tomoDimsZ));
    if (!Number.isFinite(zInt) || zInt <= 0) return null;
    return Math.max(0, zInt - 1);
  }, [tomoDimsZ]);

  const maxSliceX = useMemo(() => {
    if (tomoDimsX == null) return null;
    const xInt = Math.floor(Number(tomoDimsX));
    if (!Number.isFinite(xInt) || xInt <= 0) return null;
    return Math.max(0, xInt - 1);
  }, [tomoDimsX]);

  const maxSliceY = useMemo(() => {
    if (tomoDimsY == null) return null;
    const yInt = Math.floor(Number(tomoDimsY));
    if (!Number.isFinite(yInt) || yInt <= 0) return null;
    return Math.max(0, yInt - 1);
  }, [tomoDimsY]);

  // Initialize slice indices whenever a new tomogram or dims arrive
  useEffect(() => {
    if (maxSliceZ == null) {
      setSliceIndex(null);
      return;
    }
    const mid = Math.round(maxSliceZ / 2);
    setSliceIndex(mid);
  }, [selectedTomoId, maxSliceZ]);

  useEffect(() => {
    if (maxSliceX == null) {
      setSliceIndexX(null);
      return;
    }
    const mid = Math.round(maxSliceX / 2);
    setSliceIndexX(mid);
  }, [selectedTomoId, maxSliceX]);

  useEffect(() => {
    if (maxSliceY == null) {
      setSliceIndexY(null);
      return;
    }
    const mid = Math.round(maxSliceY / 2);
    setSliceIndexY(mid);
  }, [selectedTomoId, maxSliceY]);

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
  const slicePointsSvgZ = useMemo(
    () => computeSlicePointsSvg(filteredPoints, "z", sliceIndex, tomoDims),
    [filteredPoints, sliceIndex, tomoDims],
  );

  const slicePointsSvgX = useMemo(
    () => computeSlicePointsSvg(filteredPoints, "x", sliceIndexX, tomoDims),
    [filteredPoints, sliceIndexX, tomoDims],
  );

  const slicePointsSvgY = useMemo(
    () => computeSlicePointsSvg(filteredPoints, "y", sliceIndexY, tomoDims),
    [filteredPoints, sliceIndexY, tomoDims],
  );

  const totalCoords = pointsData?.coords?.length ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Z-axis slice image for slice view (keep previous image to avoid flicker)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "slice") {
      return;
    }

    if (
      selectedTomoId == null ||
      throttledSliceIndex == null ||
      maxSliceZ == null ||
      maxSliceZ < 0
    ) {
      setSliceError(null);
      setSliceLoading(false);
      return;
    }

    const clamped = Math.max(0, Math.min(throttledSliceIndex, maxSliceZ));

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
    throttledSliceIndex,
    maxSliceZ,
    projectId,
    protocolId,
    outputName,
    svc,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch X-axis slice image for orthogonal view
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "slice" || multiViewMode !== "triple") {
      return;
    }

    if (
      selectedTomoId == null ||
      throttledSliceIndexX == null ||
      maxSliceX == null ||
      maxSliceX < 0
    ) {
      setSliceXError(null);
      setSliceXLoading(false);
      return;
    }

    const clamped = Math.max(0, Math.min(throttledSliceIndexX, maxSliceX));

    sliceXAbortRef.current?.abort();
    const controller = new AbortController();
    sliceXAbortRef.current = controller;
    const reqId = ++sliceXReqIdRef.current;

    (async () => {
      try {
        setSliceXLoading(true);
        setSliceXError(null);

        const result = await (svc as any).fetchCoords3dTomogramSliceObjectUrl(
          projectId,
          protocolId,
          outputName,
          selectedTomoId,
          clamped,
          {
            axis: "x",
            format: "webp",
            normalize: "minmax",
            scale: 1,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted || sliceXReqIdRef.current !== reqId) {
          if (result?.revoke) {
            try {
              result.revoke();
            } catch {
              // ignore
            }
          }
          return;
        }

        setSliceXImageUrl(result?.url ?? null);
      } catch (e: any) {
        if (controller.signal.aborted || sliceXReqIdRef.current !== reqId) {
          return;
        }
        setSliceXError(e?.message || "Failed to load tomogram slice (X)");
      } finally {
        if (sliceXReqIdRef.current === reqId) {
          setSliceXLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    viewMode,
    multiViewMode,
    selectedTomoId,
    throttledSliceIndexX,
    maxSliceX,
    projectId,
    protocolId,
    outputName,
    svc,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch Y-axis slice image for orthogonal view
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "slice" || multiViewMode !== "triple") {
      return;
    }

    if (
      selectedTomoId == null ||
      throttledSliceIndexY == null ||
      maxSliceY == null ||
      maxSliceY < 0
    ) {
      setSliceYError(null);
      setSliceYLoading(false);
      return;
    }

    const clamped = Math.max(0, Math.min(throttledSliceIndexY, maxSliceY));

    sliceYAbortRef.current?.abort();
    const controller = new AbortController();
    sliceYAbortRef.current = controller;
    const reqId = ++sliceYReqIdRef.current;

    (async () => {
      try {
        setSliceYLoading(true);
        setSliceYError(null);

        const result = await (svc as any).fetchCoords3dTomogramSliceObjectUrl(
          projectId,
          protocolId,
          outputName,
          selectedTomoId,
          clamped,
          {
            axis: "y",
            format: "webp",
            normalize: "minmax",
            scale: 1,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted || sliceYReqIdRef.current !== reqId) {
          if (result?.revoke) {
            try {
              result.revoke();
            } catch {
              // ignore
            }
          }
          return;
        }

        setSliceYImageUrl(result?.url ?? null);
      } catch (e: any) {
        if (controller.signal.aborted || sliceYReqIdRef.current !== reqId) {
          return;
        }
        setSliceYError(e?.message || "Failed to load tomogram slice (Y)");
      } finally {
        if (sliceYReqIdRef.current === reqId) {
          setSliceYLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    viewMode,
    multiViewMode,
    selectedTomoId,
    throttledSliceIndexY,
    maxSliceY,
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
                ) : multiViewMode === "triple" ? (
                  // Orthogonal 3-view layout: Z big (bottom-left), Y top (horizontal), X right (vertical)
                  !tomoDims ||
                    maxSliceZ == null ||
                    maxSliceX == null ||
                    maxSliceY == null ||
                    sliceIndex == null ||
                    sliceIndexX == null ||
                    sliceIndexY == null ? (
                    <Box sx={{ m: "auto" }}>
                      <Typography variant="body2" color="text.secondary">
                        Tomogram dimensions are not available for orthogonal views.
                        Make sure dims are provided as [X, Y, Z].
                      </Typography>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        gap: 1,
                        alignItems: "stretch",
                        justifyContent: "center",
                      }}
                    >
                      {/* Left column: Y on top (XZ), Z below (XY, big) */}
                      <Box
                        sx={{
                          flex: 3,
                          minWidth: 0,
                          minHeight: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        {/* Y view (XZ plane) - TOP, horizontal */}
                        <Box
                          sx={{
                            flex: 0.8,
                            minWidth: 0,
                            minHeight: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              top: 4,
                              left: 6,
                              px: 0.5,
                              py: 0.25,
                              borderRadius: 0.5,
                              bgcolor: "rgba(0,0,0,0.45)",
                            }}
                          >
                            <Typography variant="caption" sx={{ color: "common.white" }}>
                              Y (XZ)
                            </Typography>
                          </Box>
                          {sliceYLoading && !sliceYImageUrl ? (
                            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                              <CircularProgress size={18} />
                              <Typography variant="body2">Loading Y slice…</Typography>
                            </Box>
                          ) : sliceYError ? (
                            <Typography variant="body2" color="error">
                              {sliceYError}
                            </Typography>
                          ) : !tomoDimsX || !tomoDimsZ ? (
                            <Typography variant="body2" color="text.secondary">
                              XZ plane dimensions are not available.
                            </Typography>
                          ) : !sliceYImageUrl ? (
                            <Typography variant="body2" color="text.secondary">
                              No Y slice image.
                            </Typography>
                          ) : (
                            <svg
                              viewBox={`0 0 ${tomoDimsX} ${tomoDimsZ}`}
                              preserveAspectRatio="xMidYMid meet"
                              style={{
                                width: "100%",
                                height: "80%",
                                display: "block",
                                backgroundColor: "transparent",
                              }}
                            >
                              <image
                                href={sliceYImageUrl}
                                x={0}
                                y={0}
                                width={tomoDimsX}
                                height={tomoDimsZ}
                                preserveAspectRatio="none"
                                style={{
                                  filter: `brightness(${brightness}) contrast(${contrast})`,
                                }}
                              />
                              {slicePointsSvgY.map((p) => (
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
                          )}
                        </Box>

                        {/* Z view (XY plane) - BOTTOM, big */}
                        <Box
                          sx={{
                            flex: 3.2,
                            minWidth: 0,
                            minHeight: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              top: 4,
                              left: 6,
                              px: 0.5,
                              py: 0.25,
                              borderRadius: 0.5,
                              bgcolor: "rgba(0,0,0,0.45)",
                            }}
                          >
                            <Typography variant="caption" sx={{ color: "common.white" }}>
                              Z (XY)
                            </Typography>
                          </Box>
                          {sliceLoading && !sliceImageUrl ? (
                            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                              <CircularProgress size={18} />
                              <Typography variant="body2">Loading Z slice…</Typography>
                            </Box>
                          ) : sliceError ? (
                            <Typography variant="body2" color="error">
                              {sliceError}
                            </Typography>
                          ) : !tomoDimsX || !tomoDimsY ? (
                            <Typography variant="body2" color="text.secondary">
                              XY plane dimensions are not available.
                            </Typography>
                          ) : !sliceImageUrl ? (
                            <Typography variant="body2" color="text.secondary">
                              No Z slice image.
                            </Typography>
                          ) : (
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
                                style={{
                                  filter: `brightness(${brightness}) contrast(${contrast})`,
                                }}
                              />
                              {slicePointsSvgZ.map((p) => (
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
                          )}
                        </Box>
                      </Box>

                      {/* Right column: X view (YZ plane), vertical */}
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                      >
                        <Box
                          sx={{
                            position: "absolute",
                            top: 4,
                            left: 6,
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                            bgcolor: "rgba(0,0,0,0.45)",
                          }}
                        >
                          <Typography variant="caption" sx={{ color: "common.white" }}>
                            X (YZ)
                          </Typography>
                        </Box>
                        {sliceXLoading && !sliceXImageUrl ? (
                          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2">Loading X slice…</Typography>
                          </Box>
                        ) : sliceXError ? (
                          <Typography variant="body2" color="error">
                            {sliceXError}
                          </Typography>
                        ) : !tomoDimsY || !tomoDimsZ ? (
                          <Typography variant="body2" color="text.secondary">
                            YZ plane dimensions are not available.
                          </Typography>
                        ) : !sliceXImageUrl ? (
                          <Typography variant="body2" color="text.secondary">
                            No X slice image.
                          </Typography>
                        ) : (
                          <svg
                            viewBox={`0 0 ${tomoDimsZ} ${tomoDimsY}`}
                            preserveAspectRatio="xMidYMid meet"
                            style={{
                              width: "100%",
                              height: "70%",
                              display: "block",
                              backgroundColor: "transparent",
                            }}
                          >
                            <image
                              href={sliceXImageUrl}
                              x={0}
                              y={0}
                              width={tomoDimsZ}
                              height={tomoDimsY}
                              preserveAspectRatio="none"
                              style={{
                                filter: `brightness(${brightness}) contrast(${contrast})`,
                              }}
                            />
                            {slicePointsSvgX.map((p) => (
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

                        )}
                      </Box>
                    </Box>
                  )
                ) : (

                  // Single-slice Z view
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
                    ) : maxSliceZ == null ||
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
                            style={{
                              // CSS filters applied client-side
                              filter: `brightness(${brightness}) contrast(${contrast})`,
                            }}
                          />
                          {slicePointsSvgZ.map((p) => (
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
                {viewMode === "slice" &&
                  sliceIndex != null &&
                  maxSliceZ != null && (
                    <MetaItem
                      label="Slice (Z)"
                      value={`${sliceIndex + 1} / ${maxSliceZ + 1}`}
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
                          gap: 1,
                        }}
                      >
                        {/* Single vs 3 views */}
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Slice layout
                          </Typography>
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={multiViewMode}
                            onChange={(_, v) => v && setMultiViewMode(v)}
                          >
                            <ToggleButton value="single">
                              Single
                            </ToggleButton>
                            <ToggleButton value="triple">
                              3 views
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        {/* Z slider */}
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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Slice (Z)
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => openHelp("sliceIndex")}
                            >
                              <HelpCircle size={14} />
                            </IconButton>
                          </Box>
                          {maxSliceZ != null && sliceIndex != null ? (
                            <>
                              <Slider
                                size="small"
                                value={Math.min(sliceIndex, maxSliceZ)}
                                min={0}
                                max={maxSliceZ}
                                step={1}
                                onChange={(_, v) =>
                                  setSliceIndex(v as number)
                                }
                                valueLabelDisplay="auto"
                                valueLabelFormat={(v) =>
                                  String((v as number) + 1)
                                }
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
                                  {maxSliceZ + 1}
                                </Typography>
                              </Box>
                            </>
                          ) : (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Slice range not available. Tomogram dims are
                              missing.
                            </Typography>
                          )}
                        </Box>

                        {/* X & Y sliders only in 3 views mode */}
                        {multiViewMode === "triple" && (
                          <>
                            {/* X slider */}
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
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Slice (X)
                                </Typography>
                                <IconButton
                                  size="small"
                                  onClick={() => openHelp("sliceIndex")}
                                >
                                  <HelpCircle size={14} />
                                </IconButton>
                              </Box>
                              {maxSliceX != null && sliceIndexX != null ? (
                                <>
                                  <Slider
                                    size="small"
                                    value={Math.min(
                                      sliceIndexX,
                                      maxSliceX,
                                    )}
                                    min={0}
                                    max={maxSliceX}
                                    step={1}
                                    onChange={(_, v) =>
                                      setSliceIndexX(v as number)
                                    }
                                    valueLabelDisplay="auto"
                                    valueLabelFormat={(v) =>
                                      String((v as number) + 1)
                                    }
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
                                      {maxSliceX + 1}
                                    </Typography>
                                  </Box>
                                </>
                              ) : (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Slice range not available for X axis. Tomogram
                                  dims are missing.
                                </Typography>
                              )}
                            </Box>

                            {/* Y slider */}
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
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Slice (Y)
                                </Typography>
                                <IconButton
                                  size="small"
                                  onClick={() => openHelp("sliceIndex")}
                                >
                                  <HelpCircle size={14} />
                                </IconButton>
                              </Box>
                              {maxSliceY != null && sliceIndexY != null ? (
                                <>
                                  <Slider
                                    size="small"
                                    value={Math.min(
                                      sliceIndexY,
                                      maxSliceY,
                                    )}
                                    min={0}
                                    max={maxSliceY}
                                    step={1}
                                    onChange={(_, v) =>
                                      setSliceIndexY(v as number)
                                    }
                                    valueLabelDisplay="auto"
                                    valueLabelFormat={(v) =>
                                      String((v as number) + 1)
                                    }
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
                                      {maxSliceY + 1}
                                    </Typography>
                                  </Box>
                                </>
                              ) : (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Slice range not available for Y axis. Tomogram
                                  dims are missing.
                                </Typography>
                              )}
                            </Box>
                          </>
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
                            step={
                              (scoreMinMax[1] - scoreMinMax[0]) / 200 || 0.001
                            }
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

                    {/* Brightness / Contrast (slice view only) */}
                    {viewMode === "slice" && (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                          mt: 0.5,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Intensity
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => {
                              setBrightness(1.0);
                              setContrast(1.0);
                            }}
                          >
                            Reset
                          </Button>
                        </Box>

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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Brightness
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => openHelp("brightness")}
                            >
                              <HelpCircle size={14} />
                            </IconButton>
                          </Box>
                          <Slider
                            size="small"
                            value={brightness}
                            min={0.3}
                            max={2.5}
                            step={0.05}
                            onChange={(_, v) => setBrightness(v as number)}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(v) =>
                              `${Math.round((v as number) * 100)}%`
                            }
                          />
                        </Box>

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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Contrast
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => openHelp("contrast")}
                            >
                              <HelpCircle size={14} />
                            </IconButton>
                          </Box>
                          <Slider
                            size="small"
                            value={contrast}
                            min={0.3}
                            max={2.5}
                            step={0.05}
                            onChange={(_, v) => setContrast(v as number)}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(v) =>
                              `${Math.round((v as number) * 100)}%`
                            }
                          />
                        </Box>
                      </Box>
                    )}
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
                  : helpKey === "brightness"
                    ? "Brightness"
                    : helpKey === "contrast"
                      ? "Contrast"
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

// Generic throttle hook reused from volume viewer
function useThrottledValue<T>(value: T, delayMs: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastExecutedRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const elapsed = now - lastExecutedRef.current;

    const runNow = () => {
      lastExecutedRef.current = performance.now();
      setThrottled(value);
    };

    if (elapsed >= delayMs) {
      runNow();
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      const remaining = delayMs - elapsed;
      timeoutRef.current = window.setTimeout(() => {
        runNow();
        timeoutRef.current = null;
      }, remaining);
    }

    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, delayMs]);

  return throttled;
}


