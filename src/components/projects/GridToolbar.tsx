// Grid view tools: filter cards by status (the rest fades, nothing moves),
// show the whole lineage of the selected protocol, and follow running ones.
import { Panel } from "reactflow";
import type { GridStatusCategory } from "@/utils/graph_utils";

export const GRID_STATUS_FILTERS: Array<{ id: GridStatusCategory; label: string; color: string }> = [
  { id: "running", label: "Running", color: "#0ea5e9" },
  { id: "launched", label: "Launched", color: "#6366f1" },
  { id: "scheduled", label: "Scheduled", color: "#a855f7" },
  { id: "interactive", label: "Interactive", color: "#14b8a6" },
  { id: "failed", label: "Failed", color: "#ef4444" },
  { id: "aborted", label: "Aborted", color: "#f97316" },
  { id: "finished", label: "Finished", color: "#22c55e" },
  { id: "saved", label: "Saved", color: "#94a3b8" },
  { id: "new", label: "New", color: "#cbd5e1" },
];

type Props = {
  counts: Record<GridStatusCategory, number>;
  statusFilter: ReadonlySet<GridStatusCategory>;
  onToggleStatus: (status: GridStatusCategory) => void;
  onClearStatus: () => void;
  lineage: boolean;
  onToggleLineage: () => void;
  followRunning: boolean;
  onToggleFollowRunning: () => void;
  dark?: boolean;
};

export default function GridToolbar({
  counts, statusFilter, onToggleStatus, onClearStatus, lineage, onToggleLineage,
  followRunning, onToggleFollowRunning, dark = false,
}: Props) {
  const surface = dark ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.94)";
  const border = dark ? "rgba(148, 163, 184, 0.3)" : "#dbe2ea";
  const text = dark ? "#e2e8f0" : "#1f2937";
  const muted = dark ? "#94a3b8" : "#64748b";

  const chip = (active: boolean, accent: string) => ({
    display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px",
    borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? accent : border}`,
    background: active ? `${accent}22` : "transparent", color: text,
  } as const);

  return (
    <Panel position="top-left">
      <div
        role="toolbar"
        aria-label="Grid tools"
        style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: 6,
          borderRadius: 12, background: surface, border: `1px solid ${border}`,
          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
        }}
      >
        {GRID_STATUS_FILTERS.filter((filter) => counts[filter.id] > 0 || statusFilter.has(filter.id)).map((filter) => {
          const active = statusFilter.has(filter.id);
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={active}
              title={`Highlight ${filter.label.toLowerCase()} protocols`}
              onClick={() => onToggleStatus(filter.id)}
              style={chip(active, filter.color)}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: filter.color }} />
              {filter.label}
              <span style={{ color: muted, fontWeight: 500 }}>{counts[filter.id]}</span>
            </button>
          );
        })}
        {statusFilter.size > 0 && (
          <button type="button" onClick={onClearStatus} title="Show all protocols"
            style={{ ...chip(false, muted), color: muted }}>
            Clear
          </button>
        )}
        <span style={{ width: 1, height: 20, background: border, margin: "0 2px" }} aria-hidden="true" />
        <button type="button" aria-pressed={lineage} onClick={onToggleLineage} style={chip(lineage, "#f59e0b")}
          title="Mark every ancestor and descendant of the selected protocol (L)">
          Lineage
        </button>
        <button type="button" aria-pressed={followRunning} onClick={onToggleFollowRunning}
          style={chip(followRunning, "#0ea5e9")} title="Keep the running protocols in view">
          Follow running
        </button>
      </div>
    </Panel>
  );
}
