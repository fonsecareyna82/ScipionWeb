// The project at a glance: runs by status, what runs or failed, run times and disk usage.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, HardDrive, RefreshCw, X } from "lucide-react";

import type {
  ProjectDiskUsage,
  ProjectOverview,
  ProjectOverviewRun,
} from "@/services/ProjectService";

type Props = {
  open: boolean;
  fetchOverview: () => Promise<ProjectOverview>;
  fetchDiskUsage?: (opts?: { refresh?: boolean }) => Promise<ProjectDiskUsage>;
  onOpenProtocol: (protocolId: string) => void;
  onClose: () => void;
};

const OVERVIEW_POLL_MS = 10000;
const DISK_POLL_MS = 2000;
const DISK_ROWS = 12;

const STATUS_ORDER = ["running", "launched", "scheduled", "interactive", "failed", "aborted", "finished", "saved", "new"];
const STATUS_COLOR: Record<string, string> = {
  running: "bg-amber-400",
  launched: "bg-sky-400",
  scheduled: "bg-amber-300",
  interactive: "bg-amber-500",
  failed: "bg-red-500",
  aborted: "bg-red-400",
  finished: "bg-green-500",
  saved: "bg-sky-300",
  new: "bg-sky-200",
};

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min`;
  return `${total} s`;
}

function sortedStatuses(counts: Record<string, number>): string[] {
  const rank = (status: string) => {
    const index = STATUS_ORDER.indexOf(status);
    return index < 0 ? STATUS_ORDER.length : index;
  };
  return Object.keys(counts).filter((status) => counts[status] > 0).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function Section(props: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-app-border px-5 py-4 first:border-t-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-app-subtle">{props.title}</h3>
        {props.aside}
      </div>
      {props.children}
    </section>
  );
}

function RunRow(props: { run: ProjectOverviewRun; detail: string; onOpen: (id: string) => void; progress?: boolean }) {
  const { run } = props;
  const share = run.steps ? Math.min(1, run.stepsDone / run.steps) : 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => props.onOpen(run.protocolId)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-app-hover"
        title={`#${run.protocolId} ${run.protocolClassName}`}
      >
        <span className={`h-2 w-2 flex-none rounded-full ${STATUS_COLOR[run.status] ?? "bg-gray-400"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-app-text">{run.label || run.protocolClassName}</span>
          {props.progress && run.steps > 0 && (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-app-surface-3">
              <span className="block h-full rounded-full bg-amber-400" style={{ width: `${share * 100}%` }} />
            </span>
          )}
        </span>
        <span className="flex-none text-xs tabular-nums text-app-subtle">{props.detail}</span>
      </button>
    </li>
  );
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const seconds = (now - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  return `${formatDuration(seconds)} ago`;
}

export default function ProjectOverviewPanel({
  open, fetchOverview, fetchDiskUsage, onOpenProtocol, onClose,
}: Props) {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [disk, setDisk] = useState<ProjectDiskUsage | null>(null);
  const [showAllDisk, setShowAllDisk] = useState(false);
  const diskTimer = useRef<number | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await fetchOverview());
      setOverviewError(null);
    } catch (err: any) {
      setOverviewError(err?.message ?? String(err));
    }
  }, [fetchOverview]);

  // While the server counts, ask again every few seconds.
  const loadDisk = useCallback(async (refresh = false) => {
    if (!fetchDiskUsage) return;
    if (diskTimer.current) window.clearTimeout(diskTimer.current);
    try {
      const usage = await fetchDiskUsage({ refresh });
      setDisk(usage);
      if (usage.computing) diskTimer.current = window.setTimeout(() => void loadDisk(false), DISK_POLL_MS);
    } catch {
      setDisk((current) => current ?? { computedAt: null, totalBytes: null, protocols: [], computing: false });
    }
  }, [fetchDiskUsage]);

  useEffect(() => {
    if (!open) return;
    void loadOverview();
    void loadDisk(false);
    const timer = window.setInterval(() => void loadOverview(), OVERVIEW_POLL_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey);
      if (diskTimer.current) window.clearTimeout(diskTimer.current);
    };
  }, [open, loadOverview, loadDisk, onClose]);

  if (!open) return null;

  const now = overview?.now ? new Date(overview.now).getTime() : Date.now();
  const counts = overview?.counts ?? {};
  const statuses = sortedStatuses(counts);
  const total = overview?.protocols ?? 0;
  const diskRows = (disk?.protocols ?? []).slice(0, showAllDisk ? undefined : DISK_ROWS);
  const largest = Math.max(1, ...(disk?.protocols ?? []).map((item) => item.bytes));

  return createPortal(
    <div
      className="fixed inset-0 z-[10040] flex justify-end bg-black/30"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-label="Project overview"
        className="m-3 flex h-[calc(100%-1.5rem)] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Project overview</h2>
          <div className="flex flex-none items-center gap-1">
            <button type="button" onClick={() => { void loadOverview(); void loadDisk(true); }}
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Refresh the overview" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Close the overview">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {overviewError && !overview && (
            <p className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{overviewError}</p>
          )}

          <Section title={`${total} protocol${total === 1 ? "" : "s"}`}
            aside={overview ? (
              <span className="flex items-center gap-1 text-xs text-app-subtle" title="Sum of the run times of the runs that ended">
                <Clock className="h-3 w-3" /> {formatDuration(overview.computeSeconds)} of runs
              </span>
            ) : null}
          >
            {total > 0 && (
              <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-app-surface-3" aria-hidden="true">
                {statuses.map((status) => (
                  <span key={status} className={STATUS_COLOR[status] ?? "bg-gray-400"} style={{ width: `${(counts[status] / total) * 100}%` }} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <span key={status} className="flex items-center gap-1.5 rounded-full border border-app-border px-2.5 py-1 text-xs text-app-text">
                  <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status] ?? "bg-gray-400"}`} aria-hidden="true" />
                  {status} <span className="font-semibold tabular-nums">{counts[status]}</span>
                </span>
              ))}
              {!overview && !overviewError && <span className="text-sm text-app-subtle">Loading…</span>}
            </div>
          </Section>

          {overview && overview.running.length > 0 && (
            <Section title="Running">
              <ul>
                {overview.running.map((run) => (
                  <RunRow key={run.protocolId} run={run} onOpen={onOpenProtocol} progress
                    detail={`${run.steps ? `${run.stepsDone}/${run.steps} · ` : ""}${formatDuration(run.seconds)}`} />
                ))}
              </ul>
            </Section>
          )}

          {overview && overview.failed.length > 0 && (
            <Section title="Failed">
              <ul>
                {overview.failed.map((run) => (
                  <RunRow key={run.protocolId} run={run} onOpen={onOpenProtocol} detail={timeAgo(run.endedAt, now)} />
                ))}
              </ul>
            </Section>
          )}

          {overview && overview.recent.length > 0 && (
            <Section title="Finished recently">
              <ul>
                {overview.recent.slice(0, 5).map((run) => (
                  <RunRow key={run.protocolId} run={run} onOpen={onOpenProtocol} detail={timeAgo(run.endedAt, now)} />
                ))}
              </ul>
            </Section>
          )}

          {overview && overview.longest.length > 0 && (
            <Section title="Longest runs">
              <ul>
                {overview.longest.slice(0, 5).map((run) => (
                  <RunRow key={run.protocolId} run={run} onOpen={onOpenProtocol} detail={formatDuration(run.seconds)} />
                ))}
              </ul>
            </Section>
          )}

          {fetchDiskUsage && (
            <Section
              title="Disk usage"
              aside={(
                <span className="flex items-center gap-1 text-xs text-app-subtle">
                  <HardDrive className="h-3 w-3" />
                  {disk?.computing
                    ? "Counting…"
                    : disk?.computedAt ? `${formatBytes(disk.totalBytes)} · counted ${timeAgo(disk.computedAt, Date.now())}` : ""}
                </span>
              )}
            >
              {!disk?.computedAt && (
                <p className="text-sm text-app-subtle">{disk?.computing ? "Counting the protocol folders…" : "No count yet."}</p>
              )}
              <ul className="space-y-1">
                {diskRows.map((item) => {
                  return (
                    <li key={item.protocolId} className="rounded-lg px-2 py-1.5 hover:bg-app-hover">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onOpenProtocol(item.protocolId)}
                          className="min-w-0 flex-1 truncate text-left text-sm text-app-text" title={`#${item.protocolId} ${item.protocolClassName}`}>
                          {item.label || item.protocolClassName}
                        </button>
                        <span className="flex-none text-xs tabular-nums text-app-subtle">{formatBytes(item.bytes)}</span>
                      </div>
                      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-app-surface-3" aria-hidden="true">
                        <span className="bg-sky-500" style={{ width: `${(item.bytes / largest) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {(disk?.protocols.length ?? 0) > DISK_ROWS && (
                <button type="button" onClick={() => setShowAllDisk((value) => !value)} className="mt-2 text-xs text-app-accent hover:underline">
                  {showAllDisk ? "Show the largest only" : `Show all ${disk?.protocols.length}`}
                </button>
              )}
            </Section>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
