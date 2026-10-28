import { useEffect, useState } from "react";
import { monitorViewStorageKey, VIEW_STORAGE_KEY, type MonitorMode } from "./monitor-view-preferences";

export type TimePreset = "all" | "30m" | "2h";
export type AxisKind = "time" | "order";
export type AxisRange = [number, number];
export type ChartViewport = { kind: AxisKind; range: AxisRange };
export type TimeSelection = { preset: TimePreset; custom: ChartViewport | null; revision: number };
export type TimedItem = { id: number; time: string | null };
export type ResolvedTimeRange = {
  kind: AxisKind;
  range: AxisRange | null;
  timeFilter: AxisRange | null;
  orderFilter: AxisRange | null;
  active: boolean;
  revision: number;
};
export const TIME_RANGE_STORAGE_KEY = "scipionweb.monitor.timeRange.v1";
const validPreset = (value: unknown): value is TimePreset => value === "all" || value === "30m" || value === "2h";

/** Plotly date-axis relayout strings without offsets represent UTC, not the browser's local zone. */
export function recordedTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let date = value.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) date += "T00:00:00";
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(date)) date += "Z";
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : null;
}

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

/**
 * A moment as Plotly's date axes take it: the local wall time, with no zone. Plotly reads a date string from
 * its year to its seconds and drops any zone, so "14:43+01:00" and "13:43Z", the same moment, were an hour
 * apart for it: points given with their offset fell outside a range given in UTC. Points and ranges both go
 * in local time, which is also what the axis shows.
 */
export function plotlyTime(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** The time of a point as Plotly takes it (see plotlyTime); null when it has none. */
export function plotlyPointTime(value: unknown): string | null {
  const ms = recordedTime(value);
  return ms === null ? null : plotlyTime(ms);
}

/** A time Plotly gives back (the range of a zoom): its local wall time, any zone dropped as Plotly does. */
export function fromPlotlyTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ Tt](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(\.\d+)?)?)?)?/);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds, fraction] = match;
  const ms = new Date(Number(year), Number(month) - 1, Number(day), Number(hours ?? 0), Number(minutes ?? 0),
    Number(seconds ?? 0), Math.round(Number(fraction ?? 0) * 1000)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function itemPositions(items: TimedItem[]): Map<number, number> {
  return new Map([...new Set(items.map((item) => item.id))].sort((a, b) => a - b).map((id, index) => [id, index + 1]));
}

export function resolveTimeRange(selection: TimeSelection, items: TimedItem[], positions: Map<number, number>,
                                 live: boolean, serverNow: string): ResolvedTimeRange {
  const kind: AxisKind = live ? "time" : "order";
  const times = items.map((item) => recordedTime(item.time)).filter((time): time is number => time !== null);
  const newest = times.reduce((max, time) => Math.max(max, time), -Infinity);
  const oldest = times.reduce((min, time) => Math.min(min, time), Infinity);
  const fullTime: AxisRange | null = times.length ? [oldest - (oldest === newest ? 30000 : 0), newest + (oldest === newest ? 30000 : 0)] : null;
  const fullOrder: AxisRange | null = positions.size ? [0.5, positions.size + 0.5] : null;
  const active = selection.custom !== null || selection.preset !== "all";
  let timeFilter: AxisRange | null = selection.custom?.kind === "time" ? selection.custom.range : null;
  const orderFilter = selection.custom?.kind === "order" ? selection.custom.range : null;
  if (!selection.custom && selection.preset !== "all") {
    const end = live ? recordedTime(serverNow) ?? (times.length ? newest : null) : times.length ? newest : null;
    timeFilter = end === null ? null : [end - (selection.preset === "30m" ? 30 : 120) * 60000, end];
  }
  const selected = !active ? items : items.filter((item) => {
    if (orderFilter) {
      const position = positions.get(item.id);
      return position !== undefined && position >= orderFilter[0] && position <= orderFilter[1];
    }
    const time = recordedTime(item.time);
    return timeFilter !== null && time !== null && time >= timeFilter[0] && time <= timeFilter[1];
  });
  let range = kind === "time" ? fullTime : fullOrder;
  if (kind === "time" && timeFilter) range = timeFilter;
  else if (kind === "order" && orderFilter) range = orderFilter;
  else if (active && selected.length) {
    const values = selected.map((item) => kind === "time" ? recordedTime(item.time) : positions.get(item.id) ?? null)
      .filter((value): value is number => value !== null);
    if (values.length) {
      const min = values.reduce((a, b) => Math.min(a, b), Infinity);
      const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
      const padding = kind === "order" ? 0.5 : min === max ? 30000 : 0;
      range = [min - padding, max + padding];
    }
  }
  return { kind, range, timeFilter, orderFilter, active, revision: selection.revision };
}

export function filterTimeRange<T extends TimedItem>(items: T[], view: ResolvedTimeRange, positions: Map<number, number>): T[] {
  if (!view.active) return items;
  if (view.orderFilter) return items.filter((item) => {
    const position = positions.get(item.id);
    return position !== undefined && position >= view.orderFilter![0] && position <= view.orderFilter![1];
  });
  if (!view.timeFilter) return [];
  return items.filter((item) => {
    const time = recordedTime(item.time);
    return time !== null && time >= view.timeFilter![0] && time <= view.timeFilter![1];
  });
}

export function chartXAxis(view: ResolvedTimeRange) {
  return {
    autorange: view.range === null,
    ...(view.range ? { range: view.kind === "time" ? view.range.map(plotlyTime) : view.range } : {}),
    uirevision: `${view.kind}:${view.revision}`,
  };
}

/** Ignore Y-only changes and the echoes produced by applying the same shared range to another plot. */
export function readChartRelayout(event: Record<string, unknown>, view: ResolvedTimeRange): ChartViewport | "reset" | null {
  if (event["xaxis.autorange"] === true) return "reset";
  const pair = Array.isArray(event["xaxis.range"]) ? event["xaxis.range"] as unknown[]
    : [event["xaxis.range[0]"], event["xaxis.range[1]"]];
  if (pair[0] == null || pair[1] == null) return null;
  const parse = (value: unknown) => view.kind === "time" ? fromPlotlyTime(value)
    : typeof value === "number" && Number.isFinite(value) ? value : null;
  const start = parse(pair[0]), end = parse(pair[1]);
  if (start === null || end === null || start >= end) return null;
  const tolerance = view.kind === "time" ? 1 : 0.000001;
  if (view.range && Math.abs(start - view.range[0]) <= tolerance && Math.abs(end - view.range[1]) <= tolerance) return null;
  return { kind: view.kind, range: [start, end] };
}

function readPresets(key: string): Record<MonitorMode, TimePreset> {
  const result: Record<MonitorMode, TimePreset> = { spa: "all", tomo: "all" };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    for (const mode of ["spa", "tomo"] as const) if (validPreset(stored?.[mode])) result[mode] = stored[mode];
  } catch { /* Unavailable or malformed preferences leave the full session visible. */ }
  return result;
}

export function useMonitorTimeRange(projectId: string | number) {
  const [key] = useState(() => monitorViewStorageKey().replace(VIEW_STORAGE_KEY, TIME_RANGE_STORAGE_KEY));
  const [presets, setPresets] = useState(() => readPresets(key));
  const [custom, setCustom] = useState<Partial<Record<MonitorMode, ChartViewport>>>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => { setCustom({}); setRevision((value) => value + 1); }, [projectId]);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(presets)); } catch { /* Session-local preferences still work. */ }
  }, [key, presets]);
  return {
    selection: (mode: MonitorMode): TimeSelection => ({ preset: presets[mode], custom: custom[mode] ?? null, revision }),
    setPreset: (mode: MonitorMode, preset: TimePreset) => {
      setPresets((previous) => ({ ...previous, [mode]: preset }));
      setCustom((previous) => ({ ...previous, [mode]: undefined }));
      setRevision((value) => value + 1);
    },
    setViewport: (mode: MonitorMode, viewport: ChartViewport | "reset") => {
      if (viewport === "reset") {
        setPresets((previous) => previous[mode] === "all" ? previous : { ...previous, [mode]: "all" });
        setCustom((previous) => !previous[mode] ? previous : { ...previous, [mode]: undefined });
      } else setCustom((previous) => ({ ...previous, [mode]: viewport }));
      setRevision((value) => value + 1);
    },
  };
}
