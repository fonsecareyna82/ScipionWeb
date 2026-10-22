// The tomography view of the streaming monitor: the stages of the stream, one row per tilt series with its
// tilts, CTF, alignment and tomogram, how the session goes, and the tilt series past a threshold. A tilt
// series opens its tilts by angle and the central slice of its tomogram.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { Bell, Check, X } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import { APP_TOKENS } from "@/theme/tokens";
import type {
  Id,
  StreamingMonitorPoint,
  StreamingMonitorThresholdName,
  TomoMonitor,
  TomoMonitorTilt,
  TomoMonitorTiltSeries,
} from "@/services/ProjectService";
import { HelpHint, StageCard } from "./monitor-parts";
import { THRESHOLD_LABELS, alertEpisodes, formatLimit } from "./streaming-monitor-data";

const THUMBNAIL_SIZE = 96;
const SLICE_SIZE = 512;

const PIPELINE_HELP =
  "Each card is a step of the tomography stream: the tilt series as they are acquired, their CTF, the aligned "
  + "ones and the tomograms. The number is how many tilt series it has; \"waiting\" is how many the step before "
  + "has and this one has not processed yet.";

const TABLE_HELP =
  "One row per tilt series, newest first: its tilts (kept of all; an incomplete one is still arriving), tilt "
  + "range and dose, its CTF (mean defocus, worst resolution, tilts without a CTF), the residual of its fiducial "
  + "alignment and its tomogram. Values past a threshold are red. Click a row to see its tilts by angle.";

const SESSION_HELP =
  "How the session goes, one point per tilt series at the time it was acquired: its mean defocus, the tilts it "
  + "kept and the residual of its alignment. Red points go past a threshold.";

const ALERTS_HELP =
  "Each line is a run of consecutive tilt series past the same threshold, newest first. A red dot means the "
  + "newest one is still past it. The thresholds are set with the Thresholds button, for everyone in the project.";

type Props = {
  projectId: Id;
  pollSeconds: number;
  /** Changes when the thresholds are saved: everything is read again. */
  reloadKey: number;
  dark: boolean;
  /** Whether the window the monitor is in is seen (it can be another browser window). */
  isSeen: () => boolean;
  onLoaded: (monitor: TomoMonitor) => void;
};

function TomogramSlice({ projectId, setId, itemId, size }: { projectId: Id; setId: number; itemId: number; size: number }) {
  const svc = useProjectService();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!svc.fetchTomoMonitorSliceObjectUrl) return undefined;
    const controller = new AbortController();
    let revoke: (() => void) | null = null;
    setFailed(false);
    svc.fetchTomoMonitorSliceObjectUrl(projectId, setId, itemId, { size, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) {
          result.revoke();
          return;
        }
        revoke = result.revoke;
        setUrl(result.url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      revoke?.();
    };
  }, [svc, projectId, setId, itemId, size]);

  if (url) return <img src={url} alt="Central slice of the tomogram" className="h-full w-full object-contain" />;
  return (
    <div className="flex h-full w-full items-center justify-center text-[10px] text-app-subtle"
         aria-label={failed ? "Tomogram not available" : "Tomogram loading"}>
      {failed ? "—" : "…"}
    </div>
  );
}

function Cell({ value, alerted }: { value: string; alerted: boolean }) {
  return (
    <td className={`px-2 py-1 text-right tabular-nums ${alerted ? "font-semibold text-app-danger" : "text-app-text"}`}>
      {value}
    </td>
  );
}

const number = (value: number | undefined, digits = 1, unit = "") =>
  value === undefined ? "—" : `${value.toFixed(digits)}${unit}`;

function layoutFor(title: string, yTitle: string, dark: boolean, xTitle?: string, xType?: string) {
  const tokens = APP_TOKENS[dark ? "dark" : "light"];
  return {
    autosize: true,
    height: 240,
    margin: { t: 32, r: 16, b: 40, l: 56 },
    title: { text: title, font: { size: 13, color: tokens.text }, x: 0.02 },
    paper_bgcolor: tokens.surface,
    plot_bgcolor: tokens.surface,
    font: { color: tokens.textMuted, size: 11 },
    hovermode: "closest",
    showlegend: true,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.15 },
    xaxis: { type: xType, title: xTitle ? { text: xTitle } : undefined, gridcolor: tokens.border, zeroline: false },
    yaxis: { title: { text: yTitle }, gridcolor: tokens.border, zeroline: false },
  };
}

function SessionPlot({ title, unit, rows, value, alerts, dark, onPick, byOrder = false }: {
  title: string; unit: string; rows: TomoMonitorTiltSeries[]; value: (row: TomoMonitorTiltSeries) => number | undefined;
  alerts: StreamingMonitorThresholdName[]; dark: boolean; onPick: (tsId: string) => void;
  /** Nothing streams: the tilt series in their order, as their times would all fall together. */
  byOrder?: boolean;
}) {
  const tokens = APP_TOKENS[dark ? "dark" : "light"];
  const order = new Map([...rows].sort((a, b) => a.id - b.id).map((row, index) => [row.id, index + 1]));
  const shown = rows.filter((row) => (byOrder || row.time) && value(row) !== undefined);
  const data = [{
    type: "scatter",
    mode: "markers",
    name: title,
    x: shown.map((row) => (byOrder ? order.get(row.id) : row.time)),
    y: shown.map(value),
    customdata: shown.map((row) => [row.tsId]),
    hovertemplate: `%{customdata[0]}<br>%{y:.1f} ${unit}<extra></extra>`,
    marker: { size: 7, color: shown.map((row) => (row.alerts.some((alert) => alerts.includes(alert))
      ? tokens.danger : tokens.accent)) },
  }];
  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-2" data-testid="tomo-session-plot">
      <Plot data={data} layout={{ ...layoutFor(title, unit, dark, byOrder ? "Tilt series" : undefined,
                                               byOrder ? undefined : "date"), showlegend: false }}
            config={{ displaylogo: false, responsive: true }} useResizeHandler style={{ width: "100%", height: "100%" }}
            onClick={(event: any) => {
              const tsId = event?.points?.[0]?.customdata?.[0];
              if (tsId != null) onPick(String(tsId));
            }} />
    </div>
  );
}

function TiltSeriesDetail({ projectId, row, tomograms, tilts, dark, onClose }: {
  projectId: Id; row: TomoMonitorTiltSeries; tomograms: TomoMonitor["tomograms"]; tilts: TomoMonitorTilt[] | null;
  dark: boolean; onClose: () => void;
}) {
  const tokens = APP_TOKENS[dark ? "dark" : "light"];
  const withAngle = (tilts ?? []).filter((tilt) => tilt.angle !== undefined);
  const series = (name: string, color: string, value: (tilt: TomoMonitorTilt) => number | undefined, axis = "y") => {
    const shown = withAngle.filter((tilt) => value(tilt) !== undefined);
    return {
      type: "scatter", mode: "lines+markers", name, yaxis: axis,
      x: shown.map((tilt) => tilt.angle), y: shown.map(value),
      marker: { size: 6, color: shown.map((tilt) => (tilt.enabled ? color : tokens.textDisabled)) },
      line: { color, width: 1 },
      hovertemplate: `%{x}°: %{y:.1f}<extra>${name}</extra>`,
    };
  };
  const ctfLayout = {
    ...layoutFor("CTF by tilt angle", "Defocus (Å)", dark, "Tilt angle (°)"),
    yaxis2: { title: { text: "Resolution (Å)" }, overlaying: "y", side: "right", zeroline: false },
  };
  const hasShifts = withAngle.some((tilt) => tilt.shiftX !== undefined);
  const hasResiduals = withAngle.some((tilt) => tilt.residual !== undefined);
  return (
    <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label={`Tilt series ${row.tsId}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-app-text">{row.tsId}</span>
        <span className="text-xs text-app-subtle">Excluded tilts are grey.</span>
        <button type="button" onClick={onClose} aria-label="Close the tilt series"
                className="ml-auto rounded p-1 text-app-subtle hover:bg-app-hover hover:text-app-text">
          <X className="h-4 w-4" />
        </button>
      </div>
      {tilts === null ? <div className="text-sm text-app-muted">Reading its tilts…</div> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-app-border p-2" data-testid="tilt-plot">
            <Plot data={[series("Defocus U", tokens.accent, (t) => t.defocusU),
                         series("Defocus V", tokens.success, (t) => t.defocusV),
                         series("Resolution", tokens.warning, (t) => t.resolution, "y2")]}
                  layout={ctfLayout} config={{ displaylogo: false, responsive: true }} useResizeHandler
                  style={{ width: "100%", height: "100%" }} />
          </div>
          {hasShifts ? (
            <div className="rounded-xl border border-app-border p-2" data-testid="tilt-plot">
              <Plot data={[series("Shift X", tokens.accent, (t) => t.shiftX), series("Shift Y", tokens.success, (t) => t.shiftY)]}
                    layout={layoutFor("Alignment shifts by tilt angle", "px", dark, "Tilt angle (°)")}
                    config={{ displaylogo: false, responsive: true }} useResizeHandler
                    style={{ width: "100%", height: "100%" }} />
            </div>
          ) : null}
          {hasResiduals ? (
            <div className="rounded-xl border border-app-border p-2" data-testid="tilt-plot">
              <Plot data={[series("Residual", tokens.danger, (t) => t.residual)]}
                    layout={layoutFor("Fiducial residual by tilt angle", "px", dark, "Tilt angle (°)")}
                    config={{ displaylogo: false, responsive: true }} useResizeHandler
                    style={{ width: "100%", height: "100%" }} />
            </div>
          ) : null}
          {tomograms && row.tomogramId !== undefined ? (
            <div className="flex flex-col items-center gap-1 rounded-xl border border-app-border p-2">
              <span className="self-start text-[13px] text-app-text">Tomogram, central slice</span>
              <div className="aspect-square w-full max-w-[420px] overflow-hidden rounded bg-black">
                <TomogramSlice projectId={projectId} setId={tomograms.setId} itemId={row.tomogramId} size={SLICE_SIZE} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default function TomoMonitorView({ projectId, pollSeconds, reloadKey, dark, isSeen, onLoaded }: Props) {
  const svc = useProjectService();
  const [monitor, setMonitor] = useState<TomoMonitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tsSetId, setTsSetId] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tilts, setTilts] = useState<TomoMonitorTilt[] | null>(null);
  const loadingRef = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const load = useCallback(async () => {
    if (!svc.fetchTomoMonitor || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const answer = await svc.fetchTomoMonitor(projectId, { tsSetId });
      setMonitor(answer);
      setError(null);
      onLoadedRef.current(answer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The tomography monitor could not be read");
    } finally {
      loadingRef.current = false;
    }
  }, [svc, projectId, tsSetId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!pollSeconds) return undefined;
    const timer = window.setInterval(() => {
      if (isSeen()) void load();
    }, pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [load, pollSeconds, isSeen]);

  const rows = useMemo(() => [...(monitor?.tiltSeries ?? [])].reverse(), [monitor]);
  const selectedRow = rows.find((row) => row.tsId === selected) ?? null;

  useEffect(() => {
    if (!selected || !svc.fetchTomoMonitorTiltSeries) return;
    let cancelled = false;
    setTilts(null);
    svc.fetchTomoMonitorTiltSeries(projectId, selected, { tsSetId })
      .then((detail) => {
        if (!cancelled) setTilts(detail.tilts);
      })
      .catch(() => {
        if (!cancelled) setTilts([]);
      });
    return () => {
      cancelled = true;
    };
    // The tilts are read again when the selected tilt series changes in the stream
  }, [svc, projectId, selected, tsSetId, selectedRow?.tilts, selectedRow?.aligned, selectedRow?.residual]);

  // As in the single particle view, consecutive tilt series past the same threshold are one alert
  const episodes = useMemo(() => alertEpisodes((monitor?.tiltSeries ?? []).map((row): StreamingMonitorPoint => ({
    id: row.id, time: row.time, micrographName: row.tsId, enabled: row.enabled, alerts: row.alerts,
  }))), [monitor]);

  if (!monitor) {
    return error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      : <div className="text-sm text-app-muted">Reading the tomography stream…</div>;
  }
  const past = (row: TomoMonitorTiltSeries, ...names: StreamingMonitorThresholdName[]) =>
    names.some((name) => row.alerts.includes(name));

  return (
    <div className="flex flex-col gap-4" data-testid="tomo-monitor">
      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
      {monitor.stages.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-surface p-6 text-sm text-app-muted">
          This project has no tilt series to follow yet.
        </div>
      ) : (
        <section aria-label="Tomography pipeline">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
            Pipeline <HelpHint text={PIPELINE_HELP} />
            {monitor.tiltSeriesOutputs.length > 1 ? (
              <select aria-label="Tilt series to follow"
                      className="ml-auto rounded-lg border border-app-border bg-app-surface px-2 py-1 text-xs normal-case text-app-text"
                      value={monitor.stages.find((stage) => stage.stage === "tiltseries")?.setId ?? ""}
                      onChange={(event) => {
                        setSelected(null);
                        setTsSetId(Number(event.target.value));
                      }}>
                {monitor.tiltSeriesOutputs.map((output) => (
                  <option key={output.setId} value={output.setId}>{`${output.label} · ${output.outputName}`}</option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            {monitor.stages.map((stage) => <StageCard key={stage.setId} stage={stage} live={monitor.streaming} />)}
          </div>
        </section>
      )}

      {rows.length ? (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Session">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle lg:col-span-3">
            Session <HelpHint text={SESSION_HELP} />
          </div>
          <SessionPlot title="Mean defocus" unit="Å" rows={rows} value={(row) => row.defocusU}
                       alerts={["minDefocus", "maxDefocus"]} dark={dark} onPick={setSelected} byOrder={!monitor.streaming} />
          <SessionPlot title="Tilts kept" unit="tilts" rows={rows} value={(row) => row.enabledTilts}
                       alerts={["minTilts"]} dark={dark} onPick={setSelected} byOrder={!monitor.streaming} />
          <SessionPlot title="Alignment residual" unit="px" rows={rows} value={(row) => row.residual}
                       alerts={["maxResidual"]} dark={dark} onPick={setSelected} byOrder={!monitor.streaming} />
        </section>
      ) : null}

      {selectedRow ? (
        <TiltSeriesDetail projectId={projectId} row={selectedRow} tomograms={monitor.tomograms} tilts={tilts}
                          dark={dark} onClose={() => setSelected(null)} />
      ) : null}

      {rows.length ? (
        <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="Tilt series">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
            Tilt series <HelpHint text={TABLE_HELP} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs" aria-label="Tilt series of the stream">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-app-subtle">
                  <th className="px-2 py-1">Tomogram</th>
                  <th className="px-2 py-1">Tilt series</th>
                  <th className="px-2 py-1 text-right">Tilts</th>
                  <th className="px-2 py-1 text-right">Range</th>
                  <th className="px-2 py-1 text-right">Dose</th>
                  <th className="px-2 py-1 text-right">Defocus U</th>
                  <th className="px-2 py-1 text-right">Astigmatism</th>
                  <th className="px-2 py-1 text-right">CTF resolution</th>
                  <th className="px-2 py-1 text-right">No CTF</th>
                  <th className="px-2 py-1 text-right">Residual</th>
                  <th className="px-2 py-1 text-center">Aligned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {rows.map((row) => (
                  <tr key={row.id} data-testid="tilt-series-row" onClick={() => setSelected(row.tsId)}
                      className={`cursor-pointer hover:bg-app-hover ${row.tsId === selected ? "bg-app-selected" : ""}`}>
                    <td className="px-2 py-1">
                      <div className="h-12 w-12 overflow-hidden rounded bg-black">
                        {monitor.tomograms && row.tomogramId !== undefined ? (
                          <TomogramSlice projectId={projectId} setId={monitor.tomograms.setId} itemId={row.tomogramId}
                                         size={THUMBNAIL_SIZE} />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-app-text">{row.tsId}</td>
                    <Cell value={`${row.enabledTilts ?? row.tilts}/${row.tilts}${row.complete ? "" : " …"}`}
                          alerted={past(row, "minTilts")} />
                    <Cell value={row.angleMin === undefined || row.angleMax === undefined ? "—"
                      : `${row.angleMin.toFixed(0)}° / ${row.angleMax.toFixed(0)}°`} alerted={past(row, "minAngleSpan")} />
                    <Cell value={number(row.dose, 0, " e/Å²")} alerted={false} />
                    <Cell value={row.defocusU === undefined ? "—" : `${(row.defocusU / 10000).toFixed(2)} µm`}
                          alerted={past(row, "minDefocus", "maxDefocus")} />
                    <Cell value={number(row.astigmatism, 0, " Å")} alerted={past(row, "maxAstigmatism")} />
                    <Cell value={number(row.resolution, 1, " Å")} alerted={past(row, "maxResolution")} />
                    <Cell value={row.failedCtfTilts === undefined ? "—" : String(row.failedCtfTilts)}
                          alerted={past(row, "maxFailedCtfTilts")} />
                    <Cell value={number(row.residual, 2, " px")} alerted={past(row, "maxResidual")} />
                    <td className="px-2 py-1 text-center">
                      {row.aligned ? <Check className="mx-auto h-4 w-4 text-app-success" aria-label="aligned" /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <section className="rounded-xl border border-app-border bg-app-surface p-3" aria-label="Tomography alerts">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-app-subtle">
            <Bell className="h-3.5 w-3.5" /> Alerts <HelpHint text={ALERTS_HELP} />
          </div>
          {episodes.length === 0 ? (
            <div className="text-sm text-app-muted">No tilt series goes past the thresholds.</div>
          ) : (
            <ul className="divide-y divide-app-border">
              {episodes.map((episode) => (
                <li key={`${episode.kind}-${episode.first.id}`} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <span className={`h-2 w-2 rounded-full ${episode.ongoing ? "bg-app-danger" : "bg-app-subtle"}`} />
                  <span className="font-medium text-app-text">
                    {THRESHOLD_LABELS[episode.kind]} {formatLimit(episode.kind, monitor.thresholds[episode.kind])}
                  </span>
                  <span className="text-app-muted">
                    {episode.count === 1 ? "1 tilt series" : `${episode.count} tilt series in a row`}
                    {episode.ongoing ? " · still going on" : ""}
                  </span>
                  <button type="button" className="ml-auto text-app-accent hover:underline"
                          onClick={() => setSelected(episode.first.micrographName ?? null)}>
                    {episode.first.micrographName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
