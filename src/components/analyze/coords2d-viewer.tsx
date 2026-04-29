import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Circle,
  Eraser,
  Hand,
  LocateFixed,
  MousePointer2,
  Plus,
  Square,
  Table2,
  X,
} from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type {
  Coords2dMicrograph,
  Coords2dPoint,
  Id,
  ObjectUrlResult,
} from "@/services/ProjectService";

type Coords2dViewerProps = {
  projectId: number;
  protocolId: number;
  protocolLabel: string;
  outputName: string;
};

type ViewerPoint = Coords2dPoint & {
  id: Id;
  micId: Id;
  x: number;
  y: number;
  isNew?: boolean;
};

type ViewTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type Bounds2d = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ToolMode = "pan" | "pick" | "erase";
type ShapeMode = "circle" | "square";

type ImageFilters = {
  enhanceContrast: boolean;
  gaussianBlur: boolean;
  invertContrast: boolean;
};

type ParticleCrop = {
  pointId: string;
  rowIndex: number;
  url: string;
  x: number;
  y: number;
};

type DragState = {
  type: "none" | "pan" | "point" | "erase";
  active: boolean;
  moved: boolean;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  pointId: string | null;
  micKey: string;
  startWorldX: number;
  startWorldY: number;
  initialPointX: number;
  initialPointY: number;
  initialPoint: ViewerPoint | null;
};

type ParticleCropCacheEntry = {
  signature: string;
  url: string;
};

type PendingPointMove = {
  micKey: string;
  pointId: string;
  point: ViewerPoint;
};

const DEFAULT_BOX_SIZE = 50;
const MIN_BOX_SIZE = 10;
const MAX_BOX_SIZE = 240;
const PARTICLE_GALLERY_SIZE = 74;

const PANEL_BORDER = "1px solid rgba(100,116,139,0.35)";
const HEADER_BG = "#e5e7eb";
const TOOLBAR_BG = "#eeeeee";
const ROW_SELECTED = "#3f617b";
const DEFAULT_PICK_COLOR = "#00d5d5";

function createDragState(): DragState {
  return {
    type: "none",
    active: false,
    moved: false,
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    pointId: null,
    micKey: "",
    startWorldX: 0,
    startWorldY: 0,
    initialPointX: 0,
    initialPointY: 0,
    initialPoint: null,
  };
}

function toStringId(value: Id): string {
  return String(value ?? "");
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function basename(value: string): string {
  const clean = value.trim();
  if (!clean) return "Untitled";
  return clean.split(/[\\/]/).filter(Boolean).pop() ?? clean;
}

function normalizeObjectUrl(raw: ObjectUrlResult | string | null | undefined): ObjectUrlResult | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    return {
      url: raw,
      revoke: () => URL.revokeObjectURL(raw),
    };
  }

  return raw;
}

function getMicrographLabel(micrograph: Coords2dMicrograph): string {
  const label = String(micrograph.label ?? "").trim();
  if (label) return basename(label);

  const fileName = String(micrograph.fileName ?? "").trim();
  if (fileName) return basename(fileName);

  return `Micrograph ${String(micrograph.id)}`;
}

function getPointId(point: Coords2dPoint, fallbackIndex: number): string {
  return String(point.id ?? `${point.micId}:${fallbackIndex}`);
}

function buildCanvasFilter(filters: ImageFilters): string {
  const items: string[] = [];

  if (filters.enhanceContrast) {
    items.push("contrast(220%)");
  }

  if (filters.gaussianBlur) {
    items.push("blur(0.5px)");
  }

  if (filters.invertContrast) {
    items.push("invert(1)");
  }

  return items.length ? items.join(" ") : "none";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeParticleCropSignature(
  point: ViewerPoint,
  imageUrl: string | null,
  imageWorldSize: { width: number; height: number },
  boxSize: number,
  filters: ImageFilters,
): string {
  return [
    imageUrl ?? "",
    point.id,
    point.x.toFixed(2),
    point.y.toFixed(2),
    imageWorldSize.width,
    imageWorldSize.height,
    boxSize,
    filters.enhanceContrast ? "c1" : "c0",
    filters.gaussianBlur ? "b1" : "b0",
    filters.invertContrast ? "i1" : "i0",
  ].join(":");
}

function makeParticleCropUrl(
  image: HTMLImageElement,
  point: ViewerPoint,
  imageWorldSize: { width: number; height: number },
  boxSize: number,
  filters: ImageFilters,
  outputSize = PARTICLE_GALLERY_SIZE,
): string {
  const sourceScaleX = image.naturalWidth / imageWorldSize.width;
  const sourceScaleY = image.naturalHeight / imageWorldSize.height;

  const sourceSizeX = Math.max(1, boxSize * sourceScaleX);
  const sourceSizeY = Math.max(1, boxSize * sourceScaleY);

  const rawSourceX = (point.x - boxSize / 2) * sourceScaleX;
  const rawSourceY = (point.y - boxSize / 2) * sourceScaleY;

  const sourceX = clamp(rawSourceX, 0, Math.max(0, image.naturalWidth - 1));
  const sourceY = clamp(rawSourceY, 0, Math.max(0, image.naturalHeight - 1));

  const safeSourceWidth = Math.min(sourceSizeX, image.naturalWidth - sourceX);
  const safeSourceHeight = Math.min(sourceSizeY, image.naturalHeight - sourceY);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx || safeSourceWidth <= 0 || safeSourceHeight <= 0) {
    return "";
  }

  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.filter = buildCanvasFilter(filters);
  ctx.imageSmoothingEnabled = true;

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    safeSourceWidth,
    safeSourceHeight,
    0,
    0,
    outputSize,
    outputSize,
  );

  return canvas.toDataURL("image/png");
}

function getBounds(
  points: ViewerPoint[],
  imageWorldSize: { width: number; height: number } | null,
  boxSize: number,
): Bounds2d {
  const maxPointX = Math.max(1, ...points.map((point) => point.x + boxSize));
  const maxPointY = Math.max(1, ...points.map((point) => point.y + boxSize));

  if (imageWorldSize) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(imageWorldSize.width, maxPointX),
      maxY: Math.max(imageWorldSize.height, maxPointY),
    };
  }

  if (!points.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
    };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padX = Math.max(boxSize, (maxX - minX) * 0.05);
  const padY = Math.max(boxSize, (maxY - minY) * 0.05);

  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}

function computeFitTransform(bounds: Bounds2d, size: { width: number; height: number }): ViewTransform {
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.max(
    0.0001,
    Math.min((size.width - 32) / worldWidth, (size.height - 32) / worldHeight),
  );

  return {
    scale,
    offsetX: (size.width - worldWidth * scale) / 2,
    offsetY: (size.height - worldHeight * scale) / 2,
  };
}

function Coords2dViewer({
  projectId,
  protocolId,
  protocolLabel,
  outputName,
}: Coords2dViewerProps) {
  const service = useProjectService();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const nextPointIdRef = useRef(1);
  const dragRef = useRef<DragState>(createDragState());
  const particleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const visiblePointsRef = useRef<ViewerPoint[]>([]);
  const deletedPointIdsRef = useRef<Set<string>>(new Set());
  const erasedDuringDragRef = useRef<Set<string>>(new Set());
  const particleCropCacheRef = useRef<Record<string, ParticleCropCacheEntry>>({});
  const cropUpdateFrameRef = useRef<number | null>(null);
  const pointMoveFrameRef = useRef<number | null>(null);
  const pendingPointMoveRef = useRef<PendingPointMove | null>(null);

  const [micrographs, setMicrographs] = useState<Coords2dMicrograph[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<Id | null>(null);
  const [pointsByMicId, setPointsByMicId] = useState<Record<string, ViewerPoint[]>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  const [boxSize, setBoxSize] = useState(DEFAULT_BOX_SIZE);
  const [totalPicks, setTotalPicks] = useState(0);
  const [loadingMicrographs, setLoadingMicrographs] = useState(true);
  const [loadingCoordinates, setLoadingCoordinates] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageLoadAttempted, setImageLoadAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [shapeMode, setShapeMode] = useState<ShapeMode>("circle");
  const [toolMode, setToolMode] = useState<ToolMode>("pan");
  const [pickColor, setPickColor] = useState(DEFAULT_PICK_COLOR);
  const [deletedPointIds, setDeletedPointIds] = useState<Set<string>>(() => new Set());
  const [updatedMicIds, setUpdatedMicIds] = useState<Set<string>>(() => new Set());

  const [filtersAnchorEl, setFiltersAnchorEl] = useState<HTMLElement | null>(null);
  const [toolsAnchorEl, setToolsAnchorEl] = useState<HTMLElement | null>(null);
  const [windowsAnchorEl, setWindowsAnchorEl] = useState<HTMLElement | null>(null);

  const [filters, setFilters] = useState<ImageFilters>({
    enhanceContrast: true,
    gaussianBlur: false,
    invertContrast: false,
  });

  const [particlesOpen, setParticlesOpen] = useState(false);
  const [particleCropVersion, setParticleCropVersion] = useState(0);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<ViewTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const selectedMicKey = useMemo(() => {
    return selectedMicId === null || selectedMicId === undefined ? "" : toStringId(selectedMicId);
  }, [selectedMicId]);

  const selectedMicrograph = useMemo(() => {
    if (!selectedMicKey) return null;
    return micrographs.find((micrograph) => toStringId(micrograph.id) === selectedMicKey) ?? null;
  }, [micrographs, selectedMicKey]);

  const currentPoints = useMemo(() => {
    if (!selectedMicKey) return [];
    return pointsByMicId[selectedMicKey] ?? [];
  }, [pointsByMicId, selectedMicKey]);

  const visiblePoints = useMemo(() => {
    return currentPoints.filter((point, index) => {
      const pointId = getPointId(point, index);
      return !deletedPointIds.has(pointId);
    });
  }, [currentPoints, deletedPointIds]);

  const selectedPoint = useMemo(() => {
    if (!selectedPointId) return null;
    return visiblePoints.find((point, index) => getPointId(point, index) === selectedPointId) ?? null;
  }, [selectedPointId, visiblePoints]);

  useEffect(() => {
    visiblePointsRef.current = visiblePoints;
  }, [visiblePoints]);

  useEffect(() => {
    deletedPointIdsRef.current = deletedPointIds;
  }, [deletedPointIds]);

  useEffect(() => {
    return () => {
      if (cropUpdateFrameRef.current !== null) {
        cancelAnimationFrame(cropUpdateFrameRef.current);
      }

      if (pointMoveFrameRef.current !== null) {
        cancelAnimationFrame(pointMoveFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMicrographs() {
      setLoadingMicrographs(true);
      setError(null);

      try {
        const result = await service.listCoords2dMicrographs(projectId, protocolId, outputName);

        if (cancelled) return;

        const nextMicrographs = result.micrographs ?? [];
        setMicrographs(nextMicrographs);
        setTotalPicks(result.totalPicks ?? 0);

        if (result.boxSize && Number.isFinite(result.boxSize)) {
          setBoxSize(Math.max(MIN_BOX_SIZE, Math.min(MAX_BOX_SIZE, Number(result.boxSize))));
        }

        const firstMicId = nextMicrographs[0]?.id ?? null;
        setSelectedMicId(firstMicId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load 2D coordinate micrographs");
        }
      } finally {
        if (!cancelled) setLoadingMicrographs(false);
      }
    }

    void loadMicrographs();

    return () => {
      cancelled = true;
    };
  }, [service, projectId, protocolId, outputName]);

  useEffect(() => {
    if (!micrographs.length) return;

    let cancelled = false;
    const objectUrls: ObjectUrlResult[] = [];

    async function loadThumbnails() {
      const entries = await Promise.all(
        micrographs.map(async (micrograph) => {
          const micKey = toStringId(micrograph.id);

          if (micrograph.thumbnailUrl) {
            return [micKey, micrograph.thumbnailUrl] as const;
          }

          try {
            const result = normalizeObjectUrl(
              await service.fetchCoords2dMicrographThumbnailObjectUrl(
                projectId,
                protocolId,
                outputName,
                micrograph.id,
                { size: 72, format: "png" },
              ),
            );

            if (!result) return null;

            objectUrls.push(result);
            return [micKey, result.url] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      const nextUrls: Record<string, string> = {};
      for (const entry of entries) {
        if (!entry) continue;
        nextUrls[entry[0]] = entry[1];
      }

      setThumbnailUrls(nextUrls);
    }

    void loadThumbnails();

    return () => {
      cancelled = true;
      objectUrls.forEach((item) => item.revoke?.());
    };
  }, [service, projectId, protocolId, outputName, micrographs]);

  useEffect(() => {
    if (!selectedMicKey || !selectedMicId) return;
    if (pointsByMicId[selectedMicKey]) return;

    let cancelled = false;

    async function loadCoordinates() {
      setLoadingCoordinates(true);
      setError(null);

      try {
        const points = await service.fetchCoords2dForMicrograph(
          projectId,
          protocolId,
          outputName,
          selectedMicId,
        );

        if (cancelled) return;

        const normalizedPoints = (points ?? []).map((point, index) => ({
          ...point,
          id: point.id ?? `${selectedMicKey}:${index}`,
          micId: point.micId ?? selectedMicId,
          x: Number(point.x),
          y: Number(point.y),
        }));

        setPointsByMicId((current) => ({
          ...current,
          [selectedMicKey]: normalizedPoints,
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load 2D coordinates");
        }
      } finally {
        if (!cancelled) setLoadingCoordinates(false);
      }
    }

    void loadCoordinates();

    return () => {
      cancelled = true;
    };
  }, [
    service,
    projectId,
    protocolId,
    outputName,
    selectedMicId,
    selectedMicKey,
    pointsByMicId,
  ]);

  useEffect(() => {
    if (!selectedMicId) {
      setImageUrl(null);
      setImage(null);
      setLoadingImage(false);
      setImageLoadAttempted(false);
      return;
    }

    let cancelled = false;
    let objectUrl: ObjectUrlResult | null = null;

    setImageUrl(null);
    setImage(null);
    setLoadingImage(true);
    setImageLoadAttempted(false);

    async function loadImage() {
      try {
        objectUrl = normalizeObjectUrl(
          await service.fetchCoords2dMicrographImageObjectUrl(
            projectId,
            protocolId,
            outputName,
            selectedMicId,
            { size: 2200, format: "png" },
          ),
        );

        if (!objectUrl) {
          if (!cancelled) {
            setImageUrl(null);
            setImage(null);
            setImageLoadAttempted(true);
            setLoadingImage(false);
          }
          return;
        }

        if (cancelled) return;

        const img = new Image();

        img.onload = () => {
          if (cancelled) return;
          setImageUrl(objectUrl?.url ?? null);
          setImage(img);
          setImageLoadAttempted(true);
          setLoadingImage(false);
        };

        img.onerror = () => {
          if (cancelled) return;
          setImageUrl(null);
          setImage(null);
          setImageLoadAttempted(true);
          setLoadingImage(false);
        };

        img.src = objectUrl.url;
      } catch {
        if (!cancelled) {
          setImageUrl(null);
          setImage(null);
          setImageLoadAttempted(true);
          setLoadingImage(false);
        }
      }
    }

    void loadImage();

    return () => {
      cancelled = true;
      objectUrl?.revoke?.();
    };
  }, [service, projectId, protocolId, outputName, selectedMicId]);

  useEffect(() => {
    const node = canvasWrapRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const imageWorldSize = useMemo(() => {
    if (!selectedMicrograph && !image) return null;

    const width =
      Number(selectedMicrograph?.width) > 0
        ? Number(selectedMicrograph?.width)
        : image?.naturalWidth ?? 0;

    const height =
      Number(selectedMicrograph?.height) > 0
        ? Number(selectedMicrograph?.height)
        : image?.naturalHeight ?? 0;

    if (!width || !height) return null;

    return { width, height };
  }, [image, selectedMicrograph]);

  const activeImageFilter = useMemo(() => {
    return buildCanvasFilter(filters);
  }, [filters]);

  const bounds = useMemo(() => {
    return getBounds(visiblePoints, imageWorldSize, boxSize);
  }, [boxSize, imageWorldSize, visiblePoints]);

  const fitView = useCallback(() => {
    setTransform(computeFitTransform(bounds, size));
  }, [bounds, size]);

  useEffect(() => {
    if (!selectedMicKey) return;

    const nextBounds = getBounds(visiblePointsRef.current, imageWorldSize, boxSize);
    setTransform(computeFitTransform(nextBounds, size));
    // Auto-fit only when the selected micrograph, image or canvas size changes.
    // Do not depend on visiblePoints/bounds, so moving coordinates keeps the current zoom.
  }, [selectedMicKey, imageUrl, size.width, size.height, imageWorldSize, boxSize]);

  const worldToScreen = useCallback(
    (x: number, y: number) => ({
      x: (x - bounds.minX) * transform.scale + transform.offsetX,
      y: (y - bounds.minY) * transform.scale + transform.offsetY,
    }),
    [bounds.minX, bounds.minY, transform.offsetX, transform.offsetY, transform.scale],
  );

  const screenToWorld = useCallback(
    (x: number, y: number) => ({
      x: (x - transform.offsetX) / transform.scale + bounds.minX,
      y: (y - transform.offsetY) / transform.scale + bounds.minY,
    }),
    [bounds.minX, bounds.minY, transform.offsetX, transform.offsetY, transform.scale],
  );

  const findPointAt = useCallback(
    (screenX: number, screenY: number): string | null => {
      let bestId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      const radiusPx = Math.max(8, (boxSize / 2) * transform.scale);

      visiblePointsRef.current.forEach((point, index) => {
        const pointId = getPointId(point, index);
        if (deletedPointIdsRef.current.has(pointId)) return;

        const screen = worldToScreen(point.x, point.y);
        const distance = Math.hypot(screen.x - screenX, screen.y - screenY);

        if (distance <= radiusPx && distance < bestDistance) {
          bestDistance = distance;
          bestId = pointId;
        }
      });

      return bestId;
    },
    [boxSize, transform.scale, worldToScreen],
  );

  const particleCrops = useMemo<ParticleCrop[]>(() => {
    return visiblePoints
      .map((point, index) => {
        const pointId = getPointId(point, index);
        const cached = particleCropCacheRef.current[pointId];

        return {
          pointId,
          rowIndex: index,
          url: cached?.url ?? "",
          x: point.x,
          y: point.y,
        };
      })
      .filter((crop) => Boolean(crop.url));
  }, [particleCropVersion, visiblePoints]);

  useEffect(() => {
    if (!particlesOpen || !image || !imageWorldSize) return;

    const nextCache: Record<string, ParticleCropCacheEntry> = {};
    const points = visiblePointsRef.current;

    points.forEach((point, index) => {
      const pointId = getPointId(point, index);
      const signature = makeParticleCropSignature(point, imageUrl, imageWorldSize, boxSize, filters);
      const cached = particleCropCacheRef.current[pointId];

      if (cached?.signature === signature) {
        nextCache[pointId] = cached;
        return;
      }

      const url = makeParticleCropUrl(image, point, imageWorldSize, boxSize, filters);
      if (!url) return;

      nextCache[pointId] = {
        signature,
        url,
      };
    });

    particleCropCacheRef.current = nextCache;
    setParticleCropVersion((current) => current + 1);
  }, [
    boxSize,
    deletedPointIds.size,
    filters,
    image,
    imageUrl,
    imageWorldSize,
    particlesOpen,
    selectedMicKey,
    visiblePoints.length,
  ]);

  useEffect(() => {
    if (!particlesOpen || !selectedPointId) return;

    const node = particleRefs.current[selectedPointId];
    if (!node) return;

    node.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [particleCrops.length, particlesOpen, selectedPointId]);

  const scheduleParticleCropUpdate = useCallback(
    (pointId: string, point: ViewerPoint) => {
      if (!particlesOpen || !image || !imageWorldSize) return;

      if (cropUpdateFrameRef.current !== null) {
        cancelAnimationFrame(cropUpdateFrameRef.current);
      }

      cropUpdateFrameRef.current = requestAnimationFrame(() => {
        cropUpdateFrameRef.current = null;

        const signature = makeParticleCropSignature(point, imageUrl, imageWorldSize, boxSize, filters);
        const url = makeParticleCropUrl(image, point, imageWorldSize, boxSize, filters);
        if (!url) return;

        particleCropCacheRef.current = {
          ...particleCropCacheRef.current,
          [pointId]: {
            signature,
            url,
          },
        };

        setParticleCropVersion((current) => current + 1);
      });
    },
    [boxSize, filters, image, imageUrl, imageWorldSize, particlesOpen],
  );

  const schedulePointMove = useCallback(
    (micKey: string, pointId: string, point: ViewerPoint) => {
      pendingPointMoveRef.current = {
        micKey,
        pointId,
        point,
      };

      scheduleParticleCropUpdate(pointId, point);

      if (pointMoveFrameRef.current !== null) return;

      pointMoveFrameRef.current = requestAnimationFrame(() => {
        pointMoveFrameRef.current = null;

        const pendingMove = pendingPointMoveRef.current;
        pendingPointMoveRef.current = null;

        if (!pendingMove) return;

        setPointsByMicId((current) => {
          const points = current[pendingMove.micKey];
          if (!points) return current;

          return {
            ...current,
            [pendingMove.micKey]: points.map((candidate, index) => {
              if (getPointId(candidate, index) !== pendingMove.pointId) return candidate;

              return {
                ...candidate,
                x: pendingMove.point.x,
                y: pendingMove.point.y,
              };
            }),
          };
        });
      });
    },
    [scheduleParticleCropUpdate],
  );

  useEffect(() => {
    return () => {
      if (cropUpdateFrameRef.current !== null) {
        cancelAnimationFrame(cropUpdateFrameRef.current);
      }

      if (pointMoveFrameRef.current !== null) {
        cancelAnimationFrame(pointMoveFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) return;

    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.floor(size.width * ratio);
    canvas.height = Math.floor(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    ctx.fillStyle = "#cfd3d7";
    ctx.fillRect(0, 0, size.width, size.height);

    if (image && imageUrl && imageWorldSize) {
      const topLeft = worldToScreen(0, 0);
      const bottomRight = worldToScreen(imageWorldSize.width, imageWorldSize.height);

      ctx.save();
      ctx.filter = activeImageFilter;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        image,
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y,
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(0, 0, size.width, size.height);
    }

    visiblePoints.forEach((point, index) => {
      const pointId = getPointId(point, index);
      const screen = worldToScreen(point.x, point.y);
      const radiusPx = Math.max(2, (boxSize / 2) * transform.scale);
      const selected = pointId === selectedPointId;

      ctx.strokeStyle = selected ? "#ffff00" : pickColor;
      ctx.lineWidth = selected ? 2.5 : 1.2;
      ctx.beginPath();

      if (shapeMode === "circle") {
        ctx.arc(screen.x, screen.y, radiusPx, 0, Math.PI * 2);
      } else {
        ctx.rect(screen.x - radiusPx, screen.y - radiusPx, radiusPx * 2, radiusPx * 2);
      }

      ctx.stroke();
    });
  }, [
    activeImageFilter,
    bounds.maxX,
    bounds.maxY,
    boxSize,
    image,
    imageUrl,
    imageWorldSize,
    pickColor,
    selectedPointId,
    shapeMode,
    size.height,
    size.width,
    transform.scale,
    visiblePoints,
    worldToScreen,
  ]);

  const toggleFilter = useCallback((key: keyof ImageFilters) => {
    setFilters((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const markMicrographUpdated = useCallback((micId: Id) => {
    setUpdatedMicIds((current) => new Set(current).add(toStringId(micId)));
  }, []);

  const updateMicrographParticleCount = useCallback((micId: Id, delta: number) => {
    const micKey = toStringId(micId);

    setMicrographs((current) =>
      current.map((micrograph) => {
        if (toStringId(micrograph.id) !== micKey) return micrograph;

        return {
          ...micrograph,
          particles: Math.max(0, Number(micrograph.particles ?? 0) + delta),
          updated: true,
        };
      }),
    );

    setTotalPicks((current) => Math.max(0, current + delta));
  }, []);

  const erasePointAt = useCallback(
    (screenX: number, screenY: number) => {
      if (!selectedMicId) return;

      const hitId = findPointAt(screenX, screenY);
      if (!hitId) return;
      if (erasedDuringDragRef.current.has(hitId)) return;
      if (deletedPointIdsRef.current.has(hitId)) return;

      erasedDuringDragRef.current.add(hitId);

      setDeletedPointIds((current) => {
        const next = new Set(current);
        next.add(hitId);
        deletedPointIdsRef.current = next;
        return next;
      });

      setSelectedPointId((current) => (current === hitId ? null : current));
      markMicrographUpdated(selectedMicId);
      updateMicrographParticleCount(selectedMicId, -1);
    },
    [findPointAt, markMicrographUpdated, selectedMicId, updateMicrographParticleCount],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
      if (toolMode !== "pan") return;

      event.preventDefault();

      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const world = screenToWorld(pointerX, pointerY);
      const factor = event.deltaY < 0 ? 1.12 : 0.88;

      setTransform((current) => {
        const scale = Math.min(12, Math.max(0.02, current.scale * factor));

        return {
          scale,
          offsetX: pointerX - (world.x - bounds.minX) * scale,
          offsetY: pointerY - (world.y - bounds.minY) * scale,
        };
      });
    },
    [bounds.minX, bounds.minY, screenToWorld, toolMode],
  );

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      dragRef.current = createDragState();

      if (toolMode === "erase") {
        erasedDuringDragRef.current = new Set();
        erasePointAt(pointerX, pointerY);

        dragRef.current = {
          ...createDragState(),
          type: "erase",
          active: true,
          x: event.clientX,
          y: event.clientY,
        };
        return;
      }

      if (toolMode !== "pan") return;

      const hitId = findPointAt(pointerX, pointerY);
      if (hitId && selectedMicKey) {
        const point = visiblePoints.find((candidate, index) => getPointId(candidate, index) === hitId);
        if (!point) return;

        const world = screenToWorld(pointerX, pointerY);

        setSelectedPointId(hitId);

        dragRef.current = {
          type: "point",
          active: true,
          moved: false,
          x: event.clientX,
          y: event.clientY,
          offsetX: transform.offsetX,
          offsetY: transform.offsetY,
          pointId: hitId,
          micKey: selectedMicKey,
          startWorldX: world.x,
          startWorldY: world.y,
          initialPointX: point.x,
          initialPointY: point.y,
          initialPoint: point,
        };

        return;
      }

      dragRef.current = {
        type: "pan",
        active: true,
        moved: false,
        x: event.clientX,
        y: event.clientY,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
        pointId: null,
        micKey: "",
        startWorldX: 0,
        startWorldY: 0,
        initialPointX: 0,
        initialPointY: 0,
        initialPoint: null,
      };
    },
    [
      erasePointAt,
      findPointAt,
      screenToWorld,
      selectedMicKey,
      toolMode,
      transform.offsetX,
      transform.offsetY,
      visiblePoints,
    ],
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;

      if (!drag.active) return;

      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;

      if (Math.abs(dx) + Math.abs(dy) > 3) {
        drag.moved = true;
      }

      if (drag.type === "erase") {
        const rect = event.currentTarget.getBoundingClientRect();
        erasePointAt(event.clientX - rect.left, event.clientY - rect.top);
        return;
      }

      if (drag.type === "point" && drag.pointId && drag.micKey && drag.initialPoint) {
        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const world = screenToWorld(pointerX, pointerY);

        const deltaX = world.x - drag.startWorldX;
        const deltaY = world.y - drag.startWorldY;

        let nextX = drag.initialPointX + deltaX;
        let nextY = drag.initialPointY + deltaY;

        if (imageWorldSize) {
          nextX = clamp(nextX, 0, imageWorldSize.width);
          nextY = clamp(nextY, 0, imageWorldSize.height);
        }

        schedulePointMove(drag.micKey, drag.pointId, {
          ...drag.initialPoint,
          x: nextX,
          y: nextY,
        });

        return;
      }

      if (drag.type === "pan") {
        setTransform((current) => ({
          ...current,
          offsetX: drag.offsetX + dx,
          offsetY: drag.offsetY + dy,
        }));
      }
    },
    [erasePointAt, imageWorldSize, schedulePointMove, screenToWorld],
  );

  const handleMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      dragRef.current = createDragState();

      if (drag.type === "erase") {
        erasedDuringDragRef.current = new Set();
        return;
      }

      if (drag.type === "point") {
        if (drag.moved && selectedMicId) {
          markMicrographUpdated(selectedMicId);
        }

        return;
      }

      if (drag.type === "pan" && drag.moved) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      if (!selectedMicId || !selectedMicKey) return;

      if (toolMode === "pick") {
        const world = screenToWorld(clickX, clickY);
        const point: ViewerPoint = {
          id: `new:${selectedMicKey}:${nextPointIdRef.current++}`,
          micId: selectedMicId,
          x: imageWorldSize ? clamp(world.x, 0, imageWorldSize.width) : world.x,
          y: imageWorldSize ? clamp(world.y, 0, imageWorldSize.height) : world.y,
          isNew: true,
        };

        setPointsByMicId((current) => ({
          ...current,
          [selectedMicKey]: [...(current[selectedMicKey] ?? []), point],
        }));

        setSelectedPointId(toStringId(point.id));
        markMicrographUpdated(selectedMicId);
        updateMicrographParticleCount(selectedMicId, 1);
        return;
      }

      const hitId = findPointAt(clickX, clickY);
      setSelectedPointId(hitId);
    },
    [
      findPointAt,
      imageWorldSize,
      markMicrographUpdated,
      screenToWorld,
      selectedMicId,
      selectedMicKey,
      toolMode,
      updateMicrographParticleCount,
    ],
  );

  const handleCanvasMouseLeave = useCallback(() => {
    const drag = dragRef.current;

    if (drag.type === "point" && drag.moved && selectedMicId) {
      markMicrographUpdated(selectedMicId);
    }

    if (drag.type === "erase") {
      erasedDuringDragRef.current = new Set();
    }

    dragRef.current = createDragState();
  }, [markMicrographUpdated, selectedMicId]);

  const loading = loadingMicrographs || loadingCoordinates || loadingImage;
  const updatedCount = updatedMicIds.size;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        bgcolor: "#d7d7d7",
        position: "relative",
      }}
    >
      <Box
        sx={{
          px: 0.5,
          py: 0.25,
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          borderBottom: PANEL_BORDER,
          bgcolor: "#f3f4f6",
        }}
      >
        <Button size="small" disabled sx={{ minWidth: 42, color: "#111827" }}>
          File
        </Button>

        <Button
          size="small"
          onClick={(event) => setFiltersAnchorEl(event.currentTarget)}
          sx={{ minWidth: 58, color: "#111827" }}
        >
          Filters
        </Button>

        <Button
          size="small"
          onClick={(event) => setToolsAnchorEl(event.currentTarget)}
          sx={{ minWidth: 50, color: "#111827" }}
        >
          Tools
        </Button>

        <Button
          size="small"
          onClick={(event) => setWindowsAnchorEl(event.currentTarget)}
          sx={{ minWidth: 68, color: "#111827" }}
        >
          Window
        </Button>

        <Menu
          anchorEl={filtersAnchorEl}
          open={Boolean(filtersAnchorEl)}
          onClose={() => setFiltersAnchorEl(null)}
        >
          <MenuItem onClick={() => toggleFilter("enhanceContrast")}>
            <Checkbox size="small" checked={filters.enhanceContrast} />
            Enhance contrast
          </MenuItem>

          <MenuItem onClick={() => toggleFilter("gaussianBlur")}>
            <Checkbox size="small" checked={filters.gaussianBlur} />
            Gaussian blur
          </MenuItem>

          <MenuItem onClick={() => toggleFilter("invertContrast")}>
            <Checkbox size="small" checked={filters.invertContrast} />
            Invert contrast
          </MenuItem>
        </Menu>

        <Menu
          anchorEl={toolsAnchorEl}
          open={Boolean(toolsAnchorEl)}
          onClose={() => setToolsAnchorEl(null)}
        >
          <MenuItem disabled>Power histogram</MenuItem>
          <MenuItem disabled>Reset micrograph</MenuItem>
          <MenuItem disabled>Restore micrograph</MenuItem>
        </Menu>

        <Menu
          anchorEl={windowsAnchorEl}
          open={Boolean(windowsAnchorEl)}
          onClose={() => setWindowsAnchorEl(null)}
        >
          <MenuItem
            onClick={() => {
              setParticlesOpen(true);
              setWindowsAnchorEl(null);
            }}
          >
            Particles
          </MenuItem>
        </Menu>
      </Box>

      <Box
        sx={{
          px: 1,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          borderBottom: PANEL_BORDER,
          bgcolor: HEADER_BG,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Box size(px):
        </Typography>

        <Slider
          size="small"
          min={MIN_BOX_SIZE}
          max={MAX_BOX_SIZE}
          step={1}
          value={boxSize}
          onChange={(_, value) => setBoxSize(Array.isArray(value) ? value[0] : value)}
          sx={{ width: 260 }}
        />

        <Typography variant="body2" sx={{ minWidth: 42 }}>
          ({boxSize})
        </Typography>

        <Chip
          size="small"
          label={`Total micrograph: ${micrographs.length}`}
          sx={{ bgcolor: "#cfe8cf", border: "1px solid #9cc99c" }}
        />

        <Chip
          size="small"
          label={`Total picks: ${totalPicks}`}
          sx={{ bgcolor: "#c3d7df", border: "1px solid #91b2bf" }}
        />

        {updatedCount > 0 ? (
          <Chip size="small" color="warning" label={`Updated: ${updatedCount}`} />
        ) : null}

        <Box sx={{ flex: 1 }} />

        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {protocolLabel} · {outputName}
        </Typography>
      </Box>

      <Box
        sx={{
          px: 1,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: PANEL_BORDER,
          bgcolor: TOOLBAR_BG,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Shape:
        </Typography>

        <ButtonGroup size="small" variant="outlined">
          <Button
            variant={shapeMode === "circle" ? "contained" : "outlined"}
            onClick={() => setShapeMode("circle")}
          >
            <Circle size={16} />
          </Button>

          <Button
            variant={shapeMode === "square" ? "contained" : "outlined"}
            onClick={() => setShapeMode("square")}
          >
            <Square size={16} />
          </Button>
        </ButtonGroup>

        <Divider flexItem orientation="vertical" />

        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Color:
        </Typography>

        <Box
          component="input"
          type="color"
          value={pickColor}
          onChange={(event) => setPickColor((event.target as HTMLInputElement).value)}
          sx={{
            width: 34,
            height: 30,
            p: 0,
            border: PANEL_BORDER,
            bgcolor: "transparent",
          }}
        />

        <Divider flexItem orientation="vertical" />

        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Picker tools:
        </Typography>

        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Particle picker">
            <Button
              variant={toolMode === "pick" ? "contained" : "outlined"}
              onClick={() => setToolMode("pick")}
            >
              <Plus size={16} />
            </Button>
          </Tooltip>

          <Tooltip title="Eraser">
            <Button
              variant={toolMode === "erase" ? "contained" : "outlined"}
              onClick={() => setToolMode("erase")}
            >
              <Eraser size={16} />
            </Button>
          </Tooltip>
        </ButtonGroup>

        <Divider flexItem orientation="vertical" />

        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Navigate:
        </Typography>

        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Fit to display">
            <Button onClick={fitView}>
              <LocateFixed size={16} />
            </Button>
          </Tooltip>

          <Tooltip title="Click and drag to move">
            <Button
              variant={toolMode === "pan" ? "contained" : "outlined"}
              onClick={() => setToolMode("pan")}
            >
              <Hand size={16} />
            </Button>
          </Tooltip>
        </ButtonGroup>

        <Box sx={{ flex: 1 }} />

        {selectedPoint ? (
          <Typography variant="caption">
            x={formatNumber(selectedPoint.x)} y={formatNumber(selectedPoint.y)}
          </Typography>
        ) : null}
      </Box>

      {error ? (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <TableContainer
          component={Paper}
          square
          sx={{
            width: 520,
            borderRight: PANEL_BORDER,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 58 }}>
                  Index
                </TableCell>

                <TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 72 }}>
                  Preview
                </TableCell>

                <TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700 }}>
                  File
                </TableCell>

                <TableCell
                  align="center"
                  sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 100 }}
                >
                  Particles
                </TableCell>

                <TableCell
                  align="center"
                  sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 92 }}
                >
                  Updated
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {micrographs.map((micrograph, index) => {
                const micKey = toStringId(micrograph.id);
                const selected = micKey === selectedMicKey;
                const thumbnailUrl = thumbnailUrls[micKey];

                return (
                  <TableRow
                    key={micKey}
                    hover
                    selected={selected}
                    onClick={() => {
                      setSelectedMicId(micrograph.id);
                      setSelectedPointId(null);
                    }}
                    sx={{
                      cursor: "pointer",
                      "&.Mui-selected td": {
                        bgcolor: ROW_SELECTED,
                        color: "#ffffff",
                      },
                    }}
                  >
                    <TableCell>{micrograph.index ?? index + 1}</TableCell>

                    <TableCell>
                      {thumbnailUrl ? (
                        <Box
                          component="img"
                          src={thumbnailUrl}
                          alt={getMicrographLabel(micrograph)}
                          sx={{
                            width: 46,
                            height: 34,
                            objectFit: "cover",
                            display: "block",
                            border: "1px solid rgba(15,23,42,0.25)",
                            bgcolor: "#111827",
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 46,
                            height: 34,
                            bgcolor: "rgba(15,23,42,0.18)",
                            border: "1px solid rgba(15,23,42,0.25)",
                          }}
                        />
                      )}
                    </TableCell>

                    <TableCell>{getMicrographLabel(micrograph)}</TableCell>

                    <TableCell align="center">{micrograph.particles ?? 0}</TableCell>

                    <TableCell align="center">
                      {updatedMicIds.has(micKey) || micrograph.updated ? "Yes" : "No"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            bgcolor: "#cfcfcf",
          }}
        >
          <Box
            ref={canvasWrapRef}
            sx={{
              position: "relative",
              flex: 1,
              m: 1,
              minHeight: 0,
              overflow: "hidden",
              border: PANEL_BORDER,
              bgcolor: "#bfc3c7",
            }}
          >
            <canvas
              ref={canvasRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                cursor:
                  toolMode === "pan"
                    ? "grab"
                    : toolMode === "erase"
                      ? "crosshair"
                      : "copy",
              }}
            />

            {loading ? (
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(255,255,255,0.25)",
                  pointerEvents: "none",
                }}
              >
                <CircularProgress size={24} />
              </Box>
            ) : null}

            {loadingImage ? (
              <Box
                sx={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  px: 1,
                  py: 0.5,
                  bgcolor: "rgba(255,255,255,0.86)",
                  border: PANEL_BORDER,
                  pointerEvents: "none",
                }}
              >
                <Typography variant="caption">Loading micrograph image...</Typography>
              </Box>
            ) : null}

            {!loadingImage && imageLoadAttempted && !imageUrl ? (
              <Box
                sx={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  px: 1,
                  py: 0.5,
                  bgcolor: "rgba(255,255,255,0.86)",
                  border: PANEL_BORDER,
                  pointerEvents: "none",
                }}
              >
                <Typography variant="caption">
                  No micrograph image found. Coordinates are shown in coordinate space.
                </Typography>
              </Box>
            ) : null}
          </Box>

          <Box
            sx={{
              px: 2,
              py: 1,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: PANEL_BORDER,
              bgcolor: "#d7d7d7",
            }}
          >
            <Chip
              size="small"
              icon={<Table2 size={14} />}
              label={`${visiblePoints.length} particles in selected micrograph`}
              variant="outlined"
            />

            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<MousePointer2 size={16} />}
              >
                Close
              </Button>

              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={16} />}
                sx={{
                  bgcolor: "#b22a2a",
                  "&:hover": { bgcolor: "#922020" },
                }}
              >
                Coordinate
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      {particlesOpen ? (
        <Paper
          elevation={8}
          sx={{
            width: 250,
            maxHeight: "92vh",
            position: "fixed",
            right: 24,
            top: 24,
            zIndex: 1500,
            borderRadius: 1.5,
            overflow: "hidden",
            border: PANEL_BORDER,
            bgcolor: "#ffffff",
          }}
        >
          <Box
            sx={{
              px: 1,
              py: 0.75,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              bgcolor: "#f3f4f6",
              borderBottom: PANEL_BORDER,
              cursor: "default",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Particles
            </Typography>

            <IconButton size="small" onClick={() => setParticlesOpen(false)}>
              <X size={16} />
            </IconButton>
          </Box>

          <Box
            sx={{
              p: 0.75,
              bgcolor: "#ffffff",
              overflow: "auto",
              maxHeight: "calc(92vh - 42px)",
            }}
          >
            {!image || !imageWorldSize ? (
              <Typography variant="body2" sx={{ color: "text.secondary", p: 1 }}>
                No micrograph image available.
              </Typography>
            ) : particleCrops.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary", p: 1 }}>
                No particles in selected micrograph.
              </Typography>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 0.75,
                }}
              >
                {particleCrops.map((crop) => {
                  const selected = crop.pointId === selectedPointId;

                  return (
                    <Box
                      key={crop.pointId}
                      ref={(node) => {
                        particleRefs.current[crop.pointId] = node as HTMLButtonElement | null;
                      }}
                      component="button"
                      type="button"
                      onClick={() => setSelectedPointId(crop.pointId)}
                      sx={{
                        width: PARTICLE_GALLERY_SIZE,
                        height: PARTICLE_GALLERY_SIZE,
                        p: 0,
                        border: selected ? "3px solid #ef4444" : "2px solid #4f46e5",
                        bgcolor: "#111827",
                        cursor: "pointer",
                        outline: "none",
                        display: "block",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        component="img"
                        src={crop.url}
                        alt={`Particle ${crop.rowIndex + 1}`}
                        sx={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}

export default Coords2dViewer;