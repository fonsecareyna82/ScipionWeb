import { describe, expect, it } from "vitest";

import type { StreamingMonitorPoint } from "@/services/ProjectService";
import { formatEta, plotBox, plotFrame } from "@/components/monitor/monitor-parts";
import { EMPTY_DOSE, EMPTY_PICKING, EMPTY_SERIES, alertEpisodes, mergeDose, mergePicking, mergeSeries, withParticles } from "@/components/monitor/streaming-monitor-data";

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
                       minAngleSpan: null, maxFailedCtfTilts: null, maxResidual: null, maxDoseDifference: null };

  it("gives each point its particles and the alert when they are too few", () => {
    const shown = withParticles([point(1), point(2), point(3)], { "1": 5, "2": 50 }, thresholds);

    expect(shown.map((p) => [p.particles, p.alerts])).toEqual([[5, ["minParticles"]], [50, []], [undefined, []]]);
  });

  it("raises no particles alert without the threshold", () => {
    const shown = withParticles([point(1)], { "1": 5 }, { ...thresholds, minParticles: null });

    expect(shown[0].alerts).toEqual([]);
  });
});


describe("formatEta", () => {
  it("says the time in words a person reads at a glance", () => {
    expect([0.4, 12.4, 60, 83.6].map(formatEta)).toEqual(["under a minute", "about 12 min", "about 1 h",
                                                          "about 1 h 24 min"]);
  });
});


describe("plotFrame", () => {
  it("keeps a plot as high as its box, with room for its legend inside it", () => {
    const withLegend = plotFrame(240, true);
    const without = plotFrame(240, false);

    expect(plotBox(240)).toEqual({ width: "100%", height: withLegend.height });
    expect(withLegend.margin.t).toBeGreaterThan(without.margin.t);
    // Anchored on the plotting area, not above the frame
    expect(withLegend.legend).toMatchObject({ y: 1, yanchor: "bottom" });
  });

  it("keeps the dose points by movie, and drops them for another dose analysis", () => {
    const movie = (id: number) => ({ id, time: null, meanDose: 1, doseDifference: 0, discarded: false, alerts: [] });
    const first = mergeDose(EMPTY_DOSE, { key: "9", label: "dose", reset: false, lastRowId: 20, more: false,
                                          points: [movie(3), movie(1)] });
    const next = mergeDose(first, { key: "9", label: "dose", reset: false, lastRowId: 25, more: false,
                                    points: [movie(2), movie(3)] });
    const other = mergeDose(next, { key: "8", label: "dose", reset: false, lastRowId: 4, more: false,
                                    points: [movie(7)] });

    expect(next.points.map((point) => point.id)).toEqual([1, 2, 3]);
    expect(next.lastRowId).toBe(25);
    expect([other.key, other.points.map((point) => point.id)]).toEqual(["8", [7]]);
  });
});
