// The thresholds that turn the CTF and drift of a micrograph into an alert. An empty field raises none.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { StreamingMonitorThresholdName, StreamingMonitorThresholds } from "@/services/ProjectService";
import { isQualityWindowSize, MAX_QUALITY_WINDOW } from "./quality-window-preferences";
import { THRESHOLD_LABELS, THRESHOLD_ORDER, thresholdUnit } from "./streaming-monitor-data";

type Props = {
  thresholds: StreamingMonitorThresholds;
  onSave: (thresholds: Partial<StreamingMonitorThresholds>, summaryWindowSize?: number) => Promise<void>;
  summaryWindowSize?: number;
  summaryUnit?: "movies" | "micrographs" | "tilt series";
  onCancel: () => void;
  /** Where the dialog goes: the body of the window the monitor is in. */
  container?: HTMLElement;
  /** The thresholds of the view the monitor shows. */
  names?: StreamingMonitorThresholdName[];
};

function toText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export default function StreamingMonitorThresholdsDialog({ thresholds, onSave, onCancel, container,
                                                           names = THRESHOLD_ORDER, summaryWindowSize, summaryUnit = "micrographs" }: Props) {
  const [summarySize, setSummarySize] = useState(() => String(summaryWindowSize ?? ""));
  const [values, setValues] = useState<Record<StreamingMonitorThresholdName, string>>(() =>
    Object.fromEntries(names.map((name) => [name, toText(thresholds[name])])) as
      Record<StreamingMonitorThresholdName, string>);
  const previousThresholds = useRef(thresholds);
  useEffect(() => {
    const previous = previousThresholds.current;
    previousThresholds.current = thresholds;
    setValues((current) => {
      const next = { ...current };
      let changed = false;
      for (const name of names) {
        if (current[name] === toText(previous[name]) && current[name] !== toText(thresholds[name])) {
          next[name] = toText(thresholds[name]);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [thresholds, names]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const view = container?.ownerDocument.defaultView ?? window;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    view.addEventListener("keydown", onKey);
    return () => view.removeEventListener("keydown", onKey);
  }, [onCancel, container]);

  const save = async () => {
    if (summaryWindowSize !== undefined && !isQualityWindowSize(Number(summarySize))) {
      setError("Quality summary window: enter a positive whole number up to 5000");
      return;
    }
    const changed: Partial<StreamingMonitorThresholds> = {};
    for (const name of names) {
      const text = values[name].trim();
      if (!text) {
        changed[name] = null;
        continue;
      }
      const number = Number(text);
      if (!Number.isFinite(number) || number <= 0) {
        setError(`${THRESHOLD_LABELS[name]}: a positive number, or empty for no alert`);
        return;
      }
      changed[name] = number;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(changed, summaryWindowSize === undefined ? undefined : Number(summarySize));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The thresholds could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/30 p-4" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-label="Monitor thresholds"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-app-border bg-app-surface shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <h2 className="text-[15px] font-semibold text-app-text">Monitor settings</h2>
          <button type="button" aria-label="Close" className="text-app-subtle hover:text-app-text" onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
          {summaryWindowSize !== undefined ? (
            <div className="flex flex-col gap-2 border-b border-app-border pb-4">
              <h3 className="text-[15px] font-semibold text-app-text">Quality summary</h3>
              <label className="flex items-center justify-between gap-3 text-[15px] text-app-text">
                <span>Recent window <span className="text-app-subtle">({summaryUnit})</span></span>
                <input type="number" min={1} max={MAX_QUALITY_WINDOW} step={1} inputMode="numeric" aria-label="Quality summary window"
                       className="w-32 rounded-lg border border-app-border bg-app-surface-2 px-2 py-1 text-right text-app-text"
                       value={summarySize} onChange={(event) => setSummarySize(event.target.value)} />
              </label>
              <p className="text-[13px] text-app-muted">
                Number of recent {summaryUnit} per window. Compared with the previous window of the same size.
              </p>
            </div>
          ) : null}
          <h3 className="text-[15px] font-semibold text-app-text">Alert thresholds</h3>
          <p className="text-[13px] text-app-muted">
            For every user of this project. Leave a field empty to raise no alert.
          </p>
          {names.map((name) => (
            <label key={name} className="flex items-center justify-between gap-3 text-[15px] text-app-text">
              <span>{THRESHOLD_LABELS[name]} <span className="text-app-subtle">({thresholdUnit(name)})</span></span>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                aria-label={THRESHOLD_LABELS[name]}
                className="w-32 rounded-lg border border-app-border bg-app-surface-2 px-2 py-1 text-right text-app-text"
                value={values[name]}
                onChange={(event) => setValues((previous) => ({ ...previous, [name]: event.target.value }))}
              />
            </label>
          ))}
          {error ? <div className="text-[13px] text-red-600 dark:text-red-400" role="alert">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-app-border px-4 py-3">
          <button type="button" className="rounded-lg px-3 py-1.5 text-[15px] text-app-muted hover:bg-app-hover" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={saving}
                  className="rounded-lg bg-app-accent px-3 py-1.5 text-[15px] font-medium text-white disabled:opacity-60"
                  onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    container ?? document.body,
  );
}
