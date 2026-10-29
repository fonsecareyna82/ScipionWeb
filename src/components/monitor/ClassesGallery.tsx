// The 2D class averages of the stream, biggest first, with the particles of each. The classifier rewrites
// them in place every round: their images are asked for with the version of the classes, so a new round
// shows new averages and an unchanged one is not read again.
import { useEffect, useState } from "react";

import { useProjectService } from "@/ProjectServiceContext";
import type { Id, StreamingMonitorClasses } from "@/services/ProjectService";

const AVERAGE_SIZE = 128;

type Props = {
  projectId: Id;
  classes: StreamingMonitorClasses;
  onOpen: (classId: number) => void;
};

function ClassAverage({ projectId, classes, classId }: { projectId: Id; classes: StreamingMonitorClasses; classId: number }) {
  const svc = useProjectService();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { protocolId, outputName, version } = classes;

  useEffect(() => {
    const controller = new AbortController();
    let revoke: (() => void) | null = null;
    setFailed(false);
    svc.fetchMetadataImageCellObjectUrl(projectId, protocolId, outputName, "objects", 0, "stack", {
      rowId: classId, size: AVERAGE_SIZE, format: "webp", contrastMode: "enhanced", applyTransform: false,
      inline: true, version: version ?? undefined, signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) {
          result.revoke();
          return;
        }
        revoke = result.revoke;
        setUrl(result.url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      revoke?.();
    };
  }, [svc, projectId, protocolId, outputName, version, classId]);

  if (url) return <img src={url} alt={`Class ${classId}`} className="h-full w-full object-contain" />;
  return (
    <div className="flex h-full w-full items-center justify-center text-[12px] text-app-subtle"
         aria-label={failed ? `Class ${classId} not available` : `Class ${classId} loading`}>
      {failed ? "—" : "…"}
    </div>
  );
}

export default function ClassesGallery({ projectId, classes, onOpen }: Props) {
  if (!classes.classes.length) {
    return <div className="text-[15px] text-app-muted">No class has been made yet.</div>;
  }
  const total = classes.particles || 1;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2" aria-label="2D classes">
      {classes.classes.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onOpen(item.id)} data-testid="class-average"
                  className={`flex w-full flex-col items-center gap-1 rounded-lg border border-app-border bg-app-surface-2 p-1.5 text-[13px] hover:bg-app-hover ${item.enabled ? "" : "opacity-50"}`}>
            <div className="aspect-square w-full overflow-hidden rounded bg-black">
              <ClassAverage projectId={projectId} classes={classes} classId={item.id} />
            </div>
            <span className="text-app-text">{item.particles.toLocaleString()}</span>
            <span className="text-[12px] text-app-subtle">{((100 * item.particles) / total).toFixed(1)} %</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
