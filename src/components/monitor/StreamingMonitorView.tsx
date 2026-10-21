// The live monitor of a project's stream: its stages, the CTF and drift of each micrograph over time, and
// the runs of micrographs past a threshold. The server sends only the points the page does not have yet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Plot from "react-plotly.js";
import { Activity, ArrowDown, ArrowRight, ArrowUp, Bell, HelpCircle, RefreshCw, Settings2 } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import { useIsDark } from "@/context/ThemeContext";
import { APP_TOKENS } from "@/theme/tokens";
import { ImagePreviewDialog, type ImagePreviewSource } from "@/components/analyze/image-preview-dialog";
import type {
  Id,
  StreamingMonitor,
  StreamingMonitorPoint,
  StreamingMonitorStage,
  StreamingMonitorThresholdName,
  StreamingMonitorThresholds,
} from "@/services/ProjectService";
import {
  EMPTY_PICKING,
  EMPTY_SERIES,
  POLL_CHOICES,
  THRESHOLD_LABELS,
  alertEpisodes,
  formatAngstrom,
  formatLimit,
  mergePicking,
  mergeSeries,
  readPollSeconds,
  savePollSeconds,
  withParticles,
  type PickingState,
  type SeriesState,
} from "./streaming-monitor-data";
import StreamingMonitorThresholdsDialog from "./StreamingMonitorThresholdsDialog";
import LatestMicrographsTable, { LATEST_MICROGRAPHS } from "./LatestMicrographsTable";
import ClassesGallery from "./ClassesGallery";


const STAGE_LABELS: Record<StreamingMonitorStage["stage"], string> = {
  movies: "Movies",
  micrographs: "Micrographs",
  ctf: "CTF",
  coordinates: "Coordinates",
  particles: "Particles",
  classes2d: "2D classes",
};

type PlotSpec = {
  title: string;
  unit: string;
  series: Array<{ name: string; value: (point: StreamingMonitorPoint) => number | undefined }>;
  /** Thresholds drawn as lines on this plot. */
  limits: StreamingMonitorThresholdName[];
  /** Alerts that colour a point of this plot. */
  alerts: StreamingMonitorThresholdName[];
  /** What the plot shows and what to look for. */
  help: string;
};

const PIPELINE_HELP =
  "Each card is a step of the processing chain. The big number is how many items it has; the green dot "
  + "means its output is still open and more come. The rate is the items per minute of the last 10 minutes, "
  + "the arrow compares it with the 10 before (up: faster, down: slower). \"Waiting\" is what the step before "
  + "produced and this one has not processed yet: if it keeps growing, this step falls behind the microscope.";

const LATEST_HELP =
  `The newest ${LATEST_MICROGRAPHS} micrographs, newest first, with their power spectrum and values; values past `
  + "a threshold are red. Click a row to see the micrograph.";

const ALERTS_HELP =
  "Each line is a run of consecutive micrographs past the same threshold, newest first. A red dot means the "
  + "newest micrograph is still past it; a grey one, that the values came back in range. Click the micrograph "
  + "to see it. The thresholds are set with the Thresholds button, for everyone in the project.";

function HelpHint({ text }: { text: string }) {
  return (
    <span className="inline-flex cursor-help text-app-subtle hover:text-app-text" title={text} aria-label={text}
          role="img">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

const PLOTS: PlotSpec[] = [
  {
    title: "CTF resolution",
    unit: "Å",
    series: [{ name: "Resolution", value: (point) => point.resolution }],
    limits: ["maxResolution"],
    alerts: ["maxResolution"],
    help: "The resolution up to which the CTF fit matches the Thon rings of each micrograph, in Å. Lower is "
      + "better. A rising trend usually means thicker ice, a worse focus or drift.",
  },
  {
    title: "Defocus",
    unit: "Å",
    series: [
      { name: "Defocus U", value: (point) => point.defocusU },
      { name: "Defocus V", value: (point) => point.defocusV },
    ],
    limits: ["minDefocus", "maxDefocus"],
    alerts: ["minDefocus", "maxDefocus"],
    help: "How far from focus each micrograph is, along its two directions (U and V), in Å. It should stay "
      + "within the range set for the acquisition.",
  },
  {
    title: "Astigmatism |U − V|",
    unit: "Å",
    series: [{ name: "Astigmatism", value: (point) => (point.astigmatism === undefined ? undefined
        : Math.abs(point.astigmatism)) }],
    limits: ["maxAstigmatism"],
    alerts: ["maxAstigmatism"],
    help: "The difference between the two defocus values, in Å. A large one means the image is stretched in "
      + "one direction: the astigmatism of the microscope needs correcting.",
  },
  {
    title: "Drift",
    unit: "Å",
    series: [
      { name: "Total drift", value: (point) => point.totalDrift },
      { name: "Largest frame shift", value: (point) => point.maxFrameShift },
    ],
    limits: ["maxTotalDrift", "maxFrameShift"],
    alerts: ["maxTotalDrift", "maxFrameShift"],
    help: "How much the sample moved during each movie, in Å: the whole path (total drift) and the largest "
      + "jump between two frames. High values usually mean an unstable sample or a charging grid.",
  },
];

const PARTICLES_PLOT: PlotSpec = {
  title: "Particles per micrograph",
  unit: "particles",
  series: [{ name: "Particles", value: (point) => point.particles }],
  limits: ["minParticles"],
  alerts: ["minParticles"],
  help: "How many coordinates the picking found on each micrograph. A sudden drop usually means thick ice, an "
    + "empty area or a picker that needs tuning; far too many, that it picks contamination or edges.",
};

const CLASSES_HELP =
  "The 2D class averages of the stream, biggest first, with how many particles each has and their share. "
  + "The classifier works in rounds, so they change when a round ends. Faded classes are disabled. Click one "
  + "to see it bigger.";

function TrendIcon({ trend }: { trend: StreamingMonitorStage["trend"] }) {
  if (trend === "up") return <ArrowUp className="h-3.5 w-3.5 text-app-success" aria-label="rising" />;
  if (trend === "down") return <ArrowDown className="h-3.5 w-3.5 text-app-warning" aria-label="falling" />;
  return <ArrowRight className="h-3.5 w-3.5 text-app-subtle" aria-label="steady" />;
}

function StageCard({ stage }: { stage: StreamingMonitorStage }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-app-border bg-app-surface p-3" data-testid="monitor-stage">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-app-subtle">{STAGE_LABELS[stage.stage]}</span>
        {stage.streaming ? (
          <span className="h-2 w-2 rounded-full bg-app-success" title="Still receiving items" />
        ) : null}
      </div>
      <div className="mt-1 text-2xl font-semibold text-app-text">{stage.items.toLocaleString()}</div>
      {stage.perMinute !== null ? (
        <div className="mt-1 flex items-center gap-1 text-xs text-app-muted">
          <TrendIcon trend={stage.trend} />
          <span>{stage.perMinute.toFixed(1)} / min</span>
        </div>
      ) : null}
      {stage.stage === "classes2d" && stage.particles != null ? (
        <div className="mt-1 text-xs text-app-muted">{stage.particles.toLocaleString()} particles classified</div>
      ) : null}
      {stage.classifiedFrom ? (
        <div className="mt-1 truncate text-[11px] text-app-subtle"
             title={`Classifies the ${stage.classifiedFrom.items} particles of ${stage.classifiedFrom.label} (${stage.classifiedFrom.outputName})`}>
          from {stage.classifiedFrom.label}
        </div>
      ) : null}
      {stage.micrographs !== undefined ? (
        <div className="mt-1 text-xs text-app-muted">
          {stage.counting ? "Counting micrographs…" : `from ${stage.micrographs.toLocaleString()} micrographs`}
        </div>
      ) : null}
      {stage.pickedFrom ? (
        <div className="mt-1 truncate text-[11px] text-app-subtle"
             title={`Picks the ${stage.pickedFrom.items} micrographs of ${stage.pickedFrom.label} (${stage.pickedFrom.outputName})`}>
          from {stage.pickedFrom.label}
        </div>
      ) : null}
      {stage.behind ? (
        <div className="mt-1 text-xs font-medium text-app-warning">
          {stage.behind.toLocaleString()}
          {stage.micrographs !== undefined ? " micrographs" : stage.stage === "classes2d" ? " particles" : ""} waiting
        </div>
      ) : null}
      <div className="mt-1 truncate text-[11px] text-app-subtle" title={`${stage.label} · ${stage.outputName}`}>
        {stage.label}
      </div>
    </div>
  );
}

function MonitorPlot({
  spec,
  points,
  thresholds,
  dark,
  onPick,
}: {
  spec: PlotSpec;
  points: StreamingMonitorPoint[];
  thresholds: StreamingMonitorThresholds | null;
  dark: boolean;
  onPick: (pointId: number) => void;
}) {
  const tokens = APP_TOKENS[dark ? "dark" : "light"];
  const colours = [tokens.accent, tokens.success];
  const usable = points.filter((point) => !point.failed && point.time);
  const data = spec.series.map((serie, index) => {
    const shown = usable.filter((point) => serie.value(point) !== undefined);
    return {
      type: "scattergl",
      mode: "markers",
      name: serie.name,
      x: shown.map((point) => point.time),
      y: shown.map((point) => serie.value(point)),
      customdata: shown.map((point) => [point.id, point.micrographName ?? `Micrograph ${point.id}`]),
      hovertemplate: `%{customdata[1]}<br>%{y:.1f} ${spec.unit}<extra>${serie.name}</extra>`,
      marker: {
        size: 6,
        color: shown.map((point) => (point.alerts.some((alert) => spec.alerts.includes(alert))
          ? tokens.danger : colours[index % colours.length])),
      },
    };
  });
  const shapes = spec.limits
    .map((name) => thresholds?.[name])
    .filter((value): value is number => value !== null && value !== undefined)
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
    autosize: true,
    height: 260,
    margin: { t: 32, r: 16, b: 40, l: 56 },
    title: { text: spec.title, font: { size: 13, color: tokens.text }, x: 0.02 },
    paper_bgcolor: tokens.surface,
    plot_bgcolor: tokens.surface,
    font: { color: tokens.textMuted, size: 11 },
    hovermode: "closest",
    showlegend: spec.series.length > 1,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.15 },
    xaxis: { type: "date", gridcolor: tokens.border, zeroline: false },
    yaxis: { title: { text: spec.unit }, gridcolor: tokens.border, zeroline: false },
    shapes,
  };
  return (
    <div className="relative rounded-xl border border-app-border bg-app-surface p-2" data-testid="monitor-plot">
      <div className="absolute right-3 top-3 z-10">
        <HelpHint text={`${spec.help} Each point is a micrograph, at the time it was processed; red ones go past `
          + "a threshold (the dashed lines). Click one to see the micrograph."} />
      </div>
      <Plot
        data={data}
        layout={layout}
        config={{ displaylogo: false, responsive: true }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        onClick={(event: any) => {
          const button = event?.event?.button;
          if (button != null && button !== 0) return;
          const pointId = event?.points?.[0]?.customdata?.[0];
          if (pointId != null) onPick(Number(pointId));
        }}
      />
    </div>
  );
}

type HistogramSpec = {
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
    unit: "Å",
    binSize: 0.5,
    value: (point) => point.resolution,
    help: "How many micrographs reach each CTF resolution (0.5 Å bins). A distribution moving to the right "
      + "means the data are getting worse.",
  },
  {
    title: "Defocus coverage",
    unit: "µm",
    binSize: 0.5,
    value: (point) => (point.defocusU === undefined ? undefined : point.defocusU / 10000),
    help: "How many micrographs were taken at each defocus (defocus U, 0.5 µm bins). The bars should cover "
      + "the defocus range planned for the session evenly.",
  },
];

function MonitorHistogram({ spec, points, dark }: { spec: HistogramSpec; points: StreamingMonitorPoint[]; dark: boolean }) {
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
    autosize: true,
    height: 240,
    barmode: "overlay",
    bargap: 0.05,
    margin: { t: 32, r: 16, b: 40, l: 48 },
    title: { text: spec.title, font: { size: 13, color: tokens.text }, x: 0.02 },
    paper_bgcolor: tokens.surface,
    plot_bgcolor: tokens.surface,
    font: { color: tokens.textMuted, size: 11 },
    showlegend: recent.length > 0,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.15 },
    xaxis: { title: { text: spec.unit }, gridcolor: tokens.border, zeroline: false },
    yaxis: { title: { text: "Micrographs" }, gridcolor: tokens.border, zeroline: false },
  };
  return (
    <div className="relative rounded-xl border border-app-border bg-app-surface p-2" data-testid="monitor-histogram">
      <div className="absolute right-3 top-3 z-10">
        <HelpHint text={spec.help + (recent.length ? ` The last ${RECENT_MICROGRAPHS} micrographs are drawn over the whole session.` : "")} />
      </div>
      <Plot data={data} layout={layout} config={{ displaylogo: false, responsive: true }} useResizeHandler
            style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function timeOf(point: StreamingMonitorPoint): string {
  return point.time ? new Date(point.time).toLocaleTimeString() : "—";
}

/** ``embedded``: inside a window over the project (no way back to it is needed). */
export default function StreamingMonitorView({ projectId, embedded = false }: { projectId: Id; embedded?: boolean }) {
  const svc = useProjectService();
  const dark = useIsDark();
  const [monitor, setMonitor] = useState<StreamingMonitor | null>(null);
  const [series, setSeries] = useState<SeriesState>(EMPTY_SERIES);
  const [picking, setPicking] = useState<PickingState>(EMPTY_PICKING);
  const pickingRef = useRef<PickingState>(EMPTY_PICKING);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pollSeconds, setPollSeconds] = useState<number>(() => readPollSeconds());
  const [ctfSetId, setCtfSetId] = useState<number | null>(null);
  const [coordinatesSetId, setCoordinatesSetId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<ImagePreviewSource | null>(null);
  const seriesRef = useRef<SeriesState>(EMPTY_SERIES);
  // The monitor can live in another browser window: its own document says whether it is seen.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (fromScratch = false) => {
    if (!svc.fetchStreamingMonitor || loadingRef.current) return;
    loadingRef.current = true;
    try {
      let current = fromScratch ? EMPTY_SERIES : seriesRef.current;
      let picks = fromScratch ? EMPTY_PICKING : pickingRef.current;
      let answer: StreamingMonitor;
      // Points come in batches: read until the server has no more.
      do {
        answer = await svc.fetchStreamingMonitor(projectId, {
          ctfSetId,
          coordinatesSetId,
          afterSetId: current.setId,
          afterRowId: current.lastRowId,
          afterPickSetId: picks.setId,
          afterPickRowId: picks.lastRowId,
        });
        current = mergeSeries(current, answer.series);
        picks = mergePicking(picks, answer.picking);
      } while (answer.series.more && answer.series.points.length > 0);
      seriesRef.current = current;
      pickingRef.current = picks;
      setSeries(current);
      setPicking(picks);
      setMonitor(answer);
      setUpdatedAt(new Date());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The streaming monitor could not be read");
    } finally {
      loadingRef.current = false;
    }
  }, [svc, projectId, ctfSetId, coordinatesSetId]);

  useEffect(() => {
    void load(true);
  }, [load]);

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
  const thresholds = monitor?.thresholds ?? null;
  // The points as shown: with the coordinates picked on their micrograph, which come later than the CTF
  const points = useMemo(() => withParticles(series.points, picking.counts, thresholds),
    [series.points, picking.counts, thresholds]);
  const episodes = useMemo(() => alertEpisodes(points), [points]);
  const pointsById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);

  const openMicrograph = useCallback((pointId: number) => {
    if (!ctfStage || seriesKind !== "ctf") return;
    const point = pointsById.get(pointId);
    const details: ImagePreviewSource["details"] = [];
    if (point?.defocusU !== undefined) details.push({ label: "Defocus U", value: formatAngstrom(point.defocusU, 0) });
    if (point?.astigmatism !== undefined) details.push({ label: "Astigmatism", value: formatAngstrom(Math.abs(point.astigmatism), 0) });
    if (point?.resolution !== undefined) details.push({ label: "CTF resolution", value: formatAngstrom(point.resolution) });
    if (point?.totalDrift !== undefined) details.push({ label: "Total drift", value: formatAngstrom(point.totalDrift) });
    setPreview({
      title: point?.micrographName ?? `Micrograph ${pointId}`,
      path: point?.micrographName ?? String(pointId),
      details,
      loadImage: (signal) => svc.fetchCTFMicrographImageObjectUrl(projectId, ctfStage.protocolId, ctfStage.outputName,
        pointId, { size: 1024, format: "png", quality: 80, signal }),
    });
  }, [svc, projectId, ctfStage, seriesKind, pointsById]);

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

  const saveThresholds = useCallback(async (changed: Partial<StreamingMonitorThresholds>) => {
    if (!svc.saveStreamingMonitorThresholds) return;
    await svc.saveStreamingMonitorThresholds(projectId, changed);
    setEditing(false);
    // The alerts of every point depend on the thresholds: read the series again.
    await load(true);
  }, [svc, projectId, load]);

  if (!svc.fetchStreamingMonitor) {
    return <div className="p-6 text-sm text-app-muted">The streaming monitor is not available here.</div>;
  }

  return (
    <div ref={rootRef} className="h-full w-full overflow-y-auto bg-app-bg p-4 md:p-6" data-testid="streaming-monitor">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <Activity className="h-5 w-5 text-app-accent" />
          <h1 className="text-lg font-semibold text-app-text">Streaming monitor</h1>
          {monitor ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${monitor.streaming
              ? "bg-app-accent-soft text-app-accent" : "bg-app-surface-3 text-app-muted"}`}>
              {monitor.streaming ? "Streaming" : "Not streaming"}
            </span>
          ) : null}
          {updatedAt ? (
            <span className="text-xs text-app-subtle">Updated {updatedAt.toLocaleTimeString()}</span>
          ) : null}
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
          <div className="ml-auto flex items-center gap-2">
            {monitor && monitor.ctfOutputs.length > 1 ? (
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
            ) : null}
            {monitor && monitor.coordinatesOutputs.length > 1 ? (
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
            ) : null}
            <button type="button" title="Alert thresholds" aria-label="Thresholds"
                    className="flex items-center gap-1.5 rounded-lg border border-app-border bg-app-surface px-2.5 py-1 text-sm text-app-text hover:bg-app-hover disabled:opacity-60"
                    onClick={() => setEditing(true)} disabled={!monitor}>
              <Settings2 className="h-4 w-4" />
              Thresholds
            </button>
            <button type="button" className="pp-flowControlBtn" title="Refresh" aria-label="Refresh"
                    onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </button>
            {embedded ? null : (
              <Link className="text-sm text-app-accent hover:underline" to={`/project/load/${encodeURIComponent(String(projectId))}`}>
                Back to the project
              </Link>
            )}
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-app-border bg-app-surface p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : null}

        {monitor && monitor.stages.length === 0 ? (
          <div className="rounded-xl border border-app-border bg-app-surface p-6 text-sm text-app-muted">
            This project has no movies, micrographs or CTF outputs to follow yet.
          </div>
        ) : null}

        {monitor && monitor.stages.length > 0 ? (
          <section aria-label="Pipeline">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
              Pipeline <HelpHint text={PIPELINE_HELP} />
            </div>
            <div className="flex flex-wrap gap-3">
              {monitor.stages.map((stage) => <StageCard key={stage.setId} stage={stage} />)}
            </div>
          </section>
        ) : null}

        {seriesKind ? (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Quality over time">
            {seriesKind === "micrographs" ? (
              <div className="rounded-xl border border-app-border bg-app-surface p-3 text-sm text-app-muted lg:col-span-2">
                No CTF estimation yet: the drift of the aligned micrographs is shown meanwhile.
              </div>
            ) : null}
            {plots.map((spec) => (
              <MonitorPlot key={spec.title} spec={spec} points={points} thresholds={thresholds}
                           dark={dark} onPick={openMicrograph} />
            ))}
          </section>
        ) : null}

        {seriesKind === "ctf" && ctfStage ? (
          <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="Latest micrographs">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
              Latest micrographs <HelpHint text={LATEST_HELP} />
            </div>
            <LatestMicrographsTable projectId={projectId} protocolId={ctfStage.protocolId} outputName={ctfStage.outputName}
                                    points={points} onOpen={openMicrograph} showParticles={hasPicking} />
          </section>
        ) : null}

        {monitor?.classes ? (
          <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="2D classes">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
              2D classes <HelpHint text={CLASSES_HELP} />
            </div>
            <ClassesGallery projectId={projectId} classes={monitor.classes} onOpen={openClass} />
          </section>
        ) : null}

        {seriesKind === "ctf" ? (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Distributions">
            {HISTOGRAMS.map((spec) => (
              <MonitorHistogram key={spec.title} spec={spec} points={points} dark={dark} />
            ))}
          </section>
        ) : null}

        {seriesKind ? (
          <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="Alerts">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
              <Bell className="h-3.5 w-3.5" /> Alerts <HelpHint text={ALERTS_HELP} />
            </div>
            {episodes.length === 0 ? (
              <div className="text-sm text-app-muted">No micrograph goes past the thresholds.</div>
            ) : (
              <ul className="divide-y divide-app-border">
                {episodes.map((episode) => {
                  const limit = monitor?.thresholds[episode.kind];
                  return (
                    <li key={`${episode.kind}-${episode.first.id}`} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                      <span className={`h-2 w-2 rounded-full ${episode.ongoing ? "bg-app-danger" : "bg-app-subtle"}`} />
                      <span className="font-medium text-app-text">{THRESHOLD_LABELS[episode.kind]} {formatLimit(episode.kind, limit)}</span>
                      <span className="text-app-muted">
                        {episode.count === 1 ? "1 micrograph" : `${episode.count} micrographs in a row`}
                        {" · "}{timeOf(episode.first)}{episode.count > 1 ? ` – ${timeOf(episode.last)}` : ""}
                        {episode.ongoing ? " · still going on" : ""}
                      </span>
                      <button type="button" className="ml-auto text-app-accent hover:underline"
                              onClick={() => openMicrograph(episode.first.id)}>
                        {episode.first.micrographName ?? `Micrograph ${episode.first.id}`}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <ImagePreviewDialog image={preview} onClose={() => setPreview(null)} />
      {editing && monitor ? (
        <StreamingMonitorThresholdsDialog thresholds={monitor.thresholds} onCancel={() => setEditing(false)}
                                          onSave={saveThresholds}
                                          container={rootRef.current?.ownerDocument.body ?? undefined} />
      ) : null}
    </div>
  );
}
