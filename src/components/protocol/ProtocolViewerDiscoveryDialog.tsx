// Protocol viewers (desktop "Analyze results"): their runtime forms when the
// server allows it, otherwise the static description of each viewer.
import { useEffect, useState, type ReactNode } from "react";
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Paper, Tooltip, Typography,
} from "@mui/material";
import { AlertTriangle, BarChart3, ChevronRight, Eye, Info, LayoutList, X } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import ProtocolViewerRuntimePreviewPanel from "./ProtocolViewerRuntimePreviewPanel";
import { validRuntimeViewerId } from "@/utils/protocol_viewer_runtime_preview";
import type { ProtocolViewerCandidate } from "@/services/ProjectService";
import { describeProtocolViewerPreview } from "@/utils/protocol_viewer_preview";
import { describeProtocolViewerWebActionStatuses } from "@/utils/protocol_viewer_web_action_status";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: number | string | null;
  protocolId: number | string | null;
  protocolLabel?: string;
};

const HEADER_BG = "#333d49";
const SURFACE_BG = "#f8fafc";
const BORDER = "rgba(148, 163, 184, 0.45)";

function viewerDisplayName(viewer: ProtocolViewerCandidate): string {
  if (typeof viewer.name === "string" && viewer.name.length > 0 && viewer.name.length <= 160) return viewer.name;
  if (typeof viewer.id === "string" && viewer.id.length <= 160) return viewer.id;
  return "Unnamed viewer";
}

/** The plugin package a viewer comes from, e.g. "xmipp3". */
function viewerPlugin(viewer: ProtocolViewerCandidate): string {
  return typeof viewer.id === "string" && viewer.id.includes(".") ? viewer.id.split(".")[0] : "";
}

export default function ProtocolViewerDiscoveryDialog({ open, onClose, projectId, protocolId, protocolLabel }: Props) {
  const service = useProjectService();
  const [viewers, setViewers] = useState<ProtocolViewerCandidate[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [runtimePreviewAvailable, setRuntimePreviewAvailable] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setViewers([]);
    setExpanded(null);
    setError(false);
    setRuntimePreviewAvailable(false);
    const project = String(projectId ?? "");
    const protocol = String(protocolId ?? "");
    if (!/^\d+$/.test(project) || Number(project) < 1 ||
        !/^\d+$/.test(protocol) || Number(protocol) < 1 ||
        typeof service.fetchProtocolViewerCandidates !== "function") {
      setError(true);
      return () => { cancelled = true; };
    }
    setLoading(true);
    service.fetchProtocolViewerCandidates(project, protocol)
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result.viewers)) {
          setError(true);
          return;
        }
        const runtime = result.runtimePreviewAvailable === true;
        const listed = result.viewers.slice(0, 48).filter(
          (entry): entry is ProtocolViewerCandidate =>
            !!entry && typeof entry === "object" &&
            (typeof entry.id === "string" || typeof entry.name === "string"),
        );
        setRuntimePreviewAvailable(runtime);
        setViewers(listed);
        // A single viewer opens directly, as on the desktop.
        if (runtime && listed.length === 1) setExpanded(0);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, projectId, protocolId, service, reloadKey]);

  const selected = expanded !== null ? viewers[expanded] : undefined;
  const showSidebar = !loading && !error && viewers.length > 0 && (viewers.length > 1 || !runtimePreviewAvailable);
  const subtitle = [protocolLabel, protocolId ? `Protocol ${protocolId}` : ""].filter(Boolean).join(" · ");

  let main: ReactNode;
  if (loading) {
    main = <CenteredState icon={<CircularProgress size={28} />} title="Loading protocol viewers..." />;
  } else if (error) {
    main = (
      <CenteredState
        icon={<AlertTriangle size={30} color="#dc2626" />}
        title="Could not load protocol viewers."
        text="The server did not answer. Check the connection and try again."
        action={<Button size="small" variant="outlined" onClick={() => setReloadKey(key => key + 1)}
          sx={{ textTransform: "none" }}>Try again</Button>}
      />
    );
  } else if (viewers.length === 0) {
    main = (
      <CenteredState
        icon={<Info size={30} color="#64748b" />}
        title="No protocol viewers registered for this protocol."
        text="Its outputs can still be analyzed from the Outputs tab."
      />
    );
  } else if (!selected) {
    main = (
      <CenteredState
        icon={<LayoutList size={30} color="#64748b" />}
        title={runtimePreviewAvailable ? "Choose a viewer" : "Choose a viewer to see its description"}
        text={`${viewers.length} viewer${viewers.length === 1 ? "" : "s"} available for this protocol.`}
      />
    );
  } else if (runtimePreviewAvailable && typeof service.fetchProtocolViewerRuntimePreview === "function" &&
      validRuntimeViewerId(selected.id)) {
    main = (
      <ProtocolViewerRuntimePreviewPanel
        key={`${projectId}/${protocolId}/${selected.id}`}
        service={service}
        projectId={String(projectId)}
        protocolId={String(protocolId)}
        viewerId={selected.id}
        viewerName={viewerDisplayName(selected)}
        protocolLabel={protocolLabel ?? ""}
      />
    );
  } else if (runtimePreviewAvailable) {
    main = (
      <CenteredState icon={<AlertTriangle size={30} color="#d97706" />}
        title="This viewer cannot be opened on the web." />
    );
  } else {
    main = <StaticViewerDetails viewer={selected} />;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={showSidebar ? "md" : "sm"}
      // Results open in floating windows in front of this dialog and must
      // keep the keyboard focus (e.g. the metadata viewer's search fields).
      disableEnforceFocus
      className="sfw-launcher-dialog"
      aria-labelledby="protocol-analysis-title"
      PaperProps={{
        sx: {
          borderRadius: 2,
          overflow: "hidden",
          height: "min(80vh, 760px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 22px 70px rgba(15, 23, 42, 0.35)",
          border: "1px solid rgba(15, 23, 42, 0.12)",
        },
      }}
    >
      <DialogTitle
        component="div"
        id="protocol-analysis-header"
        sx={{ px: 2.25, py: 1.4, bgcolor: HEADER_BG, color: "#f8fafc", display: "flex", alignItems: "center", gap: 1.5 }}
      >
        <Box sx={{
          width: 36, height: 36, borderRadius: 1.5, display: "grid", placeItems: "center", flex: "0 0 auto",
          bgcolor: "rgba(255, 255, 255, 0.1)", border: "1px solid rgba(255, 255, 255, 0.16)",
        }}>
          <BarChart3 size={19} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id="protocol-analysis-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.3 }}>
            Analyze protocol results
          </Typography>
          {subtitle && (
            <Typography noWrap sx={{ fontSize: "0.78rem", color: "#cbd5e1" }}>{subtitle}</Typography>
          )}
        </Box>
        <Tooltip title="Close">
          <IconButton aria-label="Close dialog" onClick={onClose} size="small"
            sx={{ color: "#e2e8f0", "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)" } }}>
            <X size={18} />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: SURFACE_BG, display: "flex", minHeight: 0, flex: 1 }}>
        {showSidebar && (
          <Box component="nav" aria-label="Protocol viewers" sx={{
            width: 248, flex: "0 0 auto", bgcolor: "#ffffff", borderRight: `1px solid ${BORDER}`,
            overflowY: "auto", py: 1.25,
          }}>
            <Typography sx={{ px: 2, pb: 1, fontSize: "0.7rem", fontWeight: 700, letterSpacing: 0.6,
              textTransform: "uppercase", color: "#64748b" }}>
              Viewers
            </Typography>
            {viewers.map((viewer, index) => {
              const displayName = viewerDisplayName(viewer);
              const isExpanded = expanded === index;
              const plugin = viewerPlugin(viewer);
              return (
                <Box
                  key={`${viewer.id ?? viewer.name ?? "viewer"}-${index}`}
                  component="button"
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Hide" : "Show"} details for ${displayName}`}
                  onClick={() => setExpanded(isExpanded ? null : index)}
                  sx={{
                    all: "unset", boxSizing: "border-box", cursor: "pointer", width: "100%",
                    display: "flex", alignItems: "center", gap: 1, px: 2, py: 1,
                    borderLeft: "3px solid", borderColor: isExpanded ? HEADER_BG : "transparent",
                    bgcolor: isExpanded ? "#eef2f6" : "transparent",
                    "&:hover": { bgcolor: isExpanded ? "#eef2f6" : "#f1f5f9" },
                    "&:focus-visible": { outline: `2px solid ${HEADER_BG}`, outlineOffset: -2 },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: "0.86rem", fontWeight: isExpanded ? 700 : 600, color: "#0f172a" }}>
                      {displayName}
                    </Typography>
                    {plugin && <Typography noWrap sx={{ fontSize: "0.72rem", color: "#64748b" }}>{plugin}</Typography>}
                    {!runtimePreviewAvailable && (
                      <Typography sx={{ fontSize: "0.72rem", color: "#b45309" }}>Web integration pending</Typography>
                    )}
                  </Box>
                  <ChevronRight size={15} color={isExpanded ? HEADER_BG : "#94a3b8"} />
                </Box>
              );
            })}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {main}
        </Box>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2.25, py: 1.25, bgcolor: SURFACE_BG, justifyContent: "space-between", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#475569", minWidth: 0 }}>
          {runtimePreviewAvailable ? <Eye size={16} /> : <Info size={16} />}
          <Typography sx={{ fontSize: "0.8rem" }}>
            {runtimePreviewAvailable
              ? "Set the options and press the eye to open the result."
              : "To analyze a specific output, use Analyze output in the Outputs tab."}
          </Typography>
        </Box>
        <Button onClick={onClose} variant="contained"
          sx={{ textTransform: "none", bgcolor: HEADER_BG, "&:hover": { bgcolor: "#25303b" } }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type CenteredStateProps = { icon: ReactNode; title: string; text?: string; action?: ReactNode };

function CenteredState({ icon, title, text, action }: CenteredStateProps) {
  return (
    <Box role={title.startsWith("Loading") ? "status" : undefined} sx={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 1, p: 4, textAlign: "center",
    }}>
      {icon}
      <Typography sx={{ fontWeight: 600, color: "#1e293b" }}>{title}</Typography>
      {text && <Typography variant="body2" sx={{ color: "#64748b", maxWidth: 420 }}>{text}</Typography>}
      {action}
    </Box>
  );
}

function StaticViewerDetails({ viewer }: { viewer: ProtocolViewerCandidate }) {
  const preview = describeProtocolViewerPreview(viewer);
  const actionStatuses = describeProtocolViewerWebActionStatuses(viewer.webActionContracts, preview.actions);
  return (
    <Box sx={{ overflowY: "auto", p: 2.5 }}>
      <Paper variant="outlined" sx={{ p: 2, borderColor: BORDER }} data-testid="protocol-viewer-details">
        <Typography sx={{ fontWeight: 700, color: "#0f172a" }}>{viewerDisplayName(viewer)}</Typography>
        <Typography variant="body2" sx={{ color: "#475569" }}>Contract: {preview.status}</Typography>
        <Typography variant="caption" sx={{ display: "block", mb: 1, color: "#64748b" }}>
          Static preview only. No controls or visualization actions are executable.
        </Typography>
        {!preview.hasStaticForm && (
          <Typography variant="body2">No static form description available.</Typography>
        )}
        {preview.hasStaticForm && preview.sections.length === 0 && (
          <Typography variant="body2">No public fields could be described.</Typography>
        )}
        {preview.sections.map((section, sIndex) => (
          <Box key={`${sIndex}-${section.label}`} sx={{ mt: 1.5 }}>
            <Typography variant="subtitle2">Section: {section.label}</Typography>
            {section.fields.map((field) => <PreviewField key={field.name} field={field} />)}
            {section.groups.map((group, gIndex) => (
              <Box key={`${gIndex}-${group.label}`} sx={{ pl: 2, mt: 1 }}>
                <Typography variant="subtitle2">Group: {group.label}</Typography>
                {group.fields.map((field) => <PreviewField key={field.name} field={field} />)}
              </Box>
            ))}
          </Box>
        ))}
        <Typography variant="subtitle2" sx={{ mt: 2 }}>Actions (preview only)</Typography>
        {preview.actions.length === 0 && <Typography variant="body2">No statically described actions.</Typography>}
        {preview.actions.map((action) => (
          <Box key={action.id} data-testid={`protocol-web-action-${action.id}`}>
            <Typography variant="body2">{action.label} — not executable</Typography>
            {actionStatuses.get(action.id) && (
              <Typography variant="caption" sx={{ display: "block" }}>
                {actionStatuses.get(action.id)?.label}
              </Typography>
            )}
            {actionStatuses.get(action.id) && (
              <Typography variant="caption" sx={{ display: "block" }}>
                Blockers: {actionStatuses.get(action.id)?.blockers.join(", ")}
              </Typography>
            )}
          </Box>
        ))}
        {(preview.dynamicSkipped > 0 || preview.hiddenCount > 0) && (
          <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
            {preview.dynamicSkipped} dynamic definitions skipped; {preview.hiddenCount} hidden fields omitted.
          </Typography>
        )}
        {preview.issues.length > 0 && (
          <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
            Contract issues: {preview.issues.join(", ")}
          </Typography>
        )}
        {preview.blockers.length > 0 && (
          <Typography variant="caption" sx={{ display: "block" }}>
            Pending checks: {preview.blockers.join(", ")}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}

type PreviewFieldProps = {
  field: ReturnType<typeof describeProtocolViewerPreview>["sections"][number]["fields"][number];
};

function PreviewField({ field }: PreviewFieldProps) {
  return (
    <Box sx={{ pl: 2, mt: 0.5 }}>
      <Typography variant="body2">{field.label}</Typography>
      <Typography variant="caption" sx={{ display: "block" }}>Control: {field.control}</Typography>
      {field.choices && <Typography variant="caption" sx={{ display: "block" }}>Options: {field.choices.join(", ")}</Typography>}
      {field.defaultValue !== undefined && <Typography variant="caption" sx={{ display: "block" }}>Default: {field.defaultValue}</Typography>}
      {field.help && <Typography variant="caption" sx={{ display: "block" }}>{field.help}</Typography>}
      {field.hasCondition && <Typography variant="caption" sx={{ display: "block" }}>Conditional field (not evaluated)</Typography>}
      {field.unresolvedDefault && <Typography variant="caption" sx={{ display: "block" }}>Default requires runtime evaluation</Typography>}
    </Box>
  );
}
