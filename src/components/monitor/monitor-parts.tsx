// Pieces both views of the streaming monitor (single particle and tomography) show.
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
  tiltseries: "Tilt series",
  ctftomo: "CTF",
  aligned: "Aligned",
  tomograms: "Tomograms",
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
 * its card) and, with a legend, room for it between the title and the plotting area.
 */
export function plotFrame(height: number, showLegend: boolean) {
  return {
    autosize: true,
    height,
    margin: { t: showLegend ? 56 : 32, r: 16, b: 40, l: 56 },
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1, yanchor: "bottom" },
  };
}

/** The box of a plot: as high as its frame, as wide as its card, never wider. */
export function plotBox(height: number) {
  return { width: "100%", height };
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

export function StageCard({ stage, live = true }: { stage: StreamingMonitorStage; live?: boolean }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-app-border bg-app-surface p-3" data-testid="monitor-stage">
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
      {stage.pickedFrom ? (
        <div className="mt-1 truncate text-[11px] text-app-subtle"
             title={`Picks the ${stage.pickedFrom.items} micrographs of ${stage.pickedFrom.label} (${stage.pickedFrom.outputName})`}>
          from {stage.pickedFrom.label}
        </div>
      ) : null}
      {live && stage.behind ? (
        <div className="mt-1 text-xs font-medium text-app-warning">
          {stage.behind.toLocaleString()}
          {stage.micrographs !== undefined ? " micrographs" : stage.stage === "classes2d" ? " particles" : ""} waiting
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
