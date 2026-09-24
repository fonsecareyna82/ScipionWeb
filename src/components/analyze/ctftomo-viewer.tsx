// src/components/analyze/ctftomo-viewer.tsx
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Divider,
  Tooltip,
} from "@mui/material";
import { ExpandMore, ChevronRight, ArrowBack, TableView as MetadataIcon } from "@mui/icons-material";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id } from "@/services/ProjectService";
import toast from "react-hot-toast";
import { MetadataViewer } from "./metadata-viewer";

type CTFTomoViewerProps = {
  projectId: Id;
  protocolId: Id;
  outputName: string;
  protocolLabel?: string;
  selectedCtfSeriesId?: Id | null;
  onCtfSeriesSelect?: (series: CTFTomoSeriesSummary) => void;
  selectedTiltSeriesId?: Id | null;
  hideMetadataAction?: boolean;
};

type CTFTomoSeriesSummary = {
  ctfSeriesId: Id;
  label: string;
  nViews?: number;
  excluded?: boolean;
  tiltSeriesId?: Id | null;
  tiltAxisAngle?: number | null;
  pixelSize?: number | null;
  dims?: [number, number] | [number, number, number];
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

type CTFViewColumnKey =
  | "order"
  | "tiltAngle"
  | "excluded"
  | "defocusU"
  | "defocusV"
  | "astigmatism"
  | "resolution"
  | "ccValue";

type CTFViewColumn = {
  key: CTFViewColumnKey;
  label: string;
  type: "number" | "boolean";
};

const CTF_VIEW_COLUMNS: CTFViewColumn[] = [
  { key: "order", label: "Acq. order", type: "number" },
  { key: "tiltAngle", label: "Tilt angle", type: "number" },
  { key: "excluded", label: "Excl.", type: "boolean" },
  { key: "defocusU", label: "DefocusU (Å)", type: "number" },
  { key: "defocusV", label: "DefocusV (Å)", type: "number" },
  { key: "astigmatism", label: "Astigmatism (Å)", type: "number" },
  { key: "resolution", label: "Resolution (Å)", type: "number" },
  { key: "ccValue", label: "CC value", type: "number" },
];

const NUMBER_CRITERIA = [
  { value: "greater_than", label: "Greater than" },
  { value: "greater_or_equal", label: "Greater than or equal to" },
  { value: "less_than", label: "Less than" },
  { value: "less_or_equal", label: "Less than or equal to" },
  { value: "equal", label: "Equal to" },
  { value: "not_equal", label: "Not equal to" },
  { value: "between", label: "Between" },
  { value: "outside", label: "Outside range" },
  { value: "empty", label: "Is empty" },
  { value: "not_empty", label: "Is not empty" },
];

const BOOLEAN_CRITERIA = [
  { value: "included", label: "Included" },
  { value: "excluded", label: "Excluded" },
];

function getDefaultCriterion(column: CTFViewColumn): string {
  return column.type === "number" ? "greater_than" : "included";
}

function matchesColumnCriterion(
  frame: CTFViewRow,
  column: CTFViewColumn,
  criterion: string,
  firstValue: string,
  secondValue: string,
): boolean {
  const rawValue = frame[column.key];
  const isEmpty = rawValue == null || rawValue === "";

  if (criterion === "empty") return isEmpty;
  if (criterion === "not_empty") return !isEmpty;

  if (column.type === "boolean") {
    return criterion === "excluded" ? Boolean(rawValue) : !Boolean(rawValue);
  }

  const value = Number(rawValue);
  const first = Number(firstValue);
  const second = Number(secondValue);

  if (!Number.isFinite(value) || !Number.isFinite(first)) return false;
  if (criterion === "greater_than") return value > first;
  if (criterion === "greater_or_equal") return value >= first;
  if (criterion === "less_than") return value < first;
  if (criterion === "less_or_equal") return value <= first;
  if (criterion === "equal") return value === first;
  if (criterion === "not_equal") return value !== first;
  if (!Number.isFinite(second)) return false;
  if (criterion === "between") return value >= Math.min(first, second) && value <= Math.max(first, second);
  if (criterion === "outside") return value < Math.min(first, second) || value > Math.max(first, second);
  return false;
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

export default function CTFTomoViewer({
  projectId,
  protocolId,
  outputName,
  selectedCtfSeriesId,
  selectedTiltSeriesId,
  onCtfSeriesSelect,
  hideMetadataAction = false,
}: CTFTomoViewerProps) {
  const svc = useProjectService();

  const [mainMode, setMainMode] = useState<"viewer" | "metadata">("viewer");

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

  const [psdError, setPsdError] = useState<string | null>(null);
  const [psdLoading, setPsdLoading] = useState(false);
  const [psdImageUrl, setPsdImageUrl] = useState<string | null>(null);
  const psdImageUrlRef = useRef<string | null>(null);

  const psdAbortRef = useRef<AbortController | null>(null);
  const psdReqIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const exclusionsRef = useRef<CTFExclusionsMap | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);

  const [criterionColumn, setCriterionColumn] = useState<CTFViewColumn | null>(null);
  const [criterionOperator, setCriterionOperator] = useState("");
  const [criterionFirstValue, setCriterionFirstValue] = useState("");
  const [criterionSecondValue, setCriterionSecondValue] = useState("");
  const [criterionScope, setCriterionScope] = useState<"current" | "all">("current");
  const [criterionBusy, setCriterionBusy] = useState(false);

  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const excludedBySeriesRef = useRef<Record<string, Set<number>>>({});
  const seriesExcludedRef = useRef<Record<string, boolean>>({});

  const chartHoveredPointRef = useRef<{ viewId: Id } | null>(null);
  const [chartMenuPos, setChartMenuPos] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [chartMenuTargetViewId, setChartMenuTargetViewId] = useState<Id | null>(null);

  const seriesColumnWidths = {
    series: { width: "30%" },
    views: { width: "12%" },
    tiltAxis: { width: "16%" },
    pixelSize: { width: "16%" },
    dimensions: { width: "18%" },
    excluded: { width: "8%" },
  } as const;

  const columnWidths = {
    order: { width: "11%" },
    angle: { width: "12%" },
    excluded: { width: "8%" },
    defocusU: { width: "14%" },
    defocusV: { width: "14%" },
    astigmatism: { width: "15%" },
    resolution: { width: "14%" },
    ccValue: { width: "12%" },
  } as const;

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

  const isPsdUnavailableError = (e: any): boolean => {
    if (Number(e?.status) !== 404) return false;

    const text = JSON.stringify({
      message: e?.message,
      detail: e?.detail,
      data: e?.data,
    }).toLowerCase();

    return (
      text.includes("psd_file_not_available") ||
      text.includes("psd output is not available")
    );
  };

  const abortPsdLoad = () => {
    psdAbortRef.current?.abort();
    psdAbortRef.current = null;
    psdReqIdRef.current += 1;
  };

  const revokePsdImageUrl = () => {
    const url = psdImageUrlRef.current;
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    psdImageUrlRef.current = null;
  };

  const disposePsdImageUrl = () => {
    revokePsdImageUrl();

    if (isMountedRef.current) {
      setPsdImageUrl(null);
    }
  };

  const projectIdNum = useMemo(() => Number(projectId), [projectId]);
  const protocolIdNum = useMemo(() => Number(protocolId), [protocolId]);
  const canOpenMetadata = useMemo(
    () => Number.isFinite(projectIdNum) && Number.isFinite(protocolIdNum),
    [projectIdNum, protocolIdNum],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      abortPsdLoad();
      revokePsdImageUrl();
    };
  }, []);

  useEffect(() => {
    if (mainMode !== "metadata") return;
    // resetRightPanelStateWhenOpeningMetadata
    setPsdError(null);
    abortPsdLoad();
    setPsdLoading(false);
    disposePsdImageUrl();
    setChartMenuPos(null);
    setChartMenuTargetViewId(null);
  }, [mainMode]);

  useEffect(() => {
    const nextMap: Record<string, boolean> = {};
    series.forEach((s) => {
      nextMap[String(s.ctfSeriesId)] = Boolean(s.excluded);
    });
    seriesExcludedRef.current = nextMap;
  }, [series]);

  const getFrameIndexValue = (f: CTFViewRow, fallbackIndex: number): number => {
    const v = f.index != null ? Number(f.index) : fallbackIndex;
    return Number.isFinite(v) ? v : fallbackIndex;
  };

  const syncExcludedSetForSeries = (ctfSeriesId: Id, frames: CTFViewRow[]) => {
    const key = String(ctfSeriesId);
    const nextSet = new Set<number>();
    frames.forEach((f, i) => {
      if (f.excluded) nextSet.add(getFrameIndexValue(f, i));
    });
    excludedBySeriesRef.current[key] = nextSet;
  };

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
        setPsdError(null);
        disposePsdImageUrl();

        excludedBySeriesRef.current = {};
        seriesExcludedRef.current = {};
        chartHoveredPointRef.current = null;

        const raw = await (svc as any).listOutputCTFTomoSeries(projectId, protocolId, outputName);

        if (cancelled) return;

        const items: CTFTomoSeriesSummary[] = (raw || []).map((s: any) => {
          const idRaw = s.ctfSeriesId ?? s.tiltSeriesId ?? s.tsId ?? s.id ?? s.name ?? s.label ?? "CTFSeries";
          const id = String(idRaw);
          const label = s.label ?? s.name ?? s.tsLabel ?? `CTFSeries ${id}`;
          const dims: any = s.dims ?? s.shape ?? s.size;

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
            tiltSeriesId: s.tiltSeriesId ?? s.tsId ?? null,
            tiltAxisAngle:
              typeof s.tiltAxisAngle === "number"
                ? s.tiltAxisAngle
                : typeof s.tilt_axis_angle === "number"
                  ? s.tilt_axis_angle
                  : s.axisAngle,
            pixelSize:
              typeof s.pixelSize === "number"
                ? s.pixelSize
                : typeof s.samplingRate === "number"
                  ? s.samplingRate
                  : undefined,
            dims:
              Array.isArray(dims) && dims.length >= 2
                ? [Number(dims[0]), Number(dims[1]), Number(dims[2] ?? 0)]
                : undefined,
          };
        });

        setSeries(items);
        if (items.length > 0) {
          const firstId = items[0].ctfSeriesId;
          setSelectedSeriesId(firstId);
          setExpandedSeriesId(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSeriesError(e?.message || "Failed to load CTF tomo series for this output");
        }
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, svc]);

  useEffect(() => {
    if (selectedCtfSeriesId == null || series.length === 0) return;

    const match = series.find((s) => String(s.ctfSeriesId) === String(selectedCtfSeriesId));
    if (match && String(match.ctfSeriesId) !== String(selectedSeriesId)) {
      setSelectedSeriesId(match.ctfSeriesId);
      setExpandedSeriesId(match.ctfSeriesId);
    }
  }, [selectedCtfSeriesId, series, selectedSeriesId]);

  useEffect(() => {
    if (selectedTiltSeriesId == null || series.length === 0) return;

    const match = series.find((s) => String(s.tiltSeriesId) === String(selectedTiltSeriesId));
    if (match && String(match.ctfSeriesId) !== String(selectedSeriesId)) {
      setSelectedSeriesId(match.ctfSeriesId);
      setExpandedSeriesId(match.ctfSeriesId);
    }
  }, [selectedTiltSeriesId, series, selectedSeriesId]);

  useEffect(() => {
    if (selectedSeriesId == null) {
      setFramesData(null);
      setFramesError(null);
      setSelectedRowIndex(null);
      abortPsdLoad();
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
        abortPsdLoad();
        setPsdError(null);
        disposePsdImageUrl();

        const raw = await (svc as any).fetchCTFTomoSeriesViews(projectId, protocolId, outputName, selectedSeriesId);

        if (cancelled) return;

        let payload: CTFFramesPayload;

        if (Array.isArray(raw)) {
          payload = {
            ctfSeriesId: selectedSeriesId,
            frames: normalizeCtfViews(raw),
          };
        } else {
          const obj: any = raw ?? {};
          const framesRaw = obj.frames ?? obj.views ?? (Array.isArray(obj.items) ? obj.items : []);
          payload = {
            ctfSeriesId: obj.ctfSeriesId ?? obj.tiltSeriesId ?? obj.id ?? selectedSeriesId,
            label: obj.label ?? obj.name,
            frames: normalizeCtfViews(framesRaw),
          };
        }

        const seriesKey = String(payload.ctfSeriesId);

        if (!excludedBySeriesRef.current[seriesKey]) {
          const seeded = new Set<number>();
          payload.frames.forEach((f, i) => {
            if (f.excluded) seeded.add(getFrameIndexValue(f, i));
          });
          excludedBySeriesRef.current[seriesKey] = seeded;
        }

        const excludedSet = excludedBySeriesRef.current[seriesKey] ?? new Set<number>();
        const forceExcludeWholeSeries = Boolean(seriesExcludedRef.current[seriesKey]);

        if (forceExcludeWholeSeries) {
          payload.frames = payload.frames.map((f) => ({ ...f, excluded: true }));
          syncExcludedSetForSeries(payload.ctfSeriesId, payload.frames);
        } else {
          payload.frames = payload.frames.map((f, i) => {
            const idxVal = getFrameIndexValue(f, i);
            const nextExcluded = excludedSet.has(idxVal);
            return f.excluded === nextExcluded ? f : { ...f, excluded: nextExcluded };
          });
        }

        setFramesData(payload);

        if (payload.frames.length > 0) {
          const firstFrame = payload.frames[0];
          setSelectedRowIndex(0);

          if (firstFrame.psdFile) {
            loadPsdForRow(firstFrame);
          }
        } else {
          setSelectedRowIndex(null);
        }
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
  }, [selectedSeriesId, projectId, protocolId, outputName, svc]);

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

  const selectedFilteredIndex = useMemo(() => {
    if (selectedRowIndex == null || !framesData?.frames || !filteredFrames.length) {
      return null;
    }
    const selectedView = framesData.frames[selectedRowIndex];
    if (!selectedView) return null;
    const idx = filteredFrames.findIndex((f) => String(f.viewId) === String(selectedView.viewId));
    return idx >= 0 ? idx : null;
  }, [selectedRowIndex, framesData, filteredFrames]);

  const selectedFrame: CTFViewRow | null = useMemo(() => {
    if (selectedRowIndex == null || !framesData?.frames || !framesData.frames.length) {
      return null;
    }
    return framesData.frames[selectedRowIndex] ?? null;
  }, [framesData, selectedRowIndex]);

  async function loadPsdForRow(row: CTFViewRow) {
    if (mainMode === "metadata") return;

    if (!row.psdFile) {
      abortPsdLoad();
      setPsdError(null);
      disposePsdImageUrl();
      setPsdLoading(false);
      return;
    }

    abortPsdLoad();

    const controller = new AbortController();
    psdAbortRef.current = controller;
    const reqId = ++psdReqIdRef.current;

    try {
      setPsdLoading(true);
      setPsdError(null);
      disposePsdImageUrl();

      const blob: Blob = await (svc as any).fetchCTFPsdImage(
        projectId,
        protocolId,
        outputName,
        row.psdFile,
        { signal: controller.signal },
      );

      if (
        controller.signal.aborted ||
        psdReqIdRef.current !== reqId ||
        !isMountedRef.current
      ) {
        return;
      }

      const url = URL.createObjectURL(blob);
      psdImageUrlRef.current = url;
      setPsdImageUrl(url);
    } catch (e: any) {
      if (
        controller.signal.aborted ||
        psdReqIdRef.current !== reqId ||
        !isMountedRef.current
      ) {
        return;
      }

      if (isPsdUnavailableError(e)) {
        setPsdError(null);
        disposePsdImageUrl();
        return;
      }

      console.error("Failed to load PSD image", e);

      setPsdError(
        "Unable to load the PSD image for the selected CTF."
      );

      disposePsdImageUrl();
    } finally {
      if (psdAbortRef.current === controller) {
        psdAbortRef.current = null;
      }

      if (
        !controller.signal.aborted &&
        psdReqIdRef.current === reqId &&
        isMountedRef.current
      ) {
        setPsdLoading(false);
      }
    }
  }

  const handleRowClick = (row: CTFViewRow) => {
    if (!framesData?.frames) return;
    const idx = framesData.frames.findIndex((f) => String(f.viewId) === String(row.viewId));
    if (idx >= 0) {
      setSelectedRowIndex(idx);
      if (row.psdFile) {
        loadPsdForRow(row);
      } else {
        abortPsdLoad();
        setPsdError(null);
        disposePsdImageUrl();
      }
    }
  };

  const handleSeriesRowClick = (seriesId: Id) => {
    const isSameSeries = selectedSeriesId != null && String(selectedSeriesId) === String(seriesId);

    setExpandedSeriesId(seriesId);

    const selectedSeries = series.find((s) => String(s.ctfSeriesId) === String(seriesId));
    if (selectedSeries) {
      onCtfSeriesSelect?.(selectedSeries);
    }

    if (isSameSeries) {
      const firstFrame = framesData?.frames?.[0];
      if (firstFrame) {
        handleRowClick(firstFrame);
      }
      return;
    }

    setSelectedSeriesId(seriesId);
    setPsdError(null);
    abortPsdLoad();
    disposePsdImageUrl();
  };


  const toggleExcludeAtIndex = (frameIndex: number) => {
    setFramesData((prev) => {
      if (!prev) return prev;
      if (frameIndex < 0 || frameIndex >= prev.frames.length) {
        return prev;
      }

      const nextFrames = prev.frames.map((f, idx) => (idx === frameIndex ? { ...f, excluded: !f.excluded } : f));

      syncExcludedSetForSeries(prev.ctfSeriesId, nextFrames);

      const allExcluded = nextFrames.length > 0 && nextFrames.every((f) => f.excluded);

      setSeries((prevSeries) =>
        prevSeries.map((s) =>
          String(s.ctfSeriesId) === String(prev.ctfSeriesId) ? { ...s, excluded: allExcluded } : s,
        ),
      );

      seriesExcludedRef.current[String(prev.ctfSeriesId)] = allExcluded;

      return { ...prev, frames: nextFrames };
    });
  };

  const handleToggleExcludeRow = (row: CTFViewRow) => {
    if (!framesData?.frames) return;
    const idx = framesData.frames.findIndex((f) => String(f.viewId) === String(row.viewId));
    if (idx >= 0) {
      toggleExcludeAtIndex(idx);
    }
  };

  const setExcludeAllForCurrentSeries = (excluded: boolean) => {
    if (!framesData) {
      if (selectedSeriesId != null) {
        const seriesId = String(selectedSeriesId);
        seriesExcludedRef.current[seriesId] = excluded;
        excludedBySeriesRef.current[seriesId] = new Set<number>();
        setSeries((prevSeries) =>
          prevSeries.map((s) => (String(s.ctfSeriesId) === seriesId ? { ...s, excluded } : s)),
        );
      }
      return;
    }

    const seriesId = String(framesData.ctfSeriesId);

    setFramesData((prev) => {
      if (!prev) return prev;
      const nextFrames = prev.frames.map((f) => ({ ...f, excluded }));
      syncExcludedSetForSeries(prev.ctfSeriesId, nextFrames);
      return { ...prev, frames: nextFrames };
    });

    setSeries((prevSeries) => prevSeries.map((s) => (String(s.ctfSeriesId) === seriesId ? { ...s, excluded } : s)));

    seriesExcludedRef.current[seriesId] = excluded;
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
      const nextFrames = prev.frames.map((f) => ({ ...f, excluded: newExcluded }));

      syncExcludedSetForSeries(seriesId, nextFrames);

      setSeries((prevSeries) =>
        prevSeries.map((s) =>
          String(s.ctfSeriesId) === String(seriesId) ? { ...s, excluded: newExcluded } : s,
        ),
      );

      seriesExcludedRef.current[String(seriesId)] = newExcluded;

      return { ...prev, frames: nextFrames };
    });

    if (!updatedByFrames) {
      setSeries((prevSeries) =>
        prevSeries.map((s) => {
          if (String(s.ctfSeriesId) !== String(seriesId)) return s;
          const nextExcluded = !s.excluded;

          seriesExcludedRef.current[String(seriesId)] = Boolean(nextExcluded);
          excludedBySeriesRef.current[String(seriesId)] = new Set<number>();

          return { ...s, excluded: nextExcluded };
        }),
      );
    }
  };

  const handleOpenCriterionDialog = (column: CTFViewColumn) => {
    setCriterionColumn(column);
    setCriterionOperator(getDefaultCriterion(column));
    setCriterionFirstValue("");
    setCriterionSecondValue("");
    setCriterionScope("current");
  };

  const handleCloseCriterionDialog = () => {
    if (criterionBusy) return;
    setCriterionColumn(null);
    setCriterionOperator("");
  };

  const getFramesForCriterion = async (seriesId: Id): Promise<CTFViewRow[]> => {
    if (framesData && String(framesData.ctfSeriesId) === String(seriesId)) {
      return framesData.frames;
    }

    const raw = await (svc as any).fetchCTFTomoSeriesViews(
      projectId,
      protocolId,
      outputName,
      seriesId,
    );

    if (Array.isArray(raw)) return normalizeCtfViews(raw);

    const obj: any = raw ?? {};
    return normalizeCtfViews(
      obj.frames ?? obj.views ?? (Array.isArray(obj.items) ? obj.items : []),
    );
  };

  const criterionOptions = criterionColumn?.type === "number"
    ? NUMBER_CRITERIA
    : BOOLEAN_CRITERIA;
  const criterionNeedsValue = criterionColumn?.type !== "boolean"
    && criterionOperator !== "empty"
    && criterionOperator !== "not_empty";
  const criterionNeedsSecondValue = criterionColumn?.type === "number"
    && (criterionOperator === "between" || criterionOperator === "outside");
  const criterionCanApply = Boolean(
    criterionColumn
    && (!criterionNeedsValue || criterionFirstValue.trim())
    && (!criterionNeedsSecondValue || criterionSecondValue.trim()),
  );

  const handleApplyColumnCriterion = async () => {
    if (!criterionColumn || !criterionCanApply || selectedSeriesId == null) return;

    const targetSeries = criterionScope === "all"
      ? series
      : series.filter((item) => String(item.ctfSeriesId) === String(selectedSeriesId));

    setCriterionBusy(true);

    try {
      const buildResult = (item: CTFTomoSeriesSummary, frames: CTFViewRow[]) => {
        const key = String(item.ctfSeriesId);
        const previousSet = new Set(excludedBySeriesRef.current[key] ?? []);
        const wholeSeriesExcluded = Boolean(seriesExcludedRef.current[key]);

        frames.forEach((frame, index) => {
          if (frame.excluded || wholeSeriesExcluded) {
            previousSet.add(getFrameIndexValue(frame, index));
          }
        });

        const nextSet = new Set(previousSet);
        let newlyExcluded = 0;

        frames.forEach((frame, index) => {
          const frameIndex = getFrameIndexValue(frame, index);
          const frameForCriterion = { ...frame, excluded: nextSet.has(frameIndex) };

          if (
            matchesColumnCriterion(
              frameForCriterion,
              criterionColumn,
              criterionOperator,
              criterionFirstValue,
              criterionSecondValue,
            )
            && !nextSet.has(frameIndex)
          ) {
            nextSet.add(frameIndex);
            newlyExcluded += 1;
          }
        });

        return {
          key,
          label: item.label,
          nextSet,
          newlyExcluded,
          allExcluded: wholeSeriesExcluded || (frames.length > 0 && nextSet.size >= frames.length),
        };
      };

      let results;

      if (
        criterionScope === "current"
        && framesData
        && String(framesData.ctfSeriesId) === String(selectedSeriesId)
      ) {
        results = targetSeries.map((item) => buildResult(item, framesData.frames));
      } else {
        results = await Promise.all(targetSeries.map(async (item) => {
          const frames = await getFramesForCriterion(item.ctfSeriesId);
          return buildResult(item, frames);
        }));
      }

      const resultsBySeries = new Map(results.map((result) => [result.key, result]));

      results.forEach((result) => {
        excludedBySeriesRef.current[result.key] = result.nextSet;
        seriesExcludedRef.current[result.key] = result.allExcluded;
      });

      setSeries((previous) => previous.map((item) => {
        const result = resultsBySeries.get(String(item.ctfSeriesId));
        return result ? { ...item, excluded: result.allExcluded } : item;
      }));

      setFramesData((previous) => {
        if (!previous) return previous;
        const result = resultsBySeries.get(String(previous.ctfSeriesId));
        if (!result) return previous;

        return {
          ...previous,
          frames: previous.frames.map((frame, index) => ({
            ...frame,
            excluded: result.nextSet.has(getFrameIndexValue(frame, index)),
          })),
        };
      });

      const totalExcluded = results.reduce((total, result) => total + result.newlyExcluded, 0);
      const affectedSeries = results.filter((result) => result.newlyExcluded > 0).length;

      if (criterionScope === "current") {
        const label = results[0]?.label ?? "the current CTF tomo series";
        toast.success(
          totalExcluded === 1
            ? `Excluded 1 CTF view in ${label}.`
            : `Excluded ${totalExcluded} CTF views in ${label}.`,
        );
      } else {
        toast.success(
          `Excluded ${totalExcluded} CTF view${totalExcluded === 1 ? "" : "s"} across ${affectedSeries} CTF tomo series.`,
        );
      }

      setCriterionColumn(null);
      setCriterionOperator("");
    } catch (error) {
      toast.error(getErrorMsg(error));
    } finally {
      setCriterionBusy(false);
    }
  };

  const buildExclusionsSummary = (): CTFExclusionsMap => {
    const summary: CTFExclusionsMap = {};

    series.forEach((s) => {
      const key = String(s.ctfSeriesId);
      const set = excludedBySeriesRef.current[key];
      const tiltimages = set ? Array.from(set).sort((a, b) => a - b) : [];

      let excluded = Boolean(s.excluded);
      if (!excluded && s.nViews != null && tiltimages.length === s.nViews) {
        excluded = true;
      }

      summary[key] = {
        excluded,
        tiltimages,
      };
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
      await (svc as any).createNewSetOfCTFTomoSeries(projectId, protocolId, outputName, summary);
      toast.success("New CTF tomo series set created successfully.");
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to create new set of CTFTomoSeries", e);
      toast.error(getErrorMsg(e));
    } finally {
      setGenerateBusy(false);
    }
  };

  const chartRows = useMemo(() => {
    if (!framesData?.frames?.length) return [];
    return framesData.frames
      .filter((f) => f.tiltAngle != null)
      .map((f, frameIdx) => {
        const resolutionVal = f.resolution === 0 ? null : f.resolution ?? null;
        return {
          viewId: f.viewId,
          frameIdx,
          tiltAngle: f.tiltAngle as number,
          defocusU: f.defocusU ?? null,
          defocusV: f.defocusV ?? null,
          resolution: resolutionVal,
          excluded: Boolean(f.excluded),
        };
      })
      .sort((a, b) => a.tiltAngle - b.tiltAngle);
  }, [framesData]);

  const defocusDomain = useMemo<[number, number]>(() => {
    if (!chartRows.length) return [0, 1];

    let min = Infinity;
    let max = -Infinity;

    chartRows.forEach((d) => {
      if (d.excluded) return;
      const vals: number[] = [];
      if (d.defocusU != null && Number.isFinite(d.defocusU)) vals.push(d.defocusU as number);
      if (d.defocusV != null && Number.isFinite(d.defocusV)) vals.push(d.defocusV as number);
      vals.forEach((v) => {
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      return [min - pad, min + pad];
    }
    const span = max - min;
    const pad = span * 0.1;
    return [min - pad, max + pad];
  }, [chartRows]);

  const resolutionDomain = useMemo<[number, number]>(() => {
    if (!chartRows.length) return [0, 1];

    let min = Infinity;
    let max = -Infinity;

    chartRows.forEach((d) => {
      if (d.excluded) return;
      const v = d.resolution;
      if (v == null || !Number.isFinite(v)) return;
      if (v < min) min = v;
      if (v > max) max = v;
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) {
      const pad = min * 0.1 || 0.1;
      return [min - pad, min + pad];
    }
    const span = max - min;
    const pad = span * 0.1;
    return [min - pad, max + pad];
  }, [chartRows]);

  const selectedChartRow = useMemo(() => {
    if (!selectedFrame) return null;

    return (
      chartRows.find((row) => String(row.viewId) === String(selectedFrame.viewId)) ?? null
    );
  }, [chartRows, selectedFrame]);

  const plotData = useMemo(() => {
    if (!chartRows.length) return [];

    const x = chartRows.map((r) => r.tiltAngle);

    const defocusUIncluded = chartRows.map((r) => (r.excluded ? null : r.defocusU));
    const defocusVIncluded = chartRows.map((r) => (r.excluded ? null : r.defocusV));
    const resolutionIncluded = chartRows.map((r) => (r.excluded ? null : r.resolution));

    const excludedX = chartRows.filter((r) => r.excluded).map((r) => r.tiltAngle);
    const excludedY = chartRows
      .filter((r) => r.excluded)
      .map((r) => (r.defocusU != null ? r.defocusU : 0));

    const customdataIncluded = chartRows.map((r) => [
      String(r.viewId),
      r.defocusU,
      r.defocusV,
      r.resolution,
      r.excluded,
    ]);

    const customdataExcluded = chartRows
      .filter((r) => r.excluded)
      .map((r) => [String(r.viewId), r.defocusU, r.defocusV, r.resolution, true]);

    const hovertemplateAll =
      "Tilt angle: %{x:.2f}°<br>" +
      "DefocusU: %{customdata[1]:.2f} Å<br>" +
      "DefocusV: %{customdata[2]:.2f} Å<br>" +
      "Resolution: %{customdata[3]:.2f} Å<extra></extra>";

    const selectedPointTraces: any[] = [];

    if (selectedChartRow) {
      const selectedCustomData = [[
        String(selectedChartRow.viewId),
        selectedChartRow.defocusU,
        selectedChartRow.defocusV,
        selectedChartRow.resolution,
        selectedChartRow.excluded,
      ]];

      const selectedMarker = {
        size: 10,
        color: "rgba(250,204,21,0.9)",
        line: { color: "#111827", width: 2 },
        symbol: "circle",
      };

      if (selectedChartRow.defocusU != null) {
        selectedPointTraces.push({
          type: "scatter",
          mode: "markers",
          name: "Selected DefocusU",
          x: [selectedChartRow.tiltAngle],
          y: [selectedChartRow.defocusU],
          customdata: selectedCustomData,
          hovertemplate: "Selected view<br>" + hovertemplateAll,
          marker: selectedMarker,
          yaxis: "y",
          showlegend: false,
        });
      }

      if (selectedChartRow.defocusV != null) {
        selectedPointTraces.push({
          type: "scatter",
          mode: "markers",
          name: "Selected DefocusV",
          x: [selectedChartRow.tiltAngle],
          y: [selectedChartRow.defocusV],
          customdata: selectedCustomData,
          hovertemplate: "Selected view<br>" + hovertemplateAll,
          marker: selectedMarker,
          yaxis: "y",
          showlegend: false,
        });
      }

      if (selectedChartRow.resolution != null) {
        selectedPointTraces.push({
          type: "scatter",
          mode: "markers",
          name: "Selected Resolution",
          x: [selectedChartRow.tiltAngle],
          y: [selectedChartRow.resolution],
          customdata: selectedCustomData,
          hovertemplate: "Selected view<br>" + hovertemplateAll,
          marker: selectedMarker,
          yaxis: "y2",
          showlegend: false,
        });
      }
    }

    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "DefocusU (Å)",
        x,
        y: defocusUIncluded,
        customdata: customdataIncluded,
        connectgaps: true,
        hoveron: "points",
        hovertemplate: hovertemplateAll,
        marker: { size: 6 },
        line: { width: 2, color: "#ef4444" },
        yaxis: "y",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "DefocusV (Å)",
        x,
        y: defocusVIncluded,
        customdata: customdataIncluded,
        connectgaps: true,
        hoveron: "points",
        hovertemplate: hovertemplateAll,
        marker: { size: 6 },
        line: { width: 2, color: "#3b82f6" },
        yaxis: "y",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "Resolution (Å)",
        x,
        y: resolutionIncluded,
        customdata: customdataIncluded,
        connectgaps: true,
        hoveron: "points",
        hovertemplate: hovertemplateAll,
        marker: { size: 6 },
        line: { width: 2, color: "#22c55e" },
        yaxis: "y2",
      },
      {
        type: "scatter",
        mode: "markers",
        name: "Excluded",
        x: excludedX,
        y: excludedY,
        customdata: customdataExcluded,
        hoveron: "points",
        hovertemplate:
          "Excluded view<br>" +
          "Tilt angle: %{x:.2f}°<br>" +
          "DefocusU: %{customdata[1]:.2f} Å<br>" +
          "DefocusV: %{customdata[2]:.2f} Å<br>" +
          "Resolution: %{customdata[3]:.2f} Å<extra></extra>",
        marker: { size: 6, color: "#140101", symbol: "o" },
        yaxis: "y",
      },
      ...selectedPointTraces,
    ] as any[];
  }, [chartRows, selectedChartRow]);

  const plotLayout = useMemo(() => {
    return {
      autosize: true,
      margin: { t: 28, r: 58, b: 42, l: 58 },
      hovermode: "closest",
      hoverdistance: 8,
      legend: {
        orientation: "v",
        x: 0.1,
        xanchor: "center",
        y: 1.18,
      },
      xaxis: {
        title: "Tilt angle (deg)",
        tickformat: ".2f",
        zeroline: false,
      },
      yaxis: {
        title: "Defocus (Å)",
        tickformat: ".2f",
        range: [defocusDomain[0], defocusDomain[1]],
        zeroline: false,
      },
      yaxis2: {
        title: "Resolution (Å)",
        tickformat: ".2f",
        range: [resolutionDomain[0], resolutionDomain[1]],
        overlaying: "y",
        side: "right",
        zeroline: false,
      },
    } as any;
  }, [defocusDomain, resolutionDomain]);

  const plotConfig = useMemo(() => {
    return {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      scrollZoom: true,
    } as any;
  }, []);

  const resolveFramesIndexFromViewId = (viewId: Id): number => {
    if (!framesData?.frames?.length) return -1;
    return framesData.frames.findIndex((f) => String(f.viewId) === String(viewId));
  };

  const getRowByViewId = (viewId: Id): CTFViewRow | null => {
    const idx = resolveFramesIndexFromViewId(viewId);
    if (idx < 0 || !framesData?.frames) return null;
    return framesData.frames[idx] ?? null;
  };

  const openChartContextMenu = (mouseX: number, mouseY: number) => {
    const hovered = chartHoveredPointRef.current;
    if (!hovered?.viewId) return;

    setPsdError(null);

    setChartMenuTargetViewId(hovered.viewId);
    setChartMenuPos({ mouseX, mouseY });
  };

  const closeChartContextMenu = () => {
    setChartMenuPos(null);
    setChartMenuTargetViewId(null);
  };

  const handleChartContextToggle = () => {
    if (!chartMenuTargetViewId) return;
    const idx = resolveFramesIndexFromViewId(chartMenuTargetViewId);
    if (idx >= 0) {
      toggleExcludeAtIndex(idx);
    }
    closeChartContextMenu();
  };

  const handleChartExcludeAll = (excludeAll: boolean) => {
    setExcludeAllForCurrentSeries(excludeAll);
    closeChartContextMenu();
  };

  const chartMenuTargetRow = useMemo(() => {
    if (!chartMenuTargetViewId) return null;
    return getRowByViewId(chartMenuTargetViewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartMenuTargetViewId, framesData]);

  const handlePlotHover = (e: any) => {
    const p = e?.points?.[0];
    const viewId = p?.customdata?.[0];
    if (viewId != null) {
      chartHoveredPointRef.current = { viewId: String(viewId) };
    }
  };

  const handlePlotUnhover = () => {
    chartHoveredPointRef.current = null;
  };

  const handlePlotClick = (e: any) => {
    if (mainMode === "metadata") return;
    const mouseButton = e?.event?.button;
    if (mouseButton != null && mouseButton !== 0) return;
    if (chartMenuPos) return;

    const p = e?.points?.[0];
    const viewId = p?.customdata?.[0];
    if (viewId == null) return;

    const idx = resolveFramesIndexFromViewId(String(viewId));
    if (idx < 0 || !framesData?.frames) return;

    setSelectedRowIndex(idx);

    const row = framesData.frames[idx];
    if (row?.psdFile) {
      loadPsdForRow(row);
    } else {
      setPsdError(null);
      disposePsdImageUrl();
    }
  };

  if (mainMode === "metadata") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
          bgcolor: "background.paper",
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
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, }}>
            <Tooltip title="Show CTFTomo viewer">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArrowBack fontSize="small" />}
                  disabled={!canOpenMetadata}
                  onClick={() => setMainMode("viewer")}
                  sx={{ textTransform: "none" }}
                >
                  CTFTomo viewer
                </Button>
              </span>
            </Tooltip>

          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }} noWrap>
            {outputName}
          </Typography>
        </Paper>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <MetadataViewer
            projectId={projectIdNum}
            protocolId={protocolIdNum}
            outputName={outputName}
            embedded
            onClose={() => setMainMode("viewer")}
          />
        </Box>
      </Box>
    );
  }


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
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
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
                "& .MuiInputBase-input": { fontSize: "0.75rem", paddingY: 0.5 },
                "& input::placeholder": { fontSize: "0.7rem" },
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
                "&:hover": { bgcolor: "primary.dark", boxShadow: "none" },
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
                "&:hover": { bgcolor: "grey.200", boxShadow: "none" },
              }}
            >
              Help
            </Button>

            {!hideMetadataAction ? (
              <Tooltip title="Show metadata viewer">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<MetadataIcon fontSize="small" />}
                    disabled={!canOpenMetadata}
                    onClick={() => setMainMode("metadata")}
                    sx={{ textTransform: "none" }}
                  >
                    Metadata
                  </Button>
                </span>
              </Tooltip>
            ) : null}
            {seriesError && !seriesLoading && (
              <Typography variant="caption" color="error" sx={{ fontSize: "0.7rem" }}>
                {seriesError}
              </Typography>
            )}
          </Paper>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
            {seriesLoading && !series.length ? (
              <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Loading CTF tomo series…
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
                    <TableCell sx={seriesColumnWidths.series}>CTF tomo series</TableCell>
                    <TableCell sx={seriesColumnWidths.views}>Views</TableCell>
                    <TableCell sx={seriesColumnWidths.tiltAxis}>Tilt axis</TableCell>
                    <TableCell sx={seriesColumnWidths.pixelSize}>Pixel size</TableCell>
                    <TableCell sx={seriesColumnWidths.dimensions}>Dimensions</TableCell>
                    <TableCell sx={seriesColumnWidths.excluded}>Excl.</TableCell>
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

                    const seriesFrames = showFramesForThisSeries ? filteredFrames : [];

                    return (
                      <Fragment key={String(s.ctfSeriesId)}>
                        {/* ctfTomoSeriesRow */}
                        <TableRow
                          hover
                          selected={isSelectedSeries}
                          onClick={() => handleSeriesRowClick(s.ctfSeriesId)}
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
                          <TableCell sx={seriesColumnWidths.series}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
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

                                    onCtfSeriesSelect?.(s);
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

                              <Typography
                                variant="body2"
                                noWrap
                                title={s.label}
                                sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                              >
                                {String(s.ctfSeriesId)}
                              </Typography>
                            </Box>
                          </TableCell>

                          <TableCell sx={seriesColumnWidths.views}>
                            {s.nViews ?? ""}
                          </TableCell>

                          <TableCell sx={seriesColumnWidths.tiltAxis}>
                            {s.tiltAxisAngle != null
                              ? `${s.tiltAxisAngle.toFixed(2)}°`
                              : ""}
                          </TableCell>

                          <TableCell sx={seriesColumnWidths.pixelSize}>
                            {s.pixelSize != null
                              ? `${s.pixelSize.toFixed(2)} Å/px`
                              : ""}
                          </TableCell>

                          <TableCell sx={seriesColumnWidths.dimensions}>
                            {s.dims
                              ? [
                                s.dims[0],
                                s.dims[1],
                                s.nViews ??
                                (s.dims.length > 2
                                  ? s.dims[2]
                                  : undefined),
                              ]
                                .filter((value) => value != null && value > 0)
                                .join(" × ")
                              : ""}
                          </TableCell>

                          <TableCell sx={seriesColumnWidths.excluded}>
                            <Checkbox
                              size="small"
                              checked={Boolean(s.excluded)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() =>
                                handleToggleExcludeSeries(s.ctfSeriesId)
                              }
                              sx={{ padding: 0.25 }}
                            />
                          </TableCell>
                        </TableRow>

                        {/* ctfMeasurementsTable */}
                        {showFramesForThisSeries && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              sx={{
                                p: 0,
                                borderBottom: "1px solid #dbe3ea",
                                backgroundColor: "#fafafa",
                              }}
                            >
                              <Box
                                sx={{
                                  position: "relative",
                                  ml: 4,
                                  pl: 2,
                                  pt: 0.5,
                                  "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    left: 0,
                                    top: -2,
                                    width: 18,
                                    height: 24,
                                    borderLeft: "2px solid #d1d5db",
                                    borderBottom: "2px solid #d1d5db",
                                    borderBottomLeftRadius: "6px",
                                  },
                                }}
                              >
                                <Table
                                  size="small"
                                  sx={{
                                    tableLayout: "fixed",
                                    width: "100%",
                                    "& th": {
                                      whiteSpace: "nowrap",
                                      fontSize: "0.72rem",
                                      fontWeight: 600,
                                      py: 0.5,
                                      backgroundColor: "#f3f4f6",
                                    },
                                    "& td": {
                                      fontSize: "0.75rem",
                                      py: 0.25,
                                    },
                                  }}
                                >
                                  <TableHead>
                                    <TableRow>
                                      <TableCell
                                        sx={{ ...columnWidths.order, cursor: "context-menu" }}
                                        title="Right-click to exclude by Acq. order"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[0]);
                                        }}
                                      >
                                        Acq. order
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.angle, cursor: "context-menu" }}
                                        title="Right-click to exclude by Tilt angle"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[1]);
                                        }}
                                      >
                                        Tilt angle
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.excluded, cursor: "context-menu" }}
                                        title="Right-click to exclude by exclusion state"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[2]);
                                        }}
                                      >
                                        Excl.
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.defocusU, cursor: "context-menu" }}
                                        title="Right-click to exclude by DefocusU"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[3]);
                                        }}
                                      >
                                        DefocusU (Å)
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.defocusV, cursor: "context-menu" }}
                                        title="Right-click to exclude by DefocusV"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[4]);
                                        }}
                                      >
                                        DefocusV (Å)
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.astigmatism, cursor: "context-menu" }}
                                        title="Right-click to exclude by Astigmatism"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[5]);
                                        }}
                                      >
                                        Astigmatism (Å)
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.resolution, cursor: "context-menu" }}
                                        title="Right-click to exclude by Resolution"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[6]);
                                        }}
                                      >
                                        Resolution (Å)
                                      </TableCell>
                                      <TableCell
                                        sx={{ ...columnWidths.ccValue, cursor: "context-menu" }}
                                        title="Right-click to exclude by CC value"
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                          handleOpenCriterionDialog(CTF_VIEW_COLUMNS[7]);
                                        }}
                                      >
                                        CC value
                                      </TableCell>
                                    </TableRow>
                                  </TableHead>

                                  <TableBody>
                                    {seriesFrames.map((row, idx) => {
                                      const isSelectedRow =
                                        idx === selectedFilteredIndex &&
                                        isSelectedSeries;

                                      return (
                                        <TableRow
                                          key={`${String(s.ctfSeriesId)}-${String(row.viewId)}`}
                                          hover
                                          selected={isSelectedRow}
                                          onClick={() => handleRowClick(row)}
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
                                              sx={{ padding: 0.25 }}
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
                                  </TableBody>
                                </Table>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            bgcolor: "background.default",
            p: 1,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              flex: 1.45,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #e5e7eb",
              borderRadius: 1.5,
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            <Box
              sx={{
                px: 1,
                py: 0.5,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.72rem" }}>
                CTF estimation
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
                Right-click on a point to exclude/include
              </Typography>
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 0.5,
              }}
              onContextMenu={(evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                openChartContextMenu(evt.clientX, evt.clientY);
              }}
            >
              {!plotData.length ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
                  No CTF data available for the selected series.
                </Typography>
              ) : (
                <Plot
                  data={plotData as any}
                  layout={plotLayout as any}
                  config={plotConfig as any}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler
                  onHover={handlePlotHover as any}
                  onUnhover={handlePlotUnhover as any}
                  onClick={handlePlotClick as any}
                />
              )}
            </Box>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              flex: 0.75,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #e5e7eb",
              borderRadius: 1.5,
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            <Box
              sx={{
                px: 1,
                py: 0.5,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.72rem" }}>
                PSD preview
              </Typography>
              {selectedFrame && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
                  Tilt: {selectedFrame.tiltAngle != null ? `${selectedFrame.tiltAngle.toFixed(2)}°` : "-"}
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 1,
              }}
            >
              {psdLoading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                    Loading PSD image…
                  </Typography>
                </Box>
              ) : psdError ? (
                <Typography variant="body2" color="error" sx={{ fontSize: "0.8rem" }}>
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
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
                  No PSD data available for the selected CTF.
                </Typography>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>

      {criterionColumn && (
        <Dialog
          open
          onClose={handleCloseCriterionDialog}
          fullWidth
          maxWidth="sm"
          aria-labelledby="ctf-column-exclusion-title"
          PaperProps={{
            sx: {
              width: "min(520px, calc(100vw - 32px))",
              overflow: "hidden",
              borderRadius: "16px",
              border: "1px solid",
              borderColor: "divider",
              backgroundImage: "none",
              boxShadow: "0 24px 64px rgba(15, 23, 42, 0.26), 0 8px 20px rgba(15, 23, 42, 0.12)",
            },
          }}
        >
          <DialogTitle
            id="ctf-column-exclusion-title"
            sx={{
              px: 2.5,
              py: 1.35,
              background: "linear-gradient(180deg, #0b1220 0%, #0a0f1e 100%)",
              color: "#e5e7eb",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              fontSize: "0.95rem",
              fontWeight: 800,
              letterSpacing: 0.15,
            }}
          >
            Exclude CTF views by {criterionColumn.label}
          </DialogTitle>

          <DialogContent
            sx={{
              px: 2.5,
              pt: "20px !important",
              pb: 2.25,
              display: "flex",
              flexDirection: "column",
              gap: 1.75,
              "& .MuiTypography-body2": { fontSize: "0.78rem", lineHeight: 1.55 },
              "& .MuiInputBase-root, & .MuiInputLabel-root": { fontSize: "0.76rem" },
              "& .MuiOutlinedInput-root": { borderRadius: "10px" },
              "& .MuiFormControlLabel-label": { fontSize: "0.76rem" },
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Matching CTF views will be added to the current exclusion draft. Changes are only
              used when you generate the subsets.
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel id="ctf-column-criterion-label">Criterion</InputLabel>
              <Select
                labelId="ctf-column-criterion-label"
                label="Criterion"
                value={criterionOperator}
                onChange={(event) => setCriterionOperator(event.target.value)}
                sx={{ fontSize: "0.76rem", borderRadius: "10px" }}
                SelectDisplayProps={{ style: { fontSize: "0.76rem" } }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      mt: 0.5,
                      overflow: "hidden",
                      borderRadius: "12px",
                      border: "1px solid",
                      borderColor: "divider",
                      boxShadow: "0 14px 34px rgba(15, 23, 42, 0.18)",
                    },
                  },
                  MenuListProps: {
                    sx: {
                      py: 0.5,
                      "& .MuiMenuItem-root": {
                        mx: 0.5,
                        minHeight: "34px",
                        borderRadius: "8px",
                        fontSize: "0.76rem",
                      },
                    },
                  },
                }}
              >
                {criterionOptions.map((option) => (
                  <MenuItem
                    key={option.value}
                    value={option.value}
                    style={{ minHeight: "34px", fontSize: "0.76rem" }}
                    sx={{ mx: 0.5, borderRadius: "8px" }}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {criterionNeedsValue && (
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Value"
                  type="number"
                  value={criterionFirstValue}
                  onChange={(event) => setCriterionFirstValue(event.target.value)}
                  autoFocus
                />

                {criterionNeedsSecondValue && (
                  <TextField
                    fullWidth
                    size="small"
                    label="Second value"
                    type="number"
                    value={criterionSecondValue}
                    onChange={(event) => setCriterionSecondValue(event.target.value)}
                  />
                )}
              </Box>
            )}

            <FormControl component="fieldset">
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                Apply to
              </Typography>
              <RadioGroup
                row
                value={criterionScope}
                onChange={(event) => setCriterionScope(event.target.value as "current" | "all")}
              >
                <FormControlLabel
                  value="current"
                  control={<Radio size="small" />}
                  label="Current CTF tomo series"
                />
                <FormControlLabel
                  value="all"
                  control={<Radio size="small" />}
                  label="All CTF tomo series"
                />
              </RadioGroup>
            </FormControl>
          </DialogContent>

          <DialogActions
            sx={{
              px: 2.5,
              py: 1.5,
              gap: 0.75,
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: "action.hover",
              "& .MuiButton-root": {
                minWidth: 92,
                height: 34,
                borderRadius: "10px",
                fontSize: "0.74rem",
                fontWeight: 700,
                textTransform: "none",
              },
            }}
          >
            <Button onClick={handleCloseCriterionDialog} disabled={criterionBusy}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleApplyColumnCriterion}
              disabled={criterionBusy || !criterionCanApply}
            >
              {criterionBusy ? "Excluding…" : "Exclude"}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Menu
        open={Boolean(chartMenuPos)}
        onClose={closeChartContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={chartMenuPos ? { top: chartMenuPos.mouseY, left: chartMenuPos.mouseX } : undefined}
        PaperProps={{
          sx: {
            borderRadius: 1,
            minWidth: 180,
            "& .MuiMenuItem-root": {
              fontSize: "0.78rem",
              minHeight: 28,
              py: 0.25,
            },
          },
        }}
        MenuListProps={{
          dense: true,
          sx: {
            py: 0.25,
          },
        }}
      >
        <MenuItem dense disabled={!chartMenuTargetRow} onClick={handleChartContextToggle}>
          {chartMenuTargetRow?.excluded ? "Include this view" : "Exclude this view"}
        </MenuItem>
        <Divider />
        <MenuItem dense onClick={() => handleChartExcludeAll(true)} disabled={!framesData?.frames?.length}>
          Exclude all views (current series)
        </MenuItem>
        <MenuItem dense onClick={() => handleChartExcludeAll(false)} disabled={!framesData?.frames?.length}>
          Include all views (current series)
        </MenuItem>
      </Menu>

      {helpDialogOpen && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-lg w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-3 dark:text-white">CTF tomo viewer help</h2>

            <p className="mb-3 text-sm text-muted-foreground">This viewer allows you to create two subsets of CTFTomoSeries.</p>

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

      {generateBusy && !generateDialogOpen && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-[120] pointer-events-auto flex items-center justify-center">
          <div className="rounded-xl border bg-gray-600 dark:bg-gray-900/95 shadow-lg px-4 py-3 flex items-center gap-3 pointer-events-auto">
            <div className="relative">
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-700 animate-spin" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white dark:text-gray-100">Processing CTF tomo series…</span>
              <span className="text-[11px] text-white dark:text-gray-400">
                Generating new CTF tomo subsets. Please wait until the process finishes.
              </span>
            </div>
          </div>
        </div>
      )}

      {generateDialogOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-lg w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-3 dark:text-white">Generate CTF tomo subsets</h2>

            <p className="mb-3 text-sm text-muted-foreground">
              Are you going to create a new set of CTF tomo series with the excluded views?
            </p>

            <ul className="mb-4 list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>
                <span className="font-semibold">Generate subsets</span>: The new set will contain all views including those that are marked as excluded.
              </li>
            </ul>

            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={handleGenerateCancel}
                disabled={generateBusy}
                className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleGenerateConfirm}
                disabled={generateBusy || !series.length}
                className="px-5 py-2 rounded-md text-sm min-w-[100px] bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
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

    const indexValue = toNumber(f.index ?? f.viewIndex ?? f.tiltIndex ?? idx);

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
      tiltAngle: toNumber(f.tiltAngle ?? f.tilt_angle ?? f.angle ?? f.alpha),
      excluded:
        typeof f.excluded === "boolean"
          ? f.excluded
          : typeof f.isExcluded === "boolean"
            ? f.isExcluded
            : Boolean(f.skip),
      defocusU: toNumber(f.defocusU ?? f.defocus_u ?? f.defocusu),
      defocusV: toNumber(f.defocusV ?? f.defocus_v ?? f.defocusv),
      astigmatism: toNumber(f.astigmatism ?? f.astig ?? f.astigmatismAmp),
      resolution: toNumber(f.resolution ?? f.resolutionLimit ?? f.res),
      ccValue: toNumber(f.ccValue ?? f.cc ?? f.correlation),
      psdFile: f.psdFile ?? f.psd_path ?? f.psd ?? f.psdImage ?? null,
    } as CTFViewRow;
  });
}
