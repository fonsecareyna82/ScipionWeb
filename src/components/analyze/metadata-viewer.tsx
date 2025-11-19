// src/components/analyze/metadata-viewer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Tooltip,
  IconButton,
} from "@mui/material";
import { LayoutGrid, TableIcon } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type {
  MetadataCell,
  MetadataColumn,
  MetadataRow,
  MetadataTableInfo,
  MetadataTableSchema,
} from "@/api/projects";

type MetadataViewerProps = {
  projectId: number;
  protocolId: number;
  outputName: string;
};

type ViewMode = "table" | "gallery";

type SelectedImageCell = {
  /** Global row index in the table (0-based, matches vertical header) */
  rowIndexInTable: number;
  columnName: string;
};

const BASE_THUMB_SIZE = 160;
const NORMAL_ROW_HEIGHT = 32;
const IMAGE_ROW_HEIGHT = BASE_THUMB_SIZE + 16;
const EXTRA_BUFFER_ROWS = 10;

// Widths for table layout
const ROW_INDEX_COL_WIDTH = 52;
const MIN_TEXT_COL_WIDTH = 140;
const IMAGE_COL_MIN_WIDTH = BASE_THUMB_SIZE + 24;

// Gallery paging
const GALLERY_PAGE_SIZE = 120;

// Header background color (light gray)
const HEADER_BG = "#f3f4f6";

/** Observe a DOM element size (content box). */
function useElementSize<T extends Element>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

type MetadataImageCellProps = {
  projectId: number;
  protocolId: number;
  outputName: string;
  svc: ReturnType<typeof useProjectService>;
  tableName: string;
  /** Global row index in the table (0-based) */
  rowIndexInTable: number;
  columnName: string;
  cell: { kind: "image"; path: string };
  size: number;
  isSelected?: boolean;
  onClick?: () => void;
  imageCacheRef: React.MutableRefObject<Map<string, { url: string; revoke: () => void }>>;
};

const MetadataImageCell: React.FC<MetadataImageCellProps> = ({
  projectId,
  protocolId,
  outputName,
  svc,
  tableName,
  rowIndexInTable,
  columnName,
  cell,
  size,
  isSelected = false,
  onClick,
  imageCacheRef,
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageCacheRef.current) {
      imageCacheRef.current = new Map();
    }

    const key = `${projectId}|${protocolId}|${outputName}|${tableName}|${rowIndexInTable}|${columnName}|${cell.path}|${size}`;
    const cached = imageCacheRef.current.get(key);
    if (cached) {
      setThumbUrl(cached.url);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { url, revoke } = await svc.fetchMetadataImageCellObjectUrl(
          projectId,
          protocolId,
          outputName,
          tableName,
          rowIndexInTable, // IMPORTANT: global row index, not row.id
          columnName,
          { size, applyTransform: false, inline: true, format: "png" },
        );
        if (cancelled) {
          revoke();
          return;
        }
        imageCacheRef.current.set(key, { url, revoke });
        setThumbUrl(url);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load image");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cell.path,
    columnName,
    imageCacheRef,
    outputName,
    projectId,
    protocolId,
    rowIndexInTable,
    size,
    svc,
    tableName,
  ]);

  const borderColor = isSelected ? "#2563eb" : "rgba(148,163,184,0.6)";

  const handleClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    ev.stopPropagation();
    if (onClick) onClick();
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        cursor: "pointer",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 1,
        border: `1px solid ${borderColor}`,
        overflow: "hidden",
        // Gray background so it looks like an image placeholder while loading
        bgcolor: "#d1d5db",
      }}
    >
      {loading ? (
        <CircularProgress size={18} />
      ) : error ? (
        <Typography variant="caption" color="error" sx={{ p: 1, textAlign: "center" }}>
          img error
        </Typography>
      ) : thumbUrl ? (
        <img
          src={thumbUrl}
          alt={cell.path}
          style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
        />
      ) : (
        <Typography variant="caption" color="text.secondary">
          no image
        </Typography>
      )}
    </Box>
  );
};

export function MetadataViewer({ projectId, protocolId, outputName }: MetadataViewerProps) {
  const svc = useProjectService();

  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Tables list
  const [tables, setTables] = useState<MetadataTableInfo[] | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | "">("");

  // Schema
  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Virtual window of rows for table mode
  const [windowRows, setWindowRows] = useState<MetadataRow[]>([]);
  const [windowOffset, setWindowOffset] = useState(0);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const lastRequestRef = useRef(0);

  // Gallery mode data
  const [galleryRows, setGalleryRows] = useState<MetadataRow[]>([]);
  const [galleryNextOffset, setGalleryNextOffset] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryHasMore, setGalleryHasMore] = useState(false);

  // Selection
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [selectedImageCell, setSelectedImageCell] = useState<SelectedImageCell | null>(
    null,
  );

  // Image cache: shared between all image cells in this viewer
  const imageCacheRef = useRef<Map<string, { url: string; revoke: () => void }>>(
    new Map(),
  );

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of imageCacheRef.current) {
        entry.revoke();
      }
      imageCacheRef.current.clear();
    };
  }, []);

  // Scroll container refs and size
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);
  const { height: viewportHeight } = useElementSize(scrollRef);

  // Load tables list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setTablesLoading(true);
        setTablesError(null);
        const list = await svc.fetchOutputMetadataTables(projectId, protocolId, outputName);
        if (cancelled) return;
        setTables(list || []);
        if (!selectedTable && list && list.length > 0) {
          setSelectedTable(list[0].name);
        }
      } catch (e: any) {
        if (!cancelled) setTablesError(e?.message || "Failed to load metadata tables");
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, protocolId, outputName, svc]);

  const handleTableChange = (ev: SelectChangeEvent<string>) => {
    const value = ev.target.value;
    setSelectedTable(value);
    setSchema(null);
    setSchemaError(null);

    // Reset table window
    setWindowRows([]);
    setWindowOffset(0);
    setWindowError(null);

    // Reset gallery
    setGalleryRows([]);
    setGalleryNextOffset(0);
    setGalleryError(null);
    setGalleryHasMore(false);

    // Reset selection
    setSelectedRowIndex(null);
    setSelectedImageCell(null);

    // Clear image cache and revoke URLs
    for (const [, entry] of imageCacheRef.current) {
      entry.revoke();
    }
    imageCacheRef.current.clear();
  };

  const tableInfo: MetadataTableInfo | null = useMemo(() => {
    if (!tables || !selectedTable) return null;
    return tables.find((t) => t.name === selectedTable) || null;
  }, [tables, selectedTable]);

  const totalRows = tableInfo?.rowCount ?? 0;

  // Load schema for selected table
  useEffect(() => {
    if (!selectedTable) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setSchemaLoading(true);
        setSchemaError(null);
        const s = await svc.fetchMetadataTableSchema(
          projectId,
          protocolId,
          outputName,
          selectedTable,
        );
        if (cancelled) return;
        setSchema(s);
      } catch (e: any) {
        if (!cancelled) {
          setSchema(null);
          setSchemaError(e?.message || "Failed to load metadata schema");
        }
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, selectedTable, svc]);

  const imageColumns = useMemo(
    () => schema?.columns.filter((c) => c.rendererType === "image") ?? [],
    [schema],
  );
  const hasImageColumns = imageColumns.length > 0;
  const firstImageColumn = imageColumns[0] ?? null;

  const sizeColumn: MetadataColumn | null = useMemo(() => {
    if (!schema) return null;
    return schema.columns.find((c) => c.name === "_size") ?? null;
  }, [schema]);

  const isClassTable = useMemo(() => {
    if (!tableInfo) return false;
    const label = (tableInfo.alias || tableInfo.name || "").toLowerCase();
    return label.startsWith("class2d") || label.startsWith("class3d");
  }, [tableInfo]);

  const showSizeLabel = isClassTable && !!sizeColumn;

  const rowHeight = hasImageColumns ? IMAGE_ROW_HEIGHT : NORMAL_ROW_HEIGHT;

  // Force view back to table if current table has no images
  useEffect(() => {
    if (viewMode === "gallery" && !hasImageColumns) {
      setViewMode("table");
    }
  }, [hasImageColumns, viewMode]);

  // Desired window size (rows that can be visible + buffer)
  const desiredWindowSize = useMemo(() => {
    if (!rowHeight || viewportHeight <= 0) return 60;
    const approxVisible = Math.ceil(viewportHeight / rowHeight);
    return approxVisible * 2 + EXTRA_BUFFER_ROWS;
  }, [viewportHeight, rowHeight]);

  const desiredWindowSizeRef = useRef(desiredWindowSize);
  useEffect(() => {
    desiredWindowSizeRef.current = desiredWindowSize;
  }, [desiredWindowSize]);

  const loadWindow = async (offset: number) => {
    if (!selectedTable) return;
    const limit = desiredWindowSizeRef.current || 60;
    const total = totalRows;

    const maxOffset = total > 0 ? Math.max(0, total - limit) : 0;
    const clampedOffset = total > 0 ? Math.min(Math.max(0, offset), maxOffset) : 0;

    const reqId = ++lastRequestRef.current;
    setWindowLoading(true);
    setWindowError(null);
    try {
      const win = await (svc as any).fetchMetadataTableWindow(
        projectId,
        protocolId,
        outputName,
        selectedTable,
        { offset: clampedOffset, limit, selectionOnly: false },
      );
      if (lastRequestRef.current !== reqId) {
        return;
      }
      const rows: MetadataRow[] = Array.isArray(win)
        ? (win as MetadataRow[])
        : ((win as any)?.rows as MetadataRow[]) || [];
      setWindowRows(rows);
      setWindowOffset(clampedOffset);
    } catch (e: any) {
      if (lastRequestRef.current === reqId) {
        setWindowRows([]);
        setWindowError(e?.message || "Failed to load rows");
      }
    } finally {
      if (lastRequestRef.current === reqId) {
        setWindowLoading(false);
      }
    }
  };

  // Initial window load when schema and table info are ready
  useEffect(() => {
    setWindowRows([]);
    setWindowOffset(0);
    setWindowError(null);
    if (!schema || !selectedTable || totalRows === 0) return;
    if (viewMode === "table") {
      void loadWindow(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, selectedTable, totalRows, projectId, protocolId, outputName, svc]);

  // Ensure data loaded when switching back to table view
  useEffect(() => {
    if (
      viewMode === "table" &&
      schema &&
      selectedTable &&
      totalRows > 0 &&
      windowRows.length === 0 &&
      !windowLoading &&
      !windowError
    ) {
      void loadWindow(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    if (!schema || !selectedTable || totalRows === 0 || rowHeight <= 0) return;

    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    const firstVisible = Math.floor(scrollTop / rowHeight);

    const limit = desiredWindowSizeRef.current || windowRows.length || 60;
    const buffer = Math.floor(limit / 3);
    const total = totalRows;
    const maxOffset = Math.max(0, total - limit);

    let targetOffset = firstVisible - buffer;
    if (targetOffset < 0) targetOffset = 0;
    if (targetOffset > maxOffset) targetOffset = maxOffset;

    const distance = Math.abs(targetOffset - windowOffset);
    if (distance < Math.max(5, Math.floor(buffer / 2))) {
      return;
    }

    void loadWindow(targetOffset);
  };

  // Gallery chunk loader
  const loadGalleryChunk = async (offset: number) => {
    if (!selectedTable || !schema || totalRows === 0) return;
    const remaining = totalRows - offset;
    if (remaining <= 0) {
      setGalleryHasMore(false);
      return;
    }
    const limit = Math.min(GALLERY_PAGE_SIZE, remaining);
    setGalleryLoading(true);
    setGalleryError(null);
    try {
      const win = await (svc as any).fetchMetadataTableWindow(
        projectId,
        protocolId,
        outputName,
        selectedTable,
        { offset, limit, selectionOnly: false },
      );
      const rows: MetadataRow[] = Array.isArray(win)
        ? (win as MetadataRow[])
        : ((win as any)?.rows as MetadataRow[]) || [];
      setGalleryRows((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      const nextOffset = offset + rows.length;
      setGalleryNextOffset(nextOffset);
      setGalleryHasMore(nextOffset < totalRows);
    } catch (e: any) {
      setGalleryError(e?.message || "Failed to load gallery images");
    } finally {
      setGalleryLoading(false);
    }
  };

  // Reset gallery when schema/table changes and load if we are in gallery view
  useEffect(() => {
    setGalleryRows([]);
    setGalleryNextOffset(0);
    setGalleryError(null);
    setGalleryHasMore(false);

    if (!schema || !selectedTable || totalRows === 0) return;
    if (viewMode === "gallery") {
      void loadGalleryChunk(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, selectedTable, totalRows, projectId, protocolId, outputName, svc]);

  // Ensure gallery data loaded when switching to gallery view
  useEffect(() => {
    if (
      viewMode === "gallery" &&
      schema &&
      selectedTable &&
      totalRows > 0 &&
      galleryRows.length === 0 &&
      !galleryLoading &&
      !galleryError
    ) {
      void loadGalleryChunk(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const handleGalleryScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    if (!galleryHasMore || galleryLoading) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      void loadGalleryChunk(galleryNextOffset);
    }
  };

  const topSpacerHeight = totalRows > 0 ? windowOffset * rowHeight : 0;
  const bottomSpacerHeight =
    totalRows > 0 ? Math.max(0, (totalRows - windowOffset - windowRows.length) * rowHeight) : 0;

  // Helper for non-image cells
  const formatCellValue = (value: MetadataCell): React.ReactNode => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "string") return value;
    if (typeof value === "object" && "kind" in value) {
      if ((value as any).kind === "matrix") {
        const m = (value as any).value;
        if (Array.isArray(m) && m.length > 0 && Array.isArray(m[0])) {
          return `matrix ${m.length}×${m[0].length}`;
        }
        return "matrix";
      }
      if ((value as any).kind === "image") {
        return "[image]";
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const baseCellSx = {
    padding: "4px 8px",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis" as const,
    overflow: "hidden" as const,
    borderBottom: "1px solid rgba(148,163,184,0.25)",
    fontSize: "0.75rem",
    lineHeight: 1.4,
  };

  const headerCellSx = {
    ...baseCellSx,
    fontWeight: 600,
    background: HEADER_BG,
    color: "#0f172a",
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
  };

  const hasData = !!schema && totalRows > 0;

  // Compute min width for the table so that all columns have enough space
  const tableMinWidth = useMemo(() => {
    if (!schema) return undefined;
    const imageCols = schema.columns.filter((c) => c.rendererType === "image").length;
    const textCols = schema.columns.length - imageCols;
    const total =
      ROW_INDEX_COL_WIDTH + textCols * MIN_TEXT_COL_WIDTH + imageCols * IMAGE_COL_MIN_WIDTH;
    return total;
  }, [schema]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        minHeight: 480,
        mt: 2,
      }}
    >
      {/* Header: view mode buttons + table selector + info */}
      <Box 
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 1.5,
          flexWrap: "wrap",
        }}
      >
        {/* Left: view mode buttons */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 96 }}>
          <Tooltip title="Table view">
            <span>
              <IconButton
                size="small"
                color={viewMode === "table" ? "primary" : "default"}
                onClick={() => setViewMode("table")}
              >
                <TableIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              hasImageColumns
                ? "Gallery view"
                : "Gallery view is only available when the table has image columns"
            }
          >
            <span>
              <IconButton
                size="small"
                color={viewMode === "gallery" ? "primary" : "default"}
                disabled={!hasImageColumns}
                onClick={() => {
                  if (!hasImageColumns) return;
                  setViewMode("gallery");
                }}
              >
                <LayoutGrid fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Center: table selector */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="metadata-table-select-label">Metadata table</InputLabel>
            <Select
              labelId="metadata-table-select-label"
              label="Metadata table"
              value={selectedTable}
              onChange={handleTableChange}
              disabled={tablesLoading || !tables || tables.length === 0}
              renderValue={(value) => {
                if (!value) return "";
                const t = tables?.find((tbl) => tbl.name === value);
                const label = t?.alias || t?.name || value;
                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TableIcon fontSize="small" />
                    <span>{label}</span>
                  </Box>
                );
              }}
            >
              {tables?.map((t) => {
                const label = t.alias || t.name;
                return (
                  <MenuItem key={t.name} value={t.name}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <TableIcon fontSize="small" />
                      <span>{label}</span>
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

        {/* Right: output info */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            minWidth: 220,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Output: <strong>{outputName}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Rows: <strong>{totalRows}</strong>
          </Typography>
        </Box>
      </Box>

      {tablesLoading && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2">Loading tables…</Typography>
        </Box>
      )}

      {tablesError && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {tablesError}
        </Typography>
      )}

      {!tablesLoading && !tablesError && tables && tables.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No metadata tables for this output.
        </Typography>
      )}

      {selectedTable && schemaLoading && !schema && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading schema…</Typography>
        </Box>
      )}

      {selectedTable && schemaError && (
        <Typography variant="body2" color="error" sx={{ mt: 2 }}>
          {schemaError}
        </Typography>
      )}

      {selectedTable && schema && totalRows === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          This table has no rows.
        </Typography>
      )}

      {selectedTable && schema && totalRows > 0 && (
        <>
          {/* TABLE VIEW */}
          <Paper
            variant="outlined"
            sx={{
              mt: 1,
              minHeight: 660,
              maxHeight: 660,
              minWidth: 840,
              flexShrink: 0,
              display: viewMode === "table" ? "flex" : "none",
              flexDirection: "column",
              borderColor: "rgba(148,163,184,0.4)",
              backgroundColor: "background.paper",
            }}
          >
            <TableContainer
              ref={scrollRef}
              onScroll={handleScroll}
              sx={{
                flex: 1,
                overflow: "auto",
              }}
            >
              <Table
                size="small"
                stickyHeader
                sx={{
                  minWidth: tableMinWidth || 700,
                  tableLayout: "fixed",
                  borderCollapse: "collapse",
                  borderSpacing: 0,
                }}
              >
                <TableHead>
                  <TableRow>
                    {/* Row index column header */}
                    <TableCell
                      sx={{
                        ...headerCellSx,
                        width: ROW_INDEX_COL_WIDTH,
                        minWidth: ROW_INDEX_COL_WIDTH,
                        maxWidth: ROW_INDEX_COL_WIDTH,
                        textAlign: "right",
                        pr: 1,
                        left: 0,
                        zIndex: 3,
                        borderRight: "1px solid rgba(148,163,184,0.6)",
                      }}
                    >
                      #
                    </TableCell>

                    {schema.columns.map((col: MetadataColumn) => (
                      <TableCell
                        key={col.name}
                        sx={{
                          ...headerCellSx,
                          minWidth:
                            col.rendererType === "image"
                              ? IMAGE_COL_MIN_WIDTH
                              : MIN_TEXT_COL_WIDTH,
                          width:
                            col.rendererType === "image"
                              ? IMAGE_COL_MIN_WIDTH
                              : MIN_TEXT_COL_WIDTH,
                        }}
                      >
                        {col.alias || col.name}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topSpacerHeight > 0 && (
                    <TableRow style={{ height: topSpacerHeight }}>
                      <TableCell
                        colSpan={schema.columns.length + 1}
                        sx={{ padding: 0, borderBottom: "none" }}
                      />
                    </TableRow>
                  )}

                  {windowRows.map((row: MetadataRow, rowIndexInWindow: number) => {
                    const displayRowIndex = windowOffset + rowIndexInWindow;
                    const isHighlightedRow =
                      selectedRowIndex !== null && selectedRowIndex === displayRowIndex;

                    return (
                      <TableRow
                        key={row.id ?? `${windowOffset}-${rowIndexInWindow}`}
                        hover
                        onClick={() => {
                          setSelectedRowIndex(displayRowIndex);
                          setSelectedImageCell(null);
                        }}
                        sx={{
                          height: rowHeight,
                          backgroundColor: isHighlightedRow
                            ? "rgba(219,234,254,0.9)"
                            : "background.paper",
                          transition: "background-color 120ms ease-out",
                          "&:hover": {
                            backgroundColor: isHighlightedRow
                              ? "rgba(191,219,254,0.95)"
                              : "rgba(248,250,252,1)",
                          },
                          "& > td": {
                            borderRight: "1px solid rgba(148,163,184,0.25)",
                            transition: "background-color 120ms ease-out",
                          },
                          "& > td:last-of-type": {
                            borderRight: "none",
                          },
                        }}
                      >
                        {/* Row index sticky cell */}
                        <TableCell
                          sx={{
                            ...baseCellSx,
                            height: rowHeight,
                            width: ROW_INDEX_COL_WIDTH,
                            minWidth: ROW_INDEX_COL_WIDTH,
                            maxWidth: ROW_INDEX_COL_WIDTH,
                            textAlign: "right",
                            pr: 1,
                            position: "sticky",
                            left: 0,
                            zIndex: 2,
                            borderRight: "1px solid rgba(148,163,184,0.3)",
                            backgroundColor: HEADER_BG
                          }}
                        >
                          {displayRowIndex + 1}
                        </TableCell>

                        {schema.columns.map((col) => {
                          const v = row.values[col.index];
                          const isImageColumn = col.rendererType === "image";
                          const isSelectedImage =
                            !!selectedImageCell &&
                            isImageColumn &&
                            selectedImageCell.rowIndexInTable === displayRowIndex &&
                            selectedImageCell.columnName === col.name;

                          const cellWidth =
                            col.rendererType === "image"
                              ? IMAGE_COL_MIN_WIDTH
                              : MIN_TEXT_COL_WIDTH;

                          if (
                            isImageColumn &&
                            v &&
                            typeof v === "object" &&
                            (v as any).kind === "image"
                          ) {
                            const cell = v as { kind: "image"; path: string };
                            return (
                              <TableCell
                                key={col.name}
                                sx={{
                                  ...baseCellSx,
                                  height: rowHeight,
                                  verticalAlign: "middle",
                                  width: cellWidth,
                                  minWidth: cellWidth,
                                  maxWidth: cellWidth,
                                  backgroundColor: isHighlightedRow
                                    ? "rgba(219,234,254,0.9)"
                                    : "background.paper",
                                }}
                              >
                                <MetadataImageCell
                                  projectId={projectId}
                                  protocolId={protocolId}
                                  outputName={outputName}
                                  svc={svc}
                                  tableName={selectedTable}
                                  rowIndexInTable={displayRowIndex}
                                  columnName={col.name}
                                  cell={cell}
                                  size={BASE_THUMB_SIZE}
                                  isSelected={isSelectedImage}
                                  onClick={() => {
                                    setSelectedRowIndex(displayRowIndex);
                                    setSelectedImageCell({
                                      rowIndexInTable: displayRowIndex,
                                      columnName: col.name,
                                    });
                                  }}
                                  imageCacheRef={imageCacheRef}
                                />
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell
                              key={col.name}
                              sx={{
                                ...baseCellSx,
                                height: rowHeight,
                                verticalAlign: "middle",
                                width: cellWidth,
                                minWidth: cellWidth,
                                maxWidth: cellWidth,
                                backgroundColor: isHighlightedRow
                                  ? "rgba(219,234,254,0.9)"
                                  : "background.paper",
                              }}
                              title={typeof v === "string" ? v : undefined}
                            >
                              {formatCellValue(v as MetadataCell)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}

                  {bottomSpacerHeight > 0 && (
                    <TableRow style={{ height: bottomSpacerHeight }}>
                      <TableCell
                        colSpan={schema.columns.length + 1}
                        sx={{ padding: 0, borderBottom: "none" }}
                      />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {windowLoading && hasData && (
              <Box
                sx={{
                  py: 0.5,
                  px: 1.5,
                  borderTop: "1px solid rgba(148,163,184,0.4)",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  Loading rows…
                </Typography>
              </Box>
            )}

            {windowError && (
              <Box
                sx={{
                  py: 0.5,
                  px: 1.5,
                  borderTop: "1px solid rgba(148,163,184,0.4)",
                }}
              >
                <Typography variant="caption" color="error">
                  {windowError}
                </Typography>
              </Box>
            )}
          </Paper>

          {/* GALLERY VIEW */}
          <Paper
            variant="outlined"
            sx={{
              mt: 1,
              minHeight: 660,
              maxHeight: 660,
              minWidth: 840,
              flexShrink: 0,
              display: viewMode === "gallery" ? "flex" : "none",
              flexDirection: "column",
              borderColor: "rgba(148,163,184,0.4)",
              backgroundColor: "background.paper",
            }}
          >
            <Box
              ref={galleryScrollRef}
              onScroll={handleGalleryScroll}
              sx={{
                flex: 1,
                overflow: "auto",
              }}
            >
              {!firstImageColumn && (
                <Box
                  sx={{
                    py: 4,
                    px: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    This table has no image columns to display in gallery mode.
                  </Typography>
                </Box>
              )}

              {firstImageColumn && (
                <Box
                  sx={{
                    p: 2,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 2,
                  }}
                >
                  {galleryRows.map((row, idx) => {
                    // galleryRows contains rows starting at index 0..N
                    const globalRowIndex = idx;

                    const v = row.values[firstImageColumn.index];
                    const isImageCell =
                      v && typeof v === "object" && (v as any).kind === "image";
                    const cell = isImageCell ? (v as { kind: "image"; path: string }) : null;

                    const isSelected =
                      !!selectedImageCell &&
                      selectedImageCell.rowIndexInTable === globalRowIndex &&
                      selectedImageCell.columnName === firstImageColumn.name;

                    let sizeLabel: string | null = null;
                    if (showSizeLabel && sizeColumn) {
                      const sizeValue = row.values[sizeColumn.index];
                      if (sizeValue !== null && sizeValue !== undefined && sizeValue !== "") {
                        sizeLabel = `size=${sizeValue}`;
                      }
                    }

                    return (
                      <Box
                        key={row.id ?? `${idx}`}
                        onClick={() => {
                          setSelectedRowIndex(globalRowIndex);
                          setSelectedImageCell({
                            rowIndexInTable: globalRowIndex,
                            columnName: firstImageColumn.name,
                          });
                        }}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 0.5,
                          p: 0.75,
                          borderRadius: 1.5,
                          border: isSelected
                            ? "2px solid #2563eb"
                            : "1px solid rgba(148,163,184,0.45)",
                          background: isSelected ? "#e0f2fe" : "#f9fafb",
                          boxShadow: isSelected
                            ? "0 0 0 1px rgba(37,99,235,0.3)"
                            : "none",
                          transition:
                            "background-color 120ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out",
                        }}
                      >
                        {cell ? (
                          <MetadataImageCell
                            projectId={projectId}
                            protocolId={protocolId}
                            outputName={outputName}
                            svc={svc}
                            tableName={selectedTable}
                            rowIndexInTable={globalRowIndex}
                            columnName={firstImageColumn.name}
                            cell={cell}
                            size={BASE_THUMB_SIZE}
                            isSelected={isSelected}
                            imageCacheRef={imageCacheRef}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: BASE_THUMB_SIZE,
                              height: BASE_THUMB_SIZE,
                              borderRadius: 1,
                              border: "1px dashed rgba(148,163,184,0.6)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              no image
                            </Typography>
                          </Box>
                        )}

                        {/* Optional size label only for Class2D/Class3D with _size column */}
                        <Box sx={{ minHeight: 18 }}>
                          {sizeLabel && (
                            <Typography variant="caption" color="text.secondary">
                              {sizeLabel}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {galleryLoading && (
                <Box
                  sx={{
                    py: 1,
                    px: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                  }}
                >
                  <CircularProgress size={16} />
                  <Typography variant="caption" color="text.secondary">
                    Loading images…
                  </Typography>
                </Box>
              )}

              {galleryError && (
                <Box
                  sx={{
                    py: 1,
                    px: 2,
                  }}
                >
                  <Typography variant="caption" color="error">
                    {galleryError}
                  </Typography>
                </Box>
              )}

              {!galleryLoading &&
                firstImageColumn &&
                galleryRows.length === 0 &&
                !galleryError && (
                  <Box
                    sx={{
                      py: 4,
                      px: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No images to display yet.
                    </Typography>
                  </Box>
                )}
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}
