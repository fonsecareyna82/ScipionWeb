// The actions a running protocol offers, as the desktop context menu shows them: STOP STREAMING of a
// streaming import, APPROVE CHECKPOINT of a checkpoint. Each one only leaves a file the running protocol
// looks for: the import then closes its output and finishes, and the protocols after it finish in turn.
import { useCallback, useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import toast from "react-hot-toast";

import { Typography } from "@mui/material";

import { ProtocolActionDialog, ProtocolBox } from "@/components/projects/ProtocolActionDialogs";

import { useProjectService } from "@/ProjectServiceContext";
import { apiErrorMessage } from "@/utils/protocol_tags";
import type { Id } from "@/services/ProjectService";

/** "STOP STREAMING" → "Stop streaming". */
export function runActionLabel(label: string): string {
  const text = label.trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// What each known action does, told before it runs (neither can be undone): a line under the title, and
// what follows from it
const RUN_ACTION_TEXTS: Record<string, { summary: string; effect: string }> = {
  "STOP STREAMING": {
    summary: "The import will take no more files.",
    effect: "It registers the files it already has, closes its output and finishes. The protocols after it "
      + "finish once they have processed what it gave them. This cannot be undone: to import more, restart or "
      + "continue the import.",
  },
  "APPROVE CHECKPOINT": {
    summary: "The protocol will stop waiting.",
    effect: "It finishes now, so the protocols after it start.",
  },
};

/**
 * The actions of one protocol, read when asked (when its menu opens) and only while it runs: reading them
 * starts a short process on the server, so a page with many running protocols does not read them all.
 */
export function useProtocolRunActions(projectId: Id | null, protocolId: Id | null, running: boolean) {
  const svc = useProjectService();
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const readFor = useRef<string | null>(null);
  const key = running && projectId != null && protocolId != null ? `${projectId}:${protocolId}` : null;

  useEffect(() => {
    // A protocol that stopped running offers nothing; one that runs again is read again
    if (key === null) setActions([]);
    readFor.current = null;
  }, [key]);

  const load = useCallback(() => {
    if (key === null || readFor.current === key || !svc.fetchProtocolRunActions) return;
    readFor.current = key;
    setLoading(true);
    svc.fetchProtocolRunActions(projectId as Id, protocolId as Id)
      .then((labels) => { if (readFor.current === key) setActions(labels); })
      .catch(() => { if (readFor.current === key) setActions([]); })
      .finally(() => setLoading(false));
  }, [key, projectId, protocolId, svc]);

  return { actions, loading, load, available: Boolean(svc.runProtocolRunAction) };
}

export function ProtocolRunActionDialog({ projectId, protocolId, protocolLabel, action, onClose }: {
  projectId: Id;
  protocolId: Id;
  protocolLabel: string;
  action: string | null;
  onClose: () => void;
}) {
  const svc = useProjectService();
  const [running, setRunning] = useState(false);
  if (action === null) return null;
  const label = runActionLabel(action);
  const texts = RUN_ACTION_TEXTS[action];

  const confirm = async () => {
    if (!svc.runProtocolRunAction || running) return;
    setRunning(true);
    try {
      await svc.runProtocolRunAction(projectId, protocolId, action);
      toast.success(`${label} requested.`);
      onClose();
    } catch (error) {
      toast.error(apiErrorMessage(error, `${label} could not be run`));
    } finally {
      setRunning(false);
    }
  };
  return (
    <ProtocolActionDialog
      title={`${label}?`}
      description={texts?.summary ?? `The protocol is asked to "${label}".`}
      icon={<Hand className="h-5 w-5 text-sky-200" />}
      confirmLabel={label}
      busyLabel={`${label}…`}
      busy={running}
      saveColor="#0284c7"
      onConfirm={() => void confirm()}
      onClose={() => !running && onClose()}
    >
      <ProtocolBox title="The protocol" band="#0284c7" protocols={[{ id: String(protocolId), label: protocolLabel, status: "running" }]} />
      {texts ? <Typography sx={{ fontSize: 14, lineHeight: 1.55, opacity: 0.85 }}>{texts.effect}</Typography> : null}
    </ProtocolActionDialog>
  );
}
