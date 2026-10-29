import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { HelpHint } from "./monitor-parts";
import type { QualitySummaryData } from "./quality-summary-data";

const STATUSES = [
  ["within", "Within limits", "bg-app-success"],
  ["outside", "Outside limits", "bg-app-warning"],
  ["failed", "CTF failed", "bg-app-danger"],
  ["missing", "Measurements missing", "bg-app-surface-3"],
  ["unavailable", "No evaluation available", "bg-app-surface-3"],
  ["pending", "Incomplete series", "bg-app-accent"],
] as const;

export default function QualitySummary({ data, unit }: { data: QualitySummaryData; unit: "movies" | "micrographs" | "tilt series" }) {
  const { recent, previous, size, delta } = data;
  const showCtfFailures = recent.failed > 0 || recent.metrics.some((metric) => ["resolution", "defocus", "astigmatism"].includes(metric.id));
  const roundedDelta = delta === null ? null : Math.round(delta * 10) / 10;
  const Trend = roundedDelta === null || roundedDelta === 0 ? Minus : roundedDelta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <section aria-label="Quality summary" className="overflow-hidden rounded-xl border border-app-border bg-app-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-app-text">Recent quality</h2>
          <HelpHint text={`Checks the current thresholds of visible metrics against the latest ${unit === "movies" ? "imported movies in import order" : "items in micrograph or tilt-series order"}. Within limits requires every shown check to have measurements and pass. Hidden metrics are excluded from this summary; project alerts stay active. The quality percentage uses items with valid threshold decisions. Assessment coverage uses the whole window. Missing results do not establish that a movie is pending or discarded; CTF failures and unfinished series are shown separately. Reasons can overlap. This is threshold compliance, not a guarantee of reconstruction quality.`} />
        </div>
        <span className="text-[13px] text-app-muted">Latest {recent.total} {unit === "movies" && recent.total === 1 ? "movie" : unit}{unit === "movies" ? " imported" : ""} · window of {size}</span>
      </div>
      {!recent.total ? (
        <p className="px-4 py-6 text-[15px] text-app-muted">Waiting for {unit} to assess.</p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 lg:border-r lg:border-app-border lg:pr-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums text-app-text" data-testid="quality-within-percent">
                {recent.percent === null ? "—" : `${Math.round(recent.percent)}%`}
              </span>
              <span className="text-[15px] text-app-muted">within limits</span>
            </div>
            <p className="text-[13px] text-app-muted">{recent.within} of {recent.evaluated} evaluated {unit} pass all shown checks</p>
            <div className="mt-1 text-[15px] text-app-text" data-testid="quality-assessment-coverage">
              <span className="font-semibold tabular-nums">{recent.coveragePercent === null ? "—" : `${Math.round(recent.coveragePercent)}%`}</span>
              <span className="ml-1 text-[13px] text-app-muted">assessment coverage · {recent.evaluated} / {recent.total}</span>
            </div>
            {data.coverage ? (
              <div className="flex flex-wrap gap-x-3 text-[13px] text-app-muted">
                <span>Aligned {data.coverage.aligned} / {recent.total}</span>
                {showCtfFailures ? <span>CTF available {data.coverage.ctf} / {recent.total}</span> : null}
              </div>
            ) : null}
            <div className="flex h-2 overflow-hidden rounded-full bg-app-surface-3" aria-hidden="true">
              {STATUSES.map(([key, , colour]) => recent[key] > 0 ? (
                <span key={key} className={colour} style={{ width: `${recent[key] / recent.total * 100}%` }} />
              ) : null)}
            </div>
            <div className={`mt-1 flex items-start gap-1 text-[13px] ${roundedDelta === null || roundedDelta === 0
              ? "text-app-muted" : roundedDelta > 0 ? "text-app-success" : "text-app-warning"}`}>
              <Trend className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{roundedDelta !== null
                ? `${roundedDelta > 0 ? "+" : ""}${roundedDelta} percentage points vs previous ${size}`
                : !recent.metrics.length ? "Enable thresholds to assess quality"
                : recent.total < size || previous.total < size
                  ? `Comparison starts at ${2 * size} ${unit}`
                  : "Comparison needs fully evaluated windows"}</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <dl className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              {STATUSES.filter(([key]) => (key !== "pending" || unit === "tilt series") && (key !== "unavailable" || unit === "movies" || recent.unavailable > 0) && (key !== "failed" || (unit !== "tilt series" && showCtfFailures))).map(([key, label, colour]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${colour}`} />
                  <dt className="text-app-muted">{label}</dt><dd className="font-semibold tabular-nums text-app-text">{recent[key]}</dd>
                </div>
              ))}
            </dl>
            {recent.metrics.length ? (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                {recent.metrics.map((metric) => (
                  <div key={metric.id} className="rounded-lg border border-app-border bg-app-surface-2 px-3 py-2"
                       data-testid={`quality-metric-${metric.id}`}>
                    <div className="text-[13px] text-app-muted">{metric.label}</div>
                    <div className={`mt-1 text-lg font-semibold tabular-nums ${metric.outside ? "text-app-warning" : "text-app-text"}`}>
                      {metric.measured ? `${Math.round(metric.outside / metric.measured * 100)}%` : "—"}
                      <span className="ml-1 text-[13px] font-normal text-app-muted">outside</span>
                    </div>
                    <div className="text-[13px] text-app-subtle">{metric.outside} / {metric.measured} measured</div>
                    {metric.missing ? <div className="text-[13px] text-app-subtle">{metric.missing} missing measurements</div> : null}
                  </div>
                ))}
              </div>
            ) : <p className="text-[15px] text-app-muted">No enabled thresholds for the visible metrics.</p>}
            <p className="text-[13px] text-app-subtle">Current limits · {recent.metrics.length} visible checks · Reasons can overlap</p>
          </div>
        </div>
      )}
    </section>
  );
}
