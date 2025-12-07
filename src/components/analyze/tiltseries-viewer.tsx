// src/components/analyze/tiltseries-viewer.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  TextField,
  Checkbox,
  Tooltip,
  Slider,
} from "@mui/material";
import {
  ArrowUpward,
  ArrowDownward,
  Refresh as RefreshIcon,
  PlayArrow,
  Stop as StopIcon,
  ExpandMore,
  ChevronRight,
  Transform as TransformIcon,
} from "@mui/icons-material";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id } from "@/services/ProjectService";
import { CloseIcon } from "@/icons";

type TiltSeriesViewerProps = {
  projectId: Id;
  protocolId: Id;
  outputName: string;
  protocolLabel?: string;
};

type TiltSeriesSummary = {
  tiltSeriesId: Id;
  label: string;
  nViews?: number;
  tiltAxisAngle?: number | null;
  pixelSize?: number | null;
  dims?: [number, number] | [number, number, number];
  excluded?: boolean;
};

type TiltViewRow = {
  viewId: Id;
  index?: number | null;
  order?: number | null;
  tiltAngle?: number | null;
  excluded?: boolean;
  dose?: number | null;
  path?: string | null;
  rot?: number | null;
  shiftX?: number | null;
  shiftY?: number | null;
};

type FramesPayload = {
  tiltSeriesId: Id;
  label?: string;
  tiltAxisAngle?: number | null;
  frames: TiltViewRow[];
};

type ObjectUrlResult = {
  url: string;
  revoke?: () => void;
};

// Helper to truncate path in the middle: /home/.../img.mrc
function truncatePathMiddle(path: string, maxLength = 40): string {
  if (path.length <= maxLength) return path;
  const half = Math.floor((maxLength - 3) / 2);
  const start = path.slice(0, half);
  const end = path.slice(-half);
  return `${start}...${end}`;
}

export default function TiltSeriesViewer({
  projectId,
  protocolId,
  outputName,
}: TiltSeriesViewerProps) {
  const svc = useProjectService();

  const [series, setSeries] = useState<TiltSeriesSummary[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<Id | null>(null);
  const [expandedSeriesId, setExpandedSeriesId] = useState<Id | null>(null);

  const [framesData, setFramesData] = useState<FramesPayload | null>(null);
  const [framesLoading, setFramesLoading] = useState(false);
  const [framesError, setFramesError] = useState<string | null>(null);

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [filterText, setFilterText] = useState<string>("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [invertPreview, setInvertPreview] = useState(false);

  const [previewReloadToken, setPreviewReloadToken] = useState(0);

  const previewAbortRef = useRef<AbortController | null>(null);
  const previewReqIdRef = useRef(0);
  const lastPreviewRevokeRef = useRef<(() => void) | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const autoplayRef = useRef<number | null>(null);
  const playDirectionRef = useRef<1 | -1>(1);

  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);

  const [displayedUrl, setDisplayedUrl] = useState<string | null>(null);
  const [transitionUrl, setTransitionUrl] = useState<string | null>(null);

  // Apply alignments toggle
  const [applyTransform, setApplyTransform] = useState<boolean>(true);

  // Column widths as percentages to avoid horizontal scroll
  const columnWidths = {
    series: { width: "16%" },
    order: { width: "7%" },
    angle: { width: "9%" },
    excluded: { width: "6%" },
    dose: { width: "7%" },
    path: { width: "27%" },
    rot: { width: "7%" },
    shiftX: { width: "7%" },
    shiftY: { width: "7%" },
  } as const;

  const imageFilterCss = useMemo(() => {
    const parts: string[] = [];
    if (invertPreview) {
      parts.push("invert(1)");
    }
    parts.push(`brightness(${brightness / 100})`);
    parts.push(`contrast(${contrast / 100})`);
    return parts.join(" ");
  }, [invertPreview, brightness, contrast]);

  const imageBaseSx = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      objectFit: "contain" as const,
      display: "block",
      filter: imageFilterCss,
    }),
    [imageFilterCss],
  );

  // Load list of tilt series for this output
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSeriesLoading(true);
        setSeriesError(null);
        setSeries([]);
        setSelectedSeriesId(null);
        setExpandedSeriesId(null);
        setFramesData(null);
        setFramesError(null);
        setSelectedRowIndex(null);
        setIsPlaying(false);

        const raw = await (svc as any).listOutputTiltSeries(
          projectId,
          protocolId,
          outputName,
        );

        if (cancelled) return;

        const items: TiltSeriesSummary[] = (raw || []).map((ts: any) => {
          const idRaw =
            ts.tiltSeriesId ??
            ts.tsId ??
            ts.id ??
            ts.name ??
            ts.label ??
            "TiltSeries";
          const id = String(idRaw);

          const label =
            ts.label ??
            ts.name ??
            ts.tsLabel ??
            `TiltSeries ${id}`;

          const dims: any = ts.dims ?? ts.shape ?? ts.size;

          return {
            tiltSeriesId: id,
            label,
            nViews: ts.nViews ?? ts.count ?? ts.nTilts ?? undefined,
            tiltAxisAngle:
              typeof ts.tiltAxisAngle === "number"
                ? ts.tiltAxisAngle
                : typeof ts.tilt_axis_angle === "number"
                ? ts.tilt_axis_angle
                : ts.axisAngle,
            pixelSize:
              typeof ts.pixelSize === "number"
                ? ts.pixelSize
                : typeof ts.samplingRate === "number"
                ? ts.samplingRate
                : undefined,
            dims:
              Array.isArray(dims) && dims.length >= 2
                ? [Number(dims[0]), Number(dims[1]), Number(dims[2] ?? 0)]
                : undefined,
          };
        });

        setSeries(items);
        if (items.length > 0) {
          const firstId = items[0].tiltSeriesId;
          setSelectedSeriesId(firstId);
          setExpandedSeriesId(firstId);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSeriesError(
            e?.message || "Failed to load tilt series for this output",
          );
        }
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, svc]);

  const activeSeries: TiltSeriesSummary | null = useMemo(() => {
    if (selectedSeriesId == null) return null;
    return (
      series.find(
        (s) => String(s.tiltSeriesId) === String(selectedSeriesId),
      ) ?? null
    );
  }, [series, selectedSeriesId]);

  // Load frames for selected tilt series
  useEffect(() => {
    if (selectedSeriesId == null) {
      setFramesData(null);
      setFramesError(null);
      setSelectedRowIndex(null);
      setIsPlaying(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setFramesLoading(true);
        setFramesError(null);
        setFramesData(null);
        setSelectedRowIndex(null);
        setIsPlaying(false);

        const raw = await (svc as any).fetchTiltSeriesFrames(
          projectId,
          protocolId,
          outputName,
          selectedSeriesId,
        );

        if (cancelled) return;

        let payload: FramesPayload;

        if (Array.isArray(raw)) {
          payload = {
            tiltSeriesId: selectedSeriesId,
            frames: normalizeFrames(raw),
            tiltAxisAngle: null,
          };
        } else {
          const obj: any = raw ?? {};
          const framesRaw =
            obj.frames ??
            obj.views ??
            (Array.isArray(obj.items) ? obj.items : []);
          payload = {
            tiltSeriesId:
              obj.tiltSeriesId ??
              obj.id ??
              selectedSeriesId,
            label: obj.label ?? obj.name,
            tiltAxisAngle:
              typeof obj.tiltAxisAngle === "number"
                ? obj.tiltAxisAngle
                : typeof obj.tilt_axis_angle === "number"
                ? obj.tilt_axis_angle
                : obj.axisAngle,
            frames: normalizeFrames(framesRaw),
          };
        }

        setFramesData(payload);
        if (payload.frames.length > 0) {
          const firstIncluded = payload.frames.findIndex(
            (f) => !f.excluded,
          );
          setSelectedRowIndex(
            firstIncluded >= 0 ? firstIncluded : 0,
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setFramesError(e?.message || "Failed to load tilt views");
        }
      } finally {
        if (!cancelled) setFramesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSeriesId, projectId, protocolId, outputName, svc]);

  // Derived filtered frames (for current selected series)
  const filteredFrames: TiltViewRow[] = useMemo(() => {
    if (!framesData?.frames) return [];
    if (!filterText.trim()) return framesData.frames;
    const q = filterText.toLowerCase();
    return framesData.frames.filter((f) => {
      const path = f.path ?? "";
      const angle = f.tiltAngle != null ? String(f.tiltAngle) : "";
      const order = f.order != null ? String(f.order) : "";
      const index = f.index != null ? String(f.index) : "";
      return (
        path.toLowerCase().includes(q) ||
        angle.toLowerCase().includes(q) ||
        order.toLowerCase().includes(q) ||
        index.toLowerCase().includes(q)
      );
    });
  }, [framesData, filterText]);

  // Map selectedRowIndex to the same index in filtered list
  const selectedFilteredIndex = useMemo(() => {
    if (
      selectedRowIndex == null ||
      !framesData?.frames ||
      !filteredFrames.length
    ) {
      return null;
    }
    const selectedView = framesData.frames[selectedRowIndex];
    if (!selectedView) return null;
    const idx = filteredFrames.findIndex(
      (f) => String(f.viewId) === String(selectedView.viewId),
    );
    return idx >= 0 ? idx : null;
  }, [selectedRowIndex, framesData, filteredFrames]);

  // Toggle exclude at frame index and sync series excluded flag
  const toggleExcludeAtIndex = (frameIndex: number) => {
    setFramesData((prev) => {
      if (!prev) return prev;
      if (
        frameIndex < 0 ||
        frameIndex >= prev.frames.length
      ) {
        return prev;
      }

      const nextFrames = prev.frames.map((f, idx) =>
        idx === frameIndex ? { ...f, excluded: !f.excluded } : f,
      );

      const allExcluded =
        nextFrames.length > 0 &&
        nextFrames.every((f) => f.excluded);

      setSeries((prevSeries) =>
        prevSeries.map((s) =>
          String(s.tiltSeriesId) === String(prev.tiltSeriesId)
            ? { ...s, excluded: allExcluded }
            : s,
        ),
      );

      return { ...prev, frames: nextFrames };
    });
  };

  const handleToggleExcludeCurrent = () => {
    if (selectedRowIndex == null || !framesData?.frames?.length) {
      return;
    }
    toggleExcludeAtIndex(selectedRowIndex);
  };

  const handleToggleExcludeRow = (row: TiltViewRow) => {
    if (!framesData?.frames) return;
    const idx = framesData.frames.findIndex(
      (f) => String(f.viewId) === String(row.viewId),
    );
    if (idx >= 0) {
      toggleExcludeAtIndex(idx);
    }
  };

  // Toggle exclude for whole tilt series (and its frames if loaded)
  const handleToggleExcludeSeries = (seriesId: Id) => {
    let updatedByFrames = false;

    setFramesData((prev) => {
      if (!prev || String(prev.tiltSeriesId) !== String(seriesId)) {
        return prev;
      }
      updatedByFrames = true;

      const anyIncluded = prev.frames.some((f) => !f.excluded);
      const newExcluded = anyIncluded;
      const nextFrames = prev.frames.map((f) => ({
        ...f,
        excluded: newExcluded,
      }));

      setSeries((prevSeries) =>
        prevSeries.map((s) =>
          String(s.tiltSeriesId) === String(seriesId)
            ? { ...s, excluded: newExcluded }
            : s,
        ),
      );

      return { ...prev, frames: nextFrames };
    });

    if (!updatedByFrames) {
      setSeries((prevSeries) =>
        prevSeries.map((s) =>
          String(s.tiltSeriesId) === String(seriesId)
            ? { ...s, excluded: !s.excluded }
            : s,
        ),
      );
    }
  };

  // Preview image for selected view
  useEffect(() => {
    if (
      selectedSeriesId == null ||
      selectedRowIndex == null ||
      !framesData?.frames ||
      !framesData.frames[selectedRowIndex]
    ) {
      previewAbortRef.current?.abort();
      setPreviewUrl(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const frameIndex = selectedRowIndex;

    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    const reqId = ++previewReqIdRef.current;

    (async () => {
      try {
        setPreviewLoading(true);
        setPreviewError(null);

        const options: any = {
          size: 1024,
          normalize: "minmax",
          signal: controller.signal,
        };
        if (applyTransform) {
          options.applyTransform = true;
        }

        const result: ObjectUrlResult | null =
          await (svc as any).fetchTiltSeriesViewImageObjectUrl(
            projectId,
            protocolId,
            outputName,
            selectedSeriesId,
            frameIndex,
            options,
          );

        if (controller.signal.aborted || previewReqIdRef.current !== reqId) {
          if (result?.revoke) {
            try {
              result.revoke();
            } catch {
              // ignore
            }
          }
          return;
        }

        if (lastPreviewRevokeRef.current) {
          try {
            lastPreviewRevokeRef.current();
          } catch {
            // ignore
          }
        }
        lastPreviewRevokeRef.current = result?.revoke ?? null;

        setPreviewUrl(result?.url ?? null);
      } catch (e: any) {
        if (controller.signal.aborted || previewReqIdRef.current !== reqId) {
          return;
        }
        setPreviewError(
          e?.message || "Failed to load tilt image preview",
        );
        setPreviewUrl(null);
      } finally {
        if (previewReqIdRef.current === reqId) {
          setPreviewLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    selectedSeriesId,
    selectedRowIndex,
    framesData,
    projectId,
    protocolId,
    outputName,
    svc,
    previewReloadToken,
    applyTransform,
  ]);

  // Manage displayedUrl vs transitionUrl for smooth crossfade
  useEffect(() => {
    if (!previewUrl) {
      setDisplayedUrl(null);
      setTransitionUrl(null);
      return;
    }
    if (!displayedUrl) {
      setDisplayedUrl(previewUrl);
      setTransitionUrl(null);
      return;
    }
    if (previewUrl === displayedUrl) {
      return;
    }
    setTransitionUrl(previewUrl);
  }, [previewUrl, displayedUrl]);

  // Cleanup object URL and autoplay on unmount
  useEffect(() => {
    return () => {
      if (lastPreviewRevokeRef.current) {
        try {
          lastPreviewRevokeRef.current();
        } catch {
          // ignore
        }
      }
      if (autoplayRef.current != null) {
        window.clearInterval(autoplayRef.current);
      }
    };
  }, []);

  const totalFrames = framesData?.frames.length ?? 0;

  const tiltAxisAngle =
    framesData?.tiltAxisAngle ?? activeSeries?.tiltAxisAngle ?? null;

  const canGoPrev =
    selectedRowIndex != null && selectedRowIndex > 0 && totalFrames > 0;
  const canGoNext =
    selectedRowIndex != null &&
    totalFrames > 0 &&
    selectedRowIndex < totalFrames - 1;

  const handlePrev = () => {
    if (!canGoPrev || selectedRowIndex == null) return;
    setSelectedRowIndex((prev) => (prev == null ? prev : prev - 1));
  };

  const handleNext = () => {
    if (!canGoNext || selectedRowIndex == null) return;
    setSelectedRowIndex((prev) => (prev == null ? prev : prev + 1));
  };

  const handleRowClick = (row: TiltViewRow) => {
    if (!framesData?.frames) return;
    const idx = framesData.frames.findIndex(
      (f) => String(f.viewId) === String(row.viewId),
    );
    if (idx >= 0) {
      setSelectedRowIndex(idx);
    }
  };

  const handleSeriesRowClick = (seriesId: Id) => {
    setSelectedSeriesId(seriesId);
    setExpandedSeriesId(seriesId);
  };

  const handleRefreshPreview = () => {
    if (selectedRowIndex == null) return;
    setPreviewUrl(null);
    setPreviewError(null);
    setDisplayedUrl(null);
    setTransitionUrl(null);
    setPreviewReloadToken((t) => t + 1);
  };

  // Autoplay: ping-pong between first and last tilt
  useEffect(() => {
    if (!isPlaying || !framesData?.frames?.length) {
      if (autoplayRef.current != null) {
        window.clearInterval(autoplayRef.current);
        autoplayRef.current = null;
      }
      return;
    }

    const handle = window.setInterval(() => {
      setSelectedRowIndex((prev) => {
        const total = framesData?.frames?.length ?? 0;
        if (!total) return prev;

        if (prev == null) {
          return 0;
        }

        let next = prev + playDirectionRef.current;

        if (next >= total) {
          playDirectionRef.current = -1;
          next = total - 2 >= 0 ? total - 2 : 0;
        } else if (next < 0) {
          playDirectionRef.current = 1;
          next = total > 1 ? 1 : 0;
        }

        return next;
      });
    }, 400);

    autoplayRef.current = handle;

    return () => {
      window.clearInterval(handle);
      if (autoplayRef.current === handle) {
        autoplayRef.current = null;
      }
    };
  }, [isPlaying, framesData?.frames?.length]);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* Left side: tilt series tree + tilt views */}
      <Box
        sx={{
          flex: 1.4,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #e5e7eb",
        }}
      >
        <Paper
          square
          elevation={0}
          sx={{
            p: 0.75,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
          >
            Filter (selected series)
          </Typography>
          <TextField
            size="small"
            variant="outlined"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by angle, order or path"
            sx={{
              maxWidth: 260,
              "& .MuiInputBase-input": {
                fontSize: "0.75rem",
                paddingY: 0.5,
              },
              "& input::placeholder": {
                fontSize: "0.7rem",
              },
            }}
          />
          {seriesLoading && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CircularProgress size={14} />
              <Typography
                variant="caption"
                sx={{ fontSize: "0.7rem" }}
              >
                Loading tilt series…
              </Typography>
            </Box>
          )}
          {seriesError && !seriesLoading && (
            <Typography
              variant="caption"
              color="error"
              sx={{ fontSize: "0.7rem" }}
            >
              {seriesError}
            </Typography>
          )}
        </Paper>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {framesLoading && !framesData ? (
            <Box
              sx={{
                p: 2,
                display: "flex",
                gap: 1,
                alignItems: "center",
              }}
            >
              <CircularProgress size={18} />
              <Typography variant="body2">
                Loading tilt views…
              </Typography>
            </Box>
          ) : framesError && !framesData ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="error">
                {framesError}
              </Typography>
            </Box>
          ) : !series.length ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No tilt series available for this output.
              </Typography>
            </Box>
          ) : (
            <Table
              size="small"
              stickyHeader
              sx={{
                tableLayout: "fixed",
                width: "100%",
                "& th": {
                  whiteSpace: "nowrap",
                  fontSize: "0.75rem",
                  paddingTop: 0.5,
                  paddingBottom: 0.5,
                },
                "& td": {
                  fontSize: "0.75rem",
                  paddingTop: 0.25,
                  paddingBottom: 0.25,
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={columnWidths.series}>
                    Tilt series
                  </TableCell>
                  <TableCell sx={columnWidths.order}>
                    Order
                  </TableCell>
                  <TableCell sx={columnWidths.angle}>
                    Tilt angle
                  </TableCell>
                  <TableCell sx={columnWidths.excluded}>
                    Excl.
                  </TableCell>
                  <TableCell sx={columnWidths.dose}>
                    Dose
                  </TableCell>
                  <TableCell sx={columnWidths.path}>
                    Path
                  </TableCell>
                  <TableCell sx={columnWidths.rot}>
                    Rot
                  </TableCell>
                  <TableCell sx={columnWidths.shiftX}>
                    ShiftX
                  </TableCell>
                  <TableCell sx={columnWidths.shiftY}>
                    ShiftY
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {series.map((s) => {
                  const isExpanded =
                    expandedSeriesId != null &&
                    String(expandedSeriesId) ===
                      String(s.tiltSeriesId);
                  const isSelectedSeries =
                    selectedSeriesId != null &&
                    String(selectedSeriesId) ===
                      String(s.tiltSeriesId);

                  const showFramesForThisSeries =
                    isExpanded &&
                    framesData &&
                    String(framesData.tiltSeriesId) ===
                      String(s.tiltSeriesId);

                  const seriesFrames = showFramesForThisSeries
                    ? filteredFrames
                    : [];

                  return (
                    <Fragment key={String(s.tiltSeriesId)}>
                      {/* Series row */}
                      <TableRow
                        hover
                        selected={isSelectedSeries}
                        onClick={() =>
                          handleSeriesRowClick(s.tiltSeriesId)
                        }
                        sx={{
                          cursor: "pointer",
                          ...(s.excluded && {
                            backgroundColor:
                              "rgba(248,113,113,0.16)",
                            "&:hover": {
                              backgroundColor:
                                "rgba(248,113,113,0.24)",
                            },
                            "&.Mui-selected": {
                              backgroundColor:
                                "rgba(248,113,113,0.30)",
                            },
                            "&.Mui-selected:hover": {
                              backgroundColor:
                                "rgba(248,113,113,0.36)",
                            },
                          }),
                        }}
                      >
                        <TableCell sx={columnWidths.series}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.25,
                            }}
                          >
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextExpanded = isExpanded
                                  ? null
                                  : s.tiltSeriesId;
                                setExpandedSeriesId(nextExpanded);
                                if (nextExpanded) {
                                  setSelectedSeriesId(
                                    s.tiltSeriesId,
                                  );
                                }
                              }}
                              sx={{ mr: 0.25 }}
                            >
                              {isExpanded ? (
                                <ExpandMore fontSize="small" />
                              ) : (
                                <ChevronRight fontSize="small" />
                              )}
                            </IconButton>
                            <Checkbox
                              size="small"
                              checked={Boolean(s.excluded)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() =>
                                handleToggleExcludeSeries(
                                  s.tiltSeriesId,
                                )
                              }
                              sx={{
                                padding: 0.25,
                              }}
                            />
                            <Typography
                              variant="body2"
                              noWrap
                              title={s.label}
                              sx={{ fontSize: "0.75rem" }}
                            >
                              {String(s.tiltSeriesId)}
                            </Typography>
                          </Box>
                        </TableCell>
                        {/* Order column for series row (empty) */}
                        <TableCell sx={columnWidths.order} />
                        {/* Empty cells to align with header */}
                        <TableCell sx={columnWidths.angle} />
                        <TableCell sx={columnWidths.excluded} />
                        <TableCell sx={columnWidths.dose} />
                        <TableCell sx={columnWidths.path} />
                        <TableCell sx={columnWidths.rot} />
                        <TableCell sx={columnWidths.shiftX} />
                        <TableCell sx={columnWidths.shiftY} />
                      </TableRow>

                      {/* Frame rows for this series */}
                      {showFramesForThisSeries &&
                        seriesFrames.map((row, idx) => {
                          const isSelectedRow =
                            idx === selectedFilteredIndex &&
                            isSelectedSeries;
                          return (
                            <TableRow
                              key={`${String(
                                s.tiltSeriesId,
                              )}-${String(row.viewId)}`}
                              hover
                              selected={isSelectedRow}
                              onClick={() =>
                                handleRowClick(row)
                              }
                              sx={{
                                cursor: "pointer",
                                ...(row.excluded && {
                                  backgroundColor:
                                    "rgba(248,113,113,0.16)",
                                  "&:hover": {
                                    backgroundColor:
                                      "rgba(248,113,113,0.24)",
                                  },
                                  "&.Mui-selected": {
                                    backgroundColor:
                                      "rgba(248,113,113,0.30)",
                                  },
                                  "&.Mui-selected:hover": {
                                    backgroundColor:
                                      "rgba(248,113,113,0.36)",
                                  },
                                }),
                              }}
                            >
                              {/* First column: indent + index (tree) */}
                              <TableCell sx={columnWidths.series}>
                                <Box
                                  sx={{
                                    pl: 6,
                                    display: "flex",
                                    alignItems: "center",
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    sx={{ fontSize: "0.75rem" }}
                                  >
                                    {row.index != null
                                      ? row.index
                                      : ""}
                                  </Typography>
                                </Box>
                              </TableCell>
                              {/* Order column */}
                              <TableCell sx={columnWidths.order}>
                                {row.order != null
                                  ? row.order
                                  : ""}
                              </TableCell>
                              <TableCell sx={columnWidths.angle}>
                                {row.tiltAngle != null
                                  ? row.tiltAngle.toFixed(2)
                                  : ""}
                              </TableCell>
                              <TableCell sx={columnWidths.excluded}>
                                <Checkbox
                                  size="small"
                                  checked={Boolean(row.excluded)}
                                  onClick={(e) =>
                                    e.stopPropagation()
                                  }
                                  onChange={() =>
                                    handleToggleExcludeRow(row)
                                  }
                                  sx={{
                                    padding: 0.25,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={columnWidths.dose}>
                                {row.dose != null
                                  ? row.dose.toFixed(2)
                                  : ""}
                              </TableCell>
                              <TableCell
                                sx={{
                                  ...columnWidths.path,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                }}
                                title={row.path ?? undefined}
                              >
                                {row.path
                                  ? truncatePathMiddle(row.path)
                                  : ""}
                              </TableCell>
                              <TableCell sx={columnWidths.rot}>
                                {row.rot != null
                                  ? row.rot.toFixed(2)
                                  : ""}
                              </TableCell>
                              <TableCell sx={columnWidths.shiftX}>
                                {row.shiftX != null
                                  ? row.shiftX.toFixed(2)
                                  : ""}
                              </TableCell>
                              <TableCell sx={columnWidths.shiftY}>
                                {row.shiftY != null
                                  ? row.shiftY.toFixed(2)
                                  : ""}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Box>
      </Box>

      {/* Right side: image preview and controls */}
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
            p: 0.75,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontSize: "0.8rem" }}
            >
              Tilt view preview
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.7rem" }}
            >
              {selectedRowIndex != null && totalFrames > 0
                ? `View ${selectedRowIndex + 1} of ${totalFrames}`
                : "No view selected"}
            </Typography>
          </Box>
        </Paper>

        {/* Smaller brightness/contrast panel */}
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderBottom: "1px solid #e5e7eb",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "nowrap", fontSize: "0.7rem" }}
            >
              Brightness
            </Typography>
            <Slider
              size="small"
              value={brightness}
              min={50}
              max={200}
              onChange={(_, value) => setBrightness(value as number)}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "nowrap", fontSize: "0.7rem" }}
            >
              Contrast
            </Typography>
            <Slider
              size="small"
              value={contrast}
              min={50}
              max={200}
              onChange={(_, value) => setContrast(value as number)}
            />
          </Box>
        </Box>

        {/* Image + overlay controls */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "background.default",
            position: "relative",
          }}
          onDoubleClick={() => setInvertPreview((prev) => !prev)}
        >
          {/* Overlay controls centered on top of the image */}
          <Box
            sx={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              bgcolor: "rgba(248,250,252,0.9)",
              borderRadius: 9999,
              px: 0.75,
              py: 0.25,
              zIndex: 2,
              boxShadow: 1,
            }}
          >
            <Tooltip title="Previous tilt">
              <span>
                <IconButton
                  size="small"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  sx={{ color: "text.primary" }}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Next tilt">
              <span>
                <IconButton
                  size="small"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  sx={{ color: "text.primary" }}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Refresh preview">
              <span>
                <IconButton
                  size="small"
                  onClick={handleRefreshPreview}
                  disabled={selectedRowIndex == null}
                  sx={{ color: "text.primary" }}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Toggle exclude current tilt">
              <span>
                <IconButton
                  size="small"
                  onClick={handleToggleExcludeCurrent}
                  disabled={
                    selectedRowIndex == null ||
                    !framesData?.frames?.length
                  }
                  sx={{ color: "text.primary" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip
              title={
                applyTransform
                  ? "Disable alignments"
                  : "Apply alignments"
              }
            >
              <span>
                <IconButton
                  size="small"
                  onClick={() =>
                    setApplyTransform((prev) => !prev)
                  }
                  sx={{
                    color: applyTransform
                      ? "primary.main"
                      : "text.primary",
                    bgcolor: applyTransform
                      ? "rgba(59,130,246,0.12)"
                      : "transparent",
                    "&:hover": {
                      bgcolor: applyTransform
                        ? "rgba(59,130,246,0.20)"
                        : "action.hover",
                    },
                  }}
                >
                  <TransformIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="Play (auto navigate)">
              <span>
                <IconButton
                  size="small"
                  onClick={() => {
                    if (totalFrames > 0) {
                      playDirectionRef.current = 1;
                      setIsPlaying(true);
                    }
                  }}
                  disabled={totalFrames <= 1}
                  sx={{ color: "text.primary" }}
                >
                  <PlayArrow fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Stop autoplay">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setIsPlaying(false)}
                  disabled={!isPlaying}
                  sx={{ color: "text.primary" }}
                >
                  <StopIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {previewError ? (
            <Typography variant="body2" color="error">
              {previewError}
            </Typography>
          ) : !displayedUrl && !transitionUrl && !previewLoading ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: "0.8rem" }}
            >
              No preview available.
            </Typography>
          ) : (
            <>
              {previewLoading && (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 3,
                    pointerEvents: "none",
                  }}
                >
                  <CircularProgress size={22} />
                </Box>
              )}
              {(displayedUrl || transitionUrl) && (
                <Box
                  sx={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  {displayedUrl && (
                    <Box
                      component="img"
                      src={displayedUrl}
                      alt="Tilt view"
                      sx={imageBaseSx}
                    />
                  )}
                  {transitionUrl && (
                    <Box
                      component="img"
                      src={transitionUrl}
                      alt="Tilt view"
                      onAnimationEnd={() => {
                        setDisplayedUrl(transitionUrl);
                        setTransitionUrl(null);
                      }}
                      sx={{
                        ...imageBaseSx,
                        position: "absolute",
                        top: 0,
                        left: 0,
                        animation: "tiltFadeIn 220ms ease-out",
                        "@keyframes tiltFadeIn": {
                          from: { opacity: 0 },
                          to: { opacity: 1 },
                        },
                      }}
                    />
                  )}
                </Box>
              )}
            </>
          )}
        </Box>

        <Box
          sx={{
            p: 0.75,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            bgcolor: "background.paper",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: "0.7rem" }}
          >
            {tiltAxisAngle != null
              ? `Tilt axis angle: ${tiltAxisAngle.toFixed(2)}`
              : "Tilt axis angle: not available"}
          </Typography>

          {activeSeries?.dims && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.7rem" }}
            >
              Size: {activeSeries.dims[0]} × {activeSeries.dims[1]}
              {typeof activeSeries.dims[2] === "number" &&
              activeSeries.dims[2]
                ? ` × ${activeSeries.dims[2]}`
                : ""}
              {activeSeries.pixelSize
                ? `, ${activeSeries.pixelSize.toFixed(2)} Å/px`
                : ""}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function normalizeFrames(raw: any[]): TiltViewRow[] {
  return (raw || []).map((f: any, idx: number) => {
    const viewId = f.viewId ?? f.id ?? f.index ?? idx;
    const toNumber = (v: any): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const indexValue = toNumber(
      f.index ?? f.viewIndex ?? idx,
    );

    let orderValue: number | null = null;
    if (f.order != null || f.viewIndex != null) {
      orderValue = toNumber(f.order ?? f.viewIndex);
    } else {
      orderValue = indexValue;
    }

    return {
      viewId,
      index: indexValue,
      order: orderValue,
      tiltAngle: toNumber(
        f.tiltAngle ?? f.tilt_angle ?? f.angle ?? f.alpha,
      ),
      excluded:
        typeof f.excluded === "boolean"
          ? f.excluded
          : typeof f.isExcluded === "boolean"
          ? f.isExcluded
          : Boolean(f.skip),
      dose: toNumber(f.dose ?? f.cumulativeDose),
      path:
        f.path ??
        f.fileName ??
        f.file ??
        f.micrograph ??
        f.image ??
        null,
      rot: toNumber(f.rot ?? f.rotation),
      shiftX: toNumber(
        f.shiftX ?? f.shift_x ?? f.sx ?? f.shiftx,
      ),
      shiftY: toNumber(
        f.shiftY ?? f.shift_y ?? f.sy ?? f.shifty,
      ),
    } as TiltViewRow;
  });
}
