// Protocol viewers (desktop "Analyze results"): their runtime forms when the
// server allows it, otherwise the static description of each viewer.
import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
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

export default function ProtocolViewerDiscoveryDialog({ open, onClose, projectId, protocolId, protocolLabel }: Props) {
  const service = useProjectService();
  const [viewers, setViewers] = useState<ProtocolViewerCandidate[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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
  }, [open, projectId, protocolId, service]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="protocol-analysis-title">
      <DialogTitle id="protocol-analysis-title">Analyze protocol results</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {runtimePreviewAvailable
            ? "Choose the options and press the eye next to what you want to see."
            : "Protocol-level viewers are independent of the selected output. Opening them on the web is not enabled on this server."}
        </Typography>
        {loading && <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><CircularProgress size={18} /><Typography>Loading protocol viewers...</Typography></Box>}
        {!loading && error && <Typography role="alert">Could not load protocol viewers.</Typography>}
        {!loading && !error && viewers.length === 0 && (
          <Typography>No protocol viewers registered for this protocol.</Typography>
        )}
        {!loading && !error && viewers.map((viewer, index) => {
          const displayName = typeof viewer.name === "string" && viewer.name.length <= 160 && viewer.name.length > 0
            ? viewer.name : typeof viewer.id === "string" && viewer.id.length <= 160 ? viewer.id : "Unnamed viewer";
          const preview = describeProtocolViewerPreview(viewer);
          const actionStatuses = describeProtocolViewerWebActionStatuses(viewer.webActionContracts, preview.actions);
          const isExpanded = expanded === index;
          return (
            <Box key={`${viewer.id ?? viewer.name ?? "viewer"}-${index}`} sx={{ py: 1, borderBottom: "1px solid #ddd" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2">{displayName}</Typography>
                  {!runtimePreviewAvailable && (
                    <Typography variant="caption" color="text.secondary">Web integration pending</Typography>
                  )}
                </Box>
                <Button size="small" variant="outlined" aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Hide" : "Show"} details for ${displayName}`}
                  onClick={() => setExpanded(isExpanded ? null : index)}>
                  {isExpanded ? "Close" : runtimePreviewAvailable ? "Open" : "View details"}
                </Button>
              </Box>
              {isExpanded && runtimePreviewAvailable && typeof service.fetchProtocolViewerRuntimePreview === "function" &&
                validRuntimeViewerId(viewer.id) && (
                  <ProtocolViewerRuntimePreviewPanel
                    key={`${projectId}/${protocolId}/${viewer.id}`}
                    service={service}
                    projectId={String(projectId)}
                    protocolId={String(protocolId)}
                    viewerId={viewer.id}
                    protocolLabel={protocolLabel ?? ""}
                  />
              )}
              {isExpanded && !runtimePreviewAvailable && (
                <Box sx={{ pl: 1, py: 1 }} data-testid="protocol-viewer-details">
                  <Typography variant="body2">Contract: {preview.status}</Typography>
                  <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
                    Static preview only. No controls or visualization actions are executable.
                  </Typography>
                  {!preview.hasStaticForm && (
                    <Typography variant="body2">No static form description available.</Typography>
                  )}
                  {preview.hasStaticForm && preview.sections.length === 0 && (
                    <Typography variant="body2">No public fields could be described.</Typography>
                  )}
                  {preview.sections.map((section, sIndex) => (
                    <Box key={`${sIndex}-${section.label}`} sx={{ mt: 1 }}>
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
                </Box>
              )}
            </Box>
          );
        })}
        <Typography variant="caption" sx={{ display: "block", mt: 2 }}>
          To analyze a specific output, use Analyze output in the Outputs tab.
        </Typography>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
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
