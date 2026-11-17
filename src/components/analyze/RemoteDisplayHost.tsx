import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import FloatingWindow from "@/components/ui/floating-window/FloatingWindow";
import {
  closeRemoteDisplay,
  forgetRemoteDisplay,
  getRemoteDisplays,
  remoteDisplayUrl,
  restoreRemoteDisplays,
  subscribeRemoteDisplays,
  type RemoteDisplay,
} from "@/api/remoteDisplays";

// The page made to go inside a window of the web: only the program, filling it (see the API's router)
function embeddedUrl(display: RemoteDisplay): string {
  return `${remoteDisplayUrl(display)}&embed=1&floating_menu=no`;
}

/** One program running on the server, in a floating window. Closing the window closes the program. */
export function RemoteDisplayWindow({ display, onClosed }: { display: RemoteDisplay; onClosed: () => void }) {
  // null: not shown yet; then how many main windows the program has (0 once it closed them)
  const [windows, setWindows] = useState<number | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "scipion-remote-display") return;
      const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-remote-display="${display.id}"]`);
      if (frame && event.source !== frame.contentWindow) return;
      const count = Number(data.windows) || 0;
      // No window before the first one is the program still starting
      if (count > 0) shown.current = true;
      if (shown.current) setWindows(count);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [display.id]);

  // The program closed its window: so does the web
  useEffect(() => {
    if (windows === 0) {
      const timer = window.setTimeout(() => {
        // The server is told too, in case something is left of it
        void closeRemoteDisplay(display.id);
        onClosed();
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [windows, onClosed, display.id]);

  const close = () => {
    void closeRemoteDisplay(display.id);
    onClosed();
  };

  return (
    <FloatingWindow
      open
      onClose={close}
      title={display.title || "Viewer"}
      ariaLabel={display.title || "Viewer"}
      closeAriaLabel="Close the viewer"
      initialWidth="72vw"
      initialHeight="80vh"
      minWidth={640}
      minHeight={420}
      headerActions={
        <button
          type="button"
          className="sfw-controlButton"
          aria-label="Open the viewer in a new tab"
          title="Open in a new tab"
          onClick={() => window.open(embeddedUrl(display), "_blank")}
        >
          <ExternalLink />
        </button>
      }
    >
      <div className="relative h-full w-full bg-white">
        <iframe
          data-remote-display={display.id}
          title={display.title || "Viewer"}
          src={embeddedUrl(display)}
          className="absolute inset-0 h-full w-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
        {!windows && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white text-[15px] text-gray-600">
            {windows === 0 ? (
              <span>The viewer was closed.</span>
            ) : (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden="true" />
                <span>Opening the viewer on the server…</span>
              </>
            )}
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}

/** Every program opened from the web, over every page while the session lasts. */
export default function RemoteDisplayHost() {
  const displays = useSyncExternalStore(subscribeRemoteDisplays, getRemoteDisplays, getRemoteDisplays);
  // What was left open (a reload, a closed tab) comes back, so it can be used or closed
  useEffect(() => {
    void restoreRemoteDisplays();
  }, []);
  return (
    <>
      {displays.map((display) => (
        <RemoteDisplayWindow key={display.id} display={display} onClosed={() => forgetRemoteDisplay(display.id)} />
      ))}
    </>
  );
}
