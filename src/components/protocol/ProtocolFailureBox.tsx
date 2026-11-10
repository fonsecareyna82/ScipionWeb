import { useEffect, useState } from "react";
import { CircleAlert, ScrollText } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import type { ProtocolFailure, ProtocolLogPlace } from "@/services/ProjectService";

type ProtocolFailureBoxProps = {
  projectId: number | string;
  protocolId: number | string;
  /** Changes when the protocol runs again (the box is read again). */
  protocolStatus?: string | null;
  /** Go to this place in the protocol's log; without it there is no "Show in log". */
  onShowInLog?: (place: ProtocolLogPlace) => void;
};

/**
 * Why a failed protocol failed, at the top of its Summary: the cause and what to try when it is a known error,
 * then the error and the command that failed, as its logs say them.
 */
export default function ProtocolFailureBox({ projectId, protocolId, protocolStatus, onShowInLog }: ProtocolFailureBoxProps) {
  const svc = useProjectService();
  const [failure, setFailure] = useState<ProtocolFailure | null>(null);

  useEffect(() => {
    let alive = true;
    setFailure(null);
    if (!svc.fetchProtocolFailure) return undefined;
    svc.fetchProtocolFailure(projectId, protocolId)
      .then((value) => { if (alive) setFailure(value); })
      .catch(() => { if (alive) setFailure(null); });
    return () => { alive = false; };
  }, [svc, projectId, protocolId, protocolStatus]);

  if (!failure?.failed) return null;
  const { cause, error, command } = failure;
  const place = (label: string, value: ProtocolLogPlace | null | undefined) => value?.text ? (
    <div className="min-w-0">
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="break-words font-mono text-[13.5px]">{value.text}</span>
      {value.line != null && (
        <span className="text-muted-foreground"> (line {value.line}{value.channel ? ` of ${value.channel}` : ""})</span>
      )}
    </div>
  ) : null;

  return (
    <section data-testid="protocol-failure" aria-label="Why it failed"
             className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900/70 dark:bg-red-950/30">
      <div className="mb-1.5 text-[13.5px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
        Why it failed
      </div>
      {cause ? (
        <div className="mb-2 flex gap-2">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div>
            <div className="font-semibold text-red-800 dark:text-red-200">{cause.title}</div>
            <div className="text-foreground">{cause.hint}</div>
          </div>
        </div>
      ) : !error?.text ? (
        <div className="mb-2 text-foreground">
          {failure.hasLogs ? "Its logs do not say why: look at their end." : "It left no log to say why."}
        </div>
      ) : null}
      <div className="space-y-1 text-foreground">
        {place("Error", error)}
        {place("Command", command)}
      </div>
      {onShowInLog && error?.text && error.channel && (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => onShowInLog(error)}
                  className="flex items-center gap-1.5 rounded-md border border-red-300 bg-background px-2.5 py-1 text-[13.5px] font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Show in log
          </button>
        </div>
      )}
    </section>
  );
}
