// Pieces both views of the streaming monitor (single particle and tomography) show.
import type { CSSProperties } from "react";
import { ArrowDown, ArrowRight, ArrowUp, HelpCircle } from "lucide-react";

import type { StreamingMonitorStage } from "@/services/ProjectService";

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
          {stage.stalled ? (
            <span className="font-normal" title="Nothing was processed in the last 10 minutes"> · stalled</span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1 truncate text-[11px] text-app-subtle" title={`${stage.label} · ${stage.outputName}`}>
        {stage.label}
      </div>
    </div>
  );
}
