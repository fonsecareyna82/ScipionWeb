// The live monitor of a project's stream: its stages, the CTF and drift of each micrograph over time, and
// the runs of micrographs past a threshold. The server sends only the points the page does not have yet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Plot from "react-plotly.js";
import { Activity, RefreshCw, Settings2 } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import { useIsDark } from "@/context/ThemeContext";
import { APP_TOKENS } from "@/theme/tokens";
import { ImagePreviewDialog, type ImagePreviewSource } from "@/components/analyze/image-preview-dialog";
import type {
  Id,
  StreamingMonitor,
  StreamingMonitorPoint,
  StreamingMonitorThresholdName,
  StreamingMonitorThresholds,
  TomoMonitor,
} from "@/services/ProjectService";
import {
  EMPTY_DOSE,
  EMPTY_PICKING,
  EMPTY_SERIES,
  POLL_CHOICES,
  THRESHOLD_ORDER,
  TOMO_THRESHOLD_ORDER,
  alertEpisodes,
  dosePlotPoints,
  formatAngstrom,
  mergeDose,
  mergePicking,
  mergeSeries,
  readPollSeconds,
  savePollSeconds,
  withParticles,
  type DoseState,
  type PickingState,
  type SeriesState,
} from "./streaming-monitor-data";
import StreamingMonitorThresholdsDialog from "./StreamingMonitorThresholdsDialog";
import { HelpHint, PlotHeader, StageCard, plotBox, plotFrame } from "./monitor-parts";
import TomoMonitorView from "./TomoMonitorView";
import { AlertsButton, AlertsPanel, useUnseenAlerts, type MonitorAlert } from "./MonitorAlertsPanel";
import LatestMicrographsTable, { LATEST_MICROGRAPHS } from "./LatestMicrographsTable";
import ClassesGallery from "./ClassesGallery";
import QualitySummary from "./QualitySummary";
import { useQualityWindows } from "./quality-window-preferences";
import { movieQualitySummary, spaQualitySummary } from "./quality-summary-data";
import CustomizeMonitorView from "./CustomizeMonitorView";
import { MONITOR_SECTIONS, useMonitorViewPreferences, type MonitorSection } from "./monitor-view-preferences";
import ThresholdSliders, { previewAlerts, type ThresholdChanges } from "./ThresholdSliders";


const PLOT_HEIGHT = 260;
const HISTOGRAM_HEIGHT = 240;

type PlotSpec = {
  section: MonitorSection;
  title: string;
  unit: string;
  /** What each point is: a micrograph, or a movie for the dose. */
  item?: "micrograph" | "movie";
  /** The thresholds are a distance from zero: drawn above and below it. */
  symmetric?: boolean;
  series: Array<{ name: string; value: (point: StreamingMonitorPoint) => number | undefined }>;
  /** Thresholds drawn as lines on this plot. */
  limits: StreamingMonitorThresholdName[];
  /** Alerts that colour a point of this plot. */
  alerts: StreamingMonitorThresholdName[];
  /** What the plot shows and what to look for. */
  help: string;
  /** Why there is nothing to draw, when no point has a value. */
  empty: string;
};

const PIPELINE_HELP =
  "Each card is a step of the processing chain. The big number is how many items it has; the green dot "
  + "means its output is still open and more come. The rate is the items per minute of the last 10 minutes, "
  + "the arrow compares it with the 10 before (up: faster, down: slower). \"Waiting\" is what the step before "
  + "produced and this one has not processed yet: if it keeps growing, this step falls behind the microscope.";

const LATEST_HELP =
  `The newest ${LATEST_MICROGRAPHS} micrographs, newest first, with their power spectrum and values; values past `
  + "a threshold are red. Click the micrograph or its power spectrum to see it bigger.";


const PLOTS: PlotSpec[] = [
  {
    title: "CTF resolution",
    section: "resolution",
    unit: "Å",
    series: [{ name: "Resolution", value: (point) => point.resolution }],
    limits: ["maxResolution"],
    alerts: ["maxResolution"],
    help: "The resolution up to which the CTF fit matches the Thon rings of each micrograph, in Å. Lower is "
      + "better. A rising trend usually means thicker ice, a worse focus or drift.",
    empty: "The CTF estimation gives no resolution for these micrographs.",
  },
  {
    title: "Defocus",
    section: "defocus",
    unit: "Å",
    series: [
      { name: "Defocus U", value: (point) => point.defocusU },
      { name: "Defocus V", value: (point) => point.defocusV },
    ],
    limits: ["minDefocus", "maxDefocus"],
    alerts: ["minDefocus", "maxDefocus"],
    help: "How far from focus each micrograph is, along its two directions (U and V), in Å. It should stay "
      + "within the range set for the acquisition.",
    empty: "No defocus estimated for these micrographs yet.",
  },
  {
    title: "Astigmatism |U − V|",
    section: "astigmatism",
    unit: "Å",
    series: [{ name: "Astigmatism", value: (point) => (point.astigmatism === undefined ? undefined
        : Math.abs(point.astigmatism)) }],
    limits: ["maxAstigmatism"],
    alerts: ["maxAstigmatism"],
    help: "The difference between the two defocus values, in Å. A large one means the image is stretched in "
      + "one direction: the astigmatism of the microscope needs correcting.",
    empty: "No astigmatism estimated for these micrographs yet.",
  },
  {
    title: "Drift",
    section: "drift",
    unit: "Å",
    series: [
      { name: "Total drift", value: (point) => point.totalDrift },
      { name: "Largest frame shift", value: (point) => point.maxFrameShift },
    ],
    limits: ["maxTotalDrift", "maxFrameShift"],
    alerts: ["maxTotalDrift", "maxFrameShift"],
    help: "How much the sample moved during each movie, in Å: the whole path (total drift) and the largest "
      + "jump between two frames. High values usually mean an unstable sample or a charging grid.",
    empty: "No drift: the movie alignment of this stream does not keep the shifts of the frames.",
  },
];

const PARTICLES_PLOT: PlotSpec = {
  title: "Particles per micrograph",
    section: "particles",
  unit: "particles",
  series: [{ name: "Particles", value: (point) => point.particles }],
  limits: ["minParticles"],
  alerts: ["minParticles"],
  help: "How many coordinates the picking found on each micrograph. A sudden drop usually means thick ice, an "
    + "empty area or a picker that needs tuning; far too many, that it picks contamination or edges. The "
    + "micrograph a point opens shows its particles circled.",
  empty: "No particles picked on these micrographs yet.",
};

const DOSE_PLOT: PlotSpec = {
  title: "Dose stability",
    section: "dose",
  unit: "%",
  item: "movie",
  symmetric: true,
  series: [{ name: "Dose against the median", value: (point) => point.doseDifference }],
  limits: ["maxDoseDifference"],
  alerts: ["maxDoseDifference"],
  help: "How far the dose of each movie is from the median dose of the session, in %, as the dose analysis "
    + "measured it. It should stay flat around 0: a jump or a drift points to the beam, the gun or the camera, "
    + "before it shows in the CTF.",
  empty: "No dose measured on the movies yet.",
};

const CLASSES_HELP =
  "The 2D class averages of the stream, biggest first, with how many particles each has and their share. "
  + "The classifier works in rounds, so they change when a round ends. Faded classes are disabled. Click one "
  + "to see it bigger.";

function MonitorPlot({
  spec,
  points,
  thresholds,
  dark,
  onPick,
  byOrder = false,
  thresholdChanges = {},
  onThresholdChange,
  savingThresholds = false,
}: {
  thresholdChanges?: ThresholdChanges;
  onThresholdChange?: (changes: ThresholdChanges) => void;
  savingThresholds?: boolean;
  spec: PlotSpec;
  points: StreamingMonitorPoint[];
  thresholds: StreamingMonitorThresholds | null;
  dark: boolean;
  onPick?: (pointId: number) => void;
  /** Nothing streams: the micrographs in their order, as processing times would all fall together. */
  byOrder?: boolean;
}) {
  const tokens = APP_TOKENS[dark ? "dark" : "light"];
  const shownThresholds = thresholds ? { ...thresholds, ...thresholdChanges } : null;
  const colours = [tokens.accent, tokens.success];
  const order = new Map(points.map((point, index) => [point.id, index + 1]));
  const usable = points.filter((point) => !point.failed && (byOrder || point.time));
  const data = spec.series.map((serie, index) => {
    const shown = usable.filter((point) => serie.value(point) !== undefined);
    return {
      type: "scattergl",
      mode: "markers",
      name: serie.name,
      x: shown.map((point) => (byOrder ? order.get(point.id) : point.time)),
      y: shown.map((point) => serie.value(point)),
      customdata: shown.map((point) => [point.id, point.micrographName ?? `Micrograph ${point.id}`]),
      hovertemplate: `%{customdata[1]}<br>%{y:.1f} ${spec.unit}<extra>${serie.name}</extra>`,
      marker: {
        size: 6,
        color: shown.map((point) => (previewAlerts(point.failed ? [] : point.alerts, thresholdChanges, {
          minDefocus: point.defocusV == null ? undefined : Math.min(point.defocusV, point.defocusU || point.defocusV),
          maxDefocus: point.defocusU == null ? undefined : Math.max(point.defocusU, point.defocusV || point.defocusU),
          maxAstigmatism: point.astigmatism == null ? undefined : Math.abs(point.astigmatism),
          maxResolution: point.resolution, maxTotalDrift: point.totalDrift, maxFrameShift: point.maxFrameShift,
          minParticles: point.particles, maxDoseDifference: point.doseDifference == null ? undefined : Math.abs(point.doseDifference),
        }).some((alert) => spec.alerts.includes(alert))
          ? tokens.danger : colours[index % colours.length])),
      },
    };
  });
  const shapes = spec.limits
    .map((name) => shownThresholds?.[name])
    .filter((value): value is number => value !== null && value !== undefined)
    .flatMap((value) => (spec.symmetric ? [value, -value] : [value]))
    .map((value) => ({
      type: "line",
      xref: "paper",
      x0: 0,
      x1: 1,
      y0: value,
      y1: value,
      line: { color: tokens.danger, width: 1, dash: "dash" },
    }));
  const layout = {
    ...plotFrame(PLOT_HEIGHT, spec.series.length > 1, false),
    uirevision: spec.title,
    paper_bgcolor: tokens.surface,
    plot_bgcolor: tokens.surface,
    font: { color: tokens.textMuted, size: 11 },
    hovermode: "closest",
    showlegend: spec.series.length > 1,
    xaxis: byOrder ? { title: { text: spec.item === "movie" ? "Movie" : "Micrograph" }, gridcolor: tokens.border, zeroline: false }
      : { type: "date", gridcolor: tokens.border, zeroline: false },
    yaxis: { title: { text: spec.unit }, gridcolor: tokens.border, zeroline: false },
    shapes,
  };
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-app-border bg-app-surface p-2" data-testid="monitor-plot">
      <PlotHeader title={spec.title} help={`${spec.help} Each point is a ${spec.item ?? "micrograph"}, at the time it `
        + "was processed; red ones go past a threshold (the dashed lines)."
        + (onPick ? " Click one to see the micrograph." : "")} />
      <ThresholdSliders names={spec.limits} thresholds={shownThresholds} bounds={thresholds}
                        onChange={onThresholdChange} disabled={savingThresholds} />
      {data.every((serie) => serie.y.length === 0) ? (
        <div className="flex items-center justify-center px-6 text-center text-sm text-app-muted" data-testid="empty-plot"
             style={plotBox(PLOT_HEIGHT)}>
          {spec.empty}
        </div>
      ) : (
        <Plot
          data={data}
          layout={layout}
          config={{ displaylogo: false, responsive: true }}
          useResizeHandler
          style={plotBox(PLOT_HEIGHT)}
          onClick={(event: any) => {
            const button = event?.event?.button;
            if (button != null && button !== 0) return;
            const pointId = event?.points?.[0]?.customdata?.[0];
            if (pointId != null) onPick?.(Number(pointId));
          }}
        />
      )}
    </div>
  );
}

type HistogramSpec = {
  limits: StreamingMonitorThresholdName[];
  thresholdScale?: number;
  title: string;
  unit: string;
  binSize: number;
  value: (point: StreamingMonitorPoint) => number | undefined;
  help: string;
};

// As in the facilities report: the whole session, and its last micrographs over it once there are enough.
const RECENT_MICROGRAPHS = 50;
const RECENT_FROM = 100;

const HISTOGRAMS: HistogramSpec[] = [
  {
    title: "CTF resolution",
    limits: ["maxResolution"],
    unit: "Å",
    binSize: 0.5,
    value: (point) => point.resolution,
    help: "How many micrographs reach each CTF resolution (0.5 Å bins). A distribution moving to the right "
      + "means the data are getting worse.",
  },
  {
    title: "Defocus coverage",
    limits: ["minDefocus", "maxDefocus"],
    thresholdScale: 1 / 10000,
    unit: "µm",
    binSize: 0.5,
    value: (point) => (point.defocusU === undefined ? undefined : point.defocusU / 10000),
    help: "How many micrographs were taken at each defocus (defocus U, 0.5 µm bins). The bars should cover "
      + "the defocus range planned for the session evenly.",
  },
];

function MonitorHistogram({ spec, points, dark, thresholds, thresholdChanges, onThresholdChange, savingThresholds = false }: {
  spec: HistogramSpec; points: StreamingMonitorPoint[]; dark: boolean;
  thresholds: StreamingMonitorThresholds | null; thresholdChanges: ThresholdChanges;
  onThresholdChange?: (changes: ThresholdChanges) => void; savingThresholds?: boolean;
}) {
  const shownThresholds = thresholds ? { ...thresholds, ...thresholdChanges } : null;
  const tokens = APP_TOKENS[dark ? "dark" : "light"];
  const values = (list: StreamingMonitorPoint[]) => list
    .filter((point) => !point.failed)
    .map(spec.value)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const all = values(points);
  const recent = points.length >= RECENT_FROM ? values(points.slice(-RECENT_MICROGRAPHS)) : [];
  const bins = { size: spec.binSize };
  const data: any[] = [{
    type: "histogram", name: "All micrographs", x: all, xbins: bins, marker: { color: tokens.accent },
    hovertemplate: `%{x} ${spec.unit}: %{y}<extra>All</extra>`,
  }];
  if (recent.length) {
    data.push({
      type: "histogram", name: `Last ${RECENT_MICROGRAPHS}`, x: recent, xbins: bins,
      marker: { color: tokens.warning }, opacity: 0.75, hovertemplate: `%{x} ${spec.unit}: %{y}<extra>Last ${RECENT_MICROGRAPHS}</extra>`,
    });
  }
  const layout = {
    ...plotFrame(HISTOGRAM_HEIGHT, recent.length > 0, false),
    uirevision: spec.title,
    shapes: spec.limits.map((name) => shownThresholds?.[name])
      .filter((value): value is number => value != null)
      .map((value) => ({ type: "line", yref: "paper", y0: 0, y1: 1,
        x0: value * (spec.thresholdScale ?? 1), x1: value * (spec.thresholdScale ?? 1),
        line: { color: tokens.danger, width: 1, dash: "dash" } })),
    barmode: "overlay",
    bargap: 0.05,
    paper_bgcolor: tokens.surface,
    plot_bgcolor: tokens.surface,
    font: { color: tokens.textMuted, size: 11 },
    showlegend: recent.length > 0,
    xaxis: { title: { text: spec.unit }, gridcolor: tokens.border, zeroline: false },
    yaxis: { title: { text: "Micrographs" }, gridcolor: tokens.border, zeroline: false },
  };
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-app-border bg-app-surface p-2" data-testid="monitor-histogram">
      <PlotHeader title={spec.title} help={spec.help + (recent.length
        ? ` The last ${RECENT_MICROGRAPHS} micrographs are drawn over the whole session.` : "")} />
      <ThresholdSliders names={spec.limits} thresholds={shownThresholds} bounds={thresholds}
                        onChange={onThresholdChange} disabled={savingThresholds} />
      <Plot data={data} layout={layout} config={{ displaylogo: false, responsive: true }} useResizeHandler
            style={plotBox(HISTOGRAM_HEIGHT)} />
    </div>
  );
}


/** ``embedded``: inside a window over the project (no way back to it is needed). */
export default function StreamingMonitorView({ projectId, embedded = false }: { projectId: Id; embedded?: boolean }) {
  const svc = useProjectService();
  const dark = useIsDark();
  const { sizes: qualityWindows, setSize: setQualityWindow } = useQualityWindows();
  const qualityWindowSizeRef = useRef(qualityWindows.spa);
  qualityWindowSizeRef.current = qualityWindows.spa;
  const { preferences, setVisible, restore } = useMonitorViewPreferences();
  const [monitor, setMonitor] = useState<StreamingMonitor | null>(null);
  const [series, setSeries] = useState<SeriesState>(EMPTY_SERIES);
  const [picking, setPicking] = useState<PickingState>(EMPTY_PICKING);
  const pickingRef = useRef<PickingState>(EMPTY_PICKING);
  const [dose, setDose] = useState<DoseState>(EMPTY_DOSE);
  const doseRef = useRef<DoseState>(EMPTY_DOSE);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pollSeconds, setPollSeconds] = useState<number>(() => readPollSeconds());
  const [ctfSetId, setCtfSetId] = useState<number | null>(null);
  const [coordinatesSetId, setCoordinatesSetId] = useState<number | null>(null);
  const [classesSetId, setClassesSetId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [thresholdChanges, setThresholdChanges] = useState<ThresholdChanges>({});
  const thresholdAutosaveTimerRef = useRef<number | null>(null);
  const thresholdSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const thresholdValuesRef = useRef<StreamingMonitorThresholds | null>(null);
  const thresholdProjectRef = useRef(projectId);
  thresholdProjectRef.current = projectId;
  const changeThresholds = useCallback((changed: ThresholdChanges) => {
    setThresholdChanges((previous) => ({ ...previous, ...changed }));
  }, []);
  useEffect(() => {
    setThresholdChanges({});
    thresholdValuesRef.current = null;
  }, [projectId]);
  // The tomography view: chosen, or the one shown when the project has tilt series and nothing else to follow
  const [view, setView] = useState<"spa" | "tomo" | null>(null);
  const [tomo, setTomo] = useState<TomoMonitor | null>(null);
  const [tomoReload, setTomoReload] = useState(0);
  const [preview, setPreview] = useState<ImagePreviewSource | null>(null);
  const seriesRef = useRef<SeriesState>(EMPTY_SERIES);
  // The monitor can live in another browser window: its own document says whether it is seen.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const reloadRequestedRef = useRef(false);
  useEffect(() => () => {
    reloadRequestedRef.current = false;
    requestRevisionRef.current += 1;
  }, []);
  const requestRevisionRef = useRef(0);
  const requestKey = JSON.stringify([projectId, ctfSetId, coordinatesSetId, classesSetId]);
  const requestKeyRef = useRef(requestKey);
  requestKeyRef.current = requestKey;
  const latestLoadRef = useRef<(fromScratch?: boolean) => Promise<void>>(async () => {});

  const load = useCallback(async (fromScratch = false) => {
    if (!svc.fetchStreamingMonitor) return;
    if (loadingRef.current) {
      if (fromScratch) reloadRequestedRef.current = true;
      return;
    }
    const revision = requestRevisionRef.current;
    const key = requestKeyRef.current;
    loadingRef.current = true;
    try {
      let current = fromScratch ? EMPTY_SERIES : seriesRef.current;
      let picks = fromScratch ? EMPTY_PICKING : pickingRef.current;
      let doses = fromScratch ? EMPTY_DOSE : doseRef.current;
      let answer: StreamingMonitor;
      // Points come in batches: read until the server has no more.
      do {
        answer = await svc.fetchStreamingMonitor(projectId, {
          ctfSetId,
          coordinatesSetId,
          classesSetId,
          afterSetId: current.setId,
          afterRowId: current.lastRowId,
          afterPickSetId: picks.setId,
          afterPickRowId: picks.lastRowId,
          afterDoseKey: doses.key,
          afterDoseRowId: doses.lastRowId,
          qualityWindowSize: qualityWindowSizeRef.current,
        });
        if (key !== requestKeyRef.current || revision !== requestRevisionRef.current) return;
        current = mergeSeries(current, answer.series);
        picks = mergePicking(picks, answer.picking);
        doses = mergeDose(doses, answer.dose);
      } while ((answer.series.more && answer.series.points.length > 0) || answer.dose.more);
      seriesRef.current = current;
      pickingRef.current = picks;
      doseRef.current = doses;
      setSeries(current);
      setPicking(picks);
      setDose(doses);
      thresholdValuesRef.current = answer.thresholds;
      setMonitor(answer);
      setUpdatedAt(new Date());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The streaming monitor could not be read");
    } finally {
      loadingRef.current = false;
      if (reloadRequestedRef.current) {
        reloadRequestedRef.current = false;
        void latestLoadRef.current(true);
      }
    }
  }, [svc, projectId, ctfSetId, coordinatesSetId, classesSetId]);
  latestLoadRef.current = load;

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!monitor?.exposures || monitor.exposures.windowSize === qualityWindows.spa) return;
    if (loadingRef.current) reloadRequestedRef.current = true;
    else void load();
  }, [monitor?.exposures?.windowSize, qualityWindows.spa, load]);

  useEffect(() => {
    if (!pollSeconds) return undefined;
    const ownerDocument = () => rootRef.current?.ownerDocument ?? document;
    const seen = () => ownerDocument().visibilityState === "visible";
    const timer = window.setInterval(() => {
      if (seen()) void load();
    }, pollSeconds * 1000);
    const onVisible = () => {
      if (seen()) void load();
    };
    // The timer asks the document the monitor is in now, so moving it to another window keeps it polling;
    // coming back to this tab reads at once.
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, pollSeconds]);

  const ctfStage = monitor?.stages.find((stage) => stage.stage === "ctf") ?? null;
  // Before there is a CTF output the points are the micrographs, and only their drift is known
  const seriesKind = monitor?.series.kind ?? null;
  const hasPicking = Boolean(monitor?.stages.some((stage) => stage.stage === "coordinates"));
  const plots = [...(seriesKind === "ctf" ? PLOTS : PLOTS.filter((spec) => spec.title === "Drift")),
                 ...(hasPicking ? [PARTICLES_PLOT] : [])];
  const visiblePlots = plots.filter((spec) => preferences.spa[spec.section] !== false);
  const thresholds = monitor?.thresholds ?? null;
  // The points as shown: with the coordinates picked on their micrograph, which come later than the CTF
  const points = useMemo(() => withParticles(series.points, picking.counts, thresholds),
    [series.points, picking.counts, thresholds]);
  const quality = useMemo(() => {
    if (!thresholds) return null;
    const current = { ...thresholds, ...thresholdChanges };
    return monitor?.exposures
      ? movieQualitySummary(monitor.exposures, current, hasPicking, qualityWindows.spa, preferences.spa)
      : spaQualitySummary(points, current, seriesKind === "ctf", hasPicking, qualityWindows.spa, preferences.spa);
  }, [points, thresholds, thresholdChanges, seriesKind, hasPicking, qualityWindows.spa, preferences.spa, monitor?.exposures]);
  // A movie of the dose analysis for a micrograph: drawn and alerted as one
  const dosePoints = useMemo(() => dosePlotPoints(dose.points), [dose.points]);
  const hasDose = dosePoints.length > 0;
  const showDose = hasDose && preferences.spa.dose !== false;
  // Every alert of the monitor, newest first: micrographs, movies of the dose analysis and tilt series
  const alerts = useMemo<MonitorAlert[]>(() => [
    ...alertEpisodes(points).map((episode) => ({ ...episode, item: "micrograph" as const })),
    ...alertEpisodes(dosePoints).map((episode) => ({ ...episode, item: "movie" as const })),
    ...alertEpisodes((tomo?.tiltSeries ?? []).map((row): StreamingMonitorPoint => ({
      id: row.id, time: row.time, micrographName: row.tsId, enabled: row.enabled, alerts: row.alerts,
    }))).map((episode) => ({ ...episode, item: "tilt series" as const })),
  ].sort((a, b) => (b.last.time ?? "").localeCompare(a.last.time ?? "")), [points, dosePoints, tomo]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const unseenAlerts = useUnseenAlerts(projectId, alerts, alertsOpen);
  // A tilt series an alert asks the tomography view to open
  const [tomoFocus, setTomoFocus] = useState<{ tsId: string; at: number } | null>(null);
  const pointsById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);

  const openMicrograph = useCallback((pointId: number, kind: "micrograph" | "psd" = "micrograph") => {
    if (!ctfStage || seriesKind !== "ctf") return;
    const point = pointsById.get(pointId);
    const details: ImagePreviewSource["details"] = [];
    if (point?.defocusU !== undefined) details.push({ label: "Defocus U", value: formatAngstrom(point.defocusU, 0) });
    if (point?.astigmatism !== undefined) details.push({ label: "Astigmatism", value: formatAngstrom(Math.abs(point.astigmatism), 0) });
    if (point?.resolution !== undefined) details.push({ label: "CTF resolution", value: formatAngstrom(point.resolution) });
    if (point?.totalDrift !== undefined) details.push({ label: "Total drift", value: formatAngstrom(point.totalDrift) });
    const load = kind === "psd" ? svc.fetchCTFPsdImageObjectUrl : svc.fetchCTFMicrographImageObjectUrl;
    const name = point?.micrographName ?? `Micrograph ${pointId}`;
    setPreview({
      title: kind === "psd" ? `${name} · power spectrum` : name,
      path: point?.micrographName ?? String(pointId),
      details,
      loadImage: (signal) => load.call(svc, projectId, ctfStage.protocolId, ctfStage.outputName,
        pointId, { size: 1024, format: "png", quality: 80, signal }),
    });
  }, [svc, projectId, ctfStage, seriesKind, pointsById]);

  const pickedCoordinates = monitor?.picking?.protocolId && monitor.picking.outputName
    ? { protocolId: monitor.picking.protocolId, outputName: monitor.picking.outputName,
        boxSize: monitor.picking.boxSize ?? null }
    : null;
  const { protocolId: pickProtocolId, outputName: pickOutputName, boxSize: pickBoxSize } = pickedCoordinates ?? {};

  // The micrograph as the picking read it, with the coordinates it found drawn over it
  const openParticles = useCallback((pointId: number) => {
    if (!pickProtocolId || !pickOutputName) return;
    const point = pointsById.get(pointId);
    const name = point?.micrographName ?? `Micrograph ${pointId}`;
    setPreview({
      title: `${name} · particles`,
      path: point?.micrographName ?? String(pointId),
      details: point?.particles !== undefined ? [{ label: "Particles", value: point.particles.toLocaleString() }] : [],
      loadImage: (signal) => svc.fetchCoords2dMicrographImageObjectUrl(projectId, pickProtocolId, pickOutputName,
        pointId, { size: 1024, format: "png", signal }),
      overlay: {
        label: "Particles",
        load: async () => ({
          points: await svc.fetchCoords2dForMicrograph(projectId, pickProtocolId, pickOutputName, pointId),
          boxSize: pickBoxSize,
        }),
      },
    });
  }, [svc, projectId, pickProtocolId, pickOutputName, pickBoxSize, pointsById]);

  const openClass = useCallback((classId: number) => {
    const classes = monitor?.classes;
    if (!classes) return;
    const item = classes.classes.find((candidate) => candidate.id === classId);
    setPreview({
      title: `Class ${classId}`,
      path: `${classes.outputName} · class ${classId}`,
      details: item ? [{ label: "Particles", value: item.particles.toLocaleString() }] : [],
      loadImage: (signal) => svc.fetchMetadataImageCellObjectUrl(projectId, classes.protocolId, classes.outputName,
        "objects", 0, "stack", { rowId: classId, size: 512, format: "png", contrastMode: "enhanced",
          applyTransform: false, inline: true, version: classes.version ?? undefined, signal }),
    });
  }, [svc, projectId, monitor?.classes]);

  const saveThresholds = useCallback((changed: Partial<StreamingMonitorThresholds>, fromSlider = false) => {
    // Saving the form supersedes a slider save that has not started yet.
    if (!fromSlider && thresholdAutosaveTimerRef.current !== null) {
      window.clearTimeout(thresholdAutosaveTimerRef.current);
      thresholdAutosaveTimerRef.current = null;
    }
    // Serialize writes so a slower earlier save cannot overwrite the latest slider position.
    const task = thresholdSaveQueueRef.current.catch(() => {}).then(async () => {
      if (!svc.saveStreamingMonitorThresholds) return;
      if (thresholdProjectRef.current !== projectId) return;
      if (!thresholdValuesRef.current) throw new Error("The monitor thresholds are not loaded yet");
      // PUT replaces every threshold. Merge at execution time so queued saves retain
      // both endpoints, the other view's limits, and the results of preceding saves.
      const complete = { ...thresholdValuesRef.current, ...changed };
      const answer = await svc.saveStreamingMonitorThresholds(projectId, complete);
      if (thresholdProjectRef.current !== projectId) return;
      const saved = { ...complete, ...answer };
      thresholdValuesRef.current = saved;
      requestRevisionRef.current += 1;
      if (!fromSlider) setEditing(false);
      setThresholdChanges((previous) => {
        if (!fromSlider) return {};
        const remaining = Object.entries(previous).filter(([name, value]) =>
          value !== changed[name as StreamingMonitorThresholdName]);
        return remaining.length === Object.keys(previous).length ? previous : Object.fromEntries(remaining);
      });
      setMonitor((previous) => previous ? { ...previous, thresholds: { ...previous.thresholds, ...changed, ...saved } } : previous);
      setTomo((previous) => previous ? { ...previous, thresholds: { ...previous.thresholds, ...changed, ...saved } } : previous);
      setTomoReload((current) => current + 1);
      await latestLoadRef.current(true);
    });
    thresholdSaveQueueRef.current = task;
    return task;
  }, [svc, projectId]);

  useEffect(() => {
    if (!Object.keys(thresholdChanges).length) return;
    // The form and plots update immediately; save once dragging pauses briefly.
    const timer = window.setTimeout(() => {
      thresholdAutosaveTimerRef.current = null;
      void saveThresholds(thresholdChanges, true).catch((reason) => {
        if (thresholdProjectRef.current !== projectId) return;
        setError(reason instanceof Error ? reason.message : "The thresholds could not be saved");
      });
    }, 400);
    thresholdAutosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (thresholdAutosaveTimerRef.current === timer) thresholdAutosaveTimerRef.current = null;
    };
  }, [thresholdChanges, saveThresholds, projectId]);

  const isSeen = useCallback(() => (rootRef.current?.ownerDocument ?? document).visibilityState === "visible", []);
  const tabs = Boolean(monitor?.tomography && monitor.stages.length > 0);
  const mode = view ?? (monitor?.tomography && monitor.stages.length === 0 ? "tomo" : "spa");
  // Without anything streaming the monitor is an overview of how the data came out: no rates, no backlogs
  const live = Boolean(mode === "tomo" ? tomo?.streaming ?? true : monitor?.streaming ?? true);

  if (!svc.fetchStreamingMonitor) {
    return <div className="p-6 text-sm text-app-muted">The streaming monitor is not available here.</div>;
  }

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-app-bg" data-testid="streaming-monitor">
      {alertsOpen ? (
        <AlertsPanel alerts={alerts} thresholds={mode === "tomo" && tomo ? tomo.thresholds : thresholds}
                     onClose={() => setAlertsOpen(false)}
                     onOpen={(alert) => {
                       if (alert.item === "tilt series" && alert.first.micrographName) {
                         setView("tomo");
                         setTomoFocus({ tsId: alert.first.micrographName, at: Date.now() });
                       } else if (alert.item === "micrograph") {
                         setView("spa");
                         openMicrograph(alert.first.id);
                       }
                     }} />
      ) : null}
      <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-3 border-b border-app-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Activity className="h-5 w-5 text-app-accent" />
            <h1 className="text-lg font-semibold text-app-text">{live ? "Streaming monitor" : "Quality overview"}</h1>
            {monitor ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${monitor.streaming
                ? "bg-app-accent-soft text-app-accent" : "bg-app-surface-3 text-app-muted"}`}>
                {monitor.streaming ? "Streaming" : "Not streaming"}
              </span>
            ) : null}
            <div className="ml-auto flex flex-col items-end gap-1.5">
              {updatedAt ? (
                <span className="text-xs text-app-subtle">Updated {updatedAt.toLocaleTimeString()}</span>
              ) : null}
              <div className="flex items-center gap-2">
              <button type="button" className="pp-flowControlBtn" title="Refresh" aria-label="Refresh"
                      onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
              </button>
                <AlertsButton unseen={unseenAlerts} total={alerts.length} open={alertsOpen}
                              onToggle={() => setAlertsOpen((open) => !open)} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <select
                aria-label="Refresh every"
                title="How often the monitor reads (in this browser)"
                className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-xs text-app-text"
                value={pollSeconds}
                onChange={(event) => {
                  const seconds = Number(event.target.value);
                  setPollSeconds(seconds);
                  savePollSeconds(seconds);
                }}
              >
                {POLL_CHOICES.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds === 0 ? "Paused" : seconds < 60 ? `Every ${seconds} s` : `Every ${seconds / 60} min`}
                  </option>
                ))}
              </select>
              <CustomizeMonitorView mode={mode} visibility={preferences[mode]}
                                    onChange={(section, visible) => setVisible(mode, section, visible)}
                                    onRestore={() => restore(mode)} />
              <button type="button" title="Alert thresholds" aria-label="Thresholds"
                      className="flex items-center gap-1.5 rounded-lg border border-app-border bg-app-accent-soft px-2.5 py-1 text-sm text-app-text hover:bg-app-hover disabled:opacity-60"
                      onClick={() => setEditing(true)} disabled={!monitor}>
                <Settings2 className="h-4 w-4" />
                Thresholds
              </button>
            </div>
            {mode === "spa" && monitor && (monitor.ctfOutputs.length > 1
              || monitor.coordinatesOutputs.length > 1 || monitor.classesOutputs.length > 1) ? (
              <span aria-hidden="true" className="w-full border-t border-app-border" />
            ) : null}
            <div className="flex w-full min-w-0 flex-wrap items-end gap-3 empty:hidden">
              {mode === "spa" && monitor && monitor.ctfOutputs.length > 1 ? (
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-center text-[11px] font-medium text-app-muted">CTF</span>
                  <select
                    aria-label="CTF output to follow"
                    className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm text-app-text"
                    value={ctfStage?.setId ?? ""}
                    onChange={(event) => setCtfSetId(Number(event.target.value))}
                  >
                    {monitor.ctfOutputs.map((output) => (
                      <option key={output.setId} value={output.setId}>{`${output.label} · ${output.outputName}`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {mode === "spa" && monitor && monitor.coordinatesOutputs.length > 1 ? (
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-center text-[11px] font-medium text-app-muted">Picking</span>
                  <select
                    aria-label="Picking to follow"
                    title="Picking to follow"
                    className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm text-app-text"
                    value={monitor.stages.find((stage) => stage.stage === "coordinates")?.setId ?? ""}
                    onChange={(event) => setCoordinatesSetId(Number(event.target.value))}
                  >
                    {monitor.coordinatesOutputs.map((output) => (
                      <option key={output.setId} value={output.setId}>{`${output.label} · ${output.outputName}`}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {mode === "spa" && monitor && monitor.classesOutputs.length > 1 ? (
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-center text-[11px] font-medium text-app-muted">2D classes</span>
                  <select
                    aria-label="2D classes to follow"
                    title="2D classes to follow"
                    className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm text-app-text"
                    value={monitor.classes?.setId ?? ""}
                    onChange={(event) => {
                      // The classes asked for bring their own picking
                      setCoordinatesSetId(null);
                      setClassesSetId(Number(event.target.value));
                    }}
                  >
                    {monitor.classesOutputs.map((output) => (
                      <option key={output.setId} value={output.setId}>{`${output.label} · ${output.outputName}`}</option>
                    ))}
                  </select>
                </label>
              ) : null}


              {embedded ? null : (
                <Link className="ml-auto text-sm text-app-accent hover:underline" to={`/project/load/${encodeURIComponent(String(projectId))}`}>
                  Back to the project
                </Link>
              )}

            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-app-border bg-app-surface p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : null}

        {tabs ? (
          <div className="flex gap-1 border-b border-app-border" role="tablist" aria-label="Monitor view">
            {(["spa", "tomo"] as const).map((view) => (
              <button key={view} type="button" role="tab" aria-selected={mode === view} onClick={() => setView(view)}
                      className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${mode === view
                        ? "border-app-accent font-medium text-app-text" : "border-transparent text-app-muted hover:text-app-text"}`}>
                {view === "spa" ? "Single particle" : "Tomography"}
              </button>
            ))}
          </div>
        ) : null}

        {MONITOR_SECTIONS[mode].every(([section]) => preferences[mode][section] === false) ? (
          <div className="rounded-xl border border-app-border bg-app-surface p-6 text-sm text-app-muted">
            No sections selected. Use Customize view to choose what to display. Alerts remain active.
          </div>
        ) : null}

        {mode === "tomo" ? (
          <TomoMonitorView projectId={projectId} pollSeconds={pollSeconds} reloadKey={tomoReload} dark={dark}
                           isSeen={isSeen} onLoaded={setTomo} focus={tomoFocus}
                           thresholdChanges={thresholdChanges} onThresholdChange={changeThresholds}
                           qualityWindowSize={qualityWindows.tomo} visibility={preferences.tomo} />
        ) : (
          <>
          {monitor && monitor.stages.length === 0 ? (
            <div className="rounded-xl border border-app-border bg-app-surface p-6 text-sm text-app-muted">
              This project has no movies, micrographs or CTF outputs to follow yet.
            </div>
          ) : null}

          {quality && monitor && monitor.stages.length > 0 && preferences.spa.summary !== false ? (
            <QualitySummary data={quality} unit={monitor.exposures ? "movies" : "micrographs"} />
          ) : null}

          {monitor && monitor.stages.length > 0 && preferences.spa.pipeline !== false ? (
            <section aria-label="Pipeline">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
                Pipeline <HelpHint text={PIPELINE_HELP} />
              </div>
              <div className="flex flex-wrap gap-3">
                {monitor.stages.map((stage) => <StageCard key={stage.setId} stage={stage} live={live} />)}
              </div>
            </section>
          ) : null}

          {(seriesKind && visiblePlots.length > 0) || showDose ? (
            <section className={`grid grid-cols-1 gap-3 ${visiblePlots.length + Number(showDose) > 1 ? "lg:grid-cols-2" : ""}`} aria-label="Quality over time">
              {seriesKind === "micrographs" && visiblePlots.length > 0 ? (
                <div className="rounded-xl border border-app-border bg-app-surface p-3 text-sm text-app-muted col-span-full">
                  No CTF estimation yet: the drift of the aligned micrographs is shown meanwhile.
                </div>
              ) : null}
              {visiblePlots.map((spec) => (
                <MonitorPlot key={spec.title} spec={spec} points={points} thresholds={thresholds} byOrder={!live}
                             dark={dark} thresholdChanges={thresholdChanges}
                             onThresholdChange={svc.saveStreamingMonitorThresholds ? changeThresholds : undefined}
                             onPick={spec === PARTICLES_PLOT && pickedCoordinates ? openParticles : openMicrograph} />
              ))}
              {showDose ? (
                <MonitorPlot spec={DOSE_PLOT} points={dosePoints} thresholds={thresholds} byOrder={!live} dark={dark}
                             thresholdChanges={thresholdChanges} onThresholdChange={svc.saveStreamingMonitorThresholds ? changeThresholds : undefined} />
              ) : null}
            </section>
          ) : null}

          {seriesKind === "ctf" && ctfStage && preferences.spa.latest !== false ? (
            <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="Latest micrographs">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
                Latest micrographs <HelpHint text={LATEST_HELP} />
              </div>
              <LatestMicrographsTable projectId={projectId} protocolId={ctfStage.protocolId} outputName={ctfStage.outputName}
                                      points={points} onOpen={openMicrograph} showParticles={hasPicking} />
            </section>
          ) : null}

          {monitor?.classes && preferences.spa.classes !== false ? (
            <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="2D classes">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
                2D classes <HelpHint text={CLASSES_HELP} />
              </div>
              <ClassesGallery projectId={projectId} classes={monitor.classes} onOpen={openClass} />
            </section>
          ) : null}

          {seriesKind === "ctf" && preferences.spa.distributions !== false ? (
            <section className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Distributions">
              {HISTOGRAMS.map((spec) => (
                <MonitorHistogram key={spec.title} spec={spec} points={points} dark={dark}
                                  thresholds={thresholds} thresholdChanges={thresholdChanges}
                                  onThresholdChange={svc.saveStreamingMonitorThresholds ? changeThresholds : undefined} />
              ))}
            </section>
          ) : null}

          </>
        )}
      </div>
      </div>

      {/* In the window the monitor is in, also when it was moved to another one */}
      <ImagePreviewDialog image={preview} onClose={() => setPreview(null)}
                          container={rootRef.current?.ownerDocument.body ?? undefined} />
      {editing && monitor ? (
        <StreamingMonitorThresholdsDialog thresholds={{ ...(mode === "tomo" && tomo ? tomo.thresholds : monitor.thresholds), ...thresholdChanges }}
                                          names={mode === "tomo" ? TOMO_THRESHOLD_ORDER : THRESHOLD_ORDER}
                                          summaryWindowSize={qualityWindows[mode]}
                                          summaryUnit={mode === "tomo" ? "tilt series" : monitor.exposures ? "movies" : "micrographs"}
                                          onCancel={() => setEditing(false)} onSave={async (changed, size) => {
                                            const current = mode === "tomo" && tomo ? tomo.thresholds : monitor.thresholds;
                                            const limitsChanged = Object.entries(changed).some(([name, value]) =>
                                              value !== current[name as StreamingMonitorThresholdName]);
                                            if (limitsChanged || Object.keys(thresholdChanges).length) await saveThresholds(changed);
                                            else setEditing(false);
                                            if (size !== undefined) setQualityWindow(mode, size);
                                          }}
                                          container={rootRef.current?.ownerDocument.body ?? undefined} />
      ) : null}
    </div>
  );
}
