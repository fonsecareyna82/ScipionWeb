// The actions a running protocol offers, as the desktop context menu shows them: STOP STREAMING of a
// streaming import, APPROVE CHECKPOINT of a checkpoint. Each one only leaves a file the running protocol
// looks for: the import then closes its output and finishes, and the protocols after it finish in turn.
import { useCallback, useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import toast from "react-hot-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";

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
  // As the other dialogs of the protocols: what is clicked here never reaches the graph behind
  const keep = (event: { preventDefault(): void; stopPropagation(): void }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open && !running) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border border-border bg-background shadow-xl rounded-xl"
                     onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-border"
             style={{ backgroundColor: "#333d49", color: "white", padding: "16px 20px", boxSizing: "border-box" }}>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Hand className="h-5 w-5 text-sky-200" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold leading-6 text-white">{label}?</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-white/75">
                  {texts?.summary ?? `The protocol is asked to "${label}".`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
            <div className="font-semibold">Protocol selected</div>
            <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-white/70 px-3 py-2 ring-1 ring-sky-200 dark:bg-sky-900/25 dark:ring-sky-800">
              <span className="shrink-0 rounded-full bg-white px-2 py-1 font-mono text-xs text-sky-900 shadow-sm ring-1 ring-sky-200 dark:bg-sky-900/50 dark:text-sky-100 dark:ring-sky-800">
                {String(protocolId)}
              </span>
              <span className="min-w-0 truncate">{protocolLabel}</span>
            </div>
          </div>

          {texts ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-gray-900/40 dark:text-slate-300">
              {texts.effect}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border bg-slate-50 px-5 py-4 dark:bg-gray-900/35">
          <button type="button" className="pp-dialogBtn" disabled={running} onContextMenu={keep}
                  onClick={(event) => { keep(event); onClose(); }}>
            Cancel
          </button>
          <button type="button" className="pp-dialogBtn pp-dialogBtnPrimary" disabled={running} onContextMenu={keep}
                  onClick={(event) => { keep(event); void confirm(); }}
                  style={{ backgroundColor: "#0284c7", borderColor: "#0284c7", color: "white" }}>
            {running ? `${label}…` : label}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
