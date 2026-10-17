// Opens Xmipp's picker in the web when a launched picking protocol asks for
// it, as the desktop opens the Java picker; closing it ends the protocol's
// interactive step (the protocol then shows as interactive).
import { useEffect, useMemo, useRef, useState } from "react";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import { useProjectService } from "@/ProjectServiceContext";
import type { OpenPickingSession } from "@/services/ProjectService";
import { xmippPickingSource } from "./xmippPickingSource";

const POLL_MS = 2000;

type Props = {
  projectId: string | number | null | undefined;
  /** Some protocol is running, so a picker may be requested. */
  active: boolean;
};

export default function WebPickingSessions({ projectId, active }: Props) {
  const service = useProjectService();
  const [current, setCurrent] = useState<OpenPickingSession | null>(null);
  // Sessions the user already closed, while their step ends. A relaunch is a
  // new session, so it opens again.
  const closedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active || projectId == null || typeof service.fetchOpenPickingSessions !== "function") return;
    let cancelled = false;
    let timer: number | undefined;
    const check = async () => {
      try {
        const sessions = await service.fetchOpenPickingSessions!(String(projectId));
        if (cancelled) return;
        const openIds = new Set(sessions.map((session) => session.sessionId));
        for (const id of [...closedRef.current]) if (!openIds.has(id)) closedRef.current.delete(id);
        setCurrent((shown) => shown ?? sessions.find((session) => !closedRef.current.has(session.sessionId)) ?? null);
      } catch {
        // A failed check is retried on the next round.
      } finally {
        if (!cancelled) timer = window.setTimeout(check, POLL_MS);
      }
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, projectId, service]);

  const source = useMemo(
    () => (current && projectId != null ? xmippPickingSource(service, String(projectId), current.protocolId) : null),
    [current, projectId, service],
  );

  if (!current || !source) return null;

  const close = () => {
    closedRef.current.add(current.sessionId);
    setCurrent(null);
    void service.closePickingSession?.(String(projectId), current.protocolId).catch(() => undefined);
  };

  return (
    <AnalyzeOutputDialog
      open
      onClose={close}
      projectId={Number(projectId)}
      protocolId={current.protocolId}
      protocolLabel={current.label}
      outputName="picking"
      displayName="Particle picking"
      outputRaw={{ pointerClass: "SetOfCoordinates" }}
      coords2dSource={source}
    />
  );
}
