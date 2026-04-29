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
  Chip,
  CircularProgress,
  Divider,
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

const DEFAULT_BOX_SIZE = 50;
const MIN_BOX_SIZE = 10;
const MAX_BOX_SIZE = 240;
const PANEL_BORDER = "1px solid rgba(100,116,139,0.35)";
const HEADER_BG = "#e5e7eb";
const TOOLBAR_BG = "#eeeeee";
const ROW_SELECTED = "#3f617b";
const DEFAULT_PICK_COLOR = "#ff0000";

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
  const dragRef = useRef({
    active: false,
    moved: false,
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const [micrographs, setMicrographs] = useState<Coords2dMicrograph[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<Id | null>(null);
  const [pointsByMicId, setPointsByMicId] = useState<Record<string, ViewerPoint[]>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  const [boxSize, setBoxSize] = useState(DEFAULT_BOX_SIZE);
  const [totalPicks, setTotalPicks] = useState(0);
  const [loadingMicrographs, setLoadingMicrographs] = useState(true);
  const [loadingCoordinates, setLoadingCoordinates] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [shapeMode, setShapeMode] = useState<ShapeMode>("circle");
  const [toolMode, setToolMode] = useState<ToolMode>("pan");
  const [pickColor, setPickColor] = useState(DEFAULT_PICK_COLOR);
  const [deletedPointIds, setDeletedPointIds] = useState<Set<string>>(() => new Set());
  const [updatedMicIds, setUpdatedMicIds] = useState<Set<string>>(() => new Set());

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
    if (!selectedMicId) return;

    let cancelled = false;
    let objectUrl: ObjectUrlResult | null = null;

    setImageUrl(null);
    setImage(null);

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

        if (!objectUrl || cancelled) return;

        const img = new Image();

        img.onload = () => {
          if (cancelled) return;
          setImageUrl(objectUrl?.url ?? null);
          setImage(img);
        };

        img.onerror = () => {
          if (cancelled) return;
          setImageUrl(null);
          setImage(null);
        };

        img.src = objectUrl.url;
      } catch {
        if (!cancelled) {
          setImageUrl(null);
          setImage(null);
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

  const bounds = useMemo(() => {
    return getBounds(visiblePoints, imageWorldSize, boxSize);
  }, [boxSize, imageWorldSize, visiblePoints]);

  const fitView = useCallback(() => {
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
    const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.max(
      0.0001,
      Math.min((size.width - 32) / worldWidth, (size.height - 32) / worldHeight),
    );

    setTransform({
      scale,
      offsetX: (size.width - worldWidth * scale) / 2,
      offsetY: (size.height - worldHeight * scale) / 2,
    });
  }, [bounds, size.height, size.width]);

  useEffect(() => {
    fitView();
  }, [fitView, selectedMicKey, imageUrl]);

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

      visiblePoints.forEach((point, index) => {
        const screen = worldToScreen(point.x, point.y);
        const distance = Math.hypot(screen.x - screenX, screen.y - screenY);

        if (distance <= radiusPx && distance < bestDistance) {
          bestDistance = distance;
          bestId = getPointId(point, index);
        }
      });

      return bestId;
    },
    [boxSize, transform.scale, visiblePoints, worldToScreen],
  );

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

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        image,
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y,
      );
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
      ctx.lineWidth = selected ? 2 : 1.2;
      ctx.beginPath();

      if (shapeMode === "circle") {
        ctx.arc(screen.x, screen.y, radiusPx, 0, Math.PI * 2);
      } else {
        ctx.rect(screen.x - radiusPx, screen.y - radiusPx, radiusPx * 2, radiusPx * 2);
      }

      ctx.stroke();
    });
  }, [
    bounds.maxX,
    bounds.maxY,
    boxSize,
    image,
    imageUrl,
    pickColor,
    selectedPointId,
    shapeMode,
    size.height,
    size.width,
    transform.scale,
    visiblePoints,
    worldToScreen,
  ]);

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
      dragRef.current = {
        active: toolMode === "pan",
        moved: false,
        x: event.clientX,
        y: event.clientY,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
      };
    },
    [toolMode, transform.offsetX, transform.offsetY],
  );

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (!drag.active) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (Math.abs(dx) + Math.abs(dy) > 3) {
      drag.moved = true;
    }

    setTransform((current) => ({
      ...current,
      offsetX: drag.offsetX + dx,
      offsetY: drag.offsetY + dy,
    }));
  }, []);

  const handleMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      dragRef.current.active = false;

      if (drag.moved) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      if (!selectedMicId || !selectedMicKey) return;

      if (toolMode === "pick") {
        const world = screenToWorld(clickX, clickY);
        const point: ViewerPoint = {
          id: `new:${selectedMicKey}:${nextPointIdRef.current++}`,
          micId: selectedMicId,
          x: world.x,
          y: world.y,
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

      if (toolMode === "erase") {
        if (!hitId) return;

        setDeletedPointIds((current) => new Set(current).add(hitId));
        setSelectedPointId((current) => (current === hitId ? null : current));
        markMicrographUpdated(selectedMicId);
        updateMicrographParticleCount(selectedMicId, -1);
        return;
      }

      setSelectedPointId(hitId);
    },
    [
      findPointAt,
      markMicrographUpdated,
      screenToWorld,
      selectedMicId,
      selectedMicKey,
      toolMode,
      updateMicrographParticleCount,
    ],
  );

  const loading = loadingMicrographs || loadingCoordinates;
  const updatedCount = updatedMicIds.size;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        bgcolor: "#d7d7d7",
      }}
    >
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
          onChange={(event: any) => setPickColor(event.target.value)}
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
              onMouseLeave={() => {
                dragRef.current.active = false;
              }}
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
                  bgcolor: "rgba(255,255,255,0.45)",
                }}
              >
                <CircularProgress size={24} />
              </Box>
            ) : null}

            {!loading && !imageUrl ? (
              <Box
                sx={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  px: 1,
                  py: 0.5,
                  bgcolor: "rgba(255,255,255,0.86)",
                  border: PANEL_BORDER,
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
    </Box>
  );
}

export default Coords2dViewer;