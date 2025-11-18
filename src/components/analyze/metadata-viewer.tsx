
// src/components/analyze/metadata-viewer.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";

import {
  MetadataCell,
  MetadataColumn,
  MetadataRow,
  MetadataTableInfo,
  MetadataTableSchema,
  fetchMetadataTablePage,
  fetchMetadataTableSchema,
  fetchOutputMetadataTables,
} from "@/api/projects";

type Id = string | number;

export type MetadataViewerProps = {
  projectId: Id;
  protocolId: Id;
  outputName: string;
};

const ROW_HEIGHT = 28; // px
const VIEWPORT_HEIGHT = 480; // px
const PAGE_SIZE = 200;
const OVERSCAN = 20;

function renderCellValue(cell: MetadataCell | undefined, column: MetadataColumn): string {
  if (cell === undefined || cell === null) return "";
  if (typeof cell === "number") {
    if (column.rendererType === "float" && column.decimals != null) {
      return cell.toFixed(column.decimals);
    }
    return String(cell);
  }
  if (typeof cell === "string") return cell;
  if (typeof cell === "boolean") return cell ? "true" : "false";

  if (typeof cell === "object") {
    if ((cell as any).kind === "image") return "[image]";
    if ((cell as any).kind === "matrix") return "[matrix]";
  }
  return String(cell as any);
}

export const MetadataViewer: React.FC<MetadataViewerProps> = ({
  projectId,
  protocolId,
  outputName,
}) => {
  const [tables, setTables] = useState<MetadataTableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [totalRows, setTotalRows] = useState<number>(0);

  // Page cache: pageNumber -> rows
  const pageCacheRef = useRef<Map<number, MetadataRow[]>>(new Map());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const [cacheVersion, setCacheVersion] = useState(0);

  const [scrollTop, setScrollTop] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const numericProjectId = projectId;
  const numericProtocolId = protocolId;

  // Derived indices for virtual window
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const startIndex = useMemo(
    () => Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN),
    [scrollTop]
  );
  const endIndex = useMemo(
    () =>
      totalRows > 0
        ? Math.min(totalRows - 1, startIndex + visibleCount - 1)
        : 0,
    [startIndex, visibleCount, totalRows]
  );

  // ---------------------------------------------------------------------------
  // Load tables list
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setTablesLoading(true);
        setTablesError(null);
        const items = await fetchOutputMetadataTables(
          numericProjectId,
          numericProtocolId,
          outputName
        );
        if (cancelled) return;
        setTables(items || []);
        setSelectedTable((prev) => {
          if (prev && items.some((t) => t.name === prev)) return prev;
          return items[0]?.name ?? null;
        });
      } catch (err: any) {
        if (!cancelled) {
          setTablesError(err?.message || "Failed to load metadata tables");
        }
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [numericProjectId, numericProtocolId, outputName]);

  // ---------------------------------------------------------------------------
  // Load schema + first page when selected table changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedTable) {
      setSchema(null);
      setTotalRows(0);
      pageCacheRef.current.clear();
      setCacheVersion((v) => v + 1);
      return;
    }

    let cancelled = false;

    // Reset cache and scroll
    pageCacheRef.current = new Map();
    loadingPagesRef.current = new Set();
    setScrollTop(0);
    setTotalRows(0);
    setSchema(null);
    setSchemaError(null);
    setSchemaLoading(true);
    setCacheVersion((v) => v + 1);

    // Load schema
    (async () => {
      try {
        const s = await fetchMetadataTableSchema(
          numericProjectId,
          numericProtocolId,
          outputName,
          selectedTable
        );
        if (cancelled) return;
        setSchema(s);
      } catch (err: any) {
        if (!cancelled) {
          setSchemaError(err?.message || "Failed to load schema");
        }
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();

    // Load first page
    (async () => {
      try {
        loadingPagesRef.current.add(1);
        const page = await fetchMetadataTablePage(
          numericProjectId,
          numericProtocolId,
          outputName,
          selectedTable,
          {
            page: 1,
            pageSize: PAGE_SIZE,
            sortBy: "id",
            asc: true,
          }
        );
        if (cancelled) return;

        pageCacheRef.current.set(1, page.rows || []);
        setTotalRows(
          typeof page.totalRows === "number"
            ? page.totalRows
            : (page.rows?.length ?? 0)
        );
        setCacheVersion((v) => v + 1);
      } catch (err: any) {
        if (!cancelled) {
          setSchemaError(err?.message || "Failed to load rows");
        }
      } finally {
        loadingPagesRef.current.delete(1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numericProjectId, numericProtocolId, outputName, selectedTable]);

  // ---------------------------------------------------------------------------
  // Load additional pages on scroll (virtual window)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedTable || !schema || totalRows <= 0) return;

    const firstNeededPage = Math.floor(startIndex / PAGE_SIZE) + 1;
    const lastNeededPage = Math.floor(endIndex / PAGE_SIZE) + 1;

    for (let page = firstNeededPage; page <= lastNeededPage; page++) {
      if (pageCacheRef.current.has(page)) continue;
      if (loadingPagesRef.current.has(page)) continue;

      loadingPagesRef.current.add(page);

      (async () => {
        try {
          const resp = await fetchMetadataTablePage(
            numericProjectId,
            numericProtocolId,
            outputName,
            selectedTable,
            {
              page,
              pageSize: PAGE_SIZE,
              sortBy: "id",
              asc: true,
            }
          );
          pageCacheRef.current.set(page, resp.rows || []);
          if (
            typeof resp.totalRows === "number" &&
            resp.totalRows !== totalRows
          ) {
            setTotalRows(resp.totalRows);
          }
          setCacheVersion((v) => v + 1);
        } catch (err) {
          // You can log the error if needed
        } finally {
          loadingPagesRef.current.delete(page);
        }
      })();
    }
  }, [
    startIndex,
    endIndex,
    selectedTable,
    schema,
    numericProjectId,
    numericProtocolId,
    outputName,
    totalRows,
  ]);

  // ---------------------------------------------------------------------------
  // Build visible rows slice from cached pages
  // ---------------------------------------------------------------------------
  const visibleRows = useMemo(
    () => {
      if (!schema || totalRows === 0) return [] as { index: number; row: MetadataRow | null }[];

      const items: { index: number; row: MetadataRow | null }[] = [];
      const end = Math.min(endIndex, totalRows - 1);
      for (let i = startIndex; i <= end; i++) {
        const page = Math.floor(i / PAGE_SIZE) + 1;
        const indexInPage = i - (page - 1) * PAGE_SIZE;
        const pageRows = pageCacheRef.current.get(page);
        const row = pageRows && pageRows[indexInPage] ? pageRows[indexInPage] : null;
        items.push({ index: i, row });
      }
      return items;
    },
    [startIndex, endIndex, totalRows, schema, cacheVersion]
  );

  const handleTableChange = (evt: SelectChangeEvent<string>) => {
    const value = evt.target.value || "";
    setSelectedTable(value || null);
  };

  const innerHeight = totalRows * ROW_HEIGHT;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (tablesLoading && !tables.length) {
    return (
      <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Loading metadata tables…</Typography>
      </Box>
    );
  }

  if (tablesError) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="error">
          {tablesError}
        </Typography>
      </Box>
    );
  }

  if (!tables.length) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          This output does not expose metadata tables.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* Toolbar: table selector + info */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="metadata-table-label">Table</InputLabel>
          <Select
            labelId="metadata-table-label"
            label="Table"
            value={selectedTable || ""}
            onChange={handleTableChange}
          >
            {tables.map((t) => (
              <MenuItem key={t.name} value={t.name}>
                {t.alias || t.name}{" "}
                {typeof t.rowCount === "number" ? ` (${t.rowCount} rows)` : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {schemaLoading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2">Loading schema…</Typography>
          </Box>
        ) : schemaError ? (
          <Typography variant="body2" color="error">
            {schemaError}
          </Typography>
        ) : (
          schema && (
            <Typography variant="caption" color="text.secondary">
              Columns: {schema.columns.length}
              {totalRows ? ` · Rows: ${totalRows}` : ""}
            </Typography>
          )
        )}
      </Box>

      {/* Table body with virtual scroll */}
      <Paper
        elevation={0}
        sx={{
          border: "1px solid #e5e7eb",
          borderRadius: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#fff",
        }}
      >
        {/* Header */}
        {schema && (
          <Box
            sx={{
              display: "flex",
              borderBottom: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              minWidth: "max-content",
            }}
          >
            {schema.columns.map((col) => (
              <Box
                key={col.name}
                sx={{
                  flex: 1,
                  px: 1,
                  py: 0.5,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRight: "1px solid #f3f4f6",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {col.alias || col.name}
              </Box>
            ))}
          </Box>
        )}

        {/* Body */}
        <Box
          ref={scrollRef}
          sx={{
            position: "relative",
            height: VIEWPORT_HEIGHT,
            overflow: "auto",
            minWidth: "max-content",
            backgroundColor: "#ffffff",
          }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {schema && totalRows > 0 ? (
            <Box sx={{ position: "relative", height: innerHeight }}>
              {visibleRows.map(({ index, row }) => (
                <Box
                  key={row ? row.id : `placeholder-${index}`}
                  sx={{
                    position: "absolute",
                    top: index * ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    display: "flex",
                    borderBottom: "1px solid #f3f4f6",
                    minHeight: ROW_HEIGHT,
                    alignItems: "center",
                    fontSize: "0.75rem",
                  }}
                >
                  {schema.columns.map((col, colIdx) => {
                    const cell = row?.values?.[colIdx];
                    return (
                      <Box
                        key={col.name}
                        sx={{
                          flex: 1,
                          px: 1,
                          py: 0.5,
                          borderRight: "1px solid #fafafa",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: row ? "text.primary" : "text.disabled",
                        }}
                      >
                        {row ? renderCellValue(cell, col) : "Loading…"}
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          ) : schemaLoading ? (
            <Box
              sx={{
                p: 2,
                display: "flex",
                gap: 1,
                alignItems: "center",
              }}
            >
              <CircularProgress size={18} />
              <Typography variant="body2">Loading rows…</Typography>
            </Box>
          ) : (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No rows.
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

