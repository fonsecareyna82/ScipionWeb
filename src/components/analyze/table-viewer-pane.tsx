import { useCallback, useState } from "react";
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
  Typography,
} from "@mui/material";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import type {
  TableViewContext,
  TableViewData,
  TableViewPaneContent,
  TableViewRow,
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
  content: TableViewPaneContent;
};

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
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
    case "plotly":
      return (
        <Box sx={{ p: 1, height: "100%", minHeight: 0 }}>
          <Plot
            data={(content.figure.data as any[]) ?? []}
            layout={{
              ...(content.figure.layout as Record<string, unknown> | undefined),
              autosize: true,
              margin: { l: 40, r: 16, t: content.title ? 40 : 16, b: 40 },
              title: content.title,
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

  const handleRowAction = useCallback(
    async (row: TableViewRow, actionId: string, actionLabel: string) => {
      setPaneLoading(true);
      setPaneError(null);
      try {
        const content = await svc.resolveTableViewPane({
          ...context,
          rowId: row.id,
          actionId,
          row,
        });
        setActivePane({ row, actionId, actionLabel, content });
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
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align ?? "left"}
                      sx={{ width: col.width, fontWeight: 600, whiteSpace: "nowrap" }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                  {showActionsColumn && (
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      Actions
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const isActive = activePane?.row.id === row.id;
                  return (
                    <TableRow
                      key={String(row.id)}
                      hover
                      selected={isActive}
                      sx={{ "&.Mui-selected": { bgcolor: "action.selected" } }}
                    >
                      {columns.map((col) => (
                        <TableCell key={col.id} align={col.align ?? "left"}>
                          {formatCell(row.cells[col.id])}
                        </TableCell>
                      ))}
                      {showActionsColumn && (
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          {(row.actions ?? []).map((action) => (
                            <Button
                              key={action.id}
                              size="small"
                              variant={isActive && activePane?.actionId === action.id ? "contained" : "text"}
                              onClick={() => void handleRowAction(row, action.id, action.label)}
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
          <Typography variant="subtitle2" noWrap title={paneTitle}>
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
