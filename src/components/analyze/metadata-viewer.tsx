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
  fetchMetadataImageCellObjectUrl,
} from "@/api/projects";

type Id = string | number;

export type MetadataViewerProps = {
  projectId: Id;
  protocolId: Id;
  outputName: string;
};

const ROW_HEIGHT = 32;        // slightly taller to fit thumbnails
const VIEWPORT_HEIGHT = 480;
const PAGE_SIZE = 200;
const OVERSCAN = 20;
const COLUMN_WIDTH = 160;     // fixed column width in px

type ImageCacheEntry = { url: string; revoke: () => void };
type ImageCache = Map<string, ImageCacheEntry>;

function renderTextCellValue(
  cell: MetadataCell | undefined,
  column: MetadataColumn
): string {
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

type MetadataImageCellProps = {
  projectId: Id;
  protocolId: Id;
  outputName: string;
  tableName: string;
  rowId: number | string;
  columnName: string;
  cacheRef: React.MutableRefObject<ImageCache>;
};

const MetadataImageCell: React.FC<MetadataImageCellProps> = ({
  projectId,
  protocolId,
  outputName,
  tableName,
  rowId,
  columnName,
  cacheRef,
}) => {
  const cacheKey = `${tableName}|${columnName}|${rowId}`;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const existing = cacheRef.current.get(cacheKey);
    if (existing) {
      setUrl(existing.url);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { url: objUrl, revoke } = await fetchMetadataImageCellObjectUrl(
          projectId,
          protocolId,
          outputName,
          tableName,
          rowId,
          columnName,
          {
            size: 64,
            applyTransform: false,
            inline: true,
            format: "png",
          }
        );
        if (cancelled || !mountedRef.current) {
          revoke();
          return;
        }
        cacheRef.current.set(cacheKey, { url: objUrl, revoke });
        setUrl(objUrl);
      } catch (e: any) {
        if (!cancelled && mountedRef.current) {
          setError(e?.message || "Image error");
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    cacheRef,
    projectId,
    protocolId,
    outputName,
    tableName,
    rowId,
    columnName,
  ]);

  if (loading && !url) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <CircularProgress size={14} />
      </Box>
    );
  }

  if (error && !url) {
    return (
      <Box
        sx={{
          fontSize: "0.7rem",
          color: "error.main",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={error}
      >
        {error}
      </Box>
    );
  }

  if (!url) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        height: "100%",
      }}
    >
      <img
        src={url}
        alt="cell thumbnail"
        style={{
          width: 24,
          height: 24,
          objectFit: "cover",
          borderRadius: 2,
          display: "block",
        }}
      />
    </Box>
  );
};

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

  const pageCacheRef = useRef<Map<number, MetadataRow[]>>(new Map());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const [cacheVersion, setCacheVersion] = useState(0);

  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const imageCacheRef = useRef<ImageCache>(new Map());

  const numericProjectId = projectId;
  const numericProtocolId = protocolId;

  const visibleCount =
    Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
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

  const gridTemplateColumns = useMemo(
    () =>
      schema
        ? `repeat(${schema.columns.length}, ${COLUMN_WIDTH}px)`
        : undefined,
    [schema]
  );

  // ---------------------------------------------------------------------------
  // Clean image cache when table/output/protocol/project changes or unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      const cache = imageCacheRef.current;
      for (const entry of cache.values()) {
        entry.revoke();
      }
      cache.clear();
    };
  }, []);

  useEffect(() => {
    const cache = imageCacheRef.current;
    for (const entry of cache.values()) {
      entry.revoke();
    }
    cache.clear();
  }, [selectedTable, numericProjectId, numericProtocolId, outputName]);

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

    pageCacheRef.current = new Map();
    loadingPagesRef.current = new Set();
    setScrollTop(0);
    setTotalRows(0);
    setSchema(null);
    setSchemaError(null);
    setSchemaLoading(true);
    setCacheVersion((v) => v + 1);

    // Schema
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

    // First page
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
  // Load additional pages on scroll
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
        } catch {
          // ignore individual page errors for now
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
      if (!schema || totalRows === 0) {
        return [] as { index: number; row: MetadataRow | null }[];
      }
      const items: { index: number; row: MetadataRow | null }[] = [];
      const end = Math.min(endIndex, totalRows - 1);
      for (let i = startIndex; i <= end; i++) {
        const page = Math.floor(i / PAGE_SIZE) + 1;
        const indexInPage = i - (page - 1) * PAGE_SIZE;
        const pageRows = pageCacheRef.current.get(page);
        const row =
          pageRows && pageRows[indexInPage] ? pageRows[indexInPage] : null;
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
  const innerMinWidth =
    schema && schema.columns.length > 0
      ? schema.columns.length * COLUMN_WIDTH
      : undefined;

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
      <Box
        sx={{
          display: "flex",
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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
                {t.alias || t.name}
                {typeof t.rowCount === "number"
                  ? ` (${t.rowCount} rows)`
                  : ""}
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

      {/* Table body with vertical + horizontal scroll */}
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
              display: "grid",
              gridTemplateColumns,
              borderBottom: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
            }}
          >
            {schema.columns.map((col) => (
              <Box
                key={col.name}
                sx={{
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
            overflowX: "auto",
            overflowY: "auto",
            backgroundColor: "#ffffff",
          }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {schema && totalRows > 0 ? (
            <Box
              sx={{
                position: "relative",
                height: innerHeight,
                minWidth: innerMinWidth,
              }}
            >
              {visibleRows.map(({ index, row }) => (
                <Box
                  key={row ? row.id : `placeholder-${index}`}
                  sx={{
                    position: "absolute",
                    top: index * ROW_HEIGHT,
                    left: 0,
                    display: "grid",
                    gridTemplateColumns,
                    height: ROW_HEIGHT,
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: "0.75rem",
                    alignItems: "center",
                  }}
                >
                  {schema.columns.map((col, colIdx) => {
                    const cell = row?.values?.[colIdx];
                    const isImageCell =
                      row &&
                      col.rendererType === "image" &&
                      cell &&
                      typeof cell === "object" &&
                      (cell as any).kind === "image";

                    return (
                      <Box
                        key={col.name}
                        sx={{
                          px: 1,
                          py: 0.5,
                          borderRight: "1px solid #fafafa",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: row ? "text.primary" : "text.disabled",
                        }}
                      >
                        {!row ? (
                          "Loading…"
                        ) : isImageCell && selectedTable ? (
                          <MetadataImageCell
                            projectId={numericProjectId}
                            protocolId={numericProtocolId}
                            outputName={outputName}
                            tableName={selectedTable}
                            rowId={row.id}
                            columnName={col.name}
                            cacheRef={imageCacheRef}
                          />
                        ) : (
                          renderTextCellValue(cell, col)
                        )}
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
