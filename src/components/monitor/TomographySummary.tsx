import type { TomoOverviewData } from "./tomo-overview-data";
import { HelpHint } from "./monitor-parts";

export default function TomographySummary({ data, filtered, onOpenSeries, showAngles = true }: {
  data: TomoOverviewData;
  showAngles?: boolean;
  filtered: boolean;
  onOpenSeries: (tsId: string) => void;
}) {
  const { tilts, angles } = data;
  const card = "min-w-0 rounded-lg border border-app-border bg-app-surface-2 px-3 py-2.5";
  return (
    <section aria-label="Tomography summary" className="rounded-xl border border-app-border bg-app-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-app-text">Tomography summary</h2>
        <span className="text-xs text-app-muted">{filtered ? "Selected range" : "Entire session"} · {data.total} tilt series</span>
      </div>
      {!data.total ? <p className="text-sm text-app-muted">No tilt series in the selected range.</p> : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${showAngles ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
            <div className={card}>
              <div className="flex items-center gap-1.5 text-xs text-app-muted">
                Series status <HelpHint text="Complete means all expected tilt images are present according to the selected output. Completeness is independent of whether a series passes the quality limits." />
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <div className="flex flex-col-reverse"><dt className="text-xs text-app-muted">Complete</dt><dd className="text-2xl font-semibold tabular-nums text-app-success" data-testid="tomo-complete-count">{data.complete}</dd></div>
                <div className="flex flex-col-reverse"><dt className="text-xs text-app-muted">Incomplete</dt><dd className="text-2xl font-semibold tabular-nums text-app-warning" data-testid="tomo-incomplete-count">{data.incomplete}</dd></div>
              </dl>
              {data.disabledSeries ? <p className="mt-1 text-[11px] text-app-subtle">{data.disabledSeries} disabled series</p> : null}
            </div>
            <div className={card}>
              <div className="flex items-center gap-1.5 text-xs text-app-muted">
                Outside limits <HelpHint text="Completed series with a known violation of a visible, enabled quality threshold. A series with several violations is counted once. Incomplete series are assessed separately when complete." />
              </div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${data.outside ? "text-app-warning" : "text-app-text"}`} data-testid="tomo-outside-count">
                {data.evaluated ? data.outside : "—"}
              </div>
              <p className="text-[11px] text-app-subtle">{data.evaluated} complete series evaluated</p>
              {data.missingEvaluation ? <p className="text-[11px] text-app-subtle">{data.missingEvaluation} without a quality decision</p> : null}
              {!data.checks ? <p className="text-[11px] text-app-subtle">No visible quality limits enabled</p> : null}
            </div>
            <div className={card}>
              <div className="flex items-center gap-1.5 text-xs text-app-muted">
                Excluded tilts <HelpHint text="Only tilt images explicitly disabled in the selected tilt-series output: present tilts minus enabled tilts. Missing or not-yet-imported images are never inferred to be discarded. This does not identify a responsible protocol or a discard reason." />
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-app-text" data-testid="tomo-excluded-tilts">
                {tilts.knownSeries ? tilts.excluded.toLocaleString() : "—"}
              </div>
              <p className="text-[11px] text-app-subtle">{tilts.knownSeries ? `${tilts.kept.toLocaleString()} kept / ${tilts.present.toLocaleString()} present` : "Tilt counts unavailable"}</p>
              {tilts.unknownSeries ? <p className="text-[11px] text-app-subtle">Counts available for {tilts.knownSeries} / {data.total} series</p> : null}
            </div>
            {showAngles ? (
            <div className={card}>
              <div className="flex items-center gap-1.5 text-xs text-app-muted">
                Angular coverage <HelpHint text="The range of enabled tilts in completed series. The target must be reached on both sides of zero; a wide but asymmetric range is insufficient. Incomplete series are excluded from this check. With no angular threshold, the median angular span is shown." />
              </div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${angles.short ? "text-app-warning" : "text-app-text"}`} data-testid="tomo-angular-coverage">
                {angles.target !== null ? angles.measured ? `${angles.sufficient} / ${angles.measured}` : "—"
                  : angles.medianSpan === null ? "—" : `${Number(angles.medianSpan.toFixed(1))}°`}
              </div>
              <p className="text-[11px] text-app-subtle">{angles.target !== null ? `complete series reach ±${angles.target}°` : "median span of complete series"}</p>
              {angles.missing ? <p className="text-[11px] text-app-subtle">{angles.missing} complete series without angles</p> : null}
              {angles.latestShort ? (
                <button type="button" className="mt-1 text-left text-[11px] text-app-accent hover:underline"
                        onClick={() => onOpenSeries(angles.latestShort!)}>
                  Inspect {angles.latestShort}
                </button>
              ) : null}
            </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
