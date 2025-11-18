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
import { useProjectService } from "@/ProjectServiceContext";
import type {
  MetadataCell,
  MetadataColumn,
  MetadataRow,
  MetadataTableInfo,
  MetadataTableSchema,
} from "@/api/projects";
import { LayoutGrid, Table as TableIcon } from "lucide-react";

type MetadataViewerProps = {
  projectId: number;
  protocolId: number;
  outputName: string;
};

type SelectedImageCell = {
  rowId: number | string;
  columnName: string;
};

type ViewMode = "table" | "gallery";

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

  // New: control concurrency of window requests
  const windowRequestInFlightRef = useRef(false);
  const pendingWindowOffsetRef = useRef<number | null>(null);

  // Gallery mode data
  const [galleryRows, setGalleryRows] = useState<MetadataRow[]>([]);
  const [galleryNextOffset, setGalleryNextOffset] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryHasMore, setGalleryHasMore] = useState(false);

  // Image selection and cache
  const [selectedImageCell, setSelectedImageCell] = useState<SelectedImageCell | null>(null);
  const imageCacheRef = useRef<Map<string, { url: string; revoke: () => void }>>(new Map());

  // Scroll container refs and size
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);
  const { height: viewportHeight } = useElementSize(scrollRef);

  // Cleanup image object URLs on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of imageCacheRef.current) {
        entry.revoke();
      }
      imageCacheRef.current.clear();
    };
  }, []);

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
    setWindowRows([]);
    setWindowOffset(0);
    setWindowError(null);
    setGalleryRows([]);
    setGalleryNextOffset(0);
    setGalleryError(null);
    setGalleryHasMore(false);
    setSelectedImageCell(null);
    // Clear image cache when switching table
    for (const [, entry] of imageCacheRef.current) entry.revoke();
    imageCacheRef.current.clear();
    // Reset window request control when changing table
    windowRequestInFlightRef.current = false;
    pendingWindowOffsetRef.current = null;
    lastRequestRef.current = 0;
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
        const s = await svc.fetchMetadataTableSchema(projectId, protocolId, outputName, selectedTable);
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

  // If current table has no image columns, force table view
  useEffect(() => {
    if (!hasImageColumns && viewMode === "gallery") {
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

  // New: window loader that collapses multiple requests into one
  const loadWindow = async (offset: number) => {
    if (!selectedTable) return;

    const limit = desiredWindowSizeRef.current || 60;
    const total = totalRows;

    const maxOffset = total > 0 ? Math.max(0, total - limit) : 0;
    const clampedOffset =
      total > 0 ? Math.min(Math.max(0, offset), maxOffset) : Math.max(0, offset);

    // If a request is already in-flight, remember only the last desired offset
    if (windowRequestInFlightRef.current) {
      pendingWindowOffsetRef.current = clampedOffset;
      return;
    }

    const reqId = ++lastRequestRef.current;
    windowRequestInFlightRef.current = true;
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

      // Ignore stale responses
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
      windowRequestInFlightRef.current = false;

      // If user scrolled further while this request was running, fire one more for the last offset
      if (
        pendingWindowOffsetRef.current !== null &&
        pendingWindowOffsetRef.current !== clampedOffset
      ) {
        const nextOffset = pendingWindowOffsetRef.current;
        pendingWindowOffsetRef.current = null;
        void loadWindow(nextOffset);
      } else {
        pendingWindowOffsetRef.current = null;
      }
    }
  };

  // Reset and load table window when schema/table changes
  useEffect(() => {
    setWindowRows([]);
    setWindowOffset(0);
    setWindowError(null);
    windowRequestInFlightRef.current = false;
    pendingWindowOffsetRef.current = null;
    if (!schema || !selectedTable || totalRows === 0) return;
    if (viewMode === "table") {
      void loadWindow(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, selectedTable, totalRows, projectId, protocolId, outputName, svc]);

  // When switching back to table view, ensure data is loaded but do not clear it
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
    // Avoid tiny shifts to reduce unnecessary requests
    if (distance < Math.max(5, Math.floor(buffer / 2))) {
      return;
    }

    void loadWindow(targetOffset);
  };

  // Gallery chunk loader
  const loadGalleryChunk = async (offset: number) => {
    if (!selectedTable || !schema || totalRows === 0 || !firstImageColumn) return;
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

    if (!schema || !selectedTable || totalRows === 0 || !hasImageColumns) return;
    if (viewMode === "gallery") {
      void loadGalleryChunk(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, selectedTable, totalRows, hasImageColumns, projectId, protocolId, outputName, svc]);

  // When switching to gallery view, ensure data is loaded but do not clear it
  useEffect(() => {
    if (
      viewMode === "gallery" &&
      hasImageColumns &&
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
  }, [viewMode, hasImageColumns]);

  const handleGalleryScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    if (!galleryHasMore || galleryLoading || !hasImageColumns) return;
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

  type MetadataImageCellProps = {
    tableName: string;
    rowId: number | string;
    columnName: string;
    cell: { kind: "image"; path: string };
    size: number;
    isSelected?: boolean;
    onClick?: () => void;
  };

  const MetadataImageCell: React.FC<MetadataImageCellProps> = ({
    tableName,
    rowId,
    columnName,
    cell,
    size,
    isSelected,
    onClick,
  }) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const rowIdNum = Number(rowId);
      const key = `${tableName}|${rowIdNum}|${columnName}|${cell.path}|${size}`;
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
            rowIdNum,
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
    }, [cell.path, columnName, projectId, protocolId, outputName, rowId, size, svc, tableName]);

    const borderColor = isSelected ? "#2563eb" : "rgba(148,163,184,0.6)";

    return (
      <Box
        onClick={onClick}
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
          bgcolor: "#020617",
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

  const baseCellSx = {
    padding: "4px 8px",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis" as const,
    overflow: "hidden" as const,
    borderBottom: "1px solid rgba(148,163,184,0.25)",
    fontSize: "0.75rem",
    lineHeight: 1.4,
    backgroundColor: "background.paper",
  };

  const headerCellSx = {
    ...baseCellSx,
    fontWeight: 600,
    background: "linear-gradient(135deg, #d8dcdfff, #d8dcdfff)",
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
      ROW_INDEX_COL_WIDTH +
      textCols * MIN_TEXT_COL_WIDTH +
      imageCols * IMAGE_COL_MIN_WIDTH;
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
            <IconButton
              size="small"
              color={viewMode === "table" ? "primary" : "default"}
              onClick={() => setViewMode("table")}
            >
              <TableIcon size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={
              hasImageColumns
                ? "Gallery view"
                : "Gallery view is only available when the table has image columns"
            }
          >
            <span style={{ display: "inline-flex" }}>
              <IconButton
                size="small"
                color={viewMode === "gallery" ? "primary" : "default"}
                onClick={() => setViewMode("gallery")}
                disabled={!hasImageColumns}
              >
                <LayoutGrid size={16} />
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
                    <TableIcon size={16} />
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
                      <TableIcon size={16} />
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
                    const isHighlightedRow = !!(
                      selectedImageCell &&
                      String(selectedImageCell.rowId) === String(row.id)
                    );

                    const displayRowNumber = windowOffset + rowIndexInWindow + 1;

                    return (
                      <TableRow
                        key={row.id ?? `${windowOffset}-${rowIndexInWindow}`}
                        hover
                        sx={{
                          height: rowHeight,
                          backgroundColor: isHighlightedRow
                            ? "rgba(219,234,254,0.7)"
                            : "transparent",
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
                            background: "linear-gradient(135deg, #d8dcdfff, #d8dcdfff)",
                          }}
                        >
                          {displayRowNumber}
                        </TableCell>

                        {schema.columns.map((col) => {
                          const v = row.values[col.index];
                          const isImageColumn = col.rendererType === "image";
                          const isSelectedImage =
                            isImageColumn &&
                            selectedImageCell &&
                            selectedImageCell.rowId === row.id &&
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
                                }}
                              >
                                <MetadataImageCell
                                  tableName={selectedTable}
                                  rowId={row.id}
                                  columnName={col.name}
                                  cell={cell}
                                  size={BASE_THUMB_SIZE}
                                  isSelected={!!isSelectedImage}
                                  onClick={() =>
                                    setSelectedImageCell({
                                      rowId: row.id,
                                      columnName: col.name,
                                    })
                                  }
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
                    const v = row.values[firstImageColumn.index];
                    const isImageCell =
                      v && typeof v === "object" && (v as any).kind === "image";
                    const cell = isImageCell ? (v as { kind: "image"; path: string }) : null;
                    const isSelected = !!(
                      selectedImageCell &&
                      String(selectedImageCell.rowId) === String(row.id) &&
                      selectedImageCell.columnName === firstImageColumn.name
                    );

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
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 0.75,
                          p: 1,
                          borderRadius: 2,
                          border: isSelected
                            ? "2px solid #2563eb"
                            : "1px solid rgba(148,163,184,0.6)",
                          background: isSelected
                            ? "linear-gradient(135deg, #e0f2fe, #eff6ff)"
                            : "radial-gradient(circle at top, #f9fafb, #e5e7eb)",
                          boxShadow: isSelected
                            ? "0 0 0 1px rgba(37,99,235,0.3)"
                            : "none",
                          minHeight: BASE_THUMB_SIZE + 32,
                        }}
                      >
                        {cell ? (
                          <MetadataImageCell
                            tableName={selectedTable}
                            rowId={row.id}
                            columnName={firstImageColumn.name}
                            cell={cell}
                            size={BASE_THUMB_SIZE}
                            isSelected={isSelected}
                            onClick={() =>
                              setSelectedImageCell({
                                rowId: row.id,
                                columnName: firstImageColumn.name,
                              })
                            }
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

              {!galleryLoading && firstImageColumn && galleryRows.length === 0 && !galleryError && (
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
