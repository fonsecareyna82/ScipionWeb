import { useRef, type PointerEvent } from "react";
import { Terminal, X } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import ProtocolLogsPanel from "@/components/protocol/ProtocolLogsPanel";
import { useProtocolLogs } from "@/hooks/useProtocolLogs";

type WorkflowLogsDockProps = {
  projectId: string | number | null | undefined;
  protocolId: string | null;
  protocolLabel: string;
  protocolStatus?: string | null;
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
};

/** A resizable sibling of the canvas, never a child or overlay of React Flow. */
export default function WorkflowLogsDock({
  projectId,
  protocolId,
  protocolLabel,
  protocolStatus,
  height,
  onHeightChange,
  onClose,
}: WorkflowLogsDockProps) {
  const svc = useProjectService();
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const {
    sortedLogChannels,
    activeLogChannelId,
    setActiveLogChannelId,
    activeLogText,
    logsError,
    logsContainerRef,
    updateStickToBottom,
    onLoadFullLog,
    onSearchAll,
    onNavigateToOffset,
    onClearLogSearch,
  } = useProtocolLogs({
    svc,
    enabled: projectId != null && protocolId != null,
    projectId,
    protocolId,
    protocolStatus,
  });

  const resizeTo = (requestedHeight: number) => {
    // The panel reserves enough room for the workflow/table above it.
    // The parent's CSS variable performs the final clamp on short windows.
    onHeightChange(Math.max(160, Math.min(1000, Math.round(requestedHeight))));
  };

  const stopResizing = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className="absolute bottom-0 left-0 right-0 flex min-h-0 flex-col overflow-hidden border-t border-border bg-background text-foreground shadow-[0_-4px_18px_rgba(15,23,42,0.08)]"
      style={{ height: "var(--ppLogsDockHeight, 0px)", zIndex: 55 }}
      aria-label="Workflow protocol logs"
      id="workflow-logs-dock"
      data-testid="workflow-logs-dock"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize workflow logs"
        aria-valuemin={160}
        aria-valuemax={1000}
        aria-valuenow={height}
        tabIndex={0}
        title="Drag to resize logs"
        className="flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-muted/50 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { startY: event.clientY, startHeight: height };
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          resizeTo(drag.startHeight + drag.startY - event.clientY);
        }}
        onPointerUp={stopResizing}
        onPointerCancel={stopResizing}
        onLostPointerCapture={() => { dragRef.current = null; }}
        onKeyDown={(event) => {
          const delta = event.key === "ArrowUp" ? 24 : event.key === "ArrowDown" ? -24 : 0;
          if (!delta) return;
          event.preventDefault();
          event.stopPropagation();
          resizeTo(height + delta);
        }}
      >
        <div className="h-1 w-12 rounded-full bg-gray-400/60" aria-hidden="true" />
      </div>

      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-sm font-semibold">Logs</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={protocolLabel}>
          {protocolId ? `#${protocolId} · ${protocolLabel || "Protocol"}` : "Select a protocol in the workflow"}
        </span>
        <button
          type="button"
          aria-label="Close workflow logs"
          title="Close logs"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-1">
        {protocolId && projectId != null ? (
          <ProtocolLogsPanel
            sortedLogChannels={sortedLogChannels}
            activeLogChannelId={activeLogChannelId}
            setActiveLogChannelId={setActiveLogChannelId}
            activeLogText={activeLogText}
            logsError={logsError}
            logsContainerRef={logsContainerRef}
            updateStickToBottom={updateStickToBottom}
            onLoadFullLog={onLoadFullLog}
            onSearchAll={onSearchAll}
            onNavigateToOffset={onNavigateToOffset}
            onClearLogSearch={onClearLogSearch}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a protocol to inspect its logs.
          </div>
        )}
      </div>
    </section>
  );
}
