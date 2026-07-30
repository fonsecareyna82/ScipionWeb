import { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import TableViewerImageSlider from "./table-viewer-image-slider";
import type {
  TableViewColumn,
  TableViewContext,
  TableViewData,
  TableViewPaneContent,
  TableViewRow,
  TableViewRowAction,
} from "@/services/ProjectService";

export type TableViewerPaneProps = {
  /** Passed through to svc.resolveTableViewPane for row actions. */
  context: TableViewContext;
  /** Table columns/rows supplied by resolveAnalyzeViewer. */
  tableData: TableViewData;
  /** Optional title shown above the table. Overridden by tableData.title when present. */
  title?: string;
  /** Shown in the right pane before any row action is triggered. */
  emptyPaneMessage?: string;
  className?: string;
};

type ActivePane = {
  row: TableViewRow;
  actionId: string;
  actionLabel: string;
  columnId?: string;
  content: TableViewPaneContent;
};

type SortDirection = "asc" | "desc";

function compareCellValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }

  const aNum = typeof a === "number" ? a : Number(String(a));
  const bNum = typeof b === "number" ? b : Number(String(b));
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isColumnSortable(column: TableViewColumn): boolean {
  return column.sortable !== false;
}

function isNumericValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";

  if (isNumericValue(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  const str = String(value).trim();
  if (!str) return "";

  if (/^-?\d+\.\d+(?:[eE][+-]?\d+)?$/.test(str)) {
    const num = Number(str);
    if (Number.isFinite(num)) return num.toFixed(2);
  }

  if (/^-?\d+(?:[eE][+-]?\d+)?$/.test(str)) {
    return str;
  }

  return String(value);
}

function columnContentWidthCh(
  column: TableViewColumn,
  rows: TableViewRow[],
): number {
  if (column.width != null) {
    if (typeof column.width === "number") {
      return column.width / 8;
    }
    const match = String(column.width).match(/^([\d.]+)ch$/);
    if (match) return Number(match[1]);
  }

  let maxLen = column.label.length;
  for (const row of rows) {
    maxLen = Math.max(maxLen, formatCell(row.cells[column.id]).length);
  }

  const sortExtra = isColumnSortable(column) ? 2 : 0;
  const actionExtra = (column.actions?.length ?? 0) > 0 ? 1 : 0;
  return Math.min(Math.max(maxLen + sortExtra + actionExtra + 2, 6), 36);
}

function actionsColumnWidthCh(rows: TableViewRow[]): number {
  let maxLen = "Actions".length;
  for (const row of rows) {
    const labels = (row.actions ?? []).map((action) => action.label).join("  ");
    maxLen = Math.max(maxLen, labels.length + (row.actions?.length ?? 0) * 2);
  }
  return Math.min(Math.max(maxLen + 4, 10), 28);
}

const TABLE_PATH_CELL_FIELDS: Record<string, string> = {
  starFile: "starFilePath",
  alignedStack: "alignedStackPath",
  tomogram: "tomogramPath",
};

function pathTooltipForColumn(
  columnId: string,
  row: TableViewRow,
  formatted: string,
): string | undefined {
  const pathKey = TABLE_PATH_CELL_FIELDS[columnId];
  if (!pathKey) return undefined;
  const fullPath = row.cells[pathKey];
  if (fullPath == null || fullPath === "") return undefined;
  const pathText = String(fullPath);
  return pathText !== formatted ? pathText : undefined;
}

function TableCellContent({
  column,
  row,
  value,
  paneLoading,
  isActive,
  activeActionId,
  onAction,
}: {
  column: TableViewColumn;
  row: TableViewRow;
  value: unknown;
  paneLoading: boolean;
  isActive: boolean;
  activeActionId?: string;
  onAction: (row: TableViewRow, action: TableViewRowAction, columnId?: string) => void;
}) {
  const formatted = formatCell(value);
  const actions = column.actions ?? [];
  const pathTooltip = pathTooltipForColumn(column.id, row, formatted);
  if (!actions.length || !formatted) {
    return <>{formatted}</>;
  }

  if (actions.length === 1) {
    const action = actions[0];
    const selected = isActive && activeActionId === action.id;
    return (
      <Button
        size="small"
        variant="text"
        color={selected ? "primary" : "inherit"}
        onClick={() => onAction(row, action, column.id)}
        disabled={paneLoading}
        title={pathTooltip ?? action.label}
        sx={{
          p: 0,
          minWidth: 0,
          textTransform: "none",
          font: "inherit",
          letterSpacing: "inherit",
          justifyContent: "flex-start",
          textAlign: "inherit",
          color: selected ? "primary.main" : "text.primary",
          textDecoration: selected ? "underline" : "none",
          "&:hover": {
            textDecoration: "underline",
            bgcolor: "transparent",
          },
        }}
      >
        {formatted}
      </Button>
    );
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5 }}>
      <Box component="span">{formatted}</Box>
      {actions.map((action) => (
        <Button
          key={action.id}
          size="small"
          variant={isActive && activeActionId === action.id ? "contained" : "text"}
          onClick={() => onAction(row, action, column.id)}
          disabled={paneLoading}
          sx={{ textTransform: "none", minWidth: 0 }}
        >
          {action.label}
        </Button>
      ))}
    </Box>
  );
}

function TableViewerPaneContent({
  content,
}: {
  content: TableViewPaneContent;
}) {
  switch (content.kind) {
    case "text":
      return (
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            height: "100%",
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.75rem",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content.text}
        </Box>
      );
    case "html":
      return (
        <Box
          className="table-viewer-pane__html"
          sx={{ p: 2, overflow: "auto", height: "100%" }}
          dangerouslySetInnerHTML={{ __html: content.html }}
        />
      );
    case "iframe":
      return (
        <Box
          component="iframe"
          src={content.src}
          title={content.title ?? "Viewer"}
          sx={{ border: 0, width: "100%", height: "100%", minHeight: 0 }}
        />
      );
    case "image":
      return (
        <Box
          sx={{
            p: 2,
            height: "100%",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            component="img"
            src={content.src}
            alt={content.alt ?? content.title ?? "Preview"}
            sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </Box>
      );
    case "plotly": {
      const backendLayout = (content.figure.layout ?? {}) as Record<string, unknown>;
      const backendMargin = (backendLayout.margin ?? {}) as Record<string, number>;
      return (
        <Box sx={{ p: 1, height: "100%", minHeight: 0 }}>
          <Plot
            data={(content.figure.data as any[]) ?? []}
            layout={{
              ...backendLayout,
              autosize: true,
              margin: {
                l: backendMargin.l ?? 72,
                r: backendMargin.r ?? 16,
                t: content.title ? 40 : (backendMargin.t ?? 16),
                b: backendMargin.b ?? 56,
              },
              title: content.title ?? backendLayout.title,
            }}
            config={{
              ...(content.figure.config as Record<string, unknown> | undefined),
              responsive: true,
              displaylogo: false,
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </Box>
      );
    }
    case "imageSlider":
      return (
        <Box sx={{ height: "100%", minHeight: 0 }}>
          <TableViewerImageSlider content={content} />
        </Box>
      );
    case "empty":
    default:
      return (
        <Box
          sx={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          <Typography variant="body2">
            {content.message ?? "Select a row action to load a plot or viewer."}
          </Typography>
        </Box>
      );
  }
}

export default function TableViewerPane({
  context,
  tableData,
  title,
  emptyPaneMessage = "Select a row action to load a plot or viewer.",
  className,
}: TableViewerPaneProps) {
  const svc = useProjectService();

  const [activePane, setActivePane] = useState<ActivePane | null>(null);
  const [paneLoading, setPaneLoading] = useState(false);
  const [paneError, setPaneError] = useState<string | null>(null);
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleRowAction = useCallback(
    async (
      row: TableViewRow,
      action: TableViewRowAction,
      columnId?: string,
    ) => {
      setPaneLoading(true);
      setPaneError(null);
      try {
        const content = await svc.resolveTableViewPane({
          ...context,
          rowId: row.id,
          actionId: action.id,
          columnId,
          row,
        });
        setActivePane({
          row,
          actionId: action.id,
          actionLabel: action.label,
          columnId,
          content,
        });
      } catch (err) {
        console.error("[TableViewerPane] resolveTableViewPane failed:", err);
        setActivePane(null);
        setPaneError(err instanceof Error ? err.message : "Failed to load viewer.");
      } finally {
        setPaneLoading(false);
      }
    },
    [context, svc],
  );

  const headerTitle = tableData.title ?? title ?? "Table";
  const columns = tableData.columns ?? [];
  const rows = tableData.rows ?? [];
  const showActionsColumn = rows.some((row) => (row.actions?.length ?? 0) > 0);

  const handleSortColumn = useCallback((columnId: string) => {
    if (sortColumnId === columnId) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc" ? "desc" : "asc",
      );
      return;
    }
    setSortColumnId(columnId);
    setSortDirection("asc");
  }, [sortColumnId]);

  const sortedRows = useMemo(() => {
    if (!sortColumnId) return rows;

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const cmp = compareCellValues(
        left.cells[sortColumnId],
        right.cells[sortColumnId],
      );
      if (cmp !== 0) return cmp * direction;
      return compareCellValues(left.id, right.id) * direction;
    });
  }, [rows, sortColumnId, sortDirection]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, string> = {};
    for (const col of columns) {
      widths[col.id] = `${columnContentWidthCh(col, rows)}ch`;
    }
    if (showActionsColumn) {
      widths.__actions = `${actionsColumnWidthCh(rows)}ch`;
    }
    return widths;
  }, [columns, rows, showActionsColumn]);

  const paneTitle =
    activePane?.content.title ??
    (activePane
      ? `${activePane.actionLabel} — row ${String(activePane.row.id)}`
      : "Viewer");

  return (
    <Box
      className={["table-viewer-pane", className].filter(Boolean).join(" ")}
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid",
          borderColor: "divider",
        }}
      >
        <Paper
          square
          elevation={0}
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {headerTitle}
          </Typography>
        </Paper>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {rows.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No rows returned.
              </Typography>
            </Box>
          ) : (
            <Table
              size="small"
              stickyHeader
              sx={{ width: "max-content", minWidth: "100%", tableLayout: "auto" }}
            >
              <TableHead>
                <TableRow>
                  {columns.map((col) => {
                    const sortable = isColumnSortable(col);
                    const active = sortColumnId === col.id;
                    return (
                      <TableCell
                        key={col.id}
                        align={col.align ?? "left"}
                        sortDirection={active ? sortDirection : false}
                        sx={{
                          width: columnWidths[col.id],
                          minWidth: columnWidths[col.id],
                          maxWidth: columnWidths[col.id],
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {sortable ? (
                          <TableSortLabel
                            active={active}
                            direction={active ? sortDirection : "asc"}
                            onClick={() => handleSortColumn(col.id)}
                            sx={
                              col.align === "right"
                                ? { flexDirection: "row-reverse" }
                                : undefined
                            }
                          >
                            {col.label}
                          </TableSortLabel>
                        ) : (
                          col.label
                        )}
                      </TableCell>
                    );
                  })}
                  {showActionsColumn && (
                    <TableCell
                      align="right"
                      sx={{
                        width: columnWidths.__actions,
                        minWidth: columnWidths.__actions,
                        maxWidth: columnWidths.__actions,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Actions
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRows.map((row) => {
                  const isActive = activePane?.row.id === row.id;
                  return (
                    <TableRow
                      key={String(row.id)}
                      hover
                      selected={isActive}
                      sx={{ "&.Mui-selected": { bgcolor: "action.selected" } }}
                    >
                      {columns.map((col) => (
                        <TableCell
                          key={col.id}
                          align={col.align ?? "left"}
                          sx={{
                            width: columnWidths[col.id],
                            minWidth: columnWidths[col.id],
                            maxWidth: columnWidths[col.id],
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          <TableCellContent
                            column={col}
                            row={row}
                            value={row.cells[col.id]}
                            paneLoading={paneLoading}
                            isActive={isActive}
                            activeActionId={activePane?.actionId}
                            onAction={handleRowAction}
                          />
                        </TableCell>
                      ))}
                      {showActionsColumn && (
                        <TableCell
                          align="right"
                          sx={{
                            width: columnWidths.__actions,
                            minWidth: columnWidths.__actions,
                            maxWidth: columnWidths.__actions,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(row.actions ?? []).map((action) => (
                            <Button
                              key={action.id}
                              size="small"
                              variant={isActive && activePane?.actionId === action.id ? "contained" : "text"}
                              onClick={() => void handleRowAction(row, action)}
                              disabled={paneLoading}
                              sx={{ ml: 0.5, textTransform: "none", minWidth: 0 }}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Paper
          square
          elevation={0}
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ wordBreak: "break-all", whiteSpace: "normal" }}
            title={paneTitle}
          >
            {paneTitle}
          </Typography>
        </Paper>

        <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          {paneLoading && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(255,255,255,0.65)",
                zIndex: 1,
              }}
            >
              <CircularProgress size={28} />
            </Box>
          )}

          {paneError ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="body2" color="error">
                {paneError}
              </Typography>
            </Box>
          ) : activePane ? (
            <TableViewerPaneContent content={activePane.content} />
          ) : (
            <TableViewerPaneContent content={{ kind: "empty", message: emptyPaneMessage }} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
