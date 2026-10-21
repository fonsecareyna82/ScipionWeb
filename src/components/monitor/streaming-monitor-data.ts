// What the streaming monitor keeps between polls: the points it has, and the alerts they make.
import type {
  StreamingMonitor,
  StreamingMonitorPoint,
  StreamingMonitorThresholdName,
  StreamingMonitorThresholds,
} from "@/services/ProjectService";

export const THRESHOLD_LABELS: Record<StreamingMonitorThresholdName, string> = {
  minDefocus: "Defocus below",
  maxDefocus: "Defocus above",
  maxAstigmatism: "Astigmatism above",
  maxResolution: "CTF resolution worse than",
  maxFrameShift: "Frame shift above",
  maxTotalDrift: "Total drift above",
  minParticles: "Fewer particles picked than",
};

/** Every threshold is in Å but the particles one, a count. */
export function formatLimit(kind: StreamingMonitorThresholdName, value: number | null | undefined): string {
  if (kind === "minParticles") return value === null || value === undefined ? "—" : String(value);
  return formatAngstrom(value, 0);
}

export function thresholdUnit(kind: StreamingMonitorThresholdName): string {
  return kind === "minParticles" ? "particles" : "Å";
}

export const THRESHOLD_ORDER: StreamingMonitorThresholdName[] = [
  "minDefocus",
  "maxDefocus",
  "maxAstigmatism",
  "maxResolution",
  "maxFrameShift",
  "maxTotalDrift",
  "minParticles",
];

/** How often the monitor reads; 0 pauses it. A preference of each browser, not of the project. */
export const POLL_CHOICES = [5, 10, 15, 30, 60, 0] as const;
export const DEFAULT_POLL_SECONDS = 15;
export const POLL_STORAGE_KEY = "scipionweb.monitor.pollSeconds";

export function readPollSeconds(): number {
  try {
    const stored = window.localStorage.getItem(POLL_STORAGE_KEY);
    const seconds = stored === null ? NaN : Number(stored);
    return (POLL_CHOICES as readonly number[]).includes(seconds) ? seconds : DEFAULT_POLL_SECONDS;
  } catch {
    return DEFAULT_POLL_SECONDS;
  }
}

export function savePollSeconds(seconds: number): void {
  try {
    window.localStorage.setItem(POLL_STORAGE_KEY, String(seconds));
  } catch {
    // Without storage the choice lasts until the monitor closes
  }
}

export type SeriesState = {
  setId: number | null;
  lastRowId: number | null;
  points: StreamingMonitorPoint[];
};

export const EMPTY_SERIES: SeriesState = { setId: null, lastRowId: null, points: [] };

/**
 * The points after this answer: the new ones added, or only them when the output was rebuilt. They come in
 * the order they were written, which parallel steps mix up: they are kept in micrograph order.
 */
export function mergeSeries(previous: SeriesState, answer: StreamingMonitor["series"]): SeriesState {
  const restart = answer.reset || answer.setId !== previous.setId;
  const kept = restart ? [] : previous.points;
  const known = new Set(kept.map((point) => point.id));
  const added = answer.points.filter((point) => !known.has(point.id));
  return {
    setId: answer.setId,
    lastRowId: answer.lastRowId ?? (restart ? null : previous.lastRowId),
    points: added.length ? [...kept, ...added].sort((a, b) => a.id - b.id) : kept,
  };
}

export type PickingState = {
  setId: number | null;
  lastRowId: number | null;
  /** Coordinates per micrograph id. */
  counts: Record<string, number>;
};

export const EMPTY_PICKING: PickingState = { setId: null, lastRowId: null, counts: {} };

/** The coordinates per micrograph after this answer: the changed ones updated, or only them when the
 *  coordinates output is another one. */
export function mergePicking(previous: PickingState, answer: StreamingMonitor["picking"]): PickingState {
  const restart = answer.reset || answer.setId !== previous.setId;
  const kept = restart ? {} : previous.counts;
  const changed = Object.keys(answer.counts).length > 0;
  return {
    setId: answer.setId,
    lastRowId: answer.lastRowId,
    counts: changed ? { ...kept, ...answer.counts } : kept,
  };
}

/**
 * The points with the coordinates picked on their micrograph. Picking comes after the CTF, so a point the
 * page already has gets them later: its particles alert is worked out here, with the project's threshold.
 */
export function withParticles(
  points: StreamingMonitorPoint[],
  counts: Record<string, number>,
  thresholds: StreamingMonitorThresholds | null,
): StreamingMonitorPoint[] {
  const limit = thresholds?.minParticles ?? null;
  return points.map((point) => {
    const particles = counts[String(point.id)] ?? point.particles;
    const others = point.alerts.filter((alert) => alert !== "minParticles");
    const alerts = limit !== null && particles !== undefined && particles < limit && !point.failed
      ? [...others, "minParticles" as const] : others;
    if (particles === point.particles && alerts.length === point.alerts.length) return point;
    return { ...point, particles, alerts };
  });
}

/** A run of consecutive micrographs past the same threshold. */
export type AlertEpisode = {
  kind: StreamingMonitorThresholdName;
  first: StreamingMonitorPoint;
  last: StreamingMonitorPoint;
  count: number;
  /** The newest micrograph still goes past it. */
  ongoing: boolean;
};

/**
 * One alert per run of consecutive micrographs past a threshold, newest first: it does not repeat until
 * a micrograph is back in range. Failed estimations neither start nor end a run.
 */
export function alertEpisodes(points: StreamingMonitorPoint[]): AlertEpisode[] {
  const open = new Map<StreamingMonitorThresholdName, AlertEpisode>();
  const episodes: AlertEpisode[] = [];
  for (const point of points) {
    if (point.failed) continue;
    const kinds = new Set(point.alerts);
    for (const [kind, episode] of open) {
      if (!kinds.has(kind)) {
        episode.ongoing = false;
        open.delete(kind);
      }
    }
    for (const kind of kinds) {
      const episode = open.get(kind);
      if (episode) {
        episode.last = point;
        episode.count += 1;
      } else {
        const started: AlertEpisode = { kind, first: point, last: point, count: 1, ongoing: true };
        open.set(kind, started);
        episodes.push(started);
      }
    }
  }
  return episodes.reverse();
}

export function formatAngstrom(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} Å`;
}

/** Defocus is shown in µm, as in the facilities report; thresholds stay in Å. */
export function toMicrons(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 10000;
}
