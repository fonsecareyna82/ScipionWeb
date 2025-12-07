// src/components/analyze/tiltseries-viewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Slider,
} from "@mui/material";
import {
  ArrowUpward,
  ArrowDownward,
  Refresh as RefreshIcon,
  PlayArrow,
  Stop as StopIcon,
  Block as BlockIcon,
} from "@mui/icons-material";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id } from "@/services/ProjectService";

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
};

type TiltViewRow = {
  viewId: Id;
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

  // 1 means forward (increasing index), -1 means backward (decreasing index)
  const playDirectionRef = useRef<1 | -1>(1);

  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);

  const [displayedUrl, setDisplayedUrl] = useState<string | null>(null);
  const [transitionUrl, setTransitionUrl] = useState<string | null>(null);

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
          setSelectedSeriesId(items[0].tiltSeriesId);
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

  const filteredFrames: TiltViewRow[] = useMemo(() => {
    if (!framesData?.frames) return [];
    if (!filterText.trim()) return framesData.frames;
    const q = filterText.toLowerCase();
    return framesData.frames.filter((f) => {
      const path = f.path ?? "";
      const angle = f.tiltAngle != null ? String(f.tiltAngle) : "";
      const order = f.order != null ? String(f.order) : "";
      return (
        path.toLowerCase().includes(q) ||
        angle.toLowerCase().includes(q) ||
        order.toLowerCase().includes(q)
      );
    });
  }, [framesData, filterText]);

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

  // Toggle excluded flag by global index
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

      // Here you can call backend API to persist exclusion if needed.

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

        const result: ObjectUrlResult | null =
          await (svc as any).fetchTiltSeriesViewImageObjectUrl(
            projectId,
            protocolId,
            outputName,
            selectedSeriesId,
            frameIndex,
            {
              size: 1024,
              normalize: "minmax",
              applyTransform: true,
              signal: controller.signal,
            },
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

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (lastPreviewRevokeRef.current) {
        try {
          lastPreviewRevokeRef.current();
        } catch {
          // ignore
        }
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
          // If there was no selection, start at first frame
          return 0;
        }

        let next = prev + playDirectionRef.current;

        // If we move past the last index, reverse direction and step back
        if (next >= total) {
          playDirectionRef.current = -1;
          next = total - 2 >= 0 ? total - 2 : 0;
        } else if (next < 0) {
          // If we move before the first index, reverse direction and step forward
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

  // Cleanup autoplay timer on unmount
  useEffect(() => {
    return () => {
      if (autoplayRef.current != null) {
        window.clearInterval(autoplayRef.current);
      }
    };
  }, []);

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
      {/* Left side: series selector + table */}
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
            p: 1,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="tiltseries-select-label">
              Tilt series (id)
            </InputLabel>
            <Select
              labelId="tiltseries-select-label"
              label="Tilt series (id)"
              value={
                selectedSeriesId != null ? String(selectedSeriesId) : ""
              }
              onChange={(e) => {
                const value = e.target.value as string;
                setSelectedSeriesId(value);
              }}
              disabled={seriesLoading || !series.length}
            >
              {series.map((s) => (
                <MenuItem
                  key={String(s.tiltSeriesId)}
                  value={String(s.tiltSeriesId)}
                  title={s.label}
                >
                  {String(s.tiltSeriesId)}
                  {s.nViews != null ? ` (${s.nViews} views)` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {seriesLoading && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption">
                Loading tilt series…
              </Typography>
            </Box>
          )}

          {seriesError && !seriesLoading && (
            <Typography variant="caption" color="error">
              {seriesError}
            </Typography>
          )}
        </Paper>

        <Box
          sx={{
            p: 1,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Filter
          </Typography>
          <TextField
            size="small"
            variant="outlined"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by angle, order or path"
            fullWidth
          />
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {framesLoading ? (
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
          ) : framesError ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="error">
                {framesError}
              </Typography>
            </Box>
          ) : !framesData || !framesData.frames.length ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No tilt views available for this series.
              </Typography>
            </Box>
          ) : (
            <Table
              size="small"
              stickyHeader
              sx={{
                minWidth: 650,
                "& th": { whiteSpace: "nowrap" },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell align="right">Order</TableCell>
                  <TableCell align="right">Tilt angle</TableCell>
                  <TableCell align="center">Excluded</TableCell>
                  <TableCell align="right">Dose</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell align="right">Rot</TableCell>
                  <TableCell align="right">ShiftX</TableCell>
                  <TableCell align="right">ShiftY</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredFrames.map((row, idx) => {
                  const isSelected = idx === selectedFilteredIndex;
                  return (
                    <TableRow
                      key={String(row.viewId)}
                      hover
                      selected={isSelected}
                      onClick={() => handleRowClick(row)}
                      sx={{
                        cursor: "pointer",
                        ...(row.excluded && {
                          backgroundColor: "rgba(248,113,113,0.16)",
                          "&:hover": {
                            backgroundColor: "rgba(248,113,113,0.24)",
                          },
                          "&.Mui-selected": {
                            backgroundColor: "rgba(248,113,113,0.30)",
                          },
                          "&.Mui-selected:hover": {
                            backgroundColor: "rgba(248,113,113,0.36)",
                          },
                        }),
                      }}
                    >
                      <TableCell align="right">
                        {row.order ?? ""}
                      </TableCell>
                      <TableCell align="right">
                        {row.tiltAngle != null
                          ? row.tiltAngle.toFixed(2)
                          : ""}
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          size="small"
                          checked={Boolean(row.excluded)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleExcludeRow(row)}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {row.dose != null ? row.dose.toFixed(2) : ""}
                      </TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 320,
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                        }}
                        title={row.path ?? undefined}
                      >
                        {row.path}
                      </TableCell>
                      <TableCell align="right">
                        {row.rot != null ? row.rot.toFixed(2) : ""}
                      </TableCell>
                      <TableCell align="right">
                        {row.shiftX != null
                          ? row.shiftX.toFixed(2)
                          : ""}
                      </TableCell>
                      <TableCell align="right">
                        {row.shiftY != null
                          ? row.shiftY.toFixed(2)
                          : ""}
                      </TableCell>
                    </TableRow>
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
            p: 1,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography variant="subtitle2">
              Tilt view preview
            </Typography>
            <Typography variant="caption" color="text.secondary">
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
              gap: 1,
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "nowrap" }}
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
              gap: 1,
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "nowrap" }}
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
          {/* Overlay controls centered on top of the image, with lighter background */}
          <Box
            sx={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
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
                  <BlockIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Play (auto navigate)">
              <span>
                <IconButton
                  size="small"
                  onClick={() => {
                    if (totalFrames > 0) {
                      // Reset direction to forward when starting autoplay
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
            <Typography variant="body2" color="text.secondary">
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
            p: 1,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            bgcolor: "background.paper",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {tiltAxisAngle != null
              ? `Tilt axis angle: ${tiltAxisAngle.toFixed(2)}`
              : "Tilt axis angle: not available"}
          </Typography>

          {activeSeries?.dims && (
            <Typography variant="caption" color="text.secondary">
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
    return {
      viewId,
      order: toNumber(f.order ?? f.index ?? f.viewIndex),
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
