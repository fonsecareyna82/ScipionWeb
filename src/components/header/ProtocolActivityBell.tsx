// The header's bell: runs of the user's protocols that ended, with in-app and desktop notifications.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bell, BellOff, BellRing, CheckCircle2, Clock, Hand, XCircle } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import { eventKey, useProtocolActivity } from "@/hooks/useProtocolActivity";
import type { ProtocolRunEvent } from "@/services/ProjectService";

const DESKTOP_KEY = "scipionweb.activity.desktopNotifications";
// Off: runs that end only show in the bell's list (no pop-ups, no badge).
const NOTIFY_KEY = "scipionweb.activity.notifications";

const STATUS_TEXT: Record<string, string> = {
  finished: "finished",
  failed: "failed",
  aborted: "was aborted",
  interactive: "is waiting for you",
};

function statusIcon(status: string, className: string) {
  if (status === "finished") return <CheckCircle2 className={`${className} text-green-600 dark:text-green-400`} />;
  if (status === "interactive") return <Hand className={`${className} text-amber-600 dark:text-amber-400`} />;
  return <XCircle className={`${className} text-red-600 dark:text-red-400`} />;
}

export function protocolLink(event: Pick<ProtocolRunEvent, "projectName" | "protocolId">): string {
  return `/project/load/${encodeURIComponent(event.projectName)}?protocol=${encodeURIComponent(event.protocolId)}`;
}

function describe(event: ProtocolRunEvent): string {
  return `${event.label || event.protocolClassName} ${STATUS_TEXT[event.status] ?? event.status}`;
}

function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Lasts the session.
  }
}

export default function ProtocolActivityBell() {
  const svc = useProjectService();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notify, setNotify] = useState<boolean>(() => readFlag(NOTIFY_KEY, true));
  const [desktop, setDesktop] = useState<boolean>(() => readFlag(DESKTOP_KEY, false)
    && typeof Notification !== "undefined" && Notification.permission === "granted");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const openEvent = useCallback((event: ProtocolRunEvent) => {
    setOpen(false);
    navigate(protocolLink(event));
  }, [navigate]);

  const onEnded = useCallback((event: ProtocolRunEvent) => {
    if (!notify) return;
    toast.custom((t) => (
      <button
        type="button"
        onClick={() => {
          toast.dismiss(t.id);
          openEvent(event);
        }}
        className="flex max-w-sm items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-lg dark:border-gray-800 dark:bg-gray-900"
      >
        {statusIcon(event.status, "mt-0.5 h-5 w-5 flex-none")}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{describe(event)}</span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{event.projectName} · open</span>
        </span>
      </button>
    ), { id: eventKey(event), duration: event.status === "finished" ? 6000 : 12000 });

    // A desktop notification when the page is not in front; the tag keeps one per run over several tabs.
    if (desktop && typeof Notification !== "undefined" && Notification.permission === "granted"
      && (document.hidden || !document.hasFocus())) {
      try {
        const notification = new Notification(describe(event), {
          body: `${event.projectName} · ScipionWeb`,
          tag: eventKey(event),
          icon: "/scipion_logo.png",
        });
        notification.onclick = () => {
          window.focus();
          openEvent(event);
          notification.close();
        };
      } catch {
        // Some browsers only notify from a service worker: the in-app notice stays.
      }
    }
  }, [notify, desktop, openEvent]);

  // Stable: a new function would restart the polling on every render.
  const fetchActivity = useMemo(
    () => (svc.fetchProtocolActivity ? svc.fetchProtocolActivity.bind(svc) : undefined),
    [svc],
  );
  const { events, live, unread, markSeen, clear } = useProtocolActivity(fetchActivity, onEnded);

  useEffect(() => {
    if (!open) return;
    markSeen();
    // In the capture phase: the graph (d3-zoom) stops the propagation of its pointer events.
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const closeOnBlur = () => setOpen(false);
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", closeOnBlur);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", closeOnBlur);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, markSeen]);

  const toggleDesktop = async () => {
    if (typeof Notification === "undefined") {
      toast.error("This browser has no desktop notifications.");
      return;
    }
    let next = !desktop;
    if (next && Notification.permission !== "granted") {
      next = (await Notification.requestPermission()) === "granted";
      if (!next) toast.error("Desktop notifications are blocked for ScipionWeb in this browser.");
    }
    setDesktop(next);
    writeFlag(DESKTOP_KEY, next);
  };

  const toggleNotify = () => {
    const next = !notify;
    setNotify(next);
    writeFlag(NOTIFY_KEY, next);
  };

  const badge = notify ? unread : 0;
  const BellIcon = !notify ? BellOff : badge ? BellRing : Bell;
  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={badge ? `Protocol activity, ${badge} new` : "Protocol activity"}
        title={live ? `${live} protocol${live === 1 ? "" : "s"} running` : "Protocol activity"}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <BellIcon className="h-5 w-5" />
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {live > 0 && badge === 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Protocol activity"
          className="absolute right-0 z-50 mt-2 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Protocol activity</div>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3 w-3" />
                {live ? `${live} running now` : "Nothing running"}
              </div>
            </div>
            {events.length > 0 && (
              <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
                Clear
              </button>
            )}
          </div>

          <ul className="max-h-[360px] overflow-y-auto">
            {events.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Runs that finish or fail show here.
              </li>
            ) : events.map((event) => (
              <li key={eventKey(event)}>
                <button
                  type="button"
                  onClick={() => openEvent(event)}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  {statusIcon(event.status, "mt-0.5 h-4 w-4 flex-none")}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900 dark:text-gray-100">{describe(event)}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {event.projectName} · {timeAgo(event.endedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-800">
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">
              <span>Notify me when runs end</span>
              <input type="checkbox" checked={notify} onChange={toggleNotify} className="h-4 w-4 accent-blue-600" />
            </label>
            <label className={`flex items-center justify-between gap-3 py-1.5 text-sm ${notify ? "cursor-pointer text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>
              <span>Also on the desktop when ScipionWeb is in the background</span>
              <input type="checkbox" checked={notify && desktop} disabled={!notify} onChange={() => void toggleDesktop()} className="h-4 w-4 accent-blue-600" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
