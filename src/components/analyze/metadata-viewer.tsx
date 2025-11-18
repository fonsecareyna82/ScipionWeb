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
  Slider,
} from "@mui/material";
import { useProjectService } from "@/ProjectServiceContext";
import {
    fetchMetadataImageCellObjectUrl,
    fetchMetadataTablePage,
  fetchMetadataTableSchema,
  fetchOutputMetadataTables,
  type MetadataCell,
  type MetadataColumn,
  type MetadataPage,
  type MetadataRow,
  type MetadataTableInfo,
  type MetadataTableSchema,
} from "@/api/projects";

export interface MetadataViewerProps {
  projectId: number;
  protocolId: number;
  outputName: string;
}

// Base thumbnail size for image cells (larger by default)
const BASE_THUMB_SIZE = 200;
const PAGE_SIZE = 200;

type SelectedImageCell = {
  tableName: string;
  rowId: number;
  columnName: string;
};

type ImageCacheEntry = { url: string; revoke: () => void };

function isImageCell(value: MetadataCell): value is { kind: "image"; path: string } {
  return typeof value === "object" && value !== null && (value as any).kind === "image";
}

function isMatrixCell(value: MetadataCell): value is { kind: "matrix"; value: any } {
  return typeof value === "object" && value !== null && (value as any).kind === "matrix";
}

type MetadataImageCellProps = {
  projectId: number;
  protocolId: number;
  outputName: string;
  tableName: string;
  rowId: number | string;
  columnName: string;
  cacheRef: React.MutableRefObject<Map<string, ImageCacheEntry>>;
  size: number;
  isSelected?: boolean;
  onClick?: () => void;
};

const MetadataImageCell: React.FC<MetadataImageCellProps> = ({
  projectId,
  protocolId,
  outputName,
  tableName,
  rowId,
  columnName,
  cacheRef,
  size,
  isSelected,
  onClick,
}) => {
  const svc = useProjectService();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = useMemo(
    () =>
      `${projectId}:${protocolId}:${outputName}:${tableName}:${rowId}:${columnName}:${size}`,
    [projectId, protocolId, outputName, tableName, rowId, columnName, size],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      try {
        setError(null);
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setUrl(cached.url);
          return;
        }
        setLoading(true);
        const { url, revoke } = await fetchMetadataImageCellObjectUrl(
          projectId,
          protocolId,
          outputName,
          tableName,
          rowId,
          columnName,
          {
            size,
            applyTransform: false,
            inline: true,
            format: "png",
          },
        );
        if (cancelled) {
          revoke();
          return;
        }
        cacheRef.current.set(cacheKey, { url, revoke });
        setUrl(url);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load image");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadImage();
    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    cacheRef,
    svc,
    projectId,
    protocolId,
    outputName,
    tableName,
    rowId,
    columnName,
    size,
  ]);

  return (
    <Box
      onClick={onClick}
      sx={{
        width: size,
        height: size,
        borderRadius: 1,
        border: isSelected ? "2px solid #1976d2" : "1px solid rgba(0,0,0,0.18)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        backgroundColor: "#fafafa",
      }}
    >
      {loading && <CircularProgress size={20} />}
      {!loading && error && (
        <Typography
          variant="caption"
          color="error"
          sx={{ p: 0.5, textAlign: "center" }}
        >
          img error
        </Typography>
      )}
      {!loading && !error && url && (
        <img
          src={url}
          alt={columnName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      )}
    </Box>
  );
};

export const MetadataViewer: React.FC<MetadataViewerProps> = ({
  projectId,
  protocolId,
  outputName,
}) => {
  const svc = useProjectService();

  const [tables, setTables] = useState<MetadataTableInfo[] | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<string | "">("");

  const [schema, setSchema] = useState<MetadataTableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [rows, setRows] = useState<MetadataRow[]>([]);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);

  // Image selection and zoom
  const [selectedImageCell, setSelectedImageCell] =
    useState<SelectedImageCell | null>(null);
  const [imageZoom, setImageZoom] = useState<number>(1);

  // Cache for image URLs
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());

  // Table scroll ref for infinite loading
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const hasImageColumns = useMemo(
    () => schema?.columns.some((c) => c.rendererType === "image") ?? false,
    [schema],
  );

  // Cleanup image cache on unmount
  useEffect(() => {
    return () => {
      imageCacheRef.current.forEach((entry) => entry.revoke());
      imageCacheRef.current.clear();
    };
  }, []);

  // Reset selection and zoom when table changes
  useEffect(() => {
    setSelectedImageCell(null);
    setImageZoom(1);
  }, [selectedTable, projectId, protocolId, outputName]);

  // Load tables list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setTablesLoading(true);
        setTablesError(null);
        const list = await fetchOutputMetadataTables(
          projectId,
          protocolId,
          outputName,
        );
        if (cancelled) return;
        setTables(list || []);
        if (list && list.length > 0 && !selectedTable) {
          setSelectedTable(list[0].name);
        }
      } catch (e: any) {
        if (!cancelled) {
          setTablesError(e?.message || "Failed to load metadata tables");
        }
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, protocolId, outputName, svc]);

  // Load schema + first page when selectedTable changes
  useEffect(() => {
    if (!selectedTable) {
      setSchema(null);
      setRows([]);
      setTotalRows(null);
      setNextPage(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setSchemaLoading(true);
        setPageLoading(true);
        setSchemaError(null);
        setPageError(null);

        const [schemaRes, pageRes]: [MetadataTableSchema, MetadataPage] =
          await Promise.all([
            fetchMetadataTableSchema(
              projectId,
              protocolId,
              outputName,
              selectedTable,
            ),
            fetchMetadataTablePage(
              projectId,
              protocolId,
              outputName,
              selectedTable,
              {
                page: 1,
                pageSize: PAGE_SIZE,
                sortBy: "id",
                asc: true,
                selectionOnly: false,
              },
            ),
          ]);

        if (cancelled) return;

        setSchema(schemaRes);
        setRows(pageRes.rows || []);
        setTotalRows(pageRes.totalRows ?? pageRes.rows.length);

        const fetched = (pageRes.pageNumber || 1) * (pageRes.pageSize || PAGE_SIZE);
        if (pageRes.totalRows && fetched < pageRes.totalRows) {
          setNextPage((pageRes.pageNumber || 1) + 1);
        } else {
          setNextPage(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message || "Failed to load metadata";
          setSchemaError(msg);
          setPageError(msg);
          setSchema(null);
          setRows([]);
          setTotalRows(null);
          setNextPage(null);
        }
      } finally {
        if (!cancelled) {
          setSchemaLoading(false);
          setPageLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTable, projectId, protocolId, outputName, svc]);

  const loadMoreRows = async () => {
    if (!selectedTable || nextPage == null || pageLoading) return;
    let cancelled = false;
    try {
      setPageLoading(true);
      setPageError(null);
      const pageRes = await fetchMetadataTablePage(
        projectId,
        protocolId,
        outputName,
        selectedTable,
        {
          page: nextPage,
          pageSize: PAGE_SIZE,
          sortBy: "id",
          asc: true,
          selectionOnly: false,
        },
      );
      if (cancelled) return;

      setRows((prev) => [...prev, ...(pageRes.rows || [])]);
      setTotalRows(pageRes.totalRows ?? pageRes.rows.length);

      const fetched = (pageRes.pageNumber || nextPage) * (pageRes.pageSize || PAGE_SIZE);
      if (pageRes.totalRows && fetched < pageRes.totalRows) {
        setNextPage((pageRes.pageNumber || nextPage) + 1);
      } else {
        setNextPage(null);
      }
    } catch (e: any) {
      if (!cancelled) {
        setPageError(e?.message || "Failed to load more rows");
      }
    } finally {
      if (!cancelled) setPageLoading(false);
    }
  };

  // Infinite scroll: load more BEFORE reaching the bottom to make it smoother
  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    if (!nextPage || pageLoading) return;
    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const thresholdPx = el.clientHeight * 0.7; // start loading well before the end
    if (distanceToBottom < thresholdPx) {
      void loadMoreRows();
    }
  };

  const handleTableChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    setSelectedTable(value);
  };

  const displayedRowCount = rows.length;
  const totalRowCount = totalRows ?? rows.length;

  const currentZoomLabel =
    imageZoom === 1 ? "Zoom ×1" : `Zoom ×${imageZoom.toFixed(1)}`;

  const canZoom = Boolean(
    selectedImageCell && hasImageColumns && selectedTable,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
      {/* Header controls */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 1.5,
          flexWrap: "wrap",
        }}
      >
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="metadata-table-select-label">Table</InputLabel>
          <Select
            labelId="metadata-table-select-label"
            label="Table"
            value={selectedTable}
            onChange={handleTableChange}
            disabled={tablesLoading || !!tablesError || !tables?.length}
          >
            {tablesLoading && (
              <MenuItem value="">
                <em>Loading tables...</em>
              </MenuItem>
            )}
            {!tablesLoading && tablesError && (
              <MenuItem value="">
                <em>Error loading tables</em>
              </MenuItem>
            )}
            {!tablesLoading &&
              !tablesError &&
              tables &&
              tables.map((t) => (
                <MenuItem key={t.name} value={t.name}>
                  {t.alias || t.name}{" "}
                  {typeof t.rowCount === "number"
                    ? ` (${t.rowCount} rows)`
                    : ""}
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Typography variant="caption" color="text.secondary">
            Output: {outputName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Rows: {displayedRowCount} / {totalRowCount}
          </Typography>
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Zoom control for image cells (slider/spinner-like) */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 220,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Zoom
          </Typography>
          <Slider
            size="small"
            min={1}
            max={3}
            step={0.25}
            value={imageZoom}
            onChange={(_, value) => {
              if (!canZoom) return;
              const v = Array.isArray(value) ? value[0] : value;
              setImageZoom(v as number);
            }}
            disabled={!canZoom}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) =>
              `×${(v as number)
                .toFixed(2)
                .replace(/\.00$/, "")
                .replace(/(\.\d)0$/, "$1")}`
            }
            sx={{ width: 140 }}
          />
          <Typography
            variant="caption"
            color={canZoom ? "text.secondary" : "text.disabled"}
            sx={{ minWidth: 70 }}
          >
            {canZoom ? currentZoomLabel : "Select image"}
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      {tablesError && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            {tablesError}
          </Typography>
        </Box>
      )}

      {!tablesError && !selectedTable && !tablesLoading && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No metadata tables available for this output.
          </Typography>
        </Box>
      )}

      {(schemaLoading || pageLoading) && rows.length === 0 ? (
        <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
          <CircularProgress size={18} />
          <Typography variant="body2">
            Loading metadata for {outputName}...
          </Typography>
        </Box>
      ) : schemaError && rows.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            {schemaError}
          </Typography>
        </Box>
      ) : schema && rows.length > 0 ? (
        <TableContainer
          component={Paper}
          sx={{
            flex: 1,
            minHeight: 0,
            maxHeight: 520,
            borderRadius: 1,
            overflow: "auto",
          }}
          ref={scrollRef}
          onScroll={handleScroll}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              tableLayout: "fixed",
              minWidth: Math.max(800, schema.columns.length * 180),
            }}
          >
            <TableHead>
              <TableRow>
                {schema.columns.map((col) => (
                  <TableCell
                    key={col.name}
                    sx={{
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderBottom: "1px solid rgba(0,0,0,0.12)",
                      backgroundColor: "#fafafa",
                    }}
                  >
                    {col.alias || col.name}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                // Determine row height based on image zoom and selection
                let rowHeight = 28;
                if (hasImageColumns) {
                  const isRowZoomed =
                    Boolean(selectedImageCell) &&
                    selectedImageCell!.tableName === selectedTable &&
                    selectedImageCell!.rowId === row.id &&
                    imageZoom > 1;
                  const effectiveThumb = BASE_THUMB_SIZE * (isRowZoomed ? imageZoom : 1);
                  rowHeight = effectiveThumb;
                }

                return (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{
                      height: rowHeight,
                      "&:last-child td, &:last-child th": { borderBottom: 0 },
                    }}
                  >
                    {schema.columns.map((col: MetadataColumn) => {
                      const value: MetadataCell | undefined =
                        row.values[col.index] ?? undefined;

                      // Image cell
                      if (col.rendererType === "image" && value && isImageCell(value)) {
                        const isSelectedImage: boolean =
                          !!selectedImageCell &&
                          !!selectedTable &&
                          selectedImageCell.tableName === selectedTable &&
                          selectedImageCell.rowId === row.id &&
                          selectedImageCell.columnName === col.name;

                        const effectiveSize =
                          imageZoom > 1 && isSelectedImage
                            ? BASE_THUMB_SIZE * imageZoom
                            : BASE_THUMB_SIZE;

                        return (
                          <TableCell
                            key={col.name}
                            sx={{
                              verticalAlign: "middle",
                              padding: 0.5,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <MetadataImageCell
                                projectId={projectId}
                                protocolId={protocolId}
                                outputName={outputName}
                                tableName={selectedTable}
                                rowId={row.id}
                                columnName={col.name}
                                cacheRef={imageCacheRef}
                                size={effectiveSize}
                                isSelected={isSelectedImage}
                                onClick={() =>
                                  setSelectedImageCell({
                                    rowId: row.id,
                                    columnName: col.name,
                                    tableName: selectedTable,
                                  })
                                }
                              />
                            </Box>
                          </TableCell>
                        );
                      }

                      // Matrix cell: render small summary
                      if (col.rendererType === "matrix" && value && isMatrixCell(value)) {
                        const mat = value.value;
                        let summary = "";
                        if (Array.isArray(mat) && mat.length > 0) {
                          const r = mat.length;
                          const c = Array.isArray(mat[0]) ? mat[0].length : 0;
                          summary = `Matrix ${r}×${c}`;
                        } else {
                          summary = "Matrix";
                        }
                        return (
                          <TableCell
                            key={col.name}
                            sx={{
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              overflow: "hidden",
                              maxWidth: 210,
                            }}
                          >
                            <Typography variant="body2" noWrap>
                              {summary}
                            </Typography>
                          </TableCell>
                        );
                      }

                      // Primitive values
                      let displayValue: string = "";
                      if (typeof value === "number") {
                        if (col.decimals != null && Number.isFinite(value)) {
                          displayValue = value.toFixed(col.decimals);
                        } else {
                          displayValue = String(value);
                        }
                      } else if (typeof value === "boolean") {
                        displayValue = value ? "true" : "false";
                      } else if (typeof value === "string") {
                        displayValue = value;
                      } else if (value == null) {
                        displayValue = "";
                      } else {
                        displayValue = JSON.stringify(value);
                      }

                      return (
                        <TableCell
                          key={col.name}
                          sx={{
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            maxWidth: 220,
                          }}
                          title={displayValue}
                        >
                          <Typography variant="body2" noWrap>
                            {displayValue}
                          </Typography>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        !schemaLoading &&
        !schemaError &&
        selectedTable && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No rows to display.
            </Typography>
          </Box>
        )
      )}

      {/* Small footer with errors / loading more */}
      <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 2 }}>
        {pageError && (
          <Typography variant="caption" color="error">
            {pageError}
          </Typography>
        )}
        {pageLoading && rows.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption">Loading more rows...</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};
