import { describe, expect, it } from "vitest";

import type { StreamingMonitorPoint } from "@/services/ProjectService";
import { EMPTY_PICKING, EMPTY_SERIES, alertEpisodes, mergePicking, mergeSeries, withParticles } from "@/components/monitor/streaming-monitor-data";

function point(id: number, alerts: StreamingMonitorPoint["alerts"] = [], extra: Partial<StreamingMonitorPoint> = {}) {
  return { id, time: `2026-10-21T12:0${id}:00Z`, enabled: true, alerts, ...extra } as StreamingMonitorPoint;
}

describe("mergeSeries", () => {
  it("adds the new points after the ones it has", () => {
    const first = mergeSeries(EMPTY_SERIES, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 2, more: false, points: [point(1), point(2)] });
    const next = mergeSeries(first, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 3, more: false, points: [point(2), point(3)] });

    expect(next.points.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(next.lastRowId).toBe(3);
  });

  it("keeps the points in micrograph order although they arrive out of it", () => {
    const first = mergeSeries(EMPTY_SERIES, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 101, more: false, points: [point(5)] });
    const next = mergeSeries(first, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 103, more: false, points: [point(3), point(6)] });

    expect(next.points.map((p) => p.id)).toEqual([3, 5, 6]);
    expect(next.lastRowId).toBe(103);
  });

  it("keeps what it has when nothing is new", () => {
    const first = mergeSeries(EMPTY_SERIES, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 2, more: false, points: [point(1), point(2)] });
    const next = mergeSeries(first, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 2, more: false, points: [] });

    expect(next).toEqual(first);
  });

  it("starts again when the output was rebuilt or another one is followed", () => {
    const first = mergeSeries(EMPTY_SERIES, { setId: 30, kind: "ctf" as const, reset: false, lastRowId: 2, more: false, points: [point(1), point(2)] });

    const rebuilt = mergeSeries(first, { setId: 30, kind: "ctf" as const, reset: true, lastRowId: 1, more: false, points: [point(1)] });
    const other = mergeSeries(first, { setId: 31, kind: "ctf" as const, reset: false, lastRowId: 5, more: false, points: [point(5)] });

    expect(rebuilt.points.map((p) => p.id)).toEqual([1]);
    expect(other.points.map((p) => p.id)).toEqual([5]);
    expect(other.setId).toBe(31);
  });
});

describe("alertEpisodes", () => {
  it("makes one alert per run of micrographs past a threshold, newest first", () => {
    const episodes = alertEpisodes([
      point(1, ["maxAstigmatism"]),
      point(2, ["maxAstigmatism"]),
      point(3),
      point(4, ["maxAstigmatism", "maxTotalDrift"]),
    ]);

    expect(episodes.map((e) => [e.kind, e.first.id, e.last.id, e.count, e.ongoing])).toEqual([
      ["maxTotalDrift", 4, 4, 1, true],
      ["maxAstigmatism", 4, 4, 1, true],
      ["maxAstigmatism", 1, 2, 2, false],
    ]);
  });

  it("does not let a failed estimation split or end a run", () => {
    const episodes = alertEpisodes([
      point(1, ["maxDefocus"]),
      point(2, [], { failed: true }),
      point(3, ["maxDefocus"]),
    ]);

    expect(episodes.map((e) => [e.first.id, e.last.id, e.count, e.ongoing])).toEqual([[1, 3, 2, true]]);
  });
});


describe("mergePicking", () => {
  it("updates the micrographs that changed, and starts again with another coordinates output", () => {
    const first = mergePicking(EMPTY_PICKING, { setId: 40, reset: false, lastRowId: 5, complete: true, counts: { "1": 3, "2": 2 } });
    const next = mergePicking(first, { setId: 40, reset: false, lastRowId: 9, complete: true, counts: { "2": 6 } });
    const other = mergePicking(next, { setId: 41, reset: false, lastRowId: 2, complete: true, counts: { "7": 1 } });

    expect(next).toEqual({ setId: 40, lastRowId: 9, counts: { "1": 3, "2": 6 } });
    expect(other.counts).toEqual({ "7": 1 });
  });
});

describe("withParticles", () => {
  const thresholds = { minDefocus: null, maxDefocus: null, maxAstigmatism: null, maxResolution: null,
                       maxFrameShift: null, maxTotalDrift: null, minParticles: 10, minTilts: null,
                       minAngleSpan: null, maxFailedCtfTilts: null, maxResidual: null };

  it("gives each point its particles and the alert when they are too few", () => {
    const shown = withParticles([point(1), point(2), point(3)], { "1": 5, "2": 50 }, thresholds);

    expect(shown.map((p) => [p.particles, p.alerts])).toEqual([[5, ["minParticles"]], [50, []], [undefined, []]]);
  });

  it("raises no particles alert without the threshold", () => {
    const shown = withParticles([point(1)], { "1": 5 }, { ...thresholds, minParticles: null });

    expect(shown[0].alerts).toEqual([]);
  });
});
