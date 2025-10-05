import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tooltip,
  IconButton,
  Box,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle as CheckIcon, X as CloseIcon } from "lucide-react";

interface Output {
  _key?: string;
  _class: string;
  _objValue: string;
  info: string;
  _parentId: string;
  protocol?: string; // ✅ añadimos esto por si queremos mostrar el label del protocolo
}

interface OutputSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  expectedClass?: string | string[];
  allOutputs: Output[];
  onSelect: (output: Output) => void;
}

const OutputSelectorDialog: React.FC<OutputSelectorDialogProps> = ({
  open,
  onClose,
  expectedClass,
  allOutputs,
  onSelect,
}) => {
  const [filter, setFilter] = useState("");

  // Filter & match logic
  const matchingOutputs = useMemo(() => {
    if (!allOutputs) return [];

    let filtered = allOutputs;
    if (expectedClass) {
      const classes = Array.isArray(expectedClass)
        ? expectedClass.map((c) => c.toLowerCase())
        : [expectedClass.toLowerCase()];
      filtered = filtered.filter((o) => classes.includes(o._class?.toLowerCase()));
    }

    if (filter.trim()) {
      const q = filter.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o._class?.toLowerCase().includes(q) ||
          o.info?.toLowerCase().includes(q) ||
          o._objValue?.toLowerCase().includes(q) ||
          o._parentId?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [allOutputs, expectedClass, filter]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      {/* === HEADER === */}
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(90deg, #e0e0e0 0%, #d5d5d5 100%)",
          borderBottom: "1px solid #bbb",
          py: 1.2,
          px: 2,
          fontWeight: 600,
        }}
      >
        Select compatible output
        <IconButton onClick={onClose} size="small">
          <CloseIcon size={18} />
        </IconButton>
      </DialogTitle>

      {/* === BODY === */}
      <DialogContent sx={{ p: 2 }}>
        {/* Search bar */}
        <Box sx={{ mb: 2, mt: 2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter outputs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Box>

        {/* Count of visible results */}
        <Typography
          variant="body2"
          sx={{ mb: 1, color: "#555", fontStyle: "italic" }}
        >
          Showing {matchingOutputs.length} compatible output
          {matchingOutputs.length !== 1 ? "s" : ""}
        </Typography>

        {/* Table */}
        <Box
          sx={{
            border: "1px solid #ddd",
            borderRadius: 1,
            overflow: "auto",
            maxHeight: 460,
          }}
        >
          <Table
            size="small"
            stickyHeader
            sx={{
              tableLayout: "fixed",
              "& .MuiTableCell-root": { fontSize: "0.85rem" },
            }}
          >
            <TableHead>
              <TableRow
                sx={{
                  backgroundColor: "#e0e0e0",
                  "& th": {
                    fontWeight: 700,
                    borderBottom: "2px solid #bbb",
                    color: "black",
                    textTransform: "none",
                    fontSize: "0.8rem",
                  },
                }}
              >
                <TableCell sx={{ width: "10%", background: "#d5d5d5" }}>ID</TableCell>
                <TableCell sx={{ width: "35%", background: "#d5d5d5" }}>Info</TableCell>
                <TableCell sx={{ width: "25%", background: "#d5d5d5" }}>Class</TableCell>
                <TableCell sx={{ width: "20%", background: "#d5d5d5" }}>Protocol</TableCell>
                <TableCell
                  sx={{ width: "10%", textAlign: "center", background: "#d5d5d5" }}
                >
                  Action
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {matchingOutputs.map((o, i) => (
                <TableRow
                  key={i}
                  hover
                  sx={{
                    cursor: "pointer",
                    backgroundColor: i % 2 === 0 ? "#fafafa" : "#ffffff",
                    "&:hover": { backgroundColor: "#f1faf1" },
                  }}
                  onClick={() => onSelect(o)}
                >
                  <TableCell title={o._parentId}>{o._parentId}</TableCell>
                  <TableCell title={o.info}>{o.info || "—"}</TableCell>
                  <TableCell title={o._class}>{o._class}</TableCell>
                  <TableCell title={o.protocol}>{o.protocol || "—"}</TableCell>
                  <TableCell sx={{ textAlign: "center" }}>
                    <Tooltip title="Select this output">
                      <IconButton color="success" size="small">
                        <CheckIcon size={18} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}

              {matchingOutputs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", opacity: 0.7 }}>
                    No compatible outputs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>

      {/* === FOOTER === */}
      <DialogActions sx={{ justifyContent: "center", borderTop: "1px solid #ddd" }}>
        <Button onClick={onClose} variant="outlined" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OutputSelectorDialog;
