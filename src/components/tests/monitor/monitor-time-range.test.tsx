import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  TIME_RANGE_STORAGE_KEY, chartXAxis, filterTimeRange, fromPlotlyTime, itemPositions, plotlyPointTime, plotlyTime,
  readChartRelayout, recordedTime,
  resolveTimeRange, useMonitorTimeRange, type TimeSelection,
} from "@/components/monitor/monitor-time-range";

const items = [
  { id: 1, time: "2026-10-21T09:00:00Z" },
  { id: 2, time: "2026-10-21T11:30:00Z" },
  { id: 3, time: "2026-10-21T11:55:00Z" },
  { id: 4, time: null },
];
const positions = itemPositions(items);
const selection = (preset: TimeSelection["preset"] = "all"): TimeSelection => ({ preset, custom: null, revision: 1 });
const now = "2026-10-21T12:00:00Z";
afterEach(() => localStorage.clear());

describe("Monitor time range", () => {
  it("uses the server clock for live windows, includes boundaries and excludes unknown or future times", () => {
    const source = [...items, { id: 5, time: "2026-10-21T12:01:00Z" }];
    const view = resolveTimeRange(selection("30m"), source, itemPositions(source), true, now);
    expect(view.range).toEqual([Date.parse("2026-10-21T11:30:00Z"), Date.parse(now)]);
    expect(filterTimeRange(source, view, itemPositions(source)).map((item) => item.id)).toEqual([2, 3]);
    const all = resolveTimeRange(selection(), source, itemPositions(source), true, now);
    expect(filterTimeRange(source, all, itemPositions(source))).toBe(source);
    expect(filterTimeRange(items, resolveTimeRange(selection("2h"), items, positions, true, now), positions).map((item) => item.id)).toEqual([2, 3]);
  });

  it("anchors completed sessions to the newest recorded item and preserves global item positions", () => {
    const view = resolveTimeRange(selection("30m"), items, positions, false, "2026-10-27T12:00:00Z");
    expect(view.kind).toBe("order");
    expect(filterTimeRange(items, view, positions).map((item) => positions.get(item.id))).toEqual([2, 3]);
    expect(chartXAxis(view).range).toEqual([1.5, 3.5]);
    const custom = resolveTimeRange({ ...selection(), custom: { kind: "order", range: [1.5, 2.5] } }, items, positions, false, now);
    expect(filterTimeRange(items, custom, positions).map((item) => item.id)).toEqual([2]);
  });

  it("reads the API's unzoned dates as UTC, and Plotly's zooms in local time; ignores Y changes and X echoes", () => {
    expect(recordedTime("2026-10-21 11:30:00.000")).toBe(Date.parse("2026-10-21T11:30:00Z"));
    expect(recordedTime("2026-10-21T13:30:00+02:00")).toBe(Date.parse("2026-10-21T11:30:00Z"));
    expect(recordedTime("invalid")).toBeNull();
    const view = resolveTimeRange(selection("30m"), items, positions, true, now);
    expect(readChartRelayout({ "yaxis.range[0]": 0, "yaxis.range[1]": 5 }, view)).toBeNull();
    // The range it was given, coming back
    expect(readChartRelayout({ "xaxis.range": chartXAxis(view).range }, view)).toBeNull();
    const zoomed = Date.parse("2026-10-21T11:45:00Z");
    expect(readChartRelayout({ "xaxis.range[0]": plotlyTime(zoomed), "xaxis.range[1]": plotlyTime(Date.parse(now)) }, view))
      .toEqual({ kind: "time", range: [zoomed, Date.parse(now)] });
    expect(readChartRelayout({ "xaxis.autorange": true }, view)).toBe("reset");
    expect(readChartRelayout({ "xaxis.range": [now, "invalid"] }, view)).toBeNull();
  });

  it("gives Plotly the points and the range of a stream in the same local time", () => {
    // Plotly reads a date from its year to its seconds and drops any zone: a point given with its offset
    // and a range given in UTC were an hour apart in Spain, and no point was drawn
    const point = "2026-10-28T14:43:13.080310+01:00";
    const instant = Date.parse(point);
    const view = resolveTimeRange(selection(), [{ id: 1, time: point }, { id: 2, time: "2026-10-28T13:45:00Z" }],
      new Map([[1, 1], [2, 2]]), true, "2026-10-28T13:46:00+00:00");
    const [start, end] = chartXAxis(view).range as string[];
    const plotlyWall = (value: string) => value.slice(0, 19).replace("T", " ");

    expect(plotlyPointTime(point)).toBe(plotlyTime(instant));
    expect(plotlyWall(plotlyPointTime(point)!) >= plotlyWall(start) && plotlyWall(plotlyPointTime(point)!) <= plotlyWall(end))
      .toBe(true);
    expect(fromPlotlyTime(plotlyPointTime(point))).toBe(Math.floor(instant));
  });

  it("preserves a custom interval when streaming finishes or starts", () => {
    const timeSelection: TimeSelection = { ...selection(), custom: { kind: "time", range: [Date.parse("2026-10-21T11:40:00Z"), Date.parse(now)] } };
    const finished = resolveTimeRange(timeSelection, items, positions, false, now);
    expect(finished.kind).toBe("order");
    expect(filterTimeRange(items, finished, positions).map((item) => item.id)).toEqual([3]);
    const orderSelection: TimeSelection = { ...selection(), custom: { kind: "order", range: [1.5, 2.5] } };
    const live = resolveTimeRange(orderSelection, items, positions, true, now);
    expect(live.kind).toBe("time");
    expect(filterTimeRange(items, live, positions).map((item) => item.id)).toEqual([2]);
  });

  it("handles empty sessions and completed items without timestamps", () => {
    const untimed = [{ id: 1, time: null }];
    const order = itemPositions(untimed);
    expect(filterTimeRange(untimed, resolveTimeRange(selection(), untimed, order, false, now), order)).toBe(untimed);
    expect(filterTimeRange(untimed, resolveTimeRange(selection("30m"), untimed, order, false, now), order)).toEqual([]);
    expect(resolveTimeRange(selection(), [], new Map(), true, now).range).toBeNull();
  });
});

function Controller({ project = 7 }: { project?: number }) {
  const range = useMonitorTimeRange(project);
  return <>
    <output aria-label="SPA selection">{JSON.stringify(range.selection("spa"))}</output>
    <output aria-label="Tomo selection">{range.selection("tomo").preset}</output>
    <button onClick={() => range.setPreset("spa", "30m")}>SPA recent</button>
    <button onClick={() => range.setViewport("spa", { kind: "time", range: [1, 2] })}>Zoom</button>
    <button onClick={() => range.setViewport("spa", "reset")}>Reset range</button>
  </>;
}

describe("Time range preferences", () => {
  it("persists presets by view but keeps custom zoom project-local", () => {
    const first = render(<Controller />);
    fireEvent.click(screen.getByRole("button", { name: "SPA recent" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
    expect(screen.getByLabelText("SPA selection")).toHaveTextContent('"kind":"time"');
    expect(screen.getByLabelText("Tomo selection")).toHaveTextContent("all");
    first.rerender(<Controller project={8} />);
    expect(screen.getByLabelText("SPA selection")).toHaveTextContent('"preset":"30m","custom":null');
    first.unmount();
    render(<Controller />);
    expect(screen.getByLabelText("SPA selection")).toHaveTextContent('"preset":"30m","custom":null');
    fireEvent.click(screen.getByRole("button", { name: "Reset range" }));
    expect(screen.getByLabelText("SPA selection")).toHaveTextContent('"preset":"all","custom":null');
  });

  it("rejects malformed saved presets", () => {
    localStorage.setItem(TIME_RANGE_STORAGE_KEY, JSON.stringify({ spa: "invalid", tomo: "2h" }));
    render(<Controller />);
    expect(screen.getByLabelText("SPA selection")).toHaveTextContent('"preset":"all"');
    expect(screen.getByLabelText("Tomo selection")).toHaveTextContent("2h");
  });
});
