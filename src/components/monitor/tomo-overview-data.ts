import type { StreamingMonitorThresholds, TomoMonitorTiltSeries } from "@/services/ProjectService";
import type { SectionVisibility } from "./monitor-view-preferences";
import { tomoQualitySummary } from "./quality-summary-data";

export type TomoOverviewData = {
  total: number;
  complete: number;
  incomplete: number;
  disabledSeries: number;
  evaluated: number;
  outside: number;
  checks: number;
  missingEvaluation: number;
  tilts: { present: number; kept: number; excluded: number; knownSeries: number; unknownSeries: number };
  angles: { target: number | null; measured: number; sufficient: number; short: number;
    missing: number; medianSpan: number | null; latestShort: string | null };
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;

/** Facts about the selected output: completion, explicitly disabled present tilts and kept-angle coverage. */
export function summarizeTomography(rows: TomoMonitorTiltSeries[], thresholds: StreamingMonitorThresholds,
                                    visibility: SectionVisibility = {}): TomoOverviewData {
  const quality = tomoQualitySummary(rows, thresholds, Math.max(1, rows.length), visibility).recent;
  const target = finite(thresholds.minAngleSpan) && thresholds.minAngleSpan > 0 ? thresholds.minAngleSpan : null;
  const result: TomoOverviewData = {
    total: rows.length, complete: rows.filter((row) => row.complete).length,
    incomplete: rows.filter((row) => !row.complete).length,
    disabledSeries: rows.filter((row) => row.enabled === false).length,
    evaluated: quality.evaluated, outside: quality.outside, checks: quality.metrics.length,
    missingEvaluation: quality.missing,
    tilts: { present: 0, kept: 0, excluded: 0, knownSeries: 0, unknownSeries: 0 },
    angles: { target, measured: 0, sufficient: 0, short: 0, missing: 0, medianSpan: null, latestShort: null },
  };
  const spans: number[] = [];
  let latestShortId = -Infinity;
  for (const row of rows) {
    if (count(row.tilts) && count(row.enabledTilts) && row.enabledTilts <= row.tilts) {
      result.tilts.present += row.tilts;
      result.tilts.kept += row.enabledTilts;
      result.tilts.excluded += row.tilts - row.enabledTilts;
      result.tilts.knownSeries++;
    } else result.tilts.unknownSeries++;
    // An unfinished series has not had the chance to reach its full angular range yet.
    if (!row.complete) continue;
    if (!finite(row.angleMin) || !finite(row.angleMax) || row.angleMin > row.angleMax) {
      result.angles.missing++;
      continue;
    }
    result.angles.measured++;
    spans.push(row.angleMax - row.angleMin);
    if (target !== null) {
      if (row.angleMin <= -target && row.angleMax >= target) result.angles.sufficient++;
      else {
        result.angles.short++;
        if (row.id > latestShortId) {
          latestShortId = row.id;
          result.angles.latestShort = row.tsId;
        }
      }
    }
  }
  spans.sort((a, b) => a - b);
  if (spans.length) {
    const middle = Math.floor(spans.length / 2);
    result.angles.medianSpan = spans.length % 2 ? spans[middle] : (spans[middle - 1] + spans[middle]) / 2;
  }
  return result;
}
