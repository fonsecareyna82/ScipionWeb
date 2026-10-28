// Pieces both views of the streaming monitor (single particle and tomography) show.
import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CheckCircle2, HelpCircle, Info } from "lucide-react";

import type { StreamingMonitorAcquisition, StreamingMonitorFlow, StreamingMonitorStage } from "@/services/ProjectService";

export const STAGE_LABELS: Record<StreamingMonitorStage["stage"], string> = {
  movies: "Movies",
  alignedMicrographs: "Aligned micrographs",
  micrographs: "Micrographs",
  ctf: "CTF",
  coordinates: "Coordinates",
  particles: "Particles",
  classes2d: "2D classes",
  tiltseriesmovies: "Tilt series movies",
  tiltseries: "Tilt series",
  ctftomo: "CTF",
  aligned: "Aligned",
  tomograms: "Tomograms",
  coordinates3d: "Coordinates",
};

export function HelpHint({ text }: { text: string }) {
  return (
    <span className="inline-flex cursor-help text-app-subtle hover:text-app-text" title={text} aria-label={text}
          role="img">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

function TrendIcon({ trend }: { trend: StreamingMonitorStage["trend"] }) {
  if (trend === "up") return <ArrowUp className="h-3.5 w-3.5 text-app-success" aria-label="rising" />;
  if (trend === "down") return <ArrowDown className="h-3.5 w-3.5 text-app-warning" aria-label="falling" />;
  return <ArrowRight className="h-3.5 w-3.5 text-app-subtle" aria-label="steady" />;
}

/** ``live``: something still streams; without it rates and backlogs say nothing (all was processed). */
/**
 * The frame of a plot of the monitor: its height (also the height of its box, so the plot never grows past
 * its card) and, with a legend, room for it between the title and the plotting area. ``titled``: Plotly
 * draws the title; without it the card shows the title above the plot (with its help, clear of Plotly's
 * buttons).
 */
export function plotFrame(height: number, showLegend: boolean, titled = true) {
  return {
    autosize: true,
    height,
    margin: { t: (titled ? 32 : 8) + (showLegend ? 24 : 0), r: 16, b: 40, l: 56 },
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1, yanchor: "bottom" },
  };
}

/** The title of a plot card, with its help: above the plot, so Plotly's buttons never cover it. */
export function PlotHeader({ title, help }: { title: string; help: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 pb-0.5 text-[13px] text-app-text">
      <span className="truncate">{title}</span>
      <HelpHint text={help} />
    </div>
  );
}

/** The box of a plot: as high as its frame, as wide as its card, never wider. */
export function plotBox(height: number) {
  return { width: "100%", height };
}

/** A plot with nothing to draw: its title and why, instead of empty axes. */
export function EmptyPlot({ title, text, height }: { title: string; text: string; height: number }) {
  return (
    <div className="flex flex-col" style={{ height }} data-testid="empty-plot">
      <span className="px-2 pt-1 text-[13px] text-app-text">{title}</span>
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-app-muted">{text}</div>
    </div>
  );
}

/** "about 12 min", "about 1 h 20 min", "under a minute". */
export function formatEta(minutes: number): string {
  if (minutes < 1) return "under a minute";
  const rounded = Math.round(minutes);
  if (rounded < 60) return `about ${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `about ${hours} h ${rest} min` : `about ${hours} h`;
}

// One quiet hue per phase of the stream, not per card: acquisition, preprocessing, picking, classification
const STAGE_HUES: Record<StreamingMonitorStage["stage"], string> = {
  movies: "var(--app-sky-700)",
  tiltseriesmovies: "var(--app-sky-700)",
  tiltseries: "var(--app-sky-700)",
  alignedMicrographs: "var(--app-indigo-700)",
  micrographs: "var(--app-indigo-700)",
  ctf: "var(--app-indigo-700)",
  ctftomo: "var(--app-indigo-700)",
  aligned: "var(--app-indigo-700)",
  tomograms: "var(--app-indigo-700)",
  coordinates: "var(--app-emerald-700)",
  particles: "var(--app-emerald-700)",
  coordinates3d: "var(--app-emerald-700)",
  classes2d: "var(--app-amber-700)",
};

function stageTint(stage: StreamingMonitorStage["stage"]) {
  const hue = STAGE_HUES[stage];
  return {
    background: `linear-gradient(135deg, color-mix(in srgb, ${hue} 8%, var(--app-surface)) 0%, var(--app-surface) 75%)`,
    borderColor: `color-mix(in srgb, ${hue} 22%, var(--app-border))`,
    "--stage-hue": hue,
  } as CSSProperties;
}

export function StageCard({ stage, live = true }: { stage: StreamingMonitorStage; live?: boolean }) {
  return (
    <div className="relative min-w-[150px] flex-1 overflow-hidden rounded-xl border p-3" style={stageTint(stage.stage)}
         data-testid="monitor-stage" data-phase-hue={STAGE_HUES[stage.stage]}>
      <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-b-full opacity-70"
            style={{ background: "var(--stage-hue)" }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-app-subtle">{STAGE_LABELS[stage.stage]}</span>
        {stage.streaming ? (
          <span className="h-2 w-2 rounded-full bg-app-success" title="Still receiving items" />
        ) : null}
      </div>
      <div className="mt-1 text-2xl font-semibold text-app-text">{stage.items.toLocaleString()}</div>
      {live && stage.perMinute !== null ? (
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
      {stage.tomogramsPicked !== undefined ? (
        <div className="mt-1 text-xs text-app-muted">from {stage.tomogramsPicked.toLocaleString()} tomograms</div>
      ) : null}
      {stage.pickedFrom ? (
        <div className="mt-1 truncate text-[11px] text-app-subtle"
             title={`Picks the ${stage.pickedFrom.items} ${stage.tomogramsPicked !== undefined ? "tomograms" : "micrographs"} `
               + `of ${stage.pickedFrom.label} (${stage.pickedFrom.outputName})`}>
          from {stage.pickedFrom.label}
        </div>
      ) : null}
      {live && stage.behind ? (
        <div className="mt-1 text-xs font-medium text-app-warning">
          {stage.behind.toLocaleString()}
          {stage.micrographs !== undefined ? " micrographs" : stage.tomogramsPicked !== undefined ? " tomograms"
            : stage.stage === "classes2d" ? " particles" : ""} waiting
          {stage.etaMinutes !== undefined ? (
            <span className="font-normal text-app-muted" title="At the rate of the last 10 minutes">
              {` · ${formatEta(stage.etaMinutes)}`}
            </span>
          ) : null}
          {stage.stalled && stage.stalledMinutes === undefined ? (
            <span className="font-normal" title="Nothing was processed in the last 10 minutes"> · stalled</span>
          ) : null}
        </div>
      ) : null}
      {stage.stalledMinutes !== undefined ? (
        <div className="mt-1 text-xs font-semibold text-app-danger" data-testid="stage-stalled">
          No progress for {formatMinutes(stage.stalledMinutes)}
          {stage.status && !LIVE_STATUSES.has(stage.status) ? ` · run ${stage.status}` : ""}
        </div>
      ) : null}
      <div className="mt-1 truncate text-[11px] text-app-subtle" title={`${stage.label} · ${stage.outputName}`}>
        {stage.label}
      </div>
    </div>
  );
}

const LIVE_STATUSES = new Set(["launched", "running", "scheduled"]);

/** "12 min", "1 h 20 min". */
export function formatMinutes(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function clockTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const FLOW_TONES = {
  warning: { color: "var(--app-warning)", Icon: AlertTriangle },
  danger: { color: "var(--app-danger)", Icon: AlertTriangle },
  info: { color: "var(--app-accent)", Icon: Info },
  success: { color: "var(--app-success)", Icon: CheckCircle2 },
} as const;

function FlowLine({ tone, children }: { tone: keyof typeof FLOW_TONES; children: ReactNode }) {
  const { color, Icon } = FLOW_TONES[tone];
  return (
    <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-app-text" data-tone={tone}
         style={{ borderColor: `color-mix(in srgb, ${color} 40%, var(--app-border))`,
                  background: `color-mix(in srgb, ${color} 8%, var(--app-surface))` }}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
      <div>{children}</div>
    </div>
  );
}

/**
 * Whether the stream flows: a pause of the acquisition, its end, a stage that stopped. A closed import is a
 * finished acquisition, never a stopped microscope: the import closes itself once its timeout passes.
 */
export function StreamFlowStatus({ flow }: { flow: StreamingMonitorFlow | null }) {
  if (!flow) return null;
  const count = `${flow.items.toLocaleString()} ${flow.unit}`;
  const lines = [];
  if (flow.acquisition === "paused") {
    lines.push(
      <FlowLine key="acquisition" tone="warning">
        No new {flow.activityUnit} for {formatMinutes(flow.idleMinutes ?? 0)} (last at {clockTime(flow.lastItemAt)}).
        {flow.importClosesInMinutes !== undefined
          ? ` If none come, the import closes on its own in ${formatMinutes(flow.importClosesInMinutes)}.` : ""}
      </FlowLine>,
    );
  } else if (flow.acquisition === "stopped") {
    lines.push(
      <FlowLine key="acquisition" tone="danger">
        The import ({flow.label}) is {flow.protocolStatus}, but it never closed its {flow.unit}: no more will come
        until it runs again.
      </FlowLine>,
    );
  } else if (flow.acquisition === "finished") {
    lines.push(flow.complete ? (
      <FlowLine key="acquisition" tone="success">
        Session complete: the acquisition finished at {clockTime(flow.finishedAt)} with {count}, and everything
        was processed.
      </FlowLine>
    ) : (
      <FlowLine key="acquisition" tone="info">
        Acquisition finished at {clockTime(flow.finishedAt)} with {count}. What is left is still being processed.
      </FlowLine>
    ));
  }
  for (const stalled of flow.stalled) {
    lines.push(
      <FlowLine key={`stalled-${stalled.protocolId}-${stalled.stage}`} tone="danger">
        {STAGE_LABELS[stalled.stage]} ({stalled.label}): no progress for {formatMinutes(stalled.minutes)}, with
        {" "}{stalled.behind.toLocaleString()} waiting
        {stalled.protocolStatus && !LIVE_STATUSES.has(stalled.protocolStatus)
          ? `. The run is ${stalled.protocolStatus}.` : "."}
      </FlowLine>,
    );
  }
  return lines.length ? <div className="mb-3 flex flex-col gap-2" aria-label="Stream flow">{lines}</div> : null;
}

const ACQUISITION_UNITS: Record<StreamingMonitorAcquisition["stage"], string> = {
  movies: "movies", micrographs: "micrographs", tiltseries: "tilt series", tiltseriesmovies: "tilt series",
};

/**
 * Which acquisition (an import) the monitor follows, when the project has several: two grids, a second
 * session on other movies. Shown only then; open ones are marked, as their imports still take files.
 */
export function AcquisitionSelect({ acquisitions, value, onChange }: {
  acquisitions: StreamingMonitorAcquisition[];
  value: number | null;
  onChange: (setId: number) => void;
}) {
  if (acquisitions.length < 2) return null;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-center text-[11px] font-medium text-app-muted">Acquisition</span>
      <select aria-label="Acquisition to follow" title="Each import of the project and what was made from it"
              className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm text-app-text"
              value={value ?? ""} onChange={(event) => onChange(Number(event.target.value))}>
        {acquisitions.map((acquisition) => (
          <option key={acquisition.setId} value={acquisition.setId}>
            {`${acquisition.streaming ? "● " : ""}${acquisition.label} · ${acquisition.items.toLocaleString()} `
              + ACQUISITION_UNITS[acquisition.stage]}
          </option>
        ))}
      </select>
    </label>
  );
}
