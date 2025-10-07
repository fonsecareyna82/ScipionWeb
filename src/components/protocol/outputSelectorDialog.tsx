// src/components/outputSelectorDialog.tsx
import React, { useMemo, useState, useEffect } from "react";
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
  Checkbox,
} from "@mui/material";
import { CheckCircle as CheckIcon, X as CloseIcon } from "lucide-react";

interface Output {
  _key?: string;
  _class: string;
  _objValue: string;
  info: string;
  _protocolId: string;
  protocol?: string;
}

interface OutputSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  expectedClass?: string | string[];
  allOutputs: Output[];
  onSelect: (output: Output | Output[]) => void;
  multiSelect?: boolean;
}

const OutputSelectorDialog: React.FC<OutputSelectorDialogProps> = ({
  open,
  onClose,
  expectedClass,
  allOutputs,
  onSelect,
  multiSelect = false,
}) => {
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setHighlightedId(null);
    }
  }, [open]);

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
          o._protocolId?.toLowerCase().includes(q) ||
          o.protocol?.toLowerCase().includes(q)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
        const idA = parseInt(a._protocolId, 10) || 0;
        const idB = parseInt(b._protocolId, 10) || 0;
        return idB - idA;
      });
      
      return sorted;
  }, [allOutputs, expectedClass, filter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const handleConfirm = () => {
    if (multiSelect) {
      const selected = matchingOutputs.filter((o) =>
        selectedIds.has(o._objValue || o._protocolId)
      );
      onSelect(selected);
    } else if (highlightedId) {
      const selected = matchingOutputs.find(
        (o) => (o._objValue || o._protocolId) === highlightedId
      );
      if (selected) onSelect(selected);
    }
    onClose();
  };

  const handleDoubleClick = (o: Output) => {
    if (multiSelect) return;
    onSelect(o);
    onClose();
  };

  const handleSingleClick = (o: Output) => {
    if (multiSelect) return;
    const id = o._objValue || o._protocolId;
    setHighlightedId((prev) => (prev === id ? null : id));
  };

  const isRowSelected = (o: Output) => {
    const id = o._objValue || o._protocolId;
    return multiSelect ? selectedIds.has(id) : highlightedId === id;
  };

  const hasSelection = multiSelect
    ? selectedIds.size > 0
    : highlightedId !== null;

  const confirmLabel = multiSelect
    ? `Confirm (${selectedIds.size})`
    : "Confirm";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      {/* === HEADER === */}
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(90deg, #e0e0e0 0%, #d5d5d5 100%)",
          borderBottom: "1px #bbb",
          py: 1.2,
          px: 2,
          fontWeight: 100,
          fontSize: 18
        }}
      >
        {multiSelect ? "Select compatible outputs" : "Select compatible output"}
        <IconButton onClick={onClose} size="small">
          <CloseIcon size={18} />
        </IconButton>
      </DialogTitle>

      {/* === BODY === */}
      <DialogContent sx={{ p: 2 }}>
        <Box sx={{ mb: 2, mt: 2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter outputs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Box>

        <Typography
          variant="body2"
          sx={{ mb: 1, color: "#555", fontStyle: "italic" }}
        >
          Showing {matchingOutputs.length} compatible output
          {matchingOutputs.length !== 1 ? "s" : ""}
        </Typography>

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
                {multiSelect && (
                  <TableCell
                    sx={{ width: "5%", textAlign: "center", background: "#d5d5d5" }}
                  >
                    ✓
                  </TableCell>
                )}
                <TableCell sx={{ width: "15%", background: "#d5d5d5" }}>
                  Protocol ID
                </TableCell>
                <TableCell sx={{ width: "40%", background: "#d5d5d5" }}>
                  Protocol Label
                </TableCell>
                <TableCell sx={{ width: "40%", background: "#d5d5d5" }}>
                  Info
                </TableCell>
                <TableCell sx={{ width: "20%", background: "#d5d5d5" }}>
                  Class
                </TableCell>
                {!multiSelect && (
                  <TableCell
                    sx={{ width: "10%", textAlign: "center", background: "#d5d5d5" }}
                  >
                    Action
                  </TableCell>
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {matchingOutputs.map((o, i) => {
                const id = o._objValue || o._protocolId;
                const isSelected = isRowSelected(o);
                const rowBg = isSelected ? "#b5f0b2" : i % 2 === 0 ? "#fafafa" : "#ffffff";

                return (
                  <TableRow
                    key={id}
                    onClick={() => handleSingleClick(o)}
                    onDoubleClick={() => handleDoubleClick(o)}
                    sx={{
                      cursor: "pointer",
                      backgroundColor: rowBg,
                      "&:hover": {
                        backgroundColor: isSelected ? rowBg : "#f1faf1",
                      },
                      borderLeft: isSelected
                        ? "4px solid #4caf50"
                        : "4px solid transparent",
                      transition: "border-left 0.15s ease-in-out",
                    }}
                  >
                    {multiSelect && (
                      <TableCell sx={{ textAlign: "center" }}>
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(id);
                          }}
                          color="success"
                        />
                      </TableCell>
                    )}

                    {/* === Protocol ID chip === */}
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          display: "inline-block",
                          px: 1,
                          py: 0.3,
                          borderRadius: "16px",
                          backgroundColor: "#e0e0e0",
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          color: "#333",
                        }}
                        title={o._protocolId}
                      >
                        {o._protocolId || "—"}
                      </Box>
                    </TableCell>

                    {/* === Protocol Label === */}
                    <TableCell title={o.protocol}>{o.protocol || "—"}</TableCell>

                    <TableCell title={o.info}>{o.info || "—"}</TableCell>
                    <TableCell title={o._class}>{o._class}</TableCell>

                    {!multiSelect && (
                      <TableCell sx={{ textAlign: "center" }}>
                        <Tooltip title="Confirm this output">
                          <IconButton
                            color="success"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(o);
                              onClose();
                            }}
                          >
                            <CheckIcon size={18} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {matchingOutputs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={multiSelect ? 5 : 6}
                    sx={{ textAlign: "center", opacity: 0.7 }}
                  >
                    No compatible outputs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>

      {/* === FOOTER === */}
      <DialogActions
        sx={{
          justifyContent: "center",
          borderTop: "1px solid #ddd",
          gap: 2,
        }}
      >
        <Button onClick={onClose} variant="outlined" size="small">
          Close
        </Button>

        <Button
          onClick={handleConfirm}
          variant="contained"
          color="success"
          size="small"
          disabled={!hasSelection}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OutputSelectorDialog;
