import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Alert, Box, Chip, CircularProgress, Divider, FormControl, IconButton, InputLabel, List, ListItemButton, ListItemText, MenuItem, Paper, Select, Slider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, type SelectChangeEvent } from "@mui/material";
import { Crosshair, LocateFixed, Search, Table2 } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type { MetadataCell, MetadataColumn, MetadataRow, MetadataTableInfo, MetadataTableSchema } from "@/services/ProjectService";

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
};

type Bounds2d = { minX: number; maxX: number; minY: number; maxY: number };
type ViewTransform = { scale: number; offsetX: number; offsetY: number };

const MAX_ROWS_TO_LOAD = 50000;
const DEFAULT_RADIUS = 5;
const PANEL_BORDER = "1px solid rgba(148,163,184,0.24)";
const HEADER_BG = "#f8fafc";

const X_NAMES = ["x", "coordx", "coordinatex", "xmippcoordinatex", "rlncoordinatex", "xcoord", "xposition", "positionx"];
const Y_NAMES = ["y", "coordy", "coordinatey", "xmippcoordinatey", "rlncoordinatey", "ycoord", "yposition", "positiony"];
const GROUP_NAMES = ["micrograph", "micrographname", "micname", "image", "imagename", "filename", "filepath", "location", "rlnmicrographname"];
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

function findColumn(columns: MetadataColumn[], names: string[]): MetadataColumn | null {
  const wanted = new Set(names.map(normalizeKey));
  const exact = columns.find((column) => wanted.has(normalizeKey(column.name)) || wanted.has(normalizeKey(column.alias)));
  if (exact) return exact;
  return columns.find((column) => {
    const name = normalizeKey(column.name);
    const alias = normalizeKey(column.alias);
    return names.some((candidate) => name.includes(normalizeKey(candidate)) || alias.includes(normalizeKey(candidate)));
  }) ?? null;
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
  if (typeof cell === "object" && (cell as any).kind === "image") return String((cell as any).path ?? "");
  try {
    return JSON.stringify(cell);
  } catch {
    return String(cell);
  }
}

function buildPoints(schema: MetadataTableSchema | null, rows: MetadataRow[]) {
  const columns = schema?.columns ?? [];
  const xColumn = findColumn(columns, X_NAMES);
  const yColumn = findColumn(columns, Y_NAMES);
  const groupColumn = findColumn(columns, GROUP_NAMES);
  const scoreColumn = findColumn(columns, SCORE_NAMES);
  const classColumn = findColumn(columns, CLASS_NAMES);

  if (!xColumn || !yColumn) {
    return { points: [] as Coords2dPoint[], xColumn, yColumn, groupColumn, scoreColumn, classColumn };
  }

  const points = rows.flatMap((row, rowIndex) => {
    const x = cellToNumber(row.values?.[xColumn.index]);
    const y = cellToNumber(row.values?.[yColumn.index]);
    if (x === null || y === null) return [];

    const groupLabel = groupColumn ? cellToString(row.values?.[groupColumn.index]) : "All coordinates";
    const rowId = (row as any)?.rowId ?? row.id ?? rowIndex;

    return [{
      id: `${String(rowId)}:${rowIndex}`,
      rowIndex,
      x,
      y,
      score: scoreColumn ? cellToNumber(row.values?.[scoreColumn.index]) : null,
      classLabel: classColumn ? cellToString(row.values?.[classColumn.index]) || null : null,
      groupKey: groupLabel || "All coordinates",
      groupLabel: groupLabel || "All coordinates",
    }];
  });

  return { points, xColumn, yColumn, groupColumn, scoreColumn, classColumn };
}

function getBounds(points: Coords2dPoint[]): Bounds2d {
  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  const padX = Math.max(10, (maxX - minX) * 0.05);
  const padY = Math.max(10, (maxY - minY) * 0.05);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function truncateMiddle(value: string, maxLength = 38): string {
  if (value.length <= maxLength) return value;
  const head = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - (maxLength - head - 1))}`;
}

function Coords2dViewer({ projectId, protocolId, protocolLabel, outputName }: Coords2dViewerProps) {
  const service = useProjectService();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const [tables, setTables] = useState<MetadataTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [rows, setRows] = useState<MetadataRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    let cancelled = false;
    async function loadTables() {
      setLoading(true);
      setError(null);
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
      setSelectedGroup("all");
      setSelectedPointId(null);
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

  const data = useMemo(() => buildPoints(schema, rows), [schema, rows]);
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    data.points.forEach((point) => {
      const current = map.get(point.groupKey);
      if (current) current.count += 1;
      else map.set(point.groupKey, { key: point.groupKey, label: point.groupLabel, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [data.points]);

  const visiblePoints = useMemo(() => {
    const byGroup = selectedGroup === "all" ? data.points : data.points.filter((point) => point.groupKey === selectedGroup);
    const q = normalizeKey(search);
    if (!q) return byGroup;
    return byGroup.filter((point) => normalizeKey(`${point.rowIndex} ${point.groupLabel} ${point.classLabel ?? ""} ${point.score ?? ""}`).includes(q));
  }, [data.points, selectedGroup, search]);

  const selectedPoint = useMemo(() => visiblePoints.find((point) => point.id === selectedPointId) ?? null, [visiblePoints, selectedPointId]);
  const bounds = useMemo(() => getBounds(visiblePoints), [visiblePoints]);

  const fitView = useCallback(() => {
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.max(0.0001, Math.min((size.width - 80) / w, (size.height - 80) / h));
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.strokeStyle = "rgba(148,163,184,0.16)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const x = (size.width / 12) * i;
      const y = (size.height / 12) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.width, y); ctx.stroke();
    }
    visiblePoints.forEach((point) => {
      const screen = worldToScreen(point.x, point.y);
      const selected = point.id === selectedPointId;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, selected ? radius + 3 : radius, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#f97316" : "rgba(56,189,248,0.9)";
      ctx.fill();
      ctx.strokeStyle = selected ? "#fff7ed" : "rgba(15,23,42,0.95)";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    });
  }, [radius, selectedPointId, size.height, size.width, visiblePoints, worldToScreen]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const world = screenToWorld(pointerX, pointerY);
    const factor = event.deltaY < 0 ? 1.12 : 0.88;
    setTransform((current) => {
      const scale = Math.min(1000, Math.max(0.0001, current.scale * factor));
      return { scale, offsetX: pointerX - (world.x - bounds.minX) * scale, offsetY: pointerY - (world.y - bounds.minY) * scale };
    });
  }, [bounds.minX, bounds.minY, screenToWorld]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, moved: false, x: event.clientX, y: event.clientY, offsetX: transform.offsetX, offsetY: transform.offsetY };
  }, [transform.offsetX, transform.offsetY]);

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    setTransform((current) => ({ ...current, offsetX: drag.offsetX + dx, offsetY: drag.offsetY + dy }));
  }, []);

  const handleMouseUp = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current.active = false;
    if (drag.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    let best: { point: Coords2dPoint; distance: number } | null = null;
    visiblePoints.forEach((point) => {
      const screen = worldToScreen(point.x, point.y);
      const distance = Math.hypot(screen.x - clickX, screen.y - clickY);
      if (distance <= Math.max(8, radius + 6) && (!best || distance < best.distance)) best = { point, distance };
    });
    setSelectedPointId(best?.point.id ?? null);
  }, [radius, visiblePoints, worldToScreen]);

  const missingColumns = !loading && schema && (!data.xColumn || !data.yColumn);

  return (
    <Box sx={{ height: "100%", display: "flex", minHeight: 0, bgcolor: "#f1f5f9" }}>
      <Box sx={{ width: 300, borderRight: PANEL_BORDER, bgcolor: "#fff", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box sx={{ p: 1.5, bgcolor: HEADER_BG, borderBottom: PANEL_BORDER }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Crosshair size={18} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Coordinates 2D</Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>{protocolLabel} · {outputName}</Typography>
        </Box>
        <Box sx={{ p: 1.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Paper variant="outlined" sx={{ p: 1 }}><Typography variant="caption">Points</Typography><Typography variant="h6">{data.points.length.toLocaleString()}</Typography></Paper>
          <Paper variant="outlined" sx={{ p: 1 }}><Typography variant="caption">Groups</Typography><Typography variant="h6">{groups.length.toLocaleString()}</Typography></Paper>
        </Box>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="coords2d-table-label">Table</InputLabel>
            <Select labelId="coords2d-table-label" label="Table" value={selectedTable} disabled={!tables.length} onChange={(event: SelectChangeEvent<string>) => setSelectedTable(event.target.value)}>
              {tables.map((table) => <MenuItem key={table.name} value={table.name}>{table.alias || table.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Divider />
        <List dense sx={{ flex: 1, overflow: "auto", py: 0 }}>
          <ListItemButton selected={selectedGroup === "all"} onClick={() => setSelectedGroup("all")}><ListItemText primary="All coordinates" secondary={`${data.points.length.toLocaleString()} points`} /></ListItemButton>
          {groups.map((group) => <ListItemButton key={group.key} selected={selectedGroup === group.key} onClick={() => setSelectedGroup(group.key)}><ListItemText primary={truncateMiddle(group.label)} secondary={`${group.count.toLocaleString()} points`} primaryTypographyProps={{ noWrap: true }} /></ListItemButton>)}
        </List>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, borderBottom: PANEL_BORDER, bgcolor: "#fff" }}>
          <Chip size="small" icon={<Table2 size={14} />} label={selectedTable || "No table"} variant="outlined" />
          {data.xColumn && data.yColumn ? <Chip size="small" label={`${data.xColumn.alias || data.xColumn.name} / ${data.yColumn.alias || data.yColumn.name}`} variant="outlined" /> : null}
          {totalRows > rows.length ? <Chip size="small" color="warning" label={`Loaded ${rows.length.toLocaleString()} of ${totalRows.toLocaleString()}`} /> : null}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ minWidth: 72 }}>Radius {radius}</Typography>
          <Slider size="small" min={2} max={16} step={1} value={radius} onChange={(_, value) => setRadius(Array.isArray(value) ? value[0] : value)} sx={{ width: 110 }} />
          <Tooltip title="Fit view"><IconButton size="small" onClick={fitView}><LocateFixed size={17} /></IconButton></Tooltip>
        </Box>
        {error ? <Box sx={{ p: 2 }}><Alert severity="error">{error}</Alert></Box> : null}
        {missingColumns ? <Box sx={{ p: 2 }}><Alert severity="warning">Could not detect X/Y coordinate columns in this table.</Alert></Box> : null}
        <Box ref={canvasWrapRef} sx={{ position: "relative", flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={() => { dragRef.current.active = false; }} style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }} />
          {loading ? <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(15,23,42,0.35)", color: "#fff" }}><CircularProgress size={24} color="inherit" /></Box> : null}
        </Box>
      </Box>
      <Box sx={{ width: 340, borderLeft: PANEL_BORDER, bgcolor: "#fff", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box sx={{ p: 1.5, bgcolor: HEADER_BG, borderBottom: PANEL_BORDER }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Inspector</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>{visiblePoints.length.toLocaleString()} visible coordinates</Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <TextField size="small" fullWidth value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter points" InputProps={{ startAdornment: <Search size={15} /> as any }} />
        </Box>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          {selectedPoint ? <Paper variant="outlined" sx={{ p: 1.25 }}><Typography variant="caption">Selected point</Typography><Typography variant="body2">X {formatNumber(selectedPoint.x, 3)} · Y {formatNumber(selectedPoint.y, 3)}</Typography><Typography variant="body2">Score {formatNumber(selectedPoint.score ?? null, 3)} · Class {selectedPoint.classLabel || "-"}</Typography></Paper> : <Typography variant="body2" sx={{ color: "text.secondary" }}>Click a coordinate in the canvas to inspect it.</Typography>}
        </Box>
        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table stickyHeader size="small">
            <TableHead><TableRow><TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700 }}>#</TableCell><TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700 }}>X</TableCell><TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700 }}>Y</TableCell><TableCell sx={{ bgcolor: HEADER_BG, fontWeight: 700 }}>Score</TableCell></TableRow></TableHead>
            <TableBody>{visiblePoints.slice(0, 350).map((point) => <TableRow key={point.id} hover selected={point.id === selectedPointId} onClick={() => setSelectedPointId(point.id)} sx={{ cursor: "pointer" }}><TableCell>{point.rowIndex + 1}</TableCell><TableCell>{formatNumber(point.x, 1)}</TableCell><TableCell>{formatNumber(point.y, 1)}</TableCell><TableCell>{formatNumber(point.score ?? null, 2)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}

export default Coords2dViewer;
