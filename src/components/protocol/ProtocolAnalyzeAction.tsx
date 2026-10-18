// "Analyze results" of a stored protocol, as the desktop offers it: shown only
// when the protocol has outputs and a viewer the dialog can open, or when it is
// an Xmipp picking protocol (the button then reopens its picker).
import { useEffect, useMemo, useState } from "react";
import { Button, Tooltip } from "@mui/material";
import { BarChart3 } from "lucide-react";

import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import { isXmippPickingProtocol, xmippPickingSource } from "@/components/picking/xmippPickingSource";
import { useProjectService } from "@/ProjectServiceContext";
import { openableProtocolViewers } from "@/utils/protocol_viewer_runtime_preview";
import ProtocolViewerDiscoveryDialog from "./ProtocolViewerDiscoveryDialog";

// While these run (or before they run) the picker belongs to Launch, not here.
const NOT_PICKABLE_STATUSES = ["running", "launched", "scheduled", "new", "saved", ""];

type Props = {
  projectId: string | number | null | undefined;
  protocolId: string | number | null | undefined;
  protocolLabel: string;
  protocolStatus?: string | null;
  /** Known by the protocol form; otherwise read from the viewers reply. */
  protocolClassName?: string | null;
  hasOutputs: boolean;
  /** "header": dark form header; "dock": light panels such as the logs dock. */
  appearance?: "header" | "dock";
  headerButtonSx?: Record<string, unknown>;
};

const dockButtonSx = {
  height: 32,
  px: 1.4,
  borderRadius: "7px",
  textTransform: "none",
  fontSize: "0.75rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  color: "#1f2937",
  border: "1px solid #d4dbe3",
  bgcolor: "#fff",
  boxShadow: "inset 0 -2px 0 rgba(14, 165, 233, 0.55)",
  "& .MuiButton-startIcon": { mr: 0.6, ml: 0, color: "#0284c7" },
  "&:hover": { bgcolor: "#f1f5f9", boxShadow: "inset 0 -2px 0 rgba(14, 165, 233, 0.9)" },
};

export default function ProtocolAnalyzeAction({
  projectId, protocolId, protocolLabel, protocolStatus, protocolClassName, hasOutputs,
  appearance = "header", headerButtonSx,
}: Props) {
  const svc = useProjectService();
  const project = String(projectId ?? "").trim();
  const protocol = String(protocolId ?? "").trim();
  const isPersisted = /^\d+$/.test(project) && Number(project) > 0 && /^\d+$/.test(protocol) && Number(protocol) > 0;
  const status = String(protocolStatus ?? "").toLowerCase();
  const [hasViewers, setHasViewers] = useState(false);
  const [discoveredClass, setDiscoveredClass] = useState<string | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Without the class, an interactive protocol may still be a picking one.
  const mayBePicking = !protocolClassName && status === "interactive";
  const shouldAsk = isPersisted && (hasOutputs || mayBePicking);

  useEffect(() => {
    setHasViewers(false);
    setDiscoveredClass(null);
    if (!shouldAsk || typeof svc.fetchProtocolViewerCandidates !== "function") return;
    let cancelled = false;
    Promise.resolve(svc.fetchProtocolViewerCandidates(project, protocol))
      .then(result => {
        if (cancelled) return;
        setHasViewers(hasOutputs && openableProtocolViewers(result).length > 0);
        setDiscoveredClass(typeof result?.protocolClassName === "string" ? result.protocolClassName : null);
      })
      .catch(() => { if (!cancelled) setHasViewers(false); });
    return () => { cancelled = true; };
  }, [svc, project, protocol, shouldAsk, hasOutputs]);

  const className = protocolClassName || discoveredClass;
  const canPick = isPersisted && isXmippPickingProtocol(className) && !NOT_PICKABLE_STATUSES.includes(status);
  const pickingSource = useMemo(
    () => (canPick ? xmippPickingSource(svc, project, protocol) : null),
    [canPick, svc, project, protocol],
  );

  if (!hasViewers && !canPick) return null;

  return (
    <>
      <Tooltip title="Open the viewers of this protocol" describeChild>
        <Button
          size="small"
          onClick={() => (canPick ? setPickerOpen(true) : setViewersOpen(true))}
          aria-haspopup="dialog"
          startIcon={<BarChart3 size={15} strokeWidth={2.2} />}
          sx={appearance === "dock" ? dockButtonSx : headerButtonSx}
        >
          Analyze results
        </Button>
      </Tooltip>

      {pickerOpen && pickingSource && (
        <AnalyzeOutputDialog
          open
          onClose={() => setPickerOpen(false)}
          projectId={Number(project)}
          protocolId={Number(protocol)}
          protocolLabel={protocolLabel}
          outputName="picking"
          displayName="Particle picking"
          outputRaw={{ pointerClass: "SetOfCoordinates" }}
          coords2dSource={pickingSource}
        />
      )}

      {viewersOpen && (
        <ProtocolViewerDiscoveryDialog
          open
          onClose={() => setViewersOpen(false)}
          projectId={project}
          protocolId={protocol}
          protocolLabel={protocolLabel}
        />
      )}
    </>
  );
}
