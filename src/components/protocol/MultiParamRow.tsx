// src/components/MultiParamRow.tsx
import { useMemo, useState } from "react";
import {
  Box,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
  TextField,
} from "@mui/material";
import { TrashBinIcon, EyeIcon, FindIcon } from "../../icons";
import { useDrag } from "./DragContext";
import OutputSelectorDialog from "./outputSelectorDialog";

type MultiParamRowProps = {
  label: string;
  items: any[];
  helpText?: string;
  onRowClear?: (i: number) => void;
  onRowDrop?: (i: number, dragged: any) => void;
  dragOverKey?: string | null;
  setDragOverKey?: (key: string | null) => void;
  currentDraggedOutput?: any;
  paramKey?: string;
  def?: any;

  // Centralized OutputSelectorDialog
  getAvailableOutputs?: () => any[];
  onPickForRow?: (rowIndex: number, picked: any) => void;

  // Inline edit support (optional)
  onRowEdit?: (rowIndex: number, patch: { object?: string; info?: string }) => void;

  // If true, block manual typing but keep drop/pick/clear behavior unchanged
  readOnly?: boolean;
};

// Utility: extract expected accepted pointer class names from parameter definition
const getExpectedClass = (def: any): string | string[] | undefined => {
  // getExpectedClass
  if (!def) return undefined;

  const candidates = [
    def.pointerClass,
    def.pointerClassName,
    def.accept,
    def.accepts,
    def.accepted,
    def.objectClass,
    def.targetClass,
    def._expectedClass,
    def.acceptsClass,
    def.type,
    def._type,
    def._classAccepted,
    def.class,
  ];

  const result: string[] = [];

  const push = (v: any) => {
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!s) return;

    // filterOutParamMeta
    if (/pointerparam$/i.test(s) || /multipointerparam$/i.test(s)) return;

    if (!result.includes(s)) result.push(s);
  };

  candidates.forEach((c) => {
    if (Array.isArray(c)) c.forEach(push);
    else push(c);
  });

  if (result.length === 0) return undefined;
  if (result.length === 1) return result[0];
  return result;
};

export default function MultiParamRow({
  items,
  onRowClear,
  onRowDrop,
  dragOverKey,
  setDragOverKey,
  currentDraggedOutput,
  paramKey,
  def,
  getAvailableOutputs,
  onPickForRow,
  onRowEdit,
  readOnly,
}: MultiParamRowProps) {
  const { currentDraggedOutput: contextDragged } = useDrag();
  const dragged = currentDraggedOutput ?? contextDragged;

  const [openSelectorFor, setOpenSelectorFor] = useState<number | null>(null);

  const isReadOnly = !!readOnly;

  // Always ensure one blank row available
  const display = useMemo(() => {
    // buildDisplayRows
    const clean = Array.isArray(items) ? [...items] : [];
    const emptyRow = { object: "", info: "" };

    if (clean.length === 0 || clean.every((r) => r.object || r.info)) {
      clean.push(emptyRow);
    } else if (!clean.some((r) => !r.object && !r.info)) {
      clean.push(emptyRow);
    }

    return clean;
  }, [items]);

  const expected = useMemo(() => getExpectedClass(def), [def]);

  // Get all available outputs and filter already used ones
  const availableOutputs = useMemo(() => {
    // computeAvailableOutputs
    const all = getAvailableOutputs ? getAvailableOutputs() ?? [] : [];
    const used = new Set(display.map((r) => r.object).filter(Boolean));
    return all.filter((o) => !used.has(o.value));
  }, [getAvailableOutputs, display]);

  const draggedPointerClass = useMemo(() => {
    // draggedPointerClass
    if (dragged?.pointerClass) return String(dragged.pointerClass);
    if (dragged?._class) return String(dragged._class);
    return "";
  }, [dragged]);

  const isDraggedCompatible = useMemo(() => {
    // isDraggedCompatible
    if (!expected) return true;

    if (Array.isArray(expected)) {
      return expected.includes(draggedPointerClass);
    }

    return draggedPointerClass === expected;
  }, [expected, draggedPointerClass]);

  const cellTextFieldSx = {
    "& .MuiInputBase-root": {
      fontSize: 12,
      height: 30,
      backgroundColor: "transparent",
    },
    "& .MuiInputBase-input": {
      fontSize: 12,
      py: 0,
      px: 0.5,
      lineHeight: 1.2,
      color: "#111827",
    },
  } as const;

  return (
    <Box sx={{ mb: 2, ml: -2 }}>
      <Box
        sx={{
          maxHeight: 320,
          width: "100%",
          maxWidth: 1040,
          overflowY: "auto",
          borderRadius: 1,
          border: "1px dashed #bbb",
          backgroundColor: "white",
          position: "relative",
          mt: 2,
        }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            tableLayout: "fixed",
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            "& .MuiTableCell-root": {
              borderBottom: "1px dashed #ccc",
              padding: "6px 10px",
              fontSize: 12,
            },
            "& .MuiTableHead-root": {
              position: "sticky",
              top: 0,
              zIndex: 2,
            },
          }}
        >
          <TableHead>
            <TableRow sx={{ background: "#e0e0e0 !important" }}>
              <TableCell sx={{ width: "40%", fontWeight: "bold", color: "black" }}>
                Object
              </TableCell>
              <TableCell sx={{ width: "45%", fontWeight: "bold", color: "black" }}>
                Information
              </TableCell>
              {onRowClear && (
                <TableCell
                  sx={{
                    width: "15%",
                    textAlign: "center",
                    fontWeight: "bold",
                    color: "black",
                    whiteSpace: "nowrap",
                  }}
                >
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {display.map((row, i) => {
              const keyId = `${paramKey}_${i}`;
              const isOver = dragOverKey === keyId;

              const backgroundColor = isOver
                ? isDraggedCompatible
                  ? "#b7f5c7"
                  : "#f5b7b7"
                : "transparent";

              const isEmpty = !row.object && !row.info;

              return (
                <TableRow
                  key={i}
                  sx={{
                    backgroundColor,
                    transition: "background-color 0.15s ease-in-out",
                    height: 38,
                    "& td": { borderBottom: "1px dashed #ccc" },
                  }}
                  onDragOver={(e) => {
                    // handleDragOver
                    if (!onRowDrop) return;
                    e.preventDefault();
                    setDragOverKey?.(keyId);
                  }}
                  onDragLeave={() => setDragOverKey?.(null)}
                  onDrop={(e) => {
                    // handleDrop
                    if (!onRowDrop) return;
                    e.preventDefault();
                    setDragOverKey?.(null);

                    try {
                      const raw = e.dataTransfer.getData("application/scipion-output");
                      if (!raw) return;

                      const parsed = JSON.parse(raw);

                      // preventDuplicatesOnDrop
                      const already = display.some((r) => r.object === parsed.value);
                      if (already) return;

                      onRowDrop(i, parsed);
                    } catch (err) {
                      console.error("Drop error:", err);
                    }
                  }}
                >
                  <TableCell
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                    }}
                    title={row.object}
                  >
                    <TextField
                      variant="standard"
                      value={String(row.object ?? "")}
                      onChange={
                        isReadOnly
                          ? undefined
                          : (e) => onRowEdit?.(i, { object: e.target.value })
                      }
                      InputProps={{ disableUnderline: true, readOnly: isReadOnly }}
                      sx={cellTextFieldSx}
                      fullWidth
                    />
                  </TableCell>

                  <TableCell
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                    }}
                    title={row.info}
                  >
                    <TextField
                      variant="standard"
                      value={String(row.info ?? "")}
                      onChange={
                        isReadOnly
                          ? undefined
                          : (e) => onRowEdit?.(i, { info: e.target.value })
                      }
                      InputProps={{ disableUnderline: true, readOnly: isReadOnly }}
                      sx={cellTextFieldSx}
                      fullWidth
                    />
                  </TableCell>

                  {onRowClear && (
                    <TableCell sx={{ textAlign: "center", verticalAlign: "middle" }}>
                      {isEmpty ? (
                        <Tooltip title="Find compatible outputs">
                          <IconButton size="small" onClick={() => setOpenSelectorFor(i)}>
                            <FindIcon fontSize="1.3rem" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <IconButton size="small" onClick={() => onRowClear(i)}>
                            <TrashBinIcon fontSize="1.1rem" />
                          </IconButton>
                        </Box>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      <OutputSelectorDialog
        open={openSelectorFor !== null}
        onClose={() => setOpenSelectorFor(null)}
        expectedClass={expected}
        allOutputs={availableOutputs}
        multiSelect={true}
        onSelect={(selected) => {
          // handleSelectorPick
          if (openSelectorFor === null) return;

          const pickedArray = Array.isArray(selected) ? selected : [selected];
          pickedArray.forEach((picked, idx) => {
            const targetRow = openSelectorFor + idx;
            onPickForRow?.(targetRow, picked);
          });

          setOpenSelectorFor(null);
        }}
      />
    </Box>
  );
}
