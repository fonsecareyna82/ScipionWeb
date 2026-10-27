import { describe, expect, it } from "vitest";
import type { StreamingMonitorThresholds, TomoMonitorTiltSeries } from "@/services/ProjectService";
import { THRESHOLD_ORDER, TOMO_THRESHOLD_ORDER } from "@/components/monitor/streaming-monitor-data";
import { summarizeTomography } from "@/components/monitor/tomo-overview-data";

const emptyLimits = Object.fromEntries([...new Set([...THRESHOLD_ORDER, ...TOMO_THRESHOLD_ORDER])]
  .map((name) => [name, null])) as StreamingMonitorThresholds;
const limits = { ...emptyLimits, minTilts: 30, minAngleSpan: 50 };
const row = (id: number, extra: Partial<TomoMonitorTiltSeries> = {}): TomoMonitorTiltSeries => ({
  id, tsId: `TS_${id}`, time: null, enabled: true, tilts: 41, enabledTilts: 41, complete: true,
  angleMin: -60, angleMax: 60, aligned: false, alerts: [], ...extra,
});

describe("Tomography overview", () => {
  it("separates completion from quality and never fails unfinished acquisition against the angular/count limits", () => {
    const data = summarizeTomography([
      row(1), row(2, { enabledTilts: 25 }), row(3, { complete: false, tilts: 5, enabledTilts: 5, angleMin: -10, angleMax: 10 }),
    ], limits);
    expect(data).toMatchObject({ total: 3, complete: 2, incomplete: 1, evaluated: 2, outside: 1 });
    expect(data.angles).toMatchObject({ measured: 2, sufficient: 2, short: 0 });
    expect(data.tilts.excluded).toBe(16);
  });

  it("counts only explicitly disabled present tilts, even in an incomplete series", () => {
    const data = summarizeTomography([row(1, { complete: false, tilts: 10, enabledTilts: 8 })], limits);
    expect(data.tilts).toMatchObject({ present: 10, kept: 8, excluded: 2, knownSeries: 1 });
    expect(data.outside).toBe(0);
    expect(data.angles.measured).toBe(0);
  });

  it("keeps missing or inconsistent counts unknown instead of reporting discarded tilts", () => {
    const data = summarizeTomography([
      row(1, { enabledTilts: undefined }), row(2, { enabledTilts: 42 }), row(3, { enabledTilts: -1 }),
      row(4, { tilts: 10, enabledTilts: 8 }),
    ], limits);
    expect(data.tilts).toEqual({ present: 10, kept: 8, excluded: 2, knownSeries: 1, unknownSeries: 3 });
  });

  it("requires both sides of the target, ignores unknown angles, and opens the newest short series", () => {
    const data = summarizeTomography([
      row(10, { angleMin: -20, angleMax: 100 }), row(3), row(8, { angleMin: -60, angleMax: 40 }),
      row(20, { angleMin: undefined }), row(30, { complete: false, angleMin: -10, angleMax: 10 }),
    ], limits);
    expect(data.angles).toMatchObject({ target: 50, measured: 3, sufficient: 1, short: 2, missing: 1, latestShort: "TS_10", medianSpan: 120 });
  });

  it("updates angular limits from current settings and accepts the exact negative and positive endpoints", () => {
    const rows = [row(1, { angleMin: -50, angleMax: 50 })];
    expect(summarizeTomography(rows, limits).angles.sufficient).toBe(1);
    expect(summarizeTomography(rows, { ...limits, minAngleSpan: 55 }).angles.short).toBe(1);
    expect(summarizeTomography(rows, { ...limits, minAngleSpan: 55 }).outside).toBe(1);
  });

  it("uses median span when the angular threshold is off and handles even samples", () => {
    const data = summarizeTomography([row(1, { angleMin: -50, angleMax: 50 }), row(2, { angleMin: -60, angleMax: 60 })], emptyLimits);
    expect(data.angles).toMatchObject({ target: null, medianSpan: 110, measured: 2, sufficient: 0, short: 0 });
    expect(data).toMatchObject({ evaluated: 0, checks: 0 });
  });

  it("keeps operational facts independent while quality violations follow the visible checks", () => {
    const configured = { ...emptyLimits, maxDefocus: 40000 };
    const rows = [row(1, { defocusU: 45000, enabled: false })];
    expect(summarizeTomography(rows, configured).outside).toBe(1);
    const hidden = summarizeTomography(rows, configured, { defocus: false });
    expect(hidden).toMatchObject({ outside: 0, evaluated: 0, complete: 1, disabledSeries: 1 });
    expect(hidden.tilts.knownSeries).toBe(1);
  });

  it("handles an empty range and invalid angular bounds without fabricating coverage", () => {
    expect(summarizeTomography([], limits)).toMatchObject({ total: 0, complete: 0, incomplete: 0, evaluated: 0 });
    const data = summarizeTomography([row(1, { angleMin: 60, angleMax: -60 }), row(2, { angleMin: NaN })], limits);
    expect(data.angles).toMatchObject({ measured: 0, missing: 2, medianSpan: null });
  });
});
