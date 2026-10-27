import { useId, useState } from "react";
import Popover from "@mui/material/Popover";
import { SlidersHorizontal } from "lucide-react";
import { MONITOR_SECTIONS, type MonitorMode, type MonitorSection, type SectionVisibility } from "./monitor-view-preferences";

export default function CustomizeMonitorView({ mode, visibility, onChange, onRestore }: {
  mode: MonitorMode;
  visibility: SectionVisibility;
  onChange: (section: MonitorSection, visible: boolean) => void;
  onRestore: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const id = useId();
  return (
    <>
      <button type="button" aria-expanded={Boolean(anchor)} aria-controls={anchor ? id : undefined}
              aria-haspopup="dialog" onClick={(event) => setAnchor(event.currentTarget)}
              className="flex items-center gap-1.5 rounded-lg border border-app-border bg-app-surface px-2.5 py-1 text-sm text-app-text hover:bg-app-hover">
        <SlidersHorizontal className="h-4 w-4" />Customize view
      </button>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
               container={anchor?.ownerDocument.body} disableScrollLock
               anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
               transformOrigin={{ vertical: "top", horizontal: "right" }}
               slotProps={{ paper: { sx: { mt: 1, width: 280, maxHeight: "min(560px, 80vh)",
                 backgroundColor: "var(--app-surface)", color: "var(--app-text)",
                 border: "1px solid var(--app-border)", borderRadius: 2 } } }}>
        <div id={id} role="dialog" aria-label="Customize monitor view" className="p-3">
          <h2 className="text-sm font-semibold">Visible sections</h2>
          <p className="mt-1 text-xs text-app-muted">{mode === "spa" ? "Single particle" : "Tomography"} · Your view in this browser</p>
          <div className="my-3 flex flex-col gap-0.5">
            {MONITOR_SECTIONS[mode].map(([section, label]) => (
              <label key={section} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-app-hover">
                <input type="checkbox" checked={visibility[section] !== false}
                       onChange={(event) => onChange(section, event.target.checked)} className="accent-app-accent" />
                {label}
              </label>
            ))}
          </div>
          <p className="border-t border-app-border pt-2 text-xs text-app-muted">
            Sections appear when data is available. Hidden sections still generate alerts.
          </p>
          <button type="button" onClick={onRestore} className="mt-2 rounded px-2 py-1.5 text-xs text-app-accent hover:bg-app-hover">
            Restore default view
          </button>
        </div>
      </Popover>
    </>
  );
}
