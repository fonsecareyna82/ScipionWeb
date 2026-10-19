// The parameters of every launch of a protocol: what changed from one launch to the next, and who launched it.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";

import {
  extractProtocolParamLabels,
  extractProtocolParams,
  getParamComparisonRows,
  type ParamComparisonRow,
} from "@/components/projects/ProjectWorkspaceCompareDialog";
import type { ProtocolLaunch } from "@/services/ProjectService";

type Props = {
  open: boolean;
  projectName: string;
  protocolId: string;
  protocolLabel: string;
  fetchLaunches: (protocolId: string) => Promise<ProtocolLaunch[]>;
  fetchProtocolDetails: (projectName: string, protocolId: string) => Promise<any>;
  onClose: () => void;
};

type Entry = {
  key: string;
  title: string;
  subtitle: string;
  mode?: string;
  params: Record<string, string>;
};

const MODE_STYLE: Record<string, string> = {
  launch: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  restart: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  continue: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  schedule: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** Each entry against the one before it (the next older launch). */
export function historyRows(
  entries: Entry[], index: number, labels: Record<string, string>,
): { rows: ParamComparisonRow[]; previous: Entry | null } {
  const entry = entries[index];
  const previous = entries[index + 1] ?? null;
  if (!entry) return { rows: [], previous: null };
  return {
    rows: getParamComparisonRows(previous?.params ?? {}, entry.params, labels, labels),
    previous,
  };
}

export default function ParameterHistoryDialog({
  open, projectName, protocolId, protocolLabel, fetchLaunches, fetchProtocolDetails, onClose,
}: Props) {
  const [launches, setLaunches] = useState<ProtocolLaunch[] | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLaunches(null);
    setDetails(null);
    setError(null);
    setSelected(0);
    fetchLaunches(protocolId)
      .then((items) => !cancelled && setLaunches(items))
      .catch((err) => !cancelled && setError(err?.message ?? String(err)));
    // Only for the labels of the parameters.
    fetchProtocolDetails(projectName, protocolId)
      .then((payload) => !cancelled && setDetails(payload))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, projectName, protocolId, fetchLaunches, fetchProtocolDetails]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const labels = useMemo(() => (details ? extractProtocolParamLabels(details) : {}), [details]);

  const entries = useMemo<Entry[]>(() => {
    const items: Entry[] = (launches ?? []).map((launch) => ({
      key: String(launch.id),
      title: formatWhen(launch.launchedAt),
      subtitle: launch.user?.name ? `by ${launch.user.name}` : "",
      mode: launch.mode,
      params: extractProtocolParams({ values: launch.params }),
    }));
    return items;
  }, [launches]);

  if (!open) return null;

  const { rows, previous } = historyRows(entries, selected, labels);
  const changedCount = rows.filter((row) => row.changed).length;
  const shown = showAll || !previous ? rows : rows.filter((row) => row.changed);

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-label="Parameter history"
        className="flex h-[min(80vh,720px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-app-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-app-text">
              <History className="h-4 w-4" /> Parameter history
            </h2>
            <p className="truncate text-xs text-app-subtle">#{protocolId} {protocolLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-app-muted hover:bg-app-hover" aria-label="Close the parameter history">
            <X className="h-4 w-4" />
          </button>
        </header>

        {error ? (
          <p className="p-5 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : launches === null ? (
          <p className="p-5 text-sm text-app-subtle">Loading…</p>
        ) : launches.length === 0 ? (
          <p className="p-5 text-sm text-app-subtle">
            This protocol has no launches kept yet: its parameters are kept from its next launch on.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1">
            <ul className="w-72 flex-none overflow-y-auto border-r border-app-border py-2" aria-label="Launches">
              {entries.map((entry, index) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    aria-current={index === selected}
                    className={`block w-full px-4 py-2 text-left ${index === selected ? "bg-app-selected" : "hover:bg-app-hover"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-app-text">{entry.title}</span>
                      {entry.mode && (
                        <span className={`flex-none rounded px-1.5 text-[10px] font-semibold uppercase ${MODE_STYLE[entry.mode] ?? "bg-app-surface-3 text-app-muted"}`}>
                          {entry.mode}
                        </span>
                      )}
                    </span>
                    {entry.subtitle && <span className="block truncate text-xs text-app-subtle">{entry.subtitle}</span>}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-app-subtle">
                <span>
                  {previous
                    ? `${changedCount} parameter${changedCount === 1 ? "" : "s"} changed since ${previous.title}`
                    : "The first launch kept: every parameter"}
                </span>
                {previous && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={showAll} onChange={() => setShowAll((value) => !value)} className="accent-blue-600" />
                    Show all parameters
                  </label>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                {shown.length === 0 ? (
                  <p className="py-6 text-center text-sm text-app-subtle">Same parameters as the launch before.</p>
                ) : (
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-app-subtle">
                        <th className="w-2/5 py-2 pr-3 font-semibold">Parameter</th>
                        {previous && <th className="py-2 pr-3 font-semibold">Before</th>}
                        <th className="py-2 font-semibold">{previous ? "After" : "Value"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row) => (
                        <tr key={row.name} className={`border-t border-app-border ${previous && row.changed ? "bg-amber-50 dark:bg-amber-900/20" : ""}`}>
                          <td className="py-1.5 pr-3 align-top">
                            <span className="block truncate text-app-text" title={row.name}>{row.label}</span>
                          </td>
                          {previous && <td className="break-words py-1.5 pr-3 align-top text-app-muted">{row.leftValue || "—"}</td>}
                          <td className="break-words py-1.5 align-top text-app-text">{row.rightValue || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
