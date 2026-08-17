import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";

import { CloseIcon } from "@/icons";
import type {
  TableViewerContext,
  TableViewerData,
} from "@/services/ProjectService";
import TableViewerPane from "./table-viewer-pane";

type TableViewerDialogProps = {
  open: boolean;
  onClose: () => void;
  context: TableViewerContext;
  table: TableViewerData;
  title?: string;
  protocolLabel?: string;
};

export default function TableViewerDialog({
  open,
  onClose,
  context,
  table,
  title,
  protocolLabel = "",
}: TableViewerDialogProps) {
  const resolvedTitle =
    title ||
    table.title ||
    context.outputName;

  const handleClose = (
    _event: object,
    reason:
      | "backdropClick"
      | "escapeKeyDown",
  ) => {
    if (
      reason ===
      "backdropClick"
    ) {
      return;
    }

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: "96vw",
          maxWidth: "96vw",
          height: "94vh",
          maxHeight: "94vh",
          minHeight: 650,
          m: 0,
          borderRadius: 2.5,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border:
            "1px solid #dbe2ea",
          backgroundColor:
            "#ffffff",
          boxShadow:
            "0 24px 70px rgba(15,23,42,0.22)",
        },
      }}
      onDoubleClickCapture={(
        event,
      ) => {
        event.stopPropagation();
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          minHeight: 66,
          px: 2.25,
          py: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          flexShrink: 0,
          borderBottom:
            "1px solid #e5e7eb",
          backgroundColor:
            "#ffffff",
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            flex: 1,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems:
                "center",
              gap: 1,
              minWidth: 0,
            }}
          >
            <Typography
              sx={{
                color: "#0f172a",
                fontSize:
                  "1.05rem",
                lineHeight: 1.2,
                fontWeight: 700,
                overflow:
                  "hidden",
                textOverflow:
                  "ellipsis",
                whiteSpace:
                  "nowrap",
              }}
            >
              {resolvedTitle}
            </Typography>

            {context.pointerClass ? (
              <Chip
                size="small"
                label={
                  context.pointerClass
                }
                sx={{
                  height: 22,
                  borderRadius:
                    1.25,
                  color:
                    "#475569",
                  backgroundColor:
                    "#f1f5f9",
                  border:
                    "1px solid #e2e8f0",
                  fontSize:
                    "0.66rem",
                  fontWeight:
                    600,
                }}
              />
            ) : null}
          </Box>

          {protocolLabel ? (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.35,
                color: "#94a3b8",
                fontSize:
                  "0.68rem",
                overflow:
                  "hidden",
                textOverflow:
                  "ellipsis",
                whiteSpace:
                  "nowrap",
              }}
            >
              Protocol:{" "}
              {protocolLabel}
            </Typography>
          ) : null}
        </Box>

        <IconButton
          size="small"
          onClick={onClose}
          aria-label="Close table viewer"
          sx={{
            color: "#64748b",
            border:
              "1px solid #e2e8f0",
            backgroundColor:
              "#ffffff",
            "&:hover": {
              color: "#0f172a",
              backgroundColor:
                "#f8fafc",
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <TableViewerPane
          context={context}
          table={table}
        />
      </DialogContent>
    </Dialog>
  );
}