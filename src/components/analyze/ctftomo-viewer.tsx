// src/components/analyze/ctftomo-viewer.tsx
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
  Button,
  Tabs,
  Tab,
} from "@mui/material";
import {
  ExpandMore,
  ChevronRight,
} from "@mui/icons-material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id } from "@/services/ProjectService";
import toast from "react-hot-toast";

type CTFTomoViewerProps = {
  projectId: Id;
  protocolId: Id;
  outputName: string;
  protocolLabel?: string;
};

type CTFTomoSeriesSummary = {
  ctfSeriesId: Id;
  label: string;
  nViews?: number;
  excluded?: boolean;
};

type CTFViewRow = {
  viewId: Id;
  index?: number | null;
  order?: number | null;
  tiltAngle?: number | null;
  excluded?: boolean;
  defocusU?: number | null;
  defocusV?: number | null;
  astigmatism?: number | null;
  resolution?: number | null;
  ccValue?: number | null;
  psdFile?: string | null;
};

type CTFFramesPayload = {
  ctfSeriesId: Id;
  label?: string;
  frames: CTFViewRow[];
};

type CTFExclusionsMap = Record<
  string,
  {
    excluded: boolean;
    tiltimages: number[];
  }
>;

// Minimal tooltip payload type to avoid TS issues with Recharts types
type CtfTooltipEntry = {
  dataKey?: string | number;
  color?: string;
  value?: number;
  name?: string;
};

// Custom tooltip props type
type CtfTooltipProps = {
  active?: boolean;
  payload?: CtfTooltipEntry[];
  label?: number | string;
};

// Helper to format numbers with N decimals when defined
function formatNumber(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

// Helper to format axis ticks with two decimals
function formatAxisNumber(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

// Custom tooltip for the CTF chart, with colored lines matching each curve
function CtfChartTooltip(props: CtfTooltipProps) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const tiltAngleVal =
    typeof label === "number" ? label : Number(label);

  const defocusUEntry = payload.find(
    (p) => p.dataKey === "defocusU",
  );
  const defocusVEntry = payload.find(
    (p) => p.dataKey === "defocusV",
  );
  const resolutionEntry = payload.find(
    (p) => p.dataKey === "resolution",
  );

  const defocusU =
    defocusUEntry && typeof defocusUEntry.value === "number"
      ? defocusUEntry.value
      : null;
  const defocusV =
    defocusVEntry && typeof defocusVEntry.value === "number"
      ? defocusVEntry.value
      : null;
  const resolution =
    resolutionEntry &&
    typeof resolutionEntry.value === "number"
      ? resolutionEntry.value
      : null;

  const colorU = defocusUEntry?.color ?? "#ef4444";
  const colorV = defocusVEntry?.color ?? "#3b82f6";
  const colorRes = resolutionEntry?.color ?? "#22c55e";

  return (
    <Paper
      elevation={3}
      sx={{ p: 0.75 }}
    >
      <Typography
        variant="caption"
        sx={{ fontSize: "0.7rem", display: "block" }}
      >
        Tilt angle:{" "}
        {Number.isFinite(tiltAngleVal)
          ? `${tiltAngleVal.toFixed(2)}°`
          : "-"}
      </Typography>
      {defocusU != null && Number.isFinite(defocusU) && (
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.7rem",
            display: "block",
            color: colorU,
          }}
        >
          DefocusU: {formatAxisNumber(defocusU)} Å
        </Typography>
      )}
      {defocusV != null && Number.isFinite(defocusV) && (
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.7rem",
            display: "block",
            color: colorV,
          }}
        >
          DefocusV: {formatAxisNumber(defocusV)} Å
        </Typography>
      )}
      {resolution != null &&
        Number.isFinite(resolution) && (
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.7rem",
              display: "block",
              color: colorRes,
            }}
          >
            Resolution: {formatAxisNumber(resolution)} Å
          </Typography>
        )}
    </Paper>
  );
}

export default function CTFTomoViewer({
  projectId,
  protocolId,
  outputName,
}: CTFTomoViewerProps) {
  const svc = useProjectService();

  const [series, setSeries] = useState<CTFTomoSeriesSummary[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<Id | null>(null);
  const [expandedSeriesId, setExpandedSeriesId] = useState<Id | null>(null);

  const [framesData, setFramesData] = useState<CTFFramesPayload | null>(null);
  const [framesLoading, setFramesLoading] = useState(false);
  const [framesError, setFramesError] = useState<string | null>(null);

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [filterText, setFilterText] = useState<string>("");

  const [viewMode, setViewMode] = useState<"seriesChart" | "psdView">(
    "seriesChart",
  );
  const [psdError, setPsdError] = useState<string | null>(null);
  const [psdLoading, setPsdLoading] = useState(false);
  const [psdImageUrl, setPsdImageUrl] = useState<string | null>(null);

  const exclusionsRef = useRef<CTFExclusionsMap | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);

  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Column widths as percentages to avoid horizontal scroll
  const columnWidths = {
    series: { width: "16%" },
    order: { width: "8%" },
    angle: { width: "9%" },
    excluded: { width: "6%" },
    defocusU: { width: "11%" },
    defocusV: { width: "11%" },
    astigmatism: { width: "11%" },
    resolution: { width: "11%" },
    ccValue: { width: "11%" },
  } as const;

  // Helper to format API errors similar to ProjectPage and TiltSeriesViewer
  const getErrorMsg = (e: any): string => {
    if (e && typeof e === "object") {
      const status = (e as any).status;
      const data = (e as any).data;
      if (status === 500) {
        return (data?.detail as string) || (e as any).message || "Server error";
      }
      return (data?.message as string) || (e as any).message || "Operation failed";
    }
    return "Operation failed";
  };

  const disposePsdImageUrl = () => {
    if (psdImageUrl) {
      URL.revokeObjectURL(psdImageUrl);
    }
    setPsdImageUrl(null);
  };

  useEffect(() => {
    return () => {
      disposePsdImageUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load list of CTF tomo series for this output
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
        setViewMode("seriesChart");
        setPsdError(null);
        disposePsdImageUrl();

        const raw = await (svc as any).listOutputCTFTomoSeries(
          projectId,
          protocolId,
          outputName,
        );

        if (cancelled) return;

        const items: CTFTomoSeriesSummary[] = (raw || []).map((s: any) => {
          const idRaw =
            s.ctfSeriesId ??
            s.tiltSeriesId ??
            s.tsId ??
            s.id ??
            s.name ??
            s.label ??
            "CTFSeries";
          const id = String(idRaw);

          const label =
            s.label ??
            s.name ??
            s.tsLabel ??
            `CTFSeries ${id}`;

          return {
            ctfSeriesId: id,
            label,
            nViews: s.nViews ?? s.count ?? s.nTilts ?? undefined,
            excluded:
              typeof s.excluded === "boolean"
                ? s.excluded
                : typeof s.isExcluded === "boolean"
                  ? s.isExcluded
                  : false,
          };
        });

        setSeries(items);
        if (items.length > 0) {
          const firstId = items[0].ctfSeriesId;
          setSelectedSeriesId(firstId);
          setExpandedSeriesId(firstId);
          setViewMode("seriesChart");
        }
      } catch (e: any) {
        if (!cancelled) {
          setSeriesError(
            e?.message || "Failed to load CTF tomo series for this output",
          );
        }
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, protocolId, outputName, svc]);

  const activeSeries: CTFTomoSeriesSummary | null = useMemo(() => {
    if (selectedSeriesId == null) return null;
    return (
      series.find(
        (s) => String(s.ctfSeriesId) === String(selectedSeriesId),
      ) ?? null
    );
  }, [series, selectedSeriesId]);

  // Load CTF views for selected series
  useEffect(() => {
    if (selectedSeriesId == null) {
      setFramesData(null);
      setFramesError(null);
      setSelectedRowIndex(null);
      setViewMode("seriesChart");
      setPsdError(null);
      disposePsdImageUrl();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setFramesLoading(true);
        setFramesError(null);
        setFramesData(null);
        setSelectedRowIndex(null);
        setViewMode("seriesChart");
        setPsdError(null);
        disposePsdImageUrl();

        const raw = await (svc as any).fetchCTFTomoSeriesViews(
          projectId,
          protocolId,
          outputName,
          selectedSeriesId,
        );

        if (cancelled) return;

        let payload: CTFFramesPayload;

        if (Array.isArray(raw)) {
          payload = {
            ctfSeriesId: selectedSeriesId,
            frames: normalizeCtfViews(raw),
          };
        } else {
          const obj: any = raw ?? {};
          const framesRaw =
            obj.frames ??
            obj.views ??
            (Array.isArray(obj.items) ? obj.items : []);

          payload = {
            ctfSeriesId:
              obj.ctfSeriesId ??
              obj.tiltSeriesId ??
              obj.id ??
              selectedSeriesId,
            label: obj.label ?? obj.name,
            frames: normalizeCtfViews(framesRaw),
          };
        }

        setFramesData(payload);
        setSelectedRowIndex(null);
        setViewMode("seriesChart");
      } catch (e: any) {
        if (!cancelled) {
          setFramesError(e?.message || "Failed to load CTF tomo views");
        }
      } finally {
        if (!cancelled) setFramesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeriesId, projectId, protocolId, outputName, svc]);

  // Derived filtered frames for the current series
  const filteredFrames: CTFViewRow[] = useMemo(() => {
    if (!framesData?.frames) return [];
    if (!filterText.trim()) return framesData.frames;
    const q = filterText.toLowerCase();
    return framesData.frames.filter((f) => {
      const angle = f.tiltAngle != null ? String(f.tiltAngle) : "";
      const order = f.order != null ? String(f.order) : "";
      const index = f.index != null ? String(f.index) : "";
      const defocusU = f.defocusU != null ? String(f.defocusU) : "";
      const defocusV = f.defocusV != null ? String(f.defocusV) : "";
      const resolution = f.resolution != null ? String(f.resolution) : "";
      return (
        angle.toLowerCase().includes(q) ||
        order.toLowerCase().includes(q) ||
        index.toLowerCase().includes(q) ||
        defocusU.toLowerCase().includes(q) ||
        defocusV.toLowerCase().includes(q) ||
        resolution.toLowerCase().includes(q)
      );
    });
  }, [framesData, filterText]);

  // Map selectedRowIndex to index in filtered list
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

  // Selected frame object for current series/index
  const selectedFrame: CTFViewRow | null = useMemo(() => {
    if (
      selectedRowIndex == null ||
      !framesData?.frames ||
      !framesData.frames.length
    ) {
      return null;
    }
    return framesData.frames[selectedRowIndex] ?? null;
  }, [framesData, selectedRowIndex]);

  // Chart data for the right panel (sorted by tilt angle)
  const chartData = useMemo(() => {
    if (!framesData?.frames?.length) return [];
    return framesData.frames
      .filter((f) => f.tiltAngle != null)
      .map((f) => {
        const res = f.resolution ?? null;
        return {
          tiltAngle: f.tiltAngle as number,
          defocusU: f.defocusU ?? null,
          defocusV: f.defocusV ?? null,
          // Resolution 0 is treated as no value
          resolution: res === 0 ? null : res,
          excluded: Boolean(f.excluded),
        };
      })
      .sort((a, b) => a.tiltAngle - b.tiltAngle);
  }, [framesData]);

  // Domains for Y axes (Defocus domain uses raw defocusU/V values)
  const defocusDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) return [0, 1];
    let min = Infinity;
    let max = -Infinity;

    chartData.forEach((d) => {
      const vals: number[] = [];
      if (d.defocusU != null && Number.isFinite(d.defocusU)) {
        vals.push(d.defocusU as number);
      }
      if (d.defocusV != null && Number.isFinite(d.defocusV)) {
        vals.push(d.defocusV as number);
      }
      vals.forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 1];
    }
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      return [min - pad, min + pad];
    }
    const span = max - min;
    const pad = span * 0.1;
    return [min - pad, max + pad];
  }, [chartData]);

  const resolutionDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) return [0, 1];
    let min = Infinity;
    let max = -Infinity;

    chartData.forEach((d) => {
      const v = d.resolution;
      if (v == null || !Number.isFinite(v)) return;
      if (v < min) min = v;
      if (v > max) max = v;
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 1];
    }
    if (min === max) {
      const pad = min * 0.1 || 0.1;
      return [min - pad, min + pad];
    }
    const span = max - min;
    const pad = span * 0.1;
    return [min - pad, max + pad];
  }, [chartData]);

  const totalFrames = framesData?.frames.length ?? 0;
  const isPsdMode = viewMode === "psdView";

  const loadPsdForRow = async (row: CTFViewRow) => {
    if (!row.psdFile) {
      setViewMode("seriesChart");
      setPsdError(null);
      disposePsdImageUrl();
      return;
    }

    try {
      setPsdLoading(true);
      setPsdError(null);
      disposePsdImageUrl();

      const blob: Blob = await (svc as any).fetchCTFPsdImage(
        projectId,
        protocolId,
        outputName,
        row.psdFile,
      );

      const url = URL.createObjectURL(blob);
      setPsdImageUrl(url);
      setViewMode("psdView");
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to load PSD image", e);
      setPsdError(
        getErrorMsg(e) ||
        "Failed to load PSD image for the selected view.",
      );
      setViewMode("seriesChart");
      disposePsdImageUrl();
    } finally {
      setPsdLoading(false);
    }
  };

  const handleRowClick = (row: CTFViewRow) => {
    if (!framesData?.frames) return;
    const idx = framesData.frames.findIndex(
      (f) => String(f.viewId) === String(row.viewId),
    );
    if (idx >= 0) {
      setSelectedRowIndex(idx);
      if (row.psdFile) {
        loadPsdForRow(row);
      } else {
        setViewMode("seriesChart");
        setPsdError(null);
        disposePsdImageUrl();
      }
    }
  };

  const handleSeriesRowClick = (seriesId: Id) => {
    setExpandedSeriesId(seriesId);
    setSelectedSeriesId((prev) =>
      prev != null && String(prev) === String(seriesId) ? prev : seriesId,
    );
    setViewMode("seriesChart");
    setPsdError(null);
    disposePsdImageUrl();
  };

  const handleChartTabChange = (
    _event: any,
    value: "seriesChart" | "psdView",
  ) => {
    setViewMode(value);
    if (value === "seriesChart") {
      setPsdError(null);
    }
  };

  const toggleExcludeAtIndex = (frameIndex: number) => {
    setFramesData((prev) => {
      if (!prev) return prev;
      if (frameIndex < 0 || frameIndex >= prev.frames.length) {
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
          String(s.ctfSeriesId) === String(prev.ctfSeriesId)
            ? { ...s, excluded: allExcluded }
            : s,
        ),
      );

      return { ...prev, frames: nextFrames };
    });
  };

  const handleToggleExcludeRow = (row: CTFViewRow) => {
    if (!framesData?.frames) return;
    const idx = framesData.frames.findIndex(
      (f) => String(f.viewId) === String(row.viewId),
    );
    if (idx >= 0) {
      toggleExcludeAtIndex(idx);
    }
  };

  const handleToggleExcludeCurrent = () => {
    if (selectedRowIndex == null || !framesData?.frames?.length) {
      return;
    }
    toggleExcludeAtIndex(selectedRowIndex);
  };

  const handleToggleExcludeSeries = (seriesId: Id) => {
    let updatedByFrames = false;

    setFramesData((prev) => {
      if (!prev || String(prev.ctfSeriesId) !== String(seriesId)) {
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
          String(s.ctfSeriesId) === String(seriesId)
            ? { ...s, excluded: newExcluded }
            : s,
        ),
      );

      return { ...prev, frames: nextFrames };
    });

    if (!updatedByFrames) {
      setSeries((prevSeries) =>
        prevSeries.map((s) =>
          String(s.ctfSeriesId) === String(seriesId)
            ? { ...s, excluded: !s.excluded }
            : s,
        ),
      );
    }
  };

  const buildExclusionsSummary = (): CTFExclusionsMap => {
    const summary: CTFExclusionsMap = {};

    series.forEach((s) => {
      const key = String(s.ctfSeriesId);
      const entry = {
        excluded: Boolean(s.excluded),
        tiltimages: [] as number[],
      };

      if (framesData && String(framesData.ctfSeriesId) === key) {
        const indices = framesData.frames
          .filter((f) => f.excluded)
          .map((f) =>
            f.index != null ? Number(f.index) : NaN,
          )
          .filter((v) => Number.isFinite(v)) as number[];

        entry.tiltimages = indices;

        if (
          !entry.excluded &&
          framesData.frames.length > 0 &&
          indices.length === framesData.frames.length
        ) {
          entry.excluded = true;
        }
      }

      summary[key] = entry;
    });

    return summary;
  };

  const handleGenerateClick = () => {
    const summary = buildExclusionsSummary();
    exclusionsRef.current = summary;
    setGenerateBusy(false);
    // eslint-disable-next-line no-console
    console.log("CTF tomo exclusion summary", summary);
    setGenerateDialogOpen(true);
  };

  const handleGenerateCancel = () => {
    if (generateBusy) return;
    setGenerateDialogOpen(false);
  };

  const handleGenerateConfirm = async () => {
    const summary = exclusionsRef.current;
    if (!summary) {
      setGenerateDialogOpen(false);
      return;
    }

    setGenerateDialogOpen(false);
    setGenerateBusy(true);

    try {
      await (svc as any).createNewSetOfCTFTomoSeries(
        projectId,
        protocolId,
        outputName,
        summary,
      );

      toast.success("New CTF tomo series set created successfully.");
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to create new set of CTFTomoSeries", e);
      toast.error(getErrorMsg(e));
    } finally {
      setGenerateBusy(false);
    }
  };

  return (
    <>
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
        {/* Left side: CTF tomo series tree + views table */}
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
              placeholder="Filter by angle, order or CTF values"
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
            <Button
              size="small"
              variant="contained"
              color="primary"
              onClick={handleGenerateClick}
              disabled={!series.length || generateBusy}
              sx={{
                textTransform: "none",
                fontSize: "0.8rem",
                paddingX: 1.8,
                paddingY: 0.4,
                borderRadius: "6px",
                boxShadow: "none",
                bgcolor: "primary.main",
                "&:hover": {
                  bgcolor: "primary.dark",
                  boxShadow: "none",
                },
              }}
            >
              Generate subsets
            </Button>
            <Button
              size="small"
              variant="contained"
              color="inherit"
              onClick={() => setHelpDialogOpen(true)}
              sx={{
                textTransform: "none",
                fontSize: "0.8rem",
                paddingX: 1.4,
                paddingY: 0.4,
                borderRadius: "6px",
                boxShadow: "none",
                bgcolor: "grey.400",
                color: "text.primary",
                "&:hover": {
                  bgcolor: "grey.200",
                  boxShadow: "none",
                },
              }}
            >
              Help
            </Button>
            {seriesLoading && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <CircularProgress size={14} />
                <Typography
                  variant="caption"
                  sx={{ fontSize: "0.7rem" }}
                >
                  Loading CTF tomo series…
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
                  Loading CTF tomo views…
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
                  No CTF tomo series available for this output.
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
                      Acq. order
                    </TableCell>
                    <TableCell sx={columnWidths.angle}>
                      Tilt angle
                    </TableCell>
                    <TableCell sx={columnWidths.excluded}>
                      Excl.
                    </TableCell>
                    <TableCell sx={columnWidths.defocusU}>
                      DefocusU (Å)
                    </TableCell>
                    <TableCell sx={columnWidths.defocusV}>
                      DefocusV (Å)
                    </TableCell>
                    <TableCell sx={columnWidths.astigmatism}>
                      Astigmatism (Å)
                    </TableCell>
                    <TableCell sx={columnWidths.resolution}>
                      Resolution (Å)
                    </TableCell>
                    <TableCell sx={columnWidths.ccValue}>
                      CC value
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {series.map((s) => {
                    const isExpanded =
                      expandedSeriesId != null &&
                      String(expandedSeriesId) === String(s.ctfSeriesId);
                    const isSelectedSeries =
                      selectedSeriesId != null &&
                      String(selectedSeriesId) === String(s.ctfSeriesId);

                    const showFramesForThisSeries =
                      isExpanded &&
                      framesData &&
                      String(framesData.ctfSeriesId) === String(s.ctfSeriesId);

                    const seriesFrames = showFramesForThisSeries
                      ? filteredFrames
                      : [];

                    return (
                      <Fragment key={String(s.ctfSeriesId)}>
                        {/* Series row */}
                        <TableRow
                          hover
                          selected={isSelectedSeries}
                          onClick={() =>
                            handleSeriesRowClick(s.ctfSeriesId)
                          }
                          sx={{
                            cursor: "pointer",
                            ...(s.excluded && {
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
                                    : s.ctfSeriesId;
                                  setExpandedSeriesId(nextExpanded);
                                  if (nextExpanded) {
                                    setSelectedSeriesId((prev) =>
                                      prev != null &&
                                      String(prev) === String(s.ctfSeriesId)
                                        ? prev
                                        : s.ctfSeriesId,
                                    );
                                    setViewMode("seriesChart");
                                    setPsdError(null);
                                    disposePsdImageUrl();
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
                                    s.ctfSeriesId,
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
                                {String(s.ctfSeriesId)}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={columnWidths.order} />
                          <TableCell sx={columnWidths.angle} />
                          <TableCell sx={columnWidths.excluded} />
                          <TableCell sx={columnWidths.defocusU} />
                          <TableCell sx={columnWidths.defocusV} />
                          <TableCell sx={columnWidths.astigmatism} />
                          <TableCell sx={columnWidths.resolution} />
                          <TableCell sx={columnWidths.ccValue} />
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
                                  s.ctfSeriesId,
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
                                    checked={Boolean(
                                      row.excluded,
                                    )}
                                    onClick={(e) =>
                                      e.stopPropagation()
                                    }
                                    onChange={() =>
                                      handleToggleExcludeRow(
                                        row,
                                      )
                                    }
                                    sx={{
                                      padding: 0.25,
                                    }}
                                  />
                                </TableCell>
                                <TableCell sx={columnWidths.defocusU}>
                                  {formatNumber(row.defocusU)}
                                </TableCell>
                                <TableCell sx={columnWidths.defocusV}>
                                  {formatNumber(row.defocusV)}
                                </TableCell>
                                <TableCell sx={columnWidths.astigmatism}>
                                  {formatNumber(row.astigmatism)}
                                </TableCell>
                                <TableCell sx={columnWidths.resolution}>
                                  {formatNumber(row.resolution)}
                                </TableCell>
                                <TableCell sx={columnWidths.ccValue}>
                                  {formatNumber(row.ccValue, 3)}
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

        {/* Right side: header + tabs + chart/PSD */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header with series info and selected tilt */}
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
                {isPsdMode ? "PSD preview" : "CTF estimation"}
              </Typography>
            </Box>
            {selectedFrame && (
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.7rem" }}
                >
                  Selected tilt:{" "}
                  {selectedFrame.tiltAngle != null
                    ? `${selectedFrame.tiltAngle.toFixed(2)}°`
                    : "-"}
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Tabs bar for CTF chart vs PSD view */}
          <Box
            sx={{
              borderBottom: "1px solid #e5e7eb",
              px: 1,
            }}
          >
            <Tabs
              value={viewMode}
              onChange={(
                e,
                value: "seriesChart" | "psdView",
              ) => handleChartTabChange(e, value)}
              textColor="primary"
              indicatorColor="primary"
              sx={{
                minHeight: 32,
                "& .MuiTab-root": {
                  minHeight: 32,
                  fontSize: "0.75rem",
                  textTransform: "none",
                  paddingX: 1.5,
                  paddingY: 0,
                },
              }}
            >
              <Tab label="CTF chart" value="seriesChart" />
              <Tab label="PSD view" value="psdView" />
            </Tabs>
          </Box>

          {/* Chart / PSD content */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "background.default",
              p: 1,
            }}
          >
            {isPsdMode ? (
              psdLoading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={18} />
                  <Typography
                    variant="body2"
                    sx={{ fontSize: "0.8rem" }}
                  >
                    Loading PSD image…
                  </Typography>
                </Box>
              ) : psdError ? (
                <Typography
                  variant="body2"
                  color="error"
                  sx={{ fontSize: "0.8rem" }}
                >
                  {psdError}
                </Typography>
              ) : psdImageUrl ? (
                <Box
                  component="img"
                  src={psdImageUrl}
                  alt="PSD view"
                  sx={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: "0.8rem" }}
                >
                  No PSD image available for the selected view.
                </Typography>
              )
            ) : !chartData.length ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: "0.8rem" }}
              >
                No CTF data available for the selected series.
              </Typography>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 48, bottom: 32, left: 48 }}
                >
                  <XAxis
                    dataKey="tiltAngle"
                    tickFormatter={formatAxisNumber}
                    label={{
                      value: "Tilt angle (deg)",
                      position: "insideBottom",
                      offset: -10,
                    }}
                  />
                  <YAxis
                    yAxisId="defocus"
                    domain={defocusDomain}
                    tickFormatter={formatAxisNumber}
                    tickMargin={8}
                    width={70}
                    label={{
                      value: "Defocus (Å)",
                      angle: -90,
                      position: "left",
                    }}
                  />
                  <YAxis
                    yAxisId="resolution"
                    orientation="right"
                    domain={resolutionDomain}
                    tickFormatter={formatAxisNumber}
                    tickMargin={8}
                    width={80}
                    label={{
                      value: "Resolution (Å)",
                      angle: -90,
                      position: "right",
                    }}
                  />
                  <RechartsTooltip content={<CtfChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    wrapperStyle={{ fontSize: "0.75rem" }}
                  />
                  <Line
                    type="monotone"
                    yAxisId="defocus"
                    dataKey="defocusU"
                    name="DefocusU (Å)"
                    stroke="#ef4444"
                    dot={{ r: 2 }}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    yAxisId="defocus"
                    dataKey="defocusV"
                    name="DefocusV (Å)"
                    stroke="#3b82f6"
                    dot={{ r: 2 }}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    yAxisId="resolution"
                    dataKey="resolution"
                    name="Resolution (Å)"
                    stroke="#22c55e"
                    dot={{ r: 2 }}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Box>

          {/* Footer info */}
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
              {totalFrames > 0
                ? `Views: ${totalFrames}`
                : "No views loaded"}
            </Typography>
            {selectedFrame && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.7rem" }}
              >
                DefocusU: {formatNumber(selectedFrame.defocusU)} Å,{" "}
                DefocusV: {formatNumber(selectedFrame.defocusV)} Å,{" "}
                Resolution: {formatNumber(selectedFrame.resolution)} Å
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* Help overlay dialog (same style as Generate subsets) */}
      {helpDialogOpen && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-lg w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-3 dark:text-white">
              CTF tomo viewer help
            </h2>

            <p className="mb-3 text-sm text-muted-foreground">
              This viewer allows you to create two subsets of CTFTomoSeries.
            </p>

            <p className="mb-4 text-sm text-muted-foreground">
              Note: The items that are excluded (checked) will be in the new set.
            </p>

            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => setHelpDialogOpen(false)}
                className="rounded-full px-4 py-2 min-w-[120px] font-medium bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing overlay while creating new set */}
      {generateBusy && !generateDialogOpen && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[120] pointer-events-auto flex items-center justify-center"
        >
          <div
            className="rounded-xl border bg-gray-600 dark:bg-gray-900/95 shadow-lg px-4 py-3 flex items-center gap-3 pointer-events-auto"
          >
            <div className="relative">
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-700 animate-spin" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white dark:text-gray-100">
                Processing CTF tomo series…
              </span>
              <span className="text-[11px] text-white dark:text-gray-400">
                Generating new CTF tomo subsets. Please wait until the process finishes.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Generate subsets overlay dialog */}
      {generateDialogOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-lg w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-3 dark:text-white">
              Generate CTF tomo subsets
            </h2>

            <p className="mb-3 text-sm text-muted-foreground">
              Are you going to create a new set of CTF tomo series with the excluded views?
            </p>

            <ul className="mb-4 list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>
                <span className="font-semibold">Generate subsets</span>: The new set
                will contain all views including those that are marked as excluded.
              </li>
            </ul>

            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={handleGenerateCancel}
                disabled={generateBusy}
                className="rounded-full px-4 py-2 min-w-[120px] font-medium bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleGenerateConfirm}
                disabled={generateBusy || !series.length}
                className="rounded-full px-4 py-2 min-w-[120px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Generate subsets
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function normalizeCtfViews(raw: any[]): CTFViewRow[] {
  return (raw || []).map((f: any, idx: number) => {
    const viewId = f.viewId ?? f.id ?? f.index ?? idx;
    const toNumber = (v: any): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const indexValue = toNumber(
      f.index ?? f.viewIndex ?? f.tiltIndex ?? idx,
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
      defocusU: toNumber(
        f.defocusU ?? f.defocus_u ?? f.defocusu,
      ),
      defocusV: toNumber(
        f.defocusV ?? f.defocus_v ?? f.defocusv,
      ),
      astigmatism: toNumber(
        f.astigmatism ?? f.astig ?? f.astigmatismAmp,
      ),
      resolution: toNumber(
        f.resolution ?? f.resolutionLimit ?? f.res,
      ),
      ccValue: toNumber(
        f.ccValue ?? f.cc ?? f.correlation,
      ),
      psdFile:
        f.psdFile ??
        f.psd_path ??
        f.psd ??
        f.psdImage ??
        null,
    } as CTFViewRow;
  });
}
