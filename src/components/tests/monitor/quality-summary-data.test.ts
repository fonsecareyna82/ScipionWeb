import { describe, expect, it } from "vitest";
import type { StreamingMonitorExposures, StreamingMonitorPoint, StreamingMonitorThresholds, TomoMonitorTiltSeries } from "@/services/ProjectService";
import { THRESHOLD_ORDER, TOMO_THRESHOLD_ORDER } from "@/components/monitor/streaming-monitor-data";
import { movieQualitySummary, spaQualitySummary, summarizeQuality, tomoQualitySummary, type QualitySample } from "@/components/monitor/quality-summary-data";

export const NO_LIMITS = Object.fromEntries([...new Set([...THRESHOLD_ORDER, ...TOMO_THRESHOLD_ORDER])]
  .map((name) => [name, null])) as StreamingMonitorThresholds;
const limits = { ...NO_LIMITS, maxResolution: 5, maxTotalDrift: 10 };
const metrics = [
  { id: "resolution", label: "CTF resolution", limits: ["maxResolution" as const] },
  { id: "drift", label: "Drift", limits: ["maxTotalDrift" as const] },
];
const sample = (id: number, extra: Partial<QualitySample> = {}): QualitySample =>
  ({ id, values: { maxResolution: 4, maxTotalDrift: 5 }, ...extra });
const point = (id: number, extra: Partial<StreamingMonitorPoint> = {}): StreamingMonitorPoint =>
  ({ id, time: null, enabled: true, resolution: 4, alerts: [], ...extra });
const row = (id: number, extra: Partial<TomoMonitorTiltSeries> = {}): TomoMonitorTiltSeries =>
  ({ id, tsId: `TS_${id}`, time: null, enabled: true, tilts: 41, enabledTilts: 41, complete: true,
    aligned: true, angleMin: -60, angleMax: 60, resolution: 4, alerts: [], ...extra });

describe("Quality summary", () => {
  it("counts overlapping reasons once per item and uses measured denominators for each reason", () => {
    const { recent } = summarizeQuality([sample(1), sample(2, { values: { maxResolution: 8, maxTotalDrift: 20 } })], limits, metrics, 100);
    expect(recent).toMatchObject({ total: 2, within: 1, outside: 1, percent: 50 });
    expect(recent.metrics.map((metric) => [metric.outside, metric.measured])).toEqual([[1, 2], [1, 2]]);
  });

  it("never treats failed or missing estimates as within limits, including nonfinite values", () => {
    const { recent } = summarizeQuality([sample(1), sample(2, { failed: true }),
      sample(3, { values: {} }), sample(4, { values: { maxResolution: NaN, maxTotalDrift: Infinity } })], limits, metrics, 100);
    expect(recent).toMatchObject({ total: 4, within: 1, failed: 1, missing: 2, outside: 0, evaluated: 1, percent: 100, coveragePercent: 25 });
    expect(recent.metrics.map((metric) => metric.measured)).toEqual([1, 1]);
  });

  it("shows no score for disabled checks or when all measurements are still missing", () => {
    expect(summarizeQuality([sample(1)], NO_LIMITS, metrics, 100).recent).toMatchObject({ percent: null, within: 0, missing: 1, metrics: [] });
    expect(summarizeQuality([sample(1, { values: {} })], limits, metrics, 100).recent.percent).toBeNull();
    expect(summarizeQuality([], limits, metrics, 100).recent.total).toBe(0);
  });

  it("compares disjoint full windows in item order, regardless of input order", () => {
    const input = [sample(6, { values: { maxResolution: 8, maxTotalDrift: 5 } }), sample(1), sample(4), sample(2), sample(5), sample(3)];
    const result = summarizeQuality(input, limits, metrics, 2);
    expect(result.recent).toMatchObject({ total: 2, percent: 50 });
    expect(result.previous).toMatchObject({ total: 2, percent: 100 });
    expect(result.delta).toBe(-50);
    expect(input[0].id).toBe(6);
  });

  it("withholds a comparison for small windows or incomplete checks, even on known outliers", () => {
    expect(summarizeQuality([sample(1), sample(2), sample(3)], limits, metrics, 2).delta).toBeNull();
    const result = summarizeQuality([sample(1, { values: { maxResolution: 8 } }), sample(2), sample(3), sample(4)], limits, metrics, 2);
    expect(result.previous.outside).toBe(1);
    expect(result.delta).toBeNull();
  });

  it("recomputes from measurements when sliders change, independently of stale server alerts", () => {
    const points = [point(1, { astigmatism: -900 })];
    expect(spaQualitySummary(points, { ...NO_LIMITS, maxAstigmatism: 1000 }, true, false).recent.percent).toBe(100);
    expect(spaQualitySummary(points, { ...NO_LIMITS, maxAstigmatism: 800 }, true, false).recent.percent).toBe(0);
  });

  it("keeps missing picking separate and checks motion only before CTF is available", () => {
    const points = [point(1, { totalDrift: 5 })];
    const configured = { ...NO_LIMITS, maxResolution: 5, maxTotalDrift: 10, minParticles: 100 };
    expect(spaQualitySummary(points, configured, false, false).recent.metrics.map((metric) => metric.id)).toEqual(["drift"]);
    expect(spaQualitySummary(points, configured, true, true).recent).toMatchObject({ within: 0, missing: 1 });
    expect(spaQualitySummary([point(1, { totalDrift: 5, particles: 120 })], configured, true, true).recent.percent).toBe(100);
  });

  it("excludes hidden SPA metrics from cards, pass rates and both comparison windows", () => {
    const points = [1, 2, 3, 4].map((id) => point(id, { resolution: id > 2 ? 8 : 4, totalDrift: 5 }));
    const shown = spaQualitySummary(points, limits, true, false, 2);
    expect(shown.recent.percent).toBe(0);
    expect(shown.delta).toBe(-100);
    const hidden = spaQualitySummary(points, limits, true, false, 2, { resolution: false });
    expect(hidden.recent.metrics.map((metric) => metric.id)).toEqual(["drift"]);
    expect(hidden.recent.percent).toBe(100);
    expect(hidden.previous.percent).toBe(100);
    expect(hidden.delta).toBe(0);
    expect(spaQualitySummary(points, limits, true, false, 2, { resolution: false, drift: false }).recent.percent).toBeNull();
    expect(limits.maxResolution).toBe(5);
  });

  it("does not apply CTF failures to a summary with all CTF checks hidden", () => {
    const points = [point(1, { failed: true, totalDrift: 5 })];
    const summary = spaQualitySummary(points, limits, true, false, 100,
      { resolution: false, defocus: false, astigmatism: false });
    expect(summary.recent).toMatchObject({ failed: 0, within: 1, percent: 100 });
    expect(points[0].failed).toBe(true);
  });

  it("follows tomography plot visibility and the table for metrics without their own plot", () => {
    const rows = [row(1, { defocusU: 20000, astigmatism: 1500, resolution: 8, angleMin: -20,
      residual: 1, failedCtfTilts: 5 })];
    const configured = { ...NO_LIMITS, maxDefocus: 40000, maxAstigmatism: 1000, maxResolution: 5,
      minTilts: 30, minAngleSpan: 50, maxResidual: 2, maxFailedCtfTilts: 1 };
    expect(tomoQualitySummary(rows, configured).recent.percent).toBe(0);
    const hidden = tomoQualitySummary(rows, configured, 20, { tiltSeries: false, angular: false });
    expect(hidden.recent.metrics.map((metric) => metric.id)).toEqual(["defocus", "tilts", "residual"]);
    expect(hidden.recent.percent).toBe(100);
    expect(tomoQualitySummary(rows, configured, 20, { tiltSeries: false, angular: false, tilts: false, residual: false })
      .recent.metrics.map((metric) => metric.id)).toEqual(["defocus"]);
  });

  it("anchors movie windows to import order and includes unprocessed imports", () => {
    const exposures: StreamingMonitorExposures = { setId: 10, ctfSetId: 30, windowSize: 2, points: [
      { id: 99, importRowId: 1, movieName: "old", time: null, aligned: true, ctfReady: true, point: point(99) },
      { id: 3, importRowId: 2, movieName: "previous", time: null, aligned: true, ctfReady: true, point: point(3) },
      { id: 1, importRowId: 3, movieName: "recent", time: null, aligned: true, ctfReady: true, point: point(1) },
      { id: 2, importRowId: 4, movieName: "newest", time: null, aligned: false, ctfReady: false, point: null },
    ] };
    const configured = { ...NO_LIMITS, maxResolution: 5 };
    const summary = movieQualitySummary(exposures, configured, false, 2);
    expect(summary.recent).toMatchObject({ total: 2, within: 1, unavailable: 1, pending: 0, evaluated: 1, percent: 100, coveragePercent: 50 });
    expect(summary.previous).toMatchObject({ within: 2, percent: 100 });
    expect(summary.delta).toBeNull();
    const completed = { ...exposures, points: exposures.points.map((movie) => movie.id === 2
      ? { ...movie, aligned: true, ctfReady: true, point: point(2, { resolution: 8 }) } : movie) };
    expect(movieQualitySummary(completed, configured, false, 2).recent).toMatchObject({ outside: 1, unavailable: 0, percent: 50, coveragePercent: 100 });
    expect(movieQualitySummary(completed, configured, false, 2).delta).toBe(-50);
  });

  it("can assess motion before CTF when the CTF checks are hidden, and retains known failures while picking waits", () => {
    const exposures: StreamingMonitorExposures = { setId: 10, ctfSetId: 30, windowSize: 100, points: [
      { id: 1, importRowId: 1, movieName: "movie", time: null, aligned: true, ctfReady: false,
        point: point(1, { totalDrift: 5 }) },
    ] };
    const configured = { ...NO_LIMITS, maxResolution: 5, maxTotalDrift: 10 };
    expect(movieQualitySummary(exposures, configured, false).recent.unavailable).toBe(1);
    expect(movieQualitySummary(exposures, configured, false, 100, { resolution: false }).recent.percent).toBe(100);
    exposures.points[0] = { ...exposures.points[0], ctfReady: true, point: point(1, { resolution: 8, totalDrift: 5 }) };
    const picking = movieQualitySummary(exposures, { ...configured, minParticles: 100 }, true);
    expect(picking.recent).toMatchObject({ outside: 1, pending: 0 });
  });

  it("keeps unknown movie outcomes out of quality without claiming they are queued or discarded", () => {
    const exposures: StreamingMonitorExposures = { setId: 10, ctfSetId: 30, windowSize: 100, points: [
      { id: 1, importRowId: 1, movieName: "good", time: null, aligned: true, ctfReady: true, point: point(1) },
      { id: 2, importRowId: 2, movieName: "bad", time: null, aligned: true, ctfReady: true, point: point(2, { resolution: 8 }) },
      { id: 3, importRowId: 3, movieName: "unknown", time: null, aligned: false, ctfReady: false, point: null },
      { id: 4, importRowId: 4, movieName: "failed", time: null, aligned: true, ctfReady: true, point: point(4, { failed: true }) },
    ] };
    const summary = movieQualitySummary(exposures, { ...NO_LIMITS, maxResolution: 5 }, false);
    expect(summary.recent).toMatchObject({ total: 4, within: 1, outside: 1, failed: 1, unavailable: 1,
      pending: 0, evaluated: 2, percent: 50, coveragePercent: 50 });
    const allUnknown = { ...exposures, points: [exposures.points[2]] };
    expect(movieQualitySummary(allUnknown, { ...NO_LIMITS, maxResolution: 5 }, false).recent)
      .toMatchObject({ unavailable: 1, evaluated: 0, percent: null, coveragePercent: 0 });
  });

  it("keeps unfinished tilt series pending instead of flagging the tilts that are still arriving", () => {
    const result = tomoQualitySummary([row(2, { complete: false, enabledTilts: 5 }), row(1)],
      { ...NO_LIMITS, minTilts: 30, minAngleSpan: 50 }, 2);
    expect(result.recent).toMatchObject({ within: 1, pending: 1, outside: 0, percent: 100, coveragePercent: 50 });
    expect(result.recent.metrics[0].measured).toBe(1);
    expect(result.delta).toBeNull();
  });

  it("requires coverage on both sides of zero, and checks both defocus directions", () => {
    const result = tomoQualitySummary([row(1, { angleMin: -20, angleMax: 100, defocusU: 20000, defocusV: 45000 })],
      { ...NO_LIMITS, minAngleSpan: 50, maxDefocus: 40000 });
    expect(result.recent.outside).toBe(1);
    expect(result.recent.metrics.map((metric) => metric.outside)).toEqual([1, 1]);
  });
});
