import type { TimePreset, TimeSelection } from "./monitor-time-range";

export default function MonitorTimeRangeSelector({ selection, onChange }: {
  selection: TimeSelection;
  onChange: (preset: TimePreset) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-app-muted"
           title="Applies to charts, distributions, tables and the tomography summary. Times are recorded by Scipion, not microscope acquisition times. Completed sessions count back from their latest recorded item. Items without timestamps are excluded from timed ranges.">
      <span>Time range</span>
      <select aria-label="Chart time range" value={selection.custom ? "custom" : selection.preset}
              onChange={(event) => { if (event.target.value !== "custom") onChange(event.target.value as TimePreset); }}
              className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-xs text-app-text">
        <option value="all">Entire session</option>
        <option value="30m">Last 30 min</option>
        <option value="2h">Last 2 h</option>
        {selection.custom ? <option value="custom">{selection.custom.kind === "time" ? "Custom time range" : "Custom item range"}</option> : null}
      </select>
    </label>
  );
}
