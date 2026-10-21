// The live monitor of a project's stream: its stages, the CTF and drift of each micrograph over time, and
// the runs of micrographs past a threshold. The server sends only the points the page does not have yet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Plot from "react-plotly.js";
import { Activity, ArrowDown, ArrowRight, ArrowUp, Bell, RefreshCw, Settings2 } from "lucide-react";

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
  EMPTY_SERIES,
  THRESHOLD_LABELS,
  alertEpisodes,
  formatAngstrom,
  mergeSeries,
  type SeriesState,
} from "./streaming-monitor-data";
import StreamingMonitorThresholdsDialog from "./StreamingMonitorThresholdsDialog";

export const MONITOR_POLL_MS = 15000;

const STAGE_LABELS: Record<StreamingMonitorStage["stage"], string> = {
  movies: "Movies",
  micrographs: "Micrographs",
  ctf: "CTF",
  coordinates: "Coordinates",
  particles: "Particles",
};

type PlotSpec = {
  title: string;
  unit: string;
  series: Array<{ name: string; value: (point: StreamingMonitorPoint) => number | undefined }>;
  /** Thresholds drawn as lines on this plot. */
  limits: StreamingMonitorThresholdName[];
  /** Alerts that colour a point of this plot. */
  alerts: StreamingMonitorThresholdName[];
};

const PLOTS: PlotSpec[] = [
  {
    title: "CTF resolution",
    unit: "Å",
    series: [{ name: "Resolution", value: (point) => point.resolution }],
    limits: ["maxResolution"],
    alerts: ["maxResolution"],
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
  },
  {
    title: "Astigmatism |U − V|",
    unit: "Å",
    series: [{ name: "Astigmatism", value: (point) => (point.astigmatism === undefined ? undefined
        : Math.abs(point.astigmatism)) }],
    limits: ["maxAstigmatism"],
    alerts: ["maxAstigmatism"],
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
  },
];

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
      <div className="mt-1 flex items-center gap-1 text-xs text-app-muted">
        <TrendIcon trend={stage.trend} />
        <span>{stage.perMinute.toFixed(1)} / min</span>
      </div>
      {stage.behind ? (
        <div className="mt-1 text-xs font-medium text-app-warning">{stage.behind.toLocaleString()} waiting</div>
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
    <div className="rounded-xl border border-app-border bg-app-surface p-2" data-testid="monitor-plot">
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

function timeOf(point: StreamingMonitorPoint): string {
  return point.time ? new Date(point.time).toLocaleTimeString() : "—";
}

/** ``embedded``: inside a window over the project (no way back to it is needed). */
export default function StreamingMonitorView({ projectId, embedded = false }: { projectId: Id; embedded?: boolean }) {
  const svc = useProjectService();
  const dark = useIsDark();
  const [monitor, setMonitor] = useState<StreamingMonitor | null>(null);
  const [series, setSeries] = useState<SeriesState>(EMPTY_SERIES);
  const [error, setError] = useState<string | null>(null);
  const [ctfSetId, setCtfSetId] = useState<number | null>(null);
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
      let answer: StreamingMonitor;
      // Points come in batches: read until the server has no more.
      do {
        answer = await svc.fetchStreamingMonitor(projectId, {
          ctfSetId,
          afterSetId: current.setId,
          afterItemId: current.lastItemId,
        });
        current = mergeSeries(current, answer.series);
      } while (answer.series.more && answer.series.points.length > 0);
      seriesRef.current = current;
      setSeries(current);
      setMonitor(answer);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The streaming monitor could not be read");
    } finally {
      loadingRef.current = false;
    }
  }, [svc, projectId, ctfSetId]);

  useEffect(() => {
    void load(true);
    const ownerDocument = () => rootRef.current?.ownerDocument ?? document;
    const seen = () => ownerDocument().visibilityState === "visible";
    const timer = window.setInterval(() => {
      if (seen()) void load();
    }, MONITOR_POLL_MS);
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
  }, [load]);

  const ctfStage = monitor?.stages.find((stage) => stage.stage === "ctf") ?? null;
  // Before there is a CTF output the points are the micrographs, and only their drift is known
  const seriesKind = monitor?.series.kind ?? null;
  const plots = seriesKind === "ctf" ? PLOTS : PLOTS.filter((spec) => spec.title === "Drift");
  const episodes = useMemo(() => alertEpisodes(series.points), [series.points]);
  const pointsById = useMemo(() => new Map(series.points.map((point) => [point.id, point])), [series.points]);

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
          <section className="flex flex-wrap gap-3" aria-label="Pipeline">
            {monitor.stages.map((stage) => <StageCard key={stage.setId} stage={stage} />)}
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
              <MonitorPlot key={spec.title} spec={spec} points={series.points} thresholds={monitor?.thresholds ?? null}
                           dark={dark} onPick={openMicrograph} />
            ))}
          </section>
        ) : null}

        {seriesKind ? (
          <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="Alerts">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
              <Bell className="h-3.5 w-3.5" /> Alerts
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
                      <span className="font-medium text-app-text">{THRESHOLD_LABELS[episode.kind]} {formatAngstrom(limit, 0)}</span>
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
