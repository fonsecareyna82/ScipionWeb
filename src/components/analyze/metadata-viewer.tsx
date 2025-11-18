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
} from "@mui/material";
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

type SelectedImageCell = {
  rowId: number | string;
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

  // Tables list
  const [tables, setTables] = useState<MetadataTableInfo[] | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | "">("");

  // Schema
  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Virtual window of rows
  const [windowRows, setWindowRows] = useState<MetadataRow[]>([]);
  const [windowOffset, setWindowOffset] = useState(0);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const lastRequestRef = useRef(0);

  // Image selection and cache
  const [selectedImageCell, setSelectedImageCell] = useState<SelectedImageCell | null>(null);
  const imageCacheRef = useRef<Map<string, { url: string; revoke: () => void }>>(new Map());

  // Row selection (full row)
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null);

  // Scroll container ref and size
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
    setSelectedImageCell(null);
    setSelectedRowId(null);
    for (const [, entry] of imageCacheRef.current) entry.revoke();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, protocolId, outputName, selectedTable, svc]);

  const hasImageColumns = useMemo(
    () => schema?.columns.some((c) => c.rendererType === "image") ?? false,
    [schema],
  );

  const rowHeight = hasImageColumns ? IMAGE_ROW_HEIGHT : NORMAL_ROW_HEIGHT;

  // Desired window size (rows that can be visible + buffer, a bit larger to reduce blanks)
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
    const clampedOffset = total > 0 ? Math.min(Math.max(0, offset), maxOffset) : Math.max(0, offset);

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
        if (win && win.rows) {
          for (const [, entry] of imageCacheRef.current) entry.revoke();
          imageCacheRef.current.clear();
        }
        return;
      }
      const rows: MetadataRow[] = Array.isArray(win)
        ? (win as MetadataRow[])
        : (win?.rows as MetadataRow[]) || [];
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
    void loadWindow(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, selectedTable, totalRows, projectId, protocolId, outputName, svc]);

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
    borderRight: "1px solid rgba(148,163,184,0.25)",
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
        height: "100%",
        minHeight: 480,
        mt: 2,
      }}
    >
      {/* Header: table selector + info */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 1.5,
          flexWrap: "wrap",
          justifyContent: "space-between",
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
          >
            {tables?.map((t) => (
              <MenuItem key={t.name} value={t.name}>
                {t.alias || t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
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
        <Paper
          variant="outlined"
          sx={{
            mt: 1,
            flex: 1,
            minHeight: 320,
            maxHeight: 660,
            minWidth: 750,
            display: "flex",
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
                  const displayRowNumber = windowOffset + rowIndexInWindow + 1;
                  const isSelectedRow =
                    selectedRowId !== null &&
                    String(selectedRowId) === String(row.id ?? displayRowNumber);
                  const hasSelectedImageCell =
                    selectedImageCell && String(selectedImageCell.rowId) === String(row.id);
                  const isHighlightedRow = isSelectedRow || Boolean(hasSelectedImageCell);

                  return (
                    <TableRow
                      key={row.id ?? `${windowOffset}-${rowIndexInWindow}`}
                      hover
                      selected={isSelectedRow}
                      onClick={() => {
                        const idForSelection = row.id ?? displayRowNumber;
                        setSelectedRowId(idForSelection);
                      }}
                      sx={{
                        height: rowHeight,
                        cursor: "pointer",
                        backgroundColor: isHighlightedRow
                          ? "rgba(219,234,254,0.9)"
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
                          background: isHighlightedRow
                            ? "linear-gradient(135deg, #c7d2fe, #e5e7eb)"
                            : "linear-gradient(135deg, #d8dcdfff, #d8dcdfff)",
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
                                rowId={row.id ?? displayRowNumber}
                                columnName={col.name}
                                cell={cell}
                                size={BASE_THUMB_SIZE}
                                isSelected={Boolean(isSelectedImage)}
                                onClick={() =>
                                  setSelectedImageCell({
                                    rowId: row.id ?? displayRowNumber,
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
                Loading visible rows…
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
      )}
    </Box>
  );
}
