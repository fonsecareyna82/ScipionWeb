import { memo } from "react";
import { Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import { CloseIcon } from "@/icons";
import type { TableViewContext, TableViewData } from "@/services/ProjectService";
import TableViewerPane from "./table-viewer-pane";

export type TableViewerDialogProps = {
  open: boolean;
  onClose: () => void;
  context: TableViewContext;
  tableData: TableViewData;
  title: string;
  pointerClass?: string;
  protocolLabel?: string;
  emptyPaneMessage?: string;
};

const dialogPaperSx = {
  borderRadius: 2,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 10px 20px rgba(0,0,0,0.15), 0 6px 10px rgba(0,0,0,0.08)",
  display: "flex",
  flexDirection: "column",
  width: "93vw",
  maxWidth: "93vw",
  height: "97vh",
  maxHeight: "98vh",
  minHeight: 650,
};

const headerSx = {
  px: 2,
  py: 1.25,
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  background: "linear-gradient(180deg, #0b1220 0%, #0a0f1e 100%)",
  color: "#e5e7eb",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  flexShrink: 0,
};

const closeBtnSx = {
  ml: "auto",
  color: "#e5e7eb",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  "&:hover": { background: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.28)" },
};

function TableViewerDialog({
  open,
  onClose,
  context,
  tableData,
  title,
  pointerClass,
  protocolLabel,
  emptyPaneMessage,
}: TableViewerDialogProps) {
  const handleDialogClose = (_event: object, reason: "backdropClick" | "escapeKeyDown") => {
    if (reason === "backdropClick") return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth={false}
      fullWidth
      PaperProps={{ sx: dialogPaperSx }}
      onDoubleClickCapture={(event) => {
        event.stopPropagation();
      }}
    >
      <DialogTitle component="div" sx={headerSx}>
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 0.25, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                color: "#f3f4f6",
                fontWeight: 600,
                letterSpacing: 0.2,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </Typography>
            {pointerClass ? (
              <Chip
                size="small"
                label={pointerClass}
                sx={{
                  height: 22,
                  color: "#e5e7eb",
                  bgcolor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  "& .MuiChip-label": { px: 1, py: 0.25 },
                }}
              />
            ) : null}
          </Box>
          {protocolLabel ? (
            <Typography
              variant="caption"
              sx={{
                color: "rgba(229,231,235,0.78)",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              Protocol: {protocolLabel}
            </Typography>
          ) : null}
        </Box>
        <IconButton onClick={onClose} aria-label="Close table viewer" size="small" sx={closeBtnSx}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent
        dividers={false}
        sx={{ p: 0, display: "flex", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}
      >
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          <TableViewerPane
            context={context}
            tableData={tableData}
            title={title}
            emptyPaneMessage={emptyPaneMessage}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default memo(TableViewerDialog);
