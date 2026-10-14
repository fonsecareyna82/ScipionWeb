// src/components/outputSelectorDialog.tsx
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
  ChevronRight as BrowseIcon,
  ChevronDown as CollapseIcon,
  X as CloseIcon,
  Search as SearchIcon,
  XCircle as ClearIcon,
} from "lucide-react";

import {
  getPointerOutputCompatibility,
} from "@/utils/protocolform.utils";


interface Output {
  paramClass?: string;
  pointerClass?: string;
  pointerClassHierarchy?: string[];
  itemClassName?: string;
  itemClassHierarchy?: string[];
  selectionKind?: string;
  scipionItemId?: string | number | null;
  enabled?: boolean;
  selectable?: boolean;
  name?: string;
  _expectedClass?: string;
  value?: string;
  info?: string;
  parentId?: string | number;
  protocol?: string;
  key?: string;
}

function getPointerClass(o: Output): string {
  // getPointerClass
  return getPointerClassLabel(o);
}

function getParamClass(o: Output): string {
  // getParamClass
  const rawParamClass = String(o.paramClass ?? "");
  return rawParamClass || (getPointerClass(o) ? "PointerParam" : "");
}

function isWildcardExpectedClass(raw: unknown): boolean {
  // isWildcardExpectedClass
  const tokens = splitClassList(raw).map((item) => item.replace(/\s+/g, "").toLowerCase());
  return tokens.includes("all") || tokens.includes("emset");
}

function splitClassList(raw: unknown): string[] {
  // splitClassList
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.flatMap((item) => splitClassList(item))));
  }

  const text = String(raw ?? "").trim();
  if (!text) return [];

  return Array.from(
    new Set(
      text
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
  );
}

function getPointerClasses(o: Output): string[] {
  // getPointerClasses
  return splitClassList(o.pointerClass ?? o._expectedClass ?? "");
}

function getPointerClassLabel(o: Output): string {
  // getPointerClassLabel
  return getPointerClasses(o).join(", ");
}

type SetItemsPage = {
  items: Output[];
  nextCursor: string | null;
};

type SetItemsLoader = (
  output: Output,
  options: { cursor: string | null; limit: number },
) => Promise<SetItemsPage>;

type LoadedSetItems = {
  items: Output[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

interface OutputSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  expectedClass?: string | string[];
  allOutputs: Output[];
  onSelect: (output: Output | Output[]) => void;
  multiSelect?: boolean;
  loadSetItems?: SetItemsLoader;
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

// GREEN77_LEFT_DISCLOSURE_AND_MEMBER_METADATA
// Metadata appears only if the paged API supplies a finite numeric value.
function getSetMemberNumber(value: unknown, key: 'itemsCount' | 'samplingRate'): number | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) return null;
  if (key === 'samplingRate' && candidate === 0) return null;
  return candidate;
}
const OutputSelectorDialog: React.FC<OutputSelectorDialogProps> = ({
  open,
  onClose,
  expectedClass,
  allOutputs,
  onSelect,
  multiSelect = false,
  loadSetItems,
}) => {
  const theme = useTheme();

  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedSetIds, setExpandedSetIds] = useState<Set<string>>(new Set());
  const [setItems, setSetItems] = useState<Record<string, LoadedSetItems>>({});
  const requestIdRef = useRef(0);
  const pendingRequestsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // resetStateOnOpen
    if (open) {
      setSelectedIds(new Set());
      setHighlightedId(null);
      setFilter("");
      setExpandedSetIds(new Set());
      setSetItems({});
      // Invalidate in-flight requests from previous openings of this dialog.
      pendingRequestsRef.current = {};
    }
  }, [open]);

  const expectedLabel = useMemo(() => {
    // expectedLabel
    if (!expectedClass) return "";
    const list = Array.isArray(expectedClass) ? expectedClass : [expectedClass];
    return list.filter(Boolean).join(", ");
  }, [expectedClass]);

  // GREEN 50: keep directly assignable outputs separate from browsable sets.
  // A legacy/wildcard selector still treats existing outputs as direct.
  const getCompatibility = useCallback((output: Output) => {
    if (!expectedClass) return "direct";
    const accepted = Array.isArray(expectedClass)
      ? expectedClass
      : [expectedClass];
    if (accepted.some(isWildcardExpectedClass)) return "direct";
    return getPointerOutputCompatibility(expectedClass, output);
  }, [expectedClass]);

  const loadSetPage = async (output: Output, cursor: string | null) => {
    if (!loadSetItems || getCompatibility(output) !== "expandable") return;

    const id = getOutputRowId(output);
    const requestId = ++requestIdRef.current;
    pendingRequestsRef.current[id] = requestId;
    setSetItems((previous) => ({
      ...previous,
      [id]: {
        items: cursor === null ? [] : (previous[id]?.items ?? []),
        nextCursor: previous[id]?.nextCursor ?? null,
        loading: true,
        error: null,
      },
    }));

    try {
      const page = await loadSetItems(output, { cursor, limit: 50 });
      if (pendingRequestsRef.current[id] !== requestId) return;
      setSetItems((previous) => ({
        ...previous,
        [id]: {
          // Keep original objects and their opaque API-supplied references.
          items: [
            ...(cursor === null ? [] : (previous[id]?.items ?? [])),
            ...(Array.isArray(page?.items) ? page.items : []),
          ],
          nextCursor: page?.nextCursor ?? null,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      if (pendingRequestsRef.current[id] !== requestId) return;
      setSetItems((previous) => ({
        ...previous,
        [id]: {
          items: cursor === null ? [] : (previous[id]?.items ?? []),
          nextCursor: cursor,
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load items",
        },
      }));
    }
  };

  const toggleSetExpansion = (output: Output) => {
    if (!loadSetItems || getCompatibility(output) !== "expandable") return;
    const id = getOutputRowId(output);
    const opening = !expandedSetIds.has(id);
    setExpandedSetIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (opening && !setItems[id]) void loadSetPage(output, null);
  };


  // GREEN75_SELECTOR_CONTEXT: the page item has no inheritance of its own.
  // Match its producer, output name and concrete item class before borrowing
  // the parent output's persisted itemClassHierarchy.
  const getSetMemberCompatibility = (member: any) => {
    const memberClass = String(member?.itemClassName ?? member?.pointerClass ?? "").trim();
    const memberId = member?.parentId ?? member?.protocolId;
    const memberKey = String(member?.key ?? "").trim();
    const parentOutput = member?.selectionKind === "set-item" && memberClass && memberId != null && memberKey
      ? allOutputs.find((parent: any) =>
          String(parent?.parentId ?? parent?.protocolId ?? "") === String(memberId) &&
          String(parent?.key ?? parent?.outputName ?? "") === memberKey &&
          String(parent?.itemClassName ?? "").trim() === memberClass &&
          Array.isArray(parent?.itemClassHierarchy),
        )
      : undefined;
    return getPointerOutputCompatibility(expectedClass, member, parentOutput);
  };

  const matchingOutputs = useMemo(() => {
    // matchingOutputs
    if (!allOutputs) return [];

    let filtered = allOutputs;

    if (expectedClass) {
      filtered = filtered.filter((output) => {
        const compatibility = getCompatibility(output);
        return compatibility === "direct" ||
          (compatibility === "expandable" && !multiSelect && Boolean(loadSetItems));
      });
    }

    if (filter.trim()) {
      const q = filter.toLowerCase();
      filtered = filtered.filter((o) => {
        const pointerClass = toLowerString(getPointerClasses(o).join(", "));
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
  }, [allOutputs, getCompatibility, filter, loadSetItems, multiSelect]);

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
      const selected = matchingOutputs.filter((o) =>
        selectedIds.has(getOutputRowId(o)) && getCompatibility(o) === "direct"
      );
      if (selected.length > 0) onSelect(selected);
    } else if (highlightedId) {
      const selected = matchingOutputs.find((o) => getOutputRowId(o) === highlightedId);
      if (selected && getCompatibility(selected) === "direct") onSelect(selected);
    }
    onClose();
  };

  const handleDoubleClick = (o: Output) => {
    // handleDoubleClick
    if (multiSelect || getCompatibility(o) !== "direct") return;
    onSelect(o);
    onClose();
  };

  const handleRowClick = (o: Output) => {
    // handleRowClick
    if (getCompatibility(o) !== "direct") return;
    const id = getOutputRowId(o);

    if (multiSelect) {
      toggleSelect(id);
      return;
    }

    setHighlightedId((prev) => (prev === id ? null : id));
  };

  const isRowSelected = (o: Output) => {
    // isRowSelected
    const id = getOutputRowId(o);
    return multiSelect ? selectedIds.has(id) : highlightedId === id;
  };

  const hasSelection = multiSelect ? selectedIds.size > 0 : highlightedId !== null;
  const confirmLabel = multiSelect ? `Confirm (${selectedIds.size})` : "Confirm";

  const borderColor = alpha(theme.palette.divider, 0.9);
  const softBorderColor = alpha(theme.palette.text.primary, 0.08);
  const headerBg = "#333d49";
  const headerLine = alpha("#ffffff", 0.08);
  const tableHeaderBg = alpha(theme.palette.primary.main, 0.055);
  const selectedBg = alpha(theme.palette.success.main, 0.14);
  const hoverBg = alpha(theme.palette.primary.main, 0.08);
  const zebraBg = alpha(theme.palette.text.primary, 0.022);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
          border: `1px solid ${borderColor}`,
          boxShadow: `0 24px 80px ${alpha(theme.palette.common.black, 0.22)}`,
          backgroundImage: "none",
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          py: 2.5,
          backgroundColor: headerBg,
          borderBottom: `1px solid ${headerLine}`,
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0, pr: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: -0.2,
                color: "#ffffff",
              }}
            >
              {multiSelect ? "Select compatible outputs" : "Select compatible output"}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
              {expectedLabel ? (
                <Chip
                  size="small"
                  label={`Expected class: ${expectedLabel}`}
                  variant="outlined"
                  sx={{
                    maxWidth: 360,
                    fontWeight: 700,
                    color: "#ffffff",
                    borderColor: "rgba(255,255,255,0.18)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    "& .MuiChip-label": {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    },
                  }}
                />
              ) : (
                <Chip
                  size="small"
                  label="No class filter"
                  variant="outlined"
                  sx={{
                    fontWeight: 700,
                    color: "#ffffff",
                    borderColor: "rgba(255,255,255,0.18)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                />
              )}

              <Chip
                size="small"
                label={`${matchingOutputs.length} result${matchingOutputs.length === 1 ? "" : "s"}`}
                variant="outlined"
                sx={{
                  fontWeight: 700,
                  color: "#ffffff",
                  borderColor: "rgba(255,255,255,0.18)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              />

              {multiSelect && selectedIds.size > 0 && (
                <Chip
                  size="small"
                  label={`${selectedIds.size} selected`}
                  sx={{
                    fontWeight: 700,
                    color: "#ffffff",
                    borderColor: "rgba(255,255,255,0.18)",
                    backgroundColor: "rgba(255,255,255,0.12)",
                  }}
                  variant="outlined"
                />
              )}
            </Stack>
          </Box>

          <IconButton
            onClick={onClose}
            size="small"
            aria-label="Close dialog"
            sx={{
              mt: -0.25,
              flexShrink: 0,
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
              "&:hover": {
                backgroundColor: "rgba(255,255,255,0.12)",
              },
            }}
          >
            <CloseIcon size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ px: 3, py: 2.25 }}>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 3,
              border: `1px solid ${softBorderColor}`,
              background: alpha(theme.palette.primary.main, 0.025),
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <TextField
                fullWidth
                size="small"
                label="Filter output"
                placeholder="Search by protocol, info, id, class or key..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                InputLabelProps={{
                  sx: {
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: 0.1,
                  },
                }}
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
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2.5,
                    backgroundColor: alpha(theme.palette.background.paper, 0.86),
                  },
                  "& .MuiInputBase-input": {
                    fontSize: "0.92rem",
                  },
                }}
              />

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ flexShrink: 0, alignSelf: { xs: "flex-end", md: "center" } }}
              >
                <Chip
                  size="small"
                  label={`Showing ${matchingOutputs.length}`}
                  sx={{
                    fontWeight: 700,
                    backgroundColor: alpha(theme.palette.text.primary, 0.05),
                  }}
                />

                {hasSelection && (
                  <Button
                    onClick={clearSelection}
                    variant="text"
                    size="small"
                    sx={{
                      minWidth: "auto",
                      px: 1,
                      fontWeight: 700,
                    }}
                  >
                    Clear
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              borderRadius: 3,
              overflow: "auto",
              backgroundImage: "none",
              maxHeight: "60vh",
            }}
          >
            <Table size="small" stickyHeader sx={{ tableLayout: "fixed", minWidth: 760 }}>
              <TableHead>
                <TableRow
                  sx={{
                    "& th": {
                      backgroundColor: tableHeaderBg,
                      fontSize: "0.73rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.55,
                      color: alpha(theme.palette.text.primary, 0.82),
                      py: 1.25,
                    },
                  }}
                >
                  {multiSelect && (
                    <TableCell sx={{ width: 64, textAlign: "center" }}>Pick</TableCell>
                  )}

                  <TableCell sx={{ width: "18%" }}>Protocol ID</TableCell>
                  <TableCell sx={{ width: "34%" }}>Protocol</TableCell>
                  <TableCell sx={{ width: multiSelect ? "48%" : "38%" }}>Info</TableCell>

                  {!multiSelect && (
                    <TableCell sx={{ width: 84, textAlign: "center" }}>Action</TableCell>
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {matchingOutputs.map((o, i) => {
                  const id = getOutputRowId(o);
                  const isSelected = isRowSelected(o);
                  const effectivePointerClass = getPointerClassLabel(o);
                  const compatibility = getCompatibility(o);
                  const expanded = expandedSetIds.has(id);
                  const page = setItems[id];

                  return (
                    <React.Fragment key={id}>
                    <TableRow
                      hover
                      selected={isSelected}
                      onClick={() => handleRowClick(o)}
                      onDoubleClick={() => handleDoubleClick(o)}
                      sx={{
                        cursor: "pointer",
                        backgroundColor: isSelected ? selectedBg : i % 2 === 0 ? zebraBg : "transparent",
                        transition: "background-color 120ms ease, transform 120ms ease",
                        "&:hover": {
                          backgroundColor: isSelected ? selectedBg : hoverBg,
                        },
                        "& td": {
                          borderBottom: `1px solid ${softBorderColor}`,
                          py: 1.15,
                          verticalAlign: "middle",
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
                            height: 26,
                            fontFamily: "monospace",
                            fontWeight: 800,
                            borderRadius: 1.75,
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            color: theme.palette.text.primary,
                            maxWidth: "100%",
                          }}
                        />
                      </TableCell>

                      <TableCell>
<Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
  {compatibility === "direct" ? (
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
                                sx={{
                                  border: `1px solid ${alpha(theme.palette.success.main, 0.20)}`,
                                  backgroundColor: alpha(theme.palette.success.main, 0.06),
                                  "&:hover": {
                                    backgroundColor: alpha(theme.palette.success.main, 0.12),
                                  },
                                }}
                              >
                                <CheckIcon size={18} />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Browse compatible items">
                              <IconButton
                                size="small"
                                aria-label={`Browse items in ${o.key || o.value || "set"}`}
                                title={expanded ? `Collapse items in ${o.key || o.value || "set"}` : `Expand items in ${o.key || o.value || "set"}`}
                                aria-expanded={expanded}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSetExpansion(o);
                                }}
                              >
                                {expanded ? <CollapseIcon size={18} /> : <BrowseIcon size={18} />}
                              </IconButton>
                            </Tooltip>
                          )}
  <Box sx={{ flex: 1, minWidth: 0 }}>
  
                        <Stack spacing={0.45} sx={{ minWidth: 0 }}>
                          <Tooltip title={o.protocol || ""} disableHoverListener={!o.protocol}>
                            <Typography
                              variant="body2"
                              noWrap
                              sx={{
                                fontWeight: 700,
                                color: theme.palette.text.primary,
                              }}
                            >
                              {o.protocol || "—"}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      
  </Box>
</Stack>
</TableCell>

                      <TableCell>
                        <Tooltip title={o.info || ""} disableHoverListener={!o.info}>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              color: alpha(theme.palette.text.primary, 0.88),
                            }}
                          >
                            {o.info || "—"}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {!multiSelect && (
                        <TableCell sx={{ textAlign: "center" }}>
                          
                        </TableCell>
                      )}
                    </TableRow>
                    {compatibility === "expandable" && expanded && (
                      <TableRow>
                        <TableCell colSpan={4} sx={{ pl: 6, py: 1.5 }}>
                          <Stack spacing={1}>
                            {(page?.items ?? []).map((member, itemIndex) => {
                              const memberName = String(
                                member.name ?? member.info ?? member.scipionItemId ?? `Item ${itemIndex + 1}`
                              );
                              // GREEN77_V7_PRESERVE_MEMBER_LABELS: keep real names; replace repeated API placeholders with a persistent ID.
                              const meaningfulMemberName = [member.name, member.info]
                                .map((value) => String(value ?? "").trim())
                                .find((value) => value && value.toLowerCase() !== "outputset");
                              const memberDisplayName = meaningfulMemberName || (member.scipionItemId == null
                                ? memberName
                                : `${String(member.itemClassName ?? member.pointerClass ?? "Item")} #${String(member.scipionItemId)}`);
                              const memberKey = String(
                                member.scipionItemId ?? member.value ?? itemIndex
                              );
                              // GREEN 73: a native item is selectable only with explicit backend approval.
                              // Presence of an opaque value alone is NOT sufficient.
                              const selectable = getSetMemberCompatibility(member) === "direct" &&
                                member.enabled === true && member.selectable === true &&
                                Boolean(String(member.value ?? "").trim()) &&
                                member.scipionItemId !== undefined &&
                                member.scipionItemId !== null;
                              return (
                                <Stack
                                  key={`${id}::${memberKey}`}
                                  direction="row"
                                  alignItems="center"
                                  justifyContent="space-between"
                                  spacing={2}
                                >
                                  {/* GREEN77_V5_SCOPED_MEMBER_METADATA: native ID and optional persisted details. */}
                                  <Stack spacing={0.3} sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                                      {memberDisplayName}
                                    </Typography>
                                    {(getSetMemberNumber(member, "itemsCount") !== null || getSetMemberNumber(member, "samplingRate") !== null) && (
                                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                        {getSetMemberNumber(member, "itemsCount") !== null && <Chip size="small" variant="outlined" label={`${getSetMemberNumber(member, "itemsCount")} items`} />}
                                        {getSetMemberNumber(member, "samplingRate") !== null && <Chip size="small" variant="outlined" label={`${getSetMemberNumber(member, "samplingRate")} Å/px`} />}
                                      </Stack>
                                    )}
                                  </Stack>
                                  <Button
                                    size="small"
                                    disabled={!selectable}
                                    aria-label={`Select item ${memberName}`}
                                    onClick={() => {
                                      if (!selectable) return;
                                      // Forward the unchanged member object. Never synthesize a pointer.
                                      onSelect(member);
                                      onClose();
                                    }}
                                  >
                                    Select
                                  </Button>
                                </Stack>
                              );
                            })}
                            {page?.loading && <Typography variant="body2">Loading items...</Typography>}
                            {page?.error && (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" color="error">{page.error}</Typography>
                                <Button size="small" onClick={() => void loadSetPage(o, page.nextCursor)}>
                                  Retry
                                </Button>
                              </Stack>
                            )}
                            {page && !page.loading && !page.error && page.items.length === 0 && (
                              <Typography variant="body2" color="text.secondary">No items found</Typography>
                            )}
                            {page?.nextCursor && !page.loading && !page.error && (
                              <Button
                                size="small"
                                aria-label={`Load more items from ${o.key || o.value || "set"}`}
                                onClick={() => void loadSetPage(o, page.nextCursor)}
                              >
                                Load more
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  );
                })}

                {matchingOutputs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 6 }}>
                      <Stack spacing={0.8} alignItems="center" justifyContent="center">
                        <Typography variant="body1" sx={{ fontWeight: 700, opacity: 0.86 }}>
                          No compatible outputs found
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.62 }}>
                          Try adjusting the filter or expected class.
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </DialogContent>

      <Divider />

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          justifyContent: "space-between",
          backgroundColor: alpha(theme.palette.text.primary, 0.018),
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            {multiSelect
              ? `Selected outputs: ${selectedIds.size}`
              : hasSelection
                ? "One output selected"
                : "No output selected"}
          </Typography>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Button
            onClick={onClose}
            variant="outlined"
            size="small"
            sx={{
              minWidth: 90,
              borderRadius: 2,
              fontWeight: 700,
              textTransform: "none",
            }}
          >
            Close
          </Button>

          <Button
            onClick={handleConfirm}
            variant="contained"
            color="success"
            size="small"
            disabled={!hasSelection}
            sx={{
              minWidth: 126,
              borderRadius: 2,
              fontWeight: 800,
              boxShadow: "none",
              textTransform: "none",
            }}
          >
            {confirmLabel}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

export default OutputSelectorDialog;