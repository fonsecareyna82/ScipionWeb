// The alerts of the monitor: a bell in its bar that counts the new ones, and a panel that slides in from the
// right with every run of items past a threshold, newest first.
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";

import type { Id, StreamingMonitorThresholds } from "@/services/ProjectService";
import { HelpHint } from "./monitor-parts";
import { THRESHOLD_LABELS, formatLimit, type AlertEpisode } from "./streaming-monitor-data";

export type MonitorAlertItem = "micrograph" | "movie" | "tilt series";

/** A run of consecutive items past the same threshold, and what kind of item they are. */
export type MonitorAlert = AlertEpisode & { item: MonitorAlertItem };

const ALERTS_HELP =
  "Each line is a run of consecutive items past the same threshold, newest first: micrographs, movies of the "
  + "dose analysis or tilt series. A red dot means the newest one is still past it; a grey one, that the values "
  + "came back in range. Click a micrograph or a tilt series to see it. The thresholds are set with the "
  + "Thresholds button, for everyone in the project.";

// The alerts already seen are kept per project in this browser; the newest ones are enough
const SEEN_LIMIT = 500;

export function alertKey(alert: MonitorAlert): string {
  return `${alert.item}:${alert.kind}:${alert.first.id}`;
}

function seenStorageKey(projectId: Id): string {
  return `scipionweb.monitor.seenAlerts.${String(projectId)}`;
}

function readSeen(projectId: Id): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(seenStorageKey(projectId)) ?? "[]");
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/** How many alerts were not seen yet. Every alert counts as seen while the panel is open. */
export function useUnseenAlerts(projectId: Id, alerts: MonitorAlert[], open: boolean): number {
  const [seen, setSeen] = useState<string[]>(() => readSeen(projectId));
  const seenRef = useRef(seen);
  seenRef.current = seen;

  useEffect(() => {
    setSeen(readSeen(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const known = new Set(seenRef.current);
    const added = alerts.map(alertKey).filter((key) => !known.has(key));
    if (!added.length) return;
    const next = [...seenRef.current, ...added].slice(-SEEN_LIMIT);
    setSeen(next);
    try {
      window.localStorage.setItem(seenStorageKey(projectId), JSON.stringify(next));
    } catch {
      // Without storage the alerts count as new again in the next visit
    }
  }, [projectId, alerts, open]);

  return useMemo(() => {
    const known = new Set(seen);
    return alerts.filter((alert) => !known.has(alertKey(alert))).length;
  }, [alerts, seen]);
}

export function AlertsButton({ unseen, total, open, onToggle }: {
  unseen: number; total: number; open: boolean; onToggle: () => void;
}) {
  const Icon = unseen ? BellRing : Bell;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
            aria-label={unseen ? `Alerts, ${unseen} new` : "Alerts"}
            title={total ? `${total} alert${total === 1 ? "" : "s"}` : "No alerts"}
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-hover hover:text-app-text ${open ? "bg-app-hover text-app-text" : "bg-app-surface"}`}>
      <Icon className="h-4 w-4" />
      {unseen > 0 ? (
        <span data-testid="monitor-alerts-badge"
              className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[13px] font-bold text-white">
          {unseen > 9 ? "9+" : unseen}
        </span>
      ) : null}
    </button>
  );
}

function timeOf(alert: MonitorAlert, which: "first" | "last"): string {
  const time = alert[which].time;
  return time ? new Date(time).toLocaleTimeString() : "—";
}

export function AlertsPanel({ alerts, thresholds, onClose, onOpen }: {
  alerts: MonitorAlert[];
  thresholds: StreamingMonitorThresholds | null;
  onClose: () => void;
  /** Opens what an alert is about; movies have nothing to open. */
  onOpen: (alert: MonitorAlert) => void;
}) {
  return (
    <aside aria-label="Alerts"
           className="absolute inset-y-0 right-0 z-20 flex w-[400px] max-w-[92%] flex-col border-l border-app-border bg-app-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-app-border px-4 py-3">
        <Bell className="h-4 w-4 text-app-subtle" />
        <span className="text-[15px] font-semibold text-app-text">Alerts</span>
        <HelpHint text={ALERTS_HELP} />
        <button type="button" onClick={onClose} aria-label="Close the alerts"
                className="ml-auto rounded p-1 text-app-muted hover:bg-app-hover hover:text-app-text">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {alerts.length === 0 ? (
          <div className="py-6 text-center text-[15px] text-app-muted">Nothing goes past the thresholds.</div>
        ) : (
          <ul className="divide-y divide-app-border">
            {alerts.map((alert) => (
              <li key={alertKey(alert)} className="flex flex-col gap-0.5 py-2 text-[15px]">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${alert.ongoing ? "bg-app-danger" : "bg-app-subtle"}`} />
                  <span className="font-medium text-app-text">
                    {THRESHOLD_LABELS[alert.kind]} {formatLimit(alert.kind, thresholds?.[alert.kind])}
                  </span>
                </div>
                <div className="pl-4 text-[13px] text-app-muted">
                  {alert.count === 1 ? `1 ${alert.item}` : `${alert.count} ${alert.item}${alert.item === "tilt series" ? "" : "s"} in a row`}
                  {" · "}{timeOf(alert, "first")}{alert.count > 1 ? ` – ${timeOf(alert, "last")}` : ""}
                  {alert.ongoing ? " · still going on" : ""}
                </div>
                <div className="truncate pl-4 text-[13px]">
                  {alert.item === "movie" ? (
                    <span className="text-app-muted">{alert.first.micrographName}</span>
                  ) : (
                    <button type="button" className="text-app-accent hover:underline" onClick={() => onOpen(alert)}>
                      {alert.first.micrographName ?? `${alert.item} ${alert.first.id}`}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
