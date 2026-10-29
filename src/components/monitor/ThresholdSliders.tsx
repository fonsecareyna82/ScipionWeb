import { useRef } from "react";
import Slider from "@mui/material/Slider";
import type { StreamingMonitorThresholdName, StreamingMonitorThresholds } from "@/services/ProjectService";
import { THRESHOLD_LABELS, thresholdUnit } from "./streaming-monitor-data";

export type ThresholdChanges = Partial<StreamingMonitorThresholds>;

const DEFAULT_MAX: Partial<Record<StreamingMonitorThresholdName, number>> = {
  minDefocus: 50000, maxDefocus: 50000, maxAstigmatism: 5000, maxResolution: 20,
  maxTotalDrift: 100, maxFrameShift: 30, minParticles: 1000, maxDoseDifference: 20,
  minTilts: 100, maxResidual: 10,
};

/** Keep the travel fixed while dragging, including unusually large saved thresholds. */
export default function ThresholdSliders({ names, thresholds, bounds, onChange, disabled = false }: {
  names: StreamingMonitorThresholdName[];
  thresholds: StreamingMonitorThresholds | null;
  bounds: StreamingMonitorThresholds | null;
  onChange?: (changes: ThresholdChanges) => void;
  disabled?: boolean;
}) {
  const domains = useRef<Record<string, number>>({});
  if (!thresholds || !onChange || !names.length) return null;
  // Saving a dragged value must not rescale the track underneath the pointer. Only an
  // external value beyond the current domain needs more room (for example a form edit).
  const domainMax = (key: string, fallback: number, limits: StreamingMonitorThresholdName[]) => {
    const largest = Math.max(0, ...limits.flatMap((name) => [bounds?.[name] ?? 0, thresholds[name] ?? 0]));
    const current = domains.current[key];
    if (current === undefined || largest > current) {
      domains.current[key] = Math.max(current ?? fallback, largest * 2);
    }
    return domains.current[key];
  };
  const defocusRange = names.includes("minDefocus") && names.includes("maxDefocus");
  const rangeMax = domainMax("defocusRange", 50000, ["minDefocus", "maxDefocus"]);
  const lower = thresholds.minDefocus ?? 10;
  const upper = thresholds.maxDefocus ?? rangeMax;
  const rangeEnabled = thresholds.minDefocus != null || thresholds.maxDefocus != null;
  return (
    <div className="flex flex-col gap-2 px-1 py-2" aria-label="Plot thresholds">
      {defocusRange ? (
        <div className="flex flex-col gap-1 text-[13px] text-app-muted" role="group" aria-label="Defocus range">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" aria-label="Enable defocus range" checked={rangeEnabled} disabled={disabled}
                     onChange={(event) => {
                       const min = bounds?.minDefocus ?? 1000;
                       onChange(event.target.checked
                         ? { minDefocus: min, maxDefocus: Math.max(bounds?.maxDefocus ?? 40000, min + 10) }
                         : { minDefocus: null, maxDefocus: null });
                     }} />
              Defocus range
            </label>
            <span className="tabular-nums text-app-text">
              {thresholds.minDefocus == null ? "Off" : thresholds.minDefocus}
              {" – "}
              {thresholds.maxDefocus == null ? "Off" : thresholds.maxDefocus} Å
            </span>
          </div>
          <div className="px-2">
            <Slider min={10} max={rangeMax} step={10} value={[lower, upper]} disableSwap
                    disabled={disabled || !rangeEnabled}
                    getAriaLabel={(index) => index === 0 ? "Defocus below slider" : "Defocus above slider"}
                    onChange={(_, value, activeThumb) => {
                      const [min, max] = value as number[];
                      onChange(activeThumb === 0
                        ? { minDefocus: Math.min(min, upper - 10) }
                        : { maxDefocus: Math.max(max, lower + 10) });
                    }}
                    sx={{ color: "var(--app-accent)", py: 1, height: 4,
                      "& .MuiSlider-thumb": { width: 14, height: 14 },
                      "& .MuiSlider-rail": { backgroundColor: "var(--app-border)", opacity: 1 } }} />
          </div>
        </div>
      ) : null}
      {names.filter((name) => !defocusRange || (name !== "minDefocus" && name !== "maxDefocus")).map((name) => {
        const value = thresholds[name];
        const step = name.includes("Defocus") || name === "maxAstigmatism" ? 10
          : name === "minParticles" || name === "minTilts" ? 1 : name === "maxResidual" ? 0.01 : 0.1;
        const max = domainMax(name, DEFAULT_MAX[name] ?? 100, [name]);
        const label = THRESHOLD_LABELS[name];
        return (
          <div key={name} className="flex flex-wrap items-center gap-2 text-[13px] text-app-muted">
            <div className="flex items-center gap-1.5">
              <input type="checkbox" checked={value != null} disabled={disabled}
                     aria-label={`Enable ${label}`}
                     onChange={(event) => onChange({ [name]: event.target.checked ? bounds?.[name] ?? max / 2 : null })} />
              <span>{label}</span>
            </div>
            <input type="range" min={step} max={max} step={step} value={value ?? step}
                   aria-label={`${label} slider`} aria-valuetext={value == null ? "Disabled" : `${value} ${thresholdUnit(name)}`}
                   className="min-w-20 flex-1 accent-app-accent" disabled={disabled || value == null}
                   onChange={(event) => onChange({ [name]: Number(event.target.value) })} />
            <span className="min-w-20 text-right tabular-nums text-app-text">
              {value == null ? "Off" : `${Number(value.toFixed(2))} ${thresholdUnit(name)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Only replace alerts for the limits being edited; other alerts still come from the server. */
export function previewAlerts(
  alerts: StreamingMonitorThresholdName[], changes: ThresholdChanges,
  values: Partial<Record<StreamingMonitorThresholdName, number | undefined>>,
): StreamingMonitorThresholdName[] {
  const result = alerts.filter((name) => !(name in changes));
  for (const name of Object.keys(changes) as StreamingMonitorThresholdName[]) {
    const limit = changes[name];
    const value = values[name];
    if (limit == null || value == null || !Number.isFinite(value)) continue;
    if (name.startsWith("min") ? value < limit : value > limit) result.push(name);
  }
  return result;
}
