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
  Chip,
  Stack,
  InputAdornment,
  Divider,
  Paper,
  TableContainer,
  alpha,
  useTheme,
} from "@mui/material";
import {
  CheckCircle as CheckIcon,
  X as CloseIcon,
  Search as SearchIcon,
  XCircle as ClearIcon,
} from "lucide-react";

interface Output {
  paramClass?: string;
  pointerClass?: string;
  _expectedClass?: string;
  value?: string;
  info?: string;
  parentId?: string | number;
  protocol?: string;
  key?: string;
}

function getPointerClass(o: Output): string {
  // getPointerClass
  return String(o.pointerClass ?? o._expectedClass ?? "");
}

function getParamClass(o: Output): string {
  // getParamClass
  const rawParamClass = String(o.paramClass ?? "");
  return rawParamClass || (getPointerClass(o) ? "PointerParam" : "");
}

interface OutputSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  expectedClass?: string | string[];
  allOutputs: Output[];
  onSelect: (output: Output | Output[]) => void;
  multiSelect?: boolean;
}

function getOutputRowId(o: Output): string {
  // getOutputRowId
  const protoId = String(o.parentId ?? "");
  const stableKey = String(
    o.key ?? o.value ?? o.info ?? getPointerClass(o) ?? getParamClass(o) ?? ""
  );
  return `${protoId}::${stableKey}`;
}


function toLowerString(value: unknown): string {
  // toLowerString
  return String(value ?? "").toLowerCase();
}

const OutputSelectorDialog: React.FC<OutputSelectorDialogProps> = ({
  open,
  onClose,
  expectedClass,
  allOutputs,
  onSelect,
  multiSelect = false,
}) => {
  const theme = useTheme();

  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    // resetStateOnOpen
    if (open) {
      setSelectedIds(new Set());
      setHighlightedId(null);
      setFilter("");
    }
  }, [open]);

  const expectedLabel = useMemo(() => {
    // expectedLabel
    if (!expectedClass) return "";
    const list = Array.isArray(expectedClass) ? expectedClass : [expectedClass];
    return list.filter(Boolean).join(", ");
  }, [expectedClass]);

  const matchingOutputs = useMemo(() => {
    // matchingOutputs
    if (!allOutputs) return [];

    let filtered = allOutputs;

    if (expectedClass) {
      const classes = Array.isArray(expectedClass)
        ? expectedClass.map((c) => toLowerString(c))
        : [toLowerString(expectedClass)];

      filtered = filtered.filter((o) => classes.includes(toLowerString(getPointerClass(o))));
    }

    if (filter.trim()) {
      const q = filter.toLowerCase();
      filtered = filtered.filter((o) => {
        const pointerClass = toLowerString(getPointerClass(o));
        const paramClass = toLowerString(getParamClass(o));
        const info = toLowerString(o.info);
        const objValue = toLowerString(o.value);
        const protocolId = toLowerString(o.parentId);
        const protocol = toLowerString(o.protocol);
        const key = toLowerString(o.key);

        return (
          pointerClass.includes(q) ||
          paramClass.includes(q) ||
          info.includes(q) ||
          objValue.includes(q) ||
          protocolId.includes(q) ||
          protocol.includes(q) ||
          key.includes(q)
        );
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      const idA = parseInt(String(a.parentId ?? ""), 10) || 0;
      const idB = parseInt(String(b.parentId ?? ""), 10) || 0;
      return idB - idA;
    });

    return sorted;
  }, [allOutputs, expectedClass, filter]);

  const toggleSelect = (id: string) => {
    // toggleSelect
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const clearSelection = () => {
    // clearSelection
    setSelectedIds(new Set());
    setHighlightedId(null);
  };

  const handleConfirm = () => {
    // handleConfirm
    if (multiSelect) {
      const selected = matchingOutputs.filter((o) => selectedIds.has(getOutputRowId(o)));
      onSelect(selected);
    } else if (highlightedId) {
      const selected = matchingOutputs.find((o) => getOutputRowId(o) === highlightedId);
      if (selected) onSelect(selected);
    }
    onClose();
  };

  const handleDoubleClick = (o: Output) => {
    // handleDoubleClick
    if (multiSelect) return;
    onSelect(o);
    onClose();
  };

  const handleSingleClick = (o: Output) => {
    // handleSingleClick
    if (multiSelect) return;
    const id = getOutputRowId(o);
    setHighlightedId((prev) => (prev === id ? null : id));
  };

  const isRowSelected = (o: Output) => {
    // isRowSelected
    const id = getOutputRowId(o);
    return multiSelect ? selectedIds.has(id) : highlightedId === id;
  };

  const hasSelection = multiSelect ? selectedIds.size > 0 : highlightedId !== null;
  const confirmLabel = multiSelect ? `Confirm (${selectedIds.size})` : "Confirm";

  const tableHeaderBg = alpha(theme.palette.text.primary, 0.06);
  const tableBorder = alpha(theme.palette.text.primary, 0.12);
  const selectedBg = alpha(theme.palette.success.main, 0.16);
  const hoverBg = alpha(theme.palette.success.main, 0.10);
  const zebraBg = alpha(theme.palette.text.primary, 0.03);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 2.5,
          py: 2,
          background: alpha(theme.palette.text.primary, 0.03),
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {multiSelect ? "Select compatible outputs" : "Select compatible output"}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.75, mt: 0.5 }}>
              Browse and filter outputs, then confirm your selection.
            </Typography>
          </Box>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            {expectedLabel ? (
              <Chip
                size="small"
                variant="outlined"
                label={`Expected: ${expectedLabel}`}
                sx={{ maxWidth: 320 }}
              />
            ) : (
              <Chip size="small" variant="outlined" label="No class filter" />
            )}

            <IconButton onClick={onClose} size="small" aria-label="Close dialog">
              <CloseIcon size={18} />
            </IconButton>
          </Stack>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter outputs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon size={16} />
                </InputAdornment>
              ),
              endAdornment: filter ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setFilter("")}
                    aria-label="Clear filter"
                    edge="end"
                  >
                    <ClearIcon size={16} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />

          <Chip
            size="small"
            label={`Showing ${matchingOutputs.length}`}
            sx={{ flexShrink: 0, fontWeight: 600 }}
          />
        </Stack>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            border: `1px solid ${tableBorder}`,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    background: tableHeaderBg,
                    fontWeight: 800,
                    borderBottom: `1px solid ${tableBorder}`,
                    fontSize: "0.78rem",
                    letterSpacing: 0.2,
                  },
                }}
              >
                {multiSelect && (
                  <TableCell sx={{ width: "6%", textAlign: "center" }}>
                    <Typography variant="caption" sx={{ fontWeight: 800 }}>
                      ✓
                    </Typography>
                  </TableCell>
                )}

                <TableCell sx={{ width: "35%" }}>Protocol ID</TableCell>
                <TableCell sx={{ width: "40%" }}>Protocol label</TableCell>
                <TableCell sx={{ width: "36%" }}>Info</TableCell>
                {/*  <TableCell sx={{ width: "20%" }}>Class</TableCell>  */}

                {!multiSelect && (
                  <TableCell sx={{ width: "10%", textAlign: "center" }}>Action</TableCell>
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {matchingOutputs.map((o, i) => {
                const id = getOutputRowId(o);
                const isSelected = isRowSelected(o);
                const effectivePointerClass = getPointerClass(o);

                return (
                  <TableRow
                    key={id}
                    hover
                    selected={isSelected}
                    onClick={() => handleSingleClick(o)}
                    onDoubleClick={() => handleDoubleClick(o)}
                    sx={{
                      cursor: "pointer",
                      backgroundColor: isSelected ? selectedBg : i % 2 === 0 ? zebraBg : "transparent",
                      "&:hover": {
                        backgroundColor: isSelected ? selectedBg : hoverBg,
                      },
                      "& td": {
                        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
                      },
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
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    )}

                    <TableCell>
                      <Chip
                        size="small"
                        label={o.parentId || "—"}
                        variant="filled"
                        sx={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          maxWidth: "100%",
                        }}
                      />
                    </TableCell>

                    <TableCell>
                      <Tooltip title={o.protocol || ""} disableHoverListener={!o.protocol}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                          {o.protocol || "—"}
                        </Typography>
                      </Tooltip>
                    </TableCell>

                    <TableCell>
                      <Tooltip title={o.info || ""} disableHoverListener={!o.info}>
                        <Typography variant="body2" noWrap sx={{ opacity: 0.9 }}>
                          {o.info || "—"}
                        </Typography>
                      </Tooltip>
                    </TableCell>

                    {/* 
                    <TableCell>
                      

                      <Tooltip title={effectivePointerClass || ""} disableHoverListener={!effectivePointerClass}>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={effectivePointerClass || "—"}
                          sx={{
                            maxWidth: "100%",
                            "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
                          }}
                        />
                      </Tooltip>

                    </TableCell> */}

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
                            aria-label="Confirm output"
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
                  <TableCell colSpan={multiSelect ? 5 : 5} sx={{ textAlign: "center", py: 4, opacity: 0.7 }}>
                    No compatible outputs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2.5, py: 2, gap: 1.5, justifyContent: "space-between" }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {multiSelect && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Selected: <strong>{selectedIds.size}</strong>
            </Typography>
          )}

          {(multiSelect ? selectedIds.size > 0 : highlightedId !== null) && (
            <Button onClick={clearSelection} variant="text" size="small">
              Clear
            </Button>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.5}>
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
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

export default OutputSelectorDialog;
