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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  type SelectChangeEvent,
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
  MetadataCell,
  MetadataColumn,
  MetadataRow,
  MetadataTableInfo,
  MetadataTableSchema,
} from "@/services/ProjectService";

type Coords2dViewerProps = {
  projectId: number;
  protocolId: number;
  protocolLabel: string;
  outputName: string;
};

type MetadataWindowResponse = MetadataRow[] | { rows?: MetadataRow[]; offset?: number };

type Coords2dPoint = {
  id: string;
  rowIndex: number;
  x: number;
  y: number;
  score?: number | null;
  classLabel?: string | null;
  groupKey: string;
  groupLabel: string;
  isNew?: boolean;
};

type Coords2dGroup = {
  key: string;
  label: string;
  count: number;
  firstRowIndex: number;
  imageColumnName?: string | null;
};

type ViewTransform = { scale: number; offsetX: number; offsetY: number };
type Bounds2d = { minX: number; maxX: number; minY: number; maxY: number };
type ToolMode = "pan" | "pick" | "erase";
type ShapeMode = "circle" | "square";

type ImageObjectUrl = { url: string; revoke?: () => void };

const MAX_ROWS_TO_LOAD = 50000;
const DEFAULT_BOX_SIZE = 50;
const PANEL_BORDER = "1px solid rgba(100,116,139,0.35)";
const HEADER_BG = "#e5e7eb";
const ROW_SELECTED = "#3f617b";

const X_NAMES = ["x", "coordx", "coordinatex", "xmippcoordinatex", "rlncoordinatex", "xcoord", "xposition", "positionx"];
const Y_NAMES = ["y", "coordy", "coordinatey", "xmippcoordinatey", "rlncoordinatey", "ycoord", "yposition", "positiony"];
const GROUP_NAMES = ["micrograph", "micrographname", "micname", "micid", "image", "imagename", "filename", "filepath", "location", "rlnmicrographname", "xmippmicname"];
const SCORE_NAMES = ["score", "confidence", "zscore", "quality", "probability", "rlnautopickfigureofmerit"];
const CLASS_NAMES = ["class", "classid", "classnumber", "rlnclassnumber"];

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/^_+/, "").replace(/[^a-z0-9]+/g, "");
}

function parseTables(raw: any): MetadataTableInfo[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.tables)) return raw.tables;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

function parseRows(raw: MetadataWindowResponse): MetadataRow[] {
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.rows) ? raw.rows : [];
}

function isImageCell(cell: MetadataCell | undefined): boolean {
  return typeof cell === "object" && cell !== null && (cell as any).kind === "image";
}

function findColumn(columns: MetadataColumn[], names: string[]): MetadataColumn | null {
  const wanted = new Set(names.map(normalizeKey));
  const exact = columns.find((column) => wanted.has(normalizeKey(column.name)) || wanted.has(normalizeKey(column.alias)));
  if (exact) return exact;

  return columns.find((column) => {
    const name = normalizeKey(column.name);
    const alias = normalizeKey(column.alias);
    return names.some((candidate) => {
      const normalized = normalizeKey(candidate);
      return name.includes(normalized) || alias.includes(normalized);
    });
  }) ?? null;
}

function findImageColumn(schema: MetadataTableSchema | null, rows: MetadataRow[]): MetadataColumn | null {
  const columns = schema?.columns ?? [];
  const declared = columns.find((column) => normalizeKey(column.rendererType) === "image");
  if (declared) return declared;
  return columns.find((column) => rows.some((row) => isImageCell(row.values?.[column.index]))) ?? null;
}

function cellToNumber(cell: MetadataCell | undefined): number | null {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  if (typeof cell === "string") {
    const parsed = Number(cell.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cellToString(cell: MetadataCell | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (isImageCell(cell)) return String((cell as any).path ?? "");

  try {
    return JSON.stringify(cell);
  } catch {
    return String(cell);
  }
}

function basename(value: string): string {
  const clean = value.trim();
  if (!clean) return "Untitled";
  return clean.split(/[\\/]/).filter(Boolean).pop() ?? clean;
}

function buildCoordinateData(schema: MetadataTableSchema | null, rows: MetadataRow[]) {
  const columns = schema?.columns ?? [];
  const xColumn = findColumn(columns, X_NAMES);
  const yColumn = findColumn(columns, Y_NAMES);
  const imageColumn = findImageColumn(schema, rows);
  const groupColumn = findColumn(columns, GROUP_NAMES) ?? imageColumn;
  const scoreColumn = findColumn(columns, SCORE_NAMES);
  const classColumn = findColumn(columns, CLASS_NAMES);

  if (!xColumn || !yColumn) {
    return { points: [] as Coords2dPoint[], groups: [] as Coords2dGroup[], xColumn, yColumn, imageColumn, groupColumn, scoreColumn, classColumn };
  }

  const points: Coords2dPoint[] = [];
  const groups = new Map<string, Coords2dGroup>();

  rows.forEach((row, rowIndex) => {
    const x = cellToNumber(row.values?.[xColumn.index]);
    const y = cellToNumber(row.values?.[yColumn.index]);
    if (x === null || y === null) return;

    const groupValue = groupColumn ? cellToString(row.values?.[groupColumn.index]) : "All coordinates";
    const groupLabel = basename(groupValue || "All coordinates");
    const groupKey = groupValue || groupLabel;
    const rowId = (row as any)?.rowId ?? row.id ?? rowIndex;

    points.push({
      id: `${String(rowId)}:${rowIndex}`,
      rowIndex,
      x,
      y,
      score: scoreColumn ? cellToNumber(row.values?.[scoreColumn.index]) : null,
      classLabel: classColumn ? cellToString(row.values?.[classColumn.index]) || null : null,
      groupKey,
      groupLabel,
    });

    const existing = groups.get(groupKey);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(groupKey, {
        key: groupKey,
        label: groupLabel,
        count: 1,
        firstRowIndex: rowIndex,
        imageColumnName: imageColumn?.name ?? null,
      });
    }
  });

  return {
    points,
    groups: Array.from(groups.values()).sort((a, b) => String(a.label).localeCompare(String(b.label))),
    xColumn,
    yColumn,
    imageColumn,
    groupColumn,
    scoreColumn,
    classColumn,
  };
}

function getBounds(points: Coords2dPoint[], image: HTMLImageElement | null, boxSize: number): Bounds2d {
  const maxPointX = Math.max(1, ...points.map((point) => point.x + boxSize));
  const maxPointY = Math.max(1, ...points.map((point) => point.y + boxSize));

  if (image) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(image.naturalWidth, maxPointX),
      maxY: Math.max(image.naturalHeight, maxPointY),
    };
  }

  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padX = Math.max(boxSize, (maxX - minX) * 0.05);
  const padY = Math.max(boxSize, (maxY - minY) * 0.05);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function normalizeImageResult(raw: any): ImageObjectUrl | null {
  if (typeof raw === "string" && raw) return { url: raw };
  if (raw && typeof raw.url === "string") return { url: raw.url, revoke: raw.revoke };
  return null;
}

function Coords2dViewer({ projectId, protocolId, protocolLabel, outputName }: Coords2dViewerProps) {
  const service = useProjectService();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const nextPointIdRef = useRef(1);
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const [tables, setTables] = useState<MetadataTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [rows, setRows] = useState<MetadataRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [boxSize, setBoxSize] = useState(DEFAULT_BOX_SIZE);
  const [shapeMode, setShapeMode] = useState<ShapeMode>("circle");
  const [toolMode, setToolMode] = useState<ToolMode>("pan");
  const [pickColor, setPickColor] = useState("#ff0000");
  const [localPoints, setLocalPoints] = useState<Coords2dPoint[]>([]);
  const [deletedPointIds, setDeletedPointIds] = useState<Set<string>>(() => new Set());
  const [updatedGroups, setUpdatedGroups] = useState<Set<string>>(() => new Set());

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTables() {
      setLoading(true);
      setError(null);
      setTables([]);
      setSelectedTable("");
      try {
        const nextTables = parseTables(await service.fetchOutputMetadataTables(projectId, protocolId, outputName));
        if (cancelled) return;
        setTables(nextTables);
        setSelectedTable(nextTables[0]?.name ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load coordinates metadata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTables();
    return () => { cancelled = true; };
  }, [service, projectId, protocolId, outputName]);

  useEffect(() => {
    if (!selectedTable) return;
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setError(null);
      setRows([]);
      setSchema(null);
      setSelectedGroupKey("");
      setSelectedPointId(null);
      setLocalPoints([]);
      setDeletedPointIds(new Set());
      setUpdatedGroups(new Set());

      try {
        const nextSchema = await service.fetchMetadataTableSchema(projectId, protocolId, outputName, selectedTable);
        if (cancelled) return;
        setSchema(nextSchema);

        const rowCount = Number((nextSchema as any)?.rowCount ?? 0);
        const limit = rowCount > 0 ? Math.min(rowCount, MAX_ROWS_TO_LOAD) : MAX_ROWS_TO_LOAD;
        const nextRows = parseRows(await service.fetchMetadataTableWindow(projectId, protocolId, outputName, selectedTable, { offset: 0, limit }) as MetadataWindowResponse);
        if (cancelled) return;
        setRows(nextRows);
        setTotalRows(rowCount || nextRows.length);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load coordinates table");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRows();
    return () => { cancelled = true; };
  }, [service, projectId, protocolId, outputName, selectedTable]);

  useEffect(() => {
    const node = canvasWrapRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sourceData = useMemo(() => buildCoordinateData(schema, rows), [schema, rows]);
  const allPoints = useMemo(
    () => [...sourceData.points.filter((point) => !deletedPointIds.has(point.id)), ...localPoints],
    [deletedPointIds, localPoints, sourceData.points],
  );

  const groups = useMemo(() => {
    const base = new Map(sourceData.groups.map((group) => [group.key, { ...group, count: 0 }]));
    allPoints.forEach((point) => {
      const group = base.get(point.groupKey);
      if (group) group.count += 1;
      else base.set(point.groupKey, { key: point.groupKey, label: point.groupLabel, count: 1, firstRowIndex: point.rowIndex, imageColumnName: sourceData.imageColumn?.name ?? null });
    });
    return Array.from(base.values()).filter((group) => group.count > 0);
  }, [allPoints, sourceData.groups, sourceData.imageColumn]);

  useEffect(() => {
    if (!selectedGroupKey && groups.length) setSelectedGroupKey(groups[0].key);
  }, [groups, selectedGroupKey]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.key === selectedGroupKey) ?? null,
    [groups, selectedGroupKey],
  );

  const visiblePoints = useMemo(
    () => allPoints.filter((point) => point.groupKey === selectedGroupKey),
    [allPoints, selectedGroupKey],
  );

  const selectedPoint = useMemo(
    () => visiblePoints.find((point) => point.id === selectedPointId) ?? null,
    [selectedPointId, visiblePoints],
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: ImageObjectUrl | null = null;

    setImageUrl(null);
    setImage(null);

    async function loadImage() {
      if (!selectedGroup || !selectedGroup.imageColumnName) return;

      try {
        objectUrl = normalizeImageResult(await service.fetchMetadataImageCellObjectUrl(
          projectId,
          protocolId,
          outputName,
          selectedTable,
          selectedGroup.firstRowIndex,
          selectedGroup.imageColumnName,
          { size: 2200 },
        ));
        if (!objectUrl || cancelled) return;

        const img = new Image();
        img.onload = () => {
          if (!cancelled) {
            setImageUrl(objectUrl?.url ?? null);
            setImage(img);
          }
        };
        img.onerror = () => {
          if (!cancelled) {
            setImageUrl(null);
            setImage(null);
          }
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
  }, [service, projectId, protocolId, outputName, selectedTable, selectedGroup?.key, selectedGroup?.firstRowIndex, selectedGroup?.imageColumnName]);

  const bounds = useMemo(() => getBounds(visiblePoints, image, boxSize), [boxSize, image, visiblePoints]);

  const fitView = useCallback(() => {
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.max(0.0001, Math.min((size.width - 32) / w, (size.height - 32) / h));
    setTransform({ scale, offsetX: (size.width - w * scale) / 2, offsetY: (size.height - h * scale) / 2 });
  }, [bounds, size.height, size.width]);

  useEffect(() => { fitView(); }, [fitView]);

  const worldToScreen = useCallback((x: number, y: number) => ({
    x: (x - bounds.minX) * transform.scale + transform.offsetX,
    y: (y - bounds.minY) * transform.scale + transform.offsetY,
  }), [bounds.minX, bounds.minY, transform.offsetX, transform.offsetY, transform.scale]);

  const screenToWorld = useCallback((x: number, y: number) => ({
    x: (x - transform.offsetX) / transform.scale + bounds.minX,
    y: (y - transform.offsetY) / transform.scale + bounds.minY,
  }), [bounds.minX, bounds.minY, transform.offsetX, transform.offsetY, transform.scale]);

  const findPointAt = useCallback((screenX: number, screenY: number): string | null => {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const radiusPx = Math.max(8, (boxSize / 2) * transform.scale);

    for (const point of visiblePoints) {
      const screen = worldToScreen(point.x, point.y);
      const distance = Math.hypot(screen.x - screenX, screen.y - screenY);
      if (distance <= radiusPx && distance < bestDistance) {
        bestDistance = distance;
        bestId = point.id;
      }
    }

    return bestId;
  }, [boxSize, transform.scale, visiblePoints, worldToScreen]);

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

    if (image && imageUrl) {
      const topLeft = worldToScreen(0, 0);
      const bottomRight = worldToScreen(bounds.maxX, bounds.maxY);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    } else {
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(0, 0, size.width, size.height);
    }

    visiblePoints.forEach((point) => {
      const screen = worldToScreen(point.x, point.y);
      const radiusPx = Math.max(2, (boxSize / 2) * transform.scale);
      const selected = point.id === selectedPointId;
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
  }, [bounds.maxX, bounds.maxY, boxSize, image, imageUrl, pickColor, selectedPointId, shapeMode, size.height, size.width, transform.scale, visiblePoints, worldToScreen]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
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
  }, [bounds.minX, bounds.minY, screenToWorld, toolMode]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: toolMode === "pan", moved: false, x: event.clientX, y: event.clientY, offsetX: transform.offsetX, offsetY: transform.offsetY };
  }, [toolMode, transform.offsetX, transform.offsetY]);

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    setTransform((current) => ({ ...current, offsetX: drag.offsetX + dx, offsetY: drag.offsetY + dy }));
  }, []);

  const markGroupUpdated = useCallback((groupKey: string) => {
    setUpdatedGroups((current) => new Set(current).add(groupKey));
  }, []);

  const handleMouseUp = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current.active = false;
    if (drag.moved) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    if (toolMode === "pick" && selectedGroup) {
      const world = screenToWorld(clickX, clickY);
      const point: Coords2dPoint = {
        id: `new:${nextPointIdRef.current++}`,
        rowIndex: allPoints.length,
        x: world.x,
        y: world.y,
        groupKey: selectedGroup.key,
        groupLabel: selectedGroup.label,
        isNew: true,
      };
      setLocalPoints((current) => [...current, point]);
      setSelectedPointId(point.id);
      markGroupUpdated(selectedGroup.key);
      return;
    }

    const hitId = findPointAt(clickX, clickY);
    if (toolMode === "erase") {
      if (!hitId) return;
      const erasedPoint = allPoints.find((point) => point.id === hitId);
      setDeletedPointIds((current) => new Set(current).add(hitId));
      setLocalPoints((current) => current.filter((point) => point.id !== hitId));
      if (erasedPoint) markGroupUpdated(erasedPoint.groupKey);
      if (selectedPointId === hitId) setSelectedPointId(null);
      return;
    }

    setSelectedPointId(hitId);
  }, [allPoints, findPointAt, markGroupUpdated, screenToWorld, selectedGroup, selectedPointId, toolMode]);

  const missingColumns = !loading && schema && (!sourceData.xColumn || !sourceData.yColumn);
  const updatedCount = updatedGroups.size;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, bgcolor: "#d7d7d7" }}>
      <Box sx={{ px: 1, py: 0.75, display: "flex", alignItems: "center", gap: 1.25, borderBottom: PANEL_BORDER, bgcolor: HEADER_BG }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Box size(px):</Typography>
        <Slider size="small" min={10} max={Math.max(200, DEFAULT_BOX_SIZE * 4)} step={1} value={boxSize} onChange={(_, value) => setBoxSize(Array.isArray(value) ? value[0] : value)} sx={{ width: 260 }} />
        <Typography variant="body2" sx={{ minWidth: 42 }}>({boxSize})</Typography>
        <Chip size="small" label={`Total micrograph: ${groups.length}`} sx={{ bgcolor: "#cfe8cf", border: "1px solid #9cc99c" }} />
        <Chip size="small" label={`Total picks: ${allPoints.length}`} sx={{ bgcolor: "#c3d7df", border: "1px solid #91b2bf" }} />
        {updatedCount > 0 ? <Chip size="small" color="warning" label={`Updated: ${updatedCount}`} /> : null}
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ width: 170 }}>
          <InputLabel id="coords2d-table-label">Table</InputLabel>
          <Select labelId="coords2d-table-label" label="Table" value={selectedTable} disabled={!tables.length} onChange={(event: SelectChangeEvent<string>) => setSelectedTable(event.target.value)}>
            {tables.map((table) => <MenuItem key={table.name} value={table.name}>{table.alias || table.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ px: 1, py: 0.75, display: "flex", alignItems: "center", gap: 1, borderBottom: PANEL_BORDER, bgcolor: "#eeeeee" }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Shape:</Typography>
        <ButtonGroup size="small" variant="outlined">
          <Button variant={shapeMode === "circle" ? "contained" : "outlined"} onClick={() => setShapeMode("circle")}><Circle size={16} /></Button>
          <Button variant={shapeMode === "square" ? "contained" : "outlined"} onClick={() => setShapeMode("square")}><Square size={16} /></Button>
        </ButtonGroup>
        <Divider flexItem orientation="vertical" />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Color:</Typography>
        <Box component="input" type="color" value={pickColor} onChange={(event: any) => setPickColor(event.target.value)} sx={{ width: 34, height: 30, p: 0, border: PANEL_BORDER, bgcolor: "transparent" }} />
        <Divider flexItem orientation="vertical" />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Picker tools:</Typography>
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Particle picker"><Button variant={toolMode === "pick" ? "contained" : "outlined"} onClick={() => setToolMode("pick")}><Plus size={16} /></Button></Tooltip>
          <Tooltip title="Eraser"><Button variant={toolMode === "erase" ? "contained" : "outlined"} onClick={() => setToolMode("erase")}><Eraser size={16} /></Button></Tooltip>
        </ButtonGroup>
        <Divider flexItem orientation="vertical" />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Navigate:</Typography>
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Fit to display"><Button onClick={fitView}><LocateFixed size={16} /></Button></Tooltip>
          <Tooltip title="Click and drag to move"><Button variant={toolMode === "pan" ? "contained" : "outlined"} onClick={() => setToolMode("pan")}><Hand size={16} /></Button></Tooltip>
        </ButtonGroup>
        <Box sx={{ flex: 1 }} />
        {selectedPoint ? <Typography variant="caption">x={formatNumber(selectedPoint.x)} y={formatNumber(selectedPoint.y)}</Typography> : null}
      </Box>

      {error ? <Alert severity="error" sx={{ borderRadius: 0 }}>{error}</Alert> : null}
      {missingColumns ? <Alert severity="warning" sx={{ borderRadius: 0 }}>Could not detect X/Y coordinate columns in this table.</Alert> : null}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <TableContainer component={Paper} square sx={{ width: 470, borderRight: PANEL_BORDER, minHeight: 0, overflow: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 58 }}>Index</TableCell>
                <TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700 }}>File</TableCell>
                <TableCell align="center" sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 100 }}>Particles</TableCell>
                <TableCell align="center" sx={{ bgcolor: HEADER_BG, fontWeight: 700, width: 92 }}>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((group, index) => {
                const selected = group.key === selectedGroupKey;
                return (
                  <TableRow key={group.key} hover selected={selected} onClick={() => { setSelectedGroupKey(group.key); setSelectedPointId(null); }} sx={{ cursor: "pointer", "&.Mui-selected td": { bgcolor: ROW_SELECTED, color: "#ffffff" } }}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{group.label}</TableCell>
                    <TableCell align="center">{group.count}</TableCell>
                    <TableCell align="center">{updatedGroups.has(group.key) ? "Yes" : "No"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "#cfcfcf" }}>
          <Box ref={canvasWrapRef} sx={{ position: "relative", flex: 1, m: 1, minHeight: 0, overflow: "hidden", border: PANEL_BORDER, bgcolor: "#bfc3c7" }}>
            <canvas
              ref={canvasRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { dragRef.current.active = false; }}
              style={{ display: "block", width: "100%", height: "100%", cursor: toolMode === "pan" ? "grab" : toolMode === "erase" ? "crosshair" : "copy" }}
            />
            {loading ? (
              <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(255,255,255,0.45)" }}>
                <CircularProgress size={24} />
              </Box>
            ) : null}
            {!loading && !imageUrl ? (
              <Box sx={{ position: "absolute", left: 12, bottom: 12, px: 1, py: 0.5, bgcolor: "rgba(255,255,255,0.86)", border: PANEL_BORDER }}>
                <Typography variant="caption">No micrograph image found in metadata. Coordinates are shown in coordinate space.</Typography>
              </Box>
            ) : null}
          </Box>

          <Box sx={{ px: 2, py: 1, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: PANEL_BORDER, bgcolor: "#d7d7d7" }}>
            <Chip size="small" icon={<Table2 size={14} />} label={`${visiblePoints.length} particles in selected micrograph`} variant="outlined" />
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<MousePointer2 size={16} />}>Close</Button>
              <Button size="small" variant="contained" startIcon={<Plus size={16} />} sx={{ bgcolor: "#b22a2a", "&:hover": { bgcolor: "#922020" } }}>Coordinate</Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default Coords2dViewer;
