// src/components/MultiParamRow.tsx
import React, { useMemo, useState } from "react";
import {
  Box,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { TrashBinIcon, EyeIcon, FindIcon } from "../../icons";
import { useDrag } from "./DragContext";

type Candidate = {
  _class: string;
  _objValue: string;
  info: string;
  _parentId?: string | null;
  _fromId?: string | number; // optional: protocol id or origin label if you want to show it
};

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
  candidates?: Candidate[]; // optional pool of outputs to choose from
};

const getExpectedClass = (def: any): string | string[] | undefined => {
  if (!def) return undefined;
  const candidates = [
    def.pointerClass,
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
  candidates.forEach((c) => {
    if (typeof c === "string" && c.trim()) result.push(c.trim());
    if (Array.isArray(c)) result.push(...c.map((s) => s.trim()));
  });
  if (result.length === 0) return undefined;
  if (result.length === 1) return result[0];
  return result;
};

export default function MultiParamRow({
  label,
  items,
  helpText,
  onRowClear,
  onRowDrop,
  dragOverKey,
  setDragOverKey,
  currentDraggedOutput,
  paramKey,
  def,
  candidates = [],
}: MultiParamRowProps) {
  const { currentDraggedOutput: contextDragged } = useDrag();
  const dragged = currentDraggedOutput ?? contextDragged;

  // Ensure one blank row more than the number of filled items
  const display = useMemo(() => {
    const clean = Array.isArray(items) ? [...items] : [];
    const emptyRow = { object: "", info: "" };
    const filledCount = clean.filter((r) => r.object || r.info).length;
    if (clean.length <= filledCount) {
      clean.push(emptyRow);
    }
    return clean;
  }, [items]);

  const expected = getExpectedClass(def);

  // Local dialog state for "Find" on blank rows
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorRowIndex, setSelectorRowIndex] = useState<number | null>(null);

  // Filter candidates to only those that match expected class and are not already selected
  const filteredCandidates = useMemo(() => {
    const classMatch = (c: Candidate): boolean =>
      !expected
        ? true
        : Array.isArray(expected)
        ? expected.includes(c._class)
        : c._class === expected;

    const alreadySelected = new Set(
      (items ?? [])
        .filter((r: any) => r?.object)
        .map((r: any) => String(r.object))
    );

    return (candidates ?? [])
      .filter((c) => classMatch(c))
      .filter((c) => !alreadySelected.has(String(c._objValue)));
  }, [candidates, expected, items]);

  // Open selector for a specific blank row
  const openSelectorForRow = (rowIndex: number) => {
    setSelectorRowIndex(rowIndex);
    setSelectorOpen(true);
  };

  // Handle picking a candidate from the dialog
  const handlePickCandidate = (c: Candidate) => {
    if (selectorRowIndex == null || !onRowDrop) {
      setSelectorOpen(false);
      setSelectorRowIndex(null);
      return;
    }
    // Extra guard against duplicates
    const dup = display.some((r) => r.object === c._objValue);
    if (dup) {
      setSelectorOpen(false);
      setSelectorRowIndex(null);
      return;
    }
    onRowDrop(selectorRowIndex, {
      _class: c._class,
      _objValue: c._objValue,
      info: c.info,
      _parentId: c._parentId ?? null,
    });
    setSelectorOpen(false);
    setSelectorRowIndex(null);
  };

  return (
    <Box sx={{ mb: 2, ml: -2 }}>
      {/* Table wrapper */}
      <Box
        sx={{
          maxHeight: 300,
          width: "100%",
          maxWidth: 980,
          overflowY: "auto",
          border: "1px dashed #999",
          borderRadius: 1,
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
            "& .MuiTableHead-root .MuiTableCell-root": {
              backgroundColor: "#cfcfcf !important",
              fontWeight: "bold",
              color: "black",
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "40%" }}>Object</TableCell>
              <TableCell sx={{ width: "45%" }}>Information</TableCell>
              {onRowClear && (
                <TableCell
                  sx={{
                    width: "15%",
                    textAlign: "center",
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

              const isMatch =
                !expected ||
                (Array.isArray(expected)
                  ? expected.includes(dragged?._class)
                  : dragged?._class === expected);

              const backgroundColor = isOver
                ? isMatch
                  ? "#b7f5c7" // green if match
                  : "#f5b7b7" // red if no match
                : "transparent";

              const isEmpty = !row.object && !row.info;

              return (
                <TableRow
                  key={i}
                  sx={{
                    backgroundColor,
                    transition: "background-color 0.2s ease-in-out",
                    height: 38,
                  }}
                  onDragOver={(e) => {
                    if (!onRowDrop) return;
                    e.preventDefault();
                    setDragOverKey?.(keyId);
                  }}
                  onDragLeave={() => setDragOverKey?.(null)}
                  onDrop={(e) => {
                    if (!onRowDrop) return;
                    e.preventDefault();
                    setDragOverKey?.(null);
                    try {
                      const raw = e.dataTransfer.getData("application/scipion-output");
                      if (!raw) return;
                      const parsed = JSON.parse(raw);

                      // Prevent duplicate outputs
                      const alreadyExists = display.some(
                        (r) => r.object === parsed._objValue
                      );
                      if (alreadyExists) return;

                      onRowDrop(i, parsed);
                    } catch (err) {
                      // ignore parse errors
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
                    {row.object}
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
                    {row.info}
                  </TableCell>

                  {onRowClear && (
                    <TableCell
                      sx={{
                        textAlign: "center",
                        verticalAlign: "middle",
                        p: 0,
                      }}
                    >
                      {isEmpty ? (
                        <Tooltip title="Find">
                          <IconButton
                            size="small"
                            onClick={() => openSelectorForRow(i)}
                          >
                            <FindIcon fontSize="1.2rem" />
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
                          <IconButton
                            size="small"
                            onClick={() => console.log("View", i)}
                          >
                            <EyeIcon fontSize="1.1rem" />
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

      {/* Selector dialog for blank rows */}
      <Dialog
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select output</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Table
            size="small"
            sx={{
              tableLayout: "fixed",
              width: "100%",
              "& .MuiTableCell-root": { fontSize: 12, whiteSpace: "nowrap" },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: "28%", fontWeight: 700 }}>Object</TableCell>
                <TableCell sx={{ width: "54%", fontWeight: 700 }}>Information</TableCell>
                <TableCell sx={{ width: "18%", textAlign: "center", fontWeight: 700 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} sx={{ textAlign: "center", py: 3 }}>
                    No candidates available
                  </TableCell>
                </TableRow>
              ) : (
                filteredCandidates.map((c, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell title={c._objValue}>{c._objValue}</TableCell>
                    <TableCell title={c.info}>{c.info}</TableCell>
                    <TableCell sx={{ textAlign: "center" }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handlePickCandidate(c)}
                        sx={{ textTransform: "none" }}
                      >
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => setSelectorOpen(false)}
            sx={{ textTransform: "none" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
