// The streaming monitor in a floating window over the project, which can move to a window of its own (and
// back), as the viewers do. The monitor stays mounted in one content host, so moving it keeps its points.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ExternalLink } from "lucide-react";

import FloatingWindow from "@/components/ui/floating-window/FloatingWindow";
import ExternalWindowPortal, {
  DetachableContentMount,
  PersistentContentPortal,
  openExternalWindow,
} from "@/components/ui/external-window/ExternalWindowPortal";
import { useIsDark } from "@/context/ThemeContext";
import type { Id } from "@/services/ProjectService";
import StreamingMonitorView from "./StreamingMonitorView";

type Props = {
  open: boolean;
  projectId: Id;
  projectLabel?: string;
  onClose: () => void;
};

export default function StreamingMonitorWindow({ open, projectId, projectLabel, onClose }: Props) {
  const dark = useIsDark();
  const [externalWindow, setExternalWindow] = useState<Window | null>(null);
  const externalWindowRef = useRef<Window | null>(null);
  // Why the external window closes: back to the floating one, the monitor is closed, or the user closed it.
  const closingRef = useRef<"return" | "close" | null>(null);

  const contentHost = useMemo(() => {
    if (typeof document === "undefined") return null;
    const host = document.createElement("div");
    host.setAttribute("data-scipion-monitor-host", "true");
    host.style.cssText = "width:100%;height:100%;min-width:0;min-height:0;flex:1 1 auto;display:flex;overflow:hidden;";
    return host;
  }, []);

  const closePopup = useCallback((reason: "return" | "close") => {
    const popup = externalWindowRef.current;
    closingRef.current = reason;
    externalWindowRef.current = null;
    setExternalWindow(null);
    if (popup && !popup.closed) popup.close();
  }, []);

  const openExternal = useCallback(() => {
    const existing = externalWindowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const popup = openExternalWindow({ title: "ScipionWeb - Streaming monitor", width: 1400, height: 920 });
    if (!popup) {
      toast.error("The browser blocked the monitor window. Allow pop-ups for ScipionWeb and try again.");
      return;
    }
    closingRef.current = null;
    externalWindowRef.current = popup;
    setExternalWindow(popup);
  }, []);

  const handleClose = useCallback(() => {
    closePopup("close");
    onClose();
  }, [closePopup, onClose]);

  const handleExternalClosed = useCallback(() => {
    const reason = closingRef.current;
    closingRef.current = null;
    externalWindowRef.current = null;
    setExternalWindow(null);
    // The user closed the window itself: the monitor closes too
    if (reason === null) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) closePopup("close");
  }, [open, closePopup]);

  useEffect(() => () => {
    const popup = externalWindowRef.current;
    externalWindowRef.current = null;
    if (popup && !popup.closed) popup.close();
  }, []);

  if (!open || !contentHost) return null;
  const subtitle = projectLabel ? `Project: ${projectLabel}` : undefined;

  return (
    <>
      <PersistentContentPortal host={contentHost}>
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1">
          <StreamingMonitorView projectId={projectId} embedded />
        </div>
      </PersistentContentPortal>
      {externalWindow && !externalWindow.closed ? (
        <ExternalWindowPortal
          popupWindow={externalWindow}
          contentHost={contentHost}
          title="Streaming monitor"
          subtitle={subtitle}
          darkMode={dark}
          onReturn={() => closePopup("return")}
          onClose={handleClose}
          onWindowClosed={handleExternalClosed}
        />
      ) : (
        <FloatingWindow
          open={open}
          onClose={handleClose}
          ariaLabel="Streaming monitor"
          closeAriaLabel="Close the streaming monitor"
          initialWidth="80vw"
          initialHeight="84vh"
          minWidth={760}
          minHeight={520}
          title={
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-gray-100">Streaming monitor</span>
              {subtitle ? <span className="truncate text-xs text-gray-300">{subtitle}</span> : null}
            </div>
          }
          headerActions={
            <button type="button" className="sfw-controlButton" aria-label="Open the monitor in its own window"
                    title="Open in its own window" onClick={openExternal}>
              <ExternalLink />
            </button>
          }
        >
          <DetachableContentMount host={contentHost} />
        </FloatingWindow>
      )}
    </>
  );
}
