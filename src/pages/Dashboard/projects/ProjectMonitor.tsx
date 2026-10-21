// The streaming monitor of one project, as its own page so it can stay open in another tab or screen.
import { useParams } from "react-router-dom";

import StreamingMonitorView from "@/components/monitor/StreamingMonitorView";

export default function ProjectMonitor() {
  const { projectId } = useParams();
  if (!projectId) return null;
  return <StreamingMonitorView projectId={projectId} />;
}
