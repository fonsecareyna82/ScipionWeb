import type { MonitorSection, SectionVisibility } from "./monitor-view-preferences";
import type {
  StreamingMonitorExposures, StreamingMonitorPoint, StreamingMonitorThresholdName, StreamingMonitorThresholds, TomoMonitorTiltSeries,
} from "@/services/ProjectService";

type Limit = StreamingMonitorThresholdName;
type Values = Partial<Record<Limit, number | undefined>>;
export type QualityMetric = { id: string; label: string; limits: Limit[]; section?: MonitorSection };
export type QualitySample = { id: number; failed?: boolean; pending?: boolean; unavailable?: boolean; evaluateUnavailable?: boolean; values: Values };
export type QualityCounts = { within: number; outside: number; failed: number; missing: number; pending: number; unavailable: number };
export type MetricCounts = { id: string; label: string; outside: number; measured: number; missing: number };
export type QualityWindow = QualityCounts & { total: number; evaluated: number; coveragePercent: number | null; percent: number | null; metrics: MetricCounts[] };
export type QualitySummaryData = {
  recent: QualityWindow;
  previous: QualityWindow;
  size: number;
  delta: number | null;
  coverage?: { aligned: number; ctf: number };
};

const CTF_METRICS: QualityMetric[] = [
  { id: "resolution", label: "CTF resolution", limits: ["maxResolution"] },
  { id: "defocus", label: "Defocus", limits: ["minDefocus", "maxDefocus"] },
  { id: "astigmatism", label: "Astigmatism", limits: ["maxAstigmatism"] },
];
const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);

function windowQuality(samples: QualitySample[], thresholds: StreamingMonitorThresholds, metrics: QualityMetric[]): QualityWindow {
  const active = metrics.map((metric) => ({ ...metric, limits: metric.limits.filter((name) =>
    thresholds[name] != null && Number.isFinite(thresholds[name])) })).filter((metric) => metric.limits.length > 0);
  const result: QualityWindow = {
    total: samples.length, evaluated: 0, coveragePercent: null, within: 0, outside: 0, failed: 0, missing: 0, pending: 0, unavailable: 0, percent: null,
    metrics: active.map(({ id, label }) => ({ id, label, outside: 0, measured: 0, missing: 0 })),
  };
  for (const sample of samples) {
    if (sample.failed) { result.failed++; continue; }
    if (sample.pending) { result.pending++; continue; }
    if (sample.unavailable && !sample.evaluateUnavailable) { result.unavailable++; continue; }
    let outside = false;
    let missing = !active.length;
    active.forEach((metric, index) => {
      let metricMissing = false;
      let metricOutside = false;
      for (const name of metric.limits) {
        const value = sample.values[name];
        const limit = thresholds[name]!;
        if (!finite(value)) metricMissing = true;
        else if (name.startsWith("min") ? value < limit : value > limit) metricOutside = true;
      }
      const counts = result.metrics[index];
      // One known violation is enough to fail a check, even if another value is still missing.
      if (metricMissing) counts.missing++;
      if (metricOutside) { counts.outside++; counts.measured++; outside = true; }
      else if (metricMissing) missing = true;
      else counts.measured++;
    });
    if (outside) result.outside++;
    else if (sample.unavailable) result.unavailable++;
    else if (missing) result.missing++;
    else result.within++;
  }
  // Quality uses valid threshold decisions only. Coverage shows how much of the full
  // import window has such a decision; failures and unknown causes remain separate.
  result.evaluated = result.within + result.outside;
  if (active.length && result.total) result.coveragePercent = result.evaluated / result.total * 100;
  if (result.evaluated) result.percent = result.within / result.evaluated * 100;
  return result;
}

/** Consecutive, disjoint windows in item order; timestamps reflect processing rather than acquisition. */
export function summarizeQuality(samples: QualitySample[], thresholds: StreamingMonitorThresholds,
                                 metrics: QualityMetric[], size: number): QualitySummaryData {
  const ordered = [...samples].sort((a, b) => a.id - b.id);
  const recent = windowQuality(ordered.slice(-size), thresholds, metrics);
  const previous = windowQuality(ordered.slice(-2 * size, -size), thresholds, metrics);
  const comparable = recent.total === size && previous.total === size
    && recent.evaluated === size && previous.evaluated === size
    && !recent.missing && !recent.pending && !previous.missing && !previous.pending
    && recent.metrics.every((metric) => !metric.missing) && previous.metrics.every((metric) => !metric.missing)
    && recent.percent !== null && previous.percent !== null;
  return { recent, previous, size, delta: comparable ? recent.percent! - previous.percent! : null };
}

function recentItems<T extends { id: number }>(rows: T[], count: number): T[] {
  const ordered = rows.every((row, index) => index === 0 || rows[index - 1].id <= row.id)
    ? rows : [...rows].sort((a, b) => a.id - b.id);
  return ordered.slice(-count);
}

function spaMetrics(hasCtf: boolean, hasPicking: boolean, visibility: SectionVisibility): QualityMetric[] {
  const metrics: QualityMetric[] = [
    ...(hasCtf ? CTF_METRICS : []),
    { id: "drift", label: "Drift", limits: ["maxTotalDrift", "maxFrameShift"] },
    ...(hasPicking ? [{ id: "particles", label: "Picking", limits: ["minParticles"] as Limit[] }] : []),
  ];
  return metrics.filter((metric) => visibility[metric.id as MonitorSection] !== false);
}

function ctfChecksVisible(metrics: QualityMetric[], thresholds: StreamingMonitorThresholds): boolean {
  return metrics.some((metric) => CTF_METRICS.some((ctf) => ctf.id === metric.id)
    && metric.limits.some((name) => thresholds[name] != null));
}

function spaValues(point: StreamingMonitorPoint | null): Values {
  if (!point) return {};
  return {
    minDefocus: finite(point.defocusV) ? Math.min(point.defocusV, point.defocusU || point.defocusV) : undefined,
    maxDefocus: finite(point.defocusU) ? Math.max(point.defocusU, point.defocusV || point.defocusU) : undefined,
    maxAstigmatism: finite(point.astigmatism) ? Math.abs(point.astigmatism) : undefined,
    maxResolution: point.resolution, maxTotalDrift: point.totalDrift, maxFrameShift: point.maxFrameShift,
    minParticles: point.particles,
  };
}

export function spaQualitySummary(points: StreamingMonitorPoint[], thresholds: StreamingMonitorThresholds,
                                  hasCtf: boolean, hasPicking: boolean, size = 100, visibility: SectionVisibility = {}): QualitySummaryData {
  const visible = spaMetrics(hasCtf, hasPicking, visibility);
  const ctfVisible = ctfChecksVisible(visible, thresholds);
  return summarizeQuality(recentItems(points, size * 2).map((point) => ({ id: point.id,
    failed: point.failed && ctfVisible, values: spaValues(point),
  })), thresholds, visible, size);
}

export function movieQualitySummary(exposures: StreamingMonitorExposures, thresholds: StreamingMonitorThresholds,
                                    hasPicking: boolean, size = 100, visibility: SectionVisibility = {}): QualitySummaryData {
  const visible = spaMetrics(exposures.ctfSetId !== null, hasPicking, visibility);
  const ctfVisible = ctfChecksVisible(visible, thresholds);
  const enabled = (id: string) => visible.some((metric) => metric.id === id
    && metric.limits.some((name) => thresholds[name] != null));
  const summary = summarizeQuality(exposures.points.map((movie) => ({
    // The window follows actual import order, not ids or downstream processing completion order.
    id: movie.importRowId,
    evaluateUnavailable: true,
    failed: movie.point?.failed && ctfVisible,
    // Absence does not tell us whether a protocol is waiting, failed, or discarded this movie.
    unavailable: (ctfVisible && !movie.ctfReady) || (enabled("drift") && !movie.aligned)
      || (enabled("particles") && movie.point?.particles === undefined),
    values: spaValues(movie.point),
  })), thresholds, visible, size);
  const latest = [...exposures.points].sort((a, b) => a.importRowId - b.importRowId).slice(-size);
  return { ...summary, coverage: { aligned: latest.filter((movie) => movie.aligned).length,
    ctf: latest.filter((movie) => movie.ctfReady).length } };
}

export function tomoQualitySummary(rows: TomoMonitorTiltSeries[], thresholds: StreamingMonitorThresholds,
                                   size = 20, visibility: SectionVisibility = {}): QualitySummaryData {
  const metrics: QualityMetric[] = [
    ...CTF_METRICS.map((metric): QualityMetric => ({ ...metric,
      section: metric.id === "defocus" ? "defocus" : "tiltSeries" })),
    { id: "tilts", label: "Tilts kept", limits: ["minTilts"] },
    { id: "angle", label: "Angular coverage", limits: ["minAngleSpan"], section: "angular" },
    { id: "ctfFailures", label: "Tilts without CTF", limits: ["maxFailedCtfTilts"], section: "tiltSeries" },
    { id: "residual", label: "Alignment residual", limits: ["maxResidual"] },
  ];
  const visible = metrics.filter((metric) => visibility[metric.section ?? metric.id as MonitorSection] !== false);
  return summarizeQuality(recentItems(rows, size * 2).map((row) => ({ id: row.id, pending: !row.complete, values: {
    minDefocus: finite(row.defocusU) ? Math.min(row.defocusU, row.defocusV || row.defocusU) : undefined,
    maxDefocus: finite(row.defocusU) ? Math.max(row.defocusU, row.defocusV || row.defocusU) : undefined,
    maxAstigmatism: row.astigmatism, maxResolution: row.resolution, minTilts: row.enabledTilts,
    minAngleSpan: finite(row.angleMin) && finite(row.angleMax) ? Math.min(-row.angleMin, row.angleMax) : undefined,
    maxFailedCtfTilts: row.failedCtfTilts, maxResidual: row.residual,
  } })), thresholds, visible, size);
}
