import { useCallback, useEffect, useRef, useState } from "react";
import type { ProtocolActivity, ProtocolRunEvent } from "@/services/ProjectService";

type ActivitySource = (since?: string | null) => Promise<ProtocolActivity>;

const POLL_SECONDS = 10;
const KEEP_EVENTS = 30;
// Where the last answer's time and the recent events are kept, so a reload (or
// coming back after a while) reports what ended meanwhile (the server caps it to 6 h).
const SINCE_KEY = "scipionweb.activity.since";
const EVENTS_KEY = "scipionweb.activity.events";
const SEEN_KEY = "scipionweb.activity.seenAt";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage the activity lasts the session.
  }
}

export function eventKey(event: ProtocolRunEvent): string {
  return `${event.projectId}:${event.protocolId}:${event.status}:${event.endedAt}`;
}

/**
 * Runs of the user's projects that end (finished, failed, aborted, waiting),
 * polled every few seconds; ``onEnded`` hears of each new one once.
 */
export function useProtocolActivity(fetchActivity: ActivitySource | undefined, onEnded: (event: ProtocolRunEvent) => void) {
  const [events, setEvents] = useState<ProtocolRunEvent[]>(() => readJson<ProtocolRunEvent[]>(EVENTS_KEY, []));
  const [live, setLive] = useState(0);
  const [seenAt, setSeenAt] = useState<string>(() => readJson<string>(SEEN_KEY, ""));
  const sinceRef = useRef<string | null>(readJson<string | null>(SINCE_KEY, null));
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const eventsRef = useRef(events);

  useEffect(() => {
    if (!fetchActivity) return;
    let cancelled = false;
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const activity = await fetchActivity(sinceRef.current);
        if (cancelled) return;
        if (activity.now) {
          sinceRef.current = activity.now;
          writeJson(SINCE_KEY, activity.now);
        }
        setLive(activity.live);
        const known = new Set(eventsRef.current.map(eventKey));
        const fresh = activity.events.filter((event) => !known.has(eventKey(event)));
        if (fresh.length) {
          const next = [...fresh, ...eventsRef.current].slice(0, KEEP_EVENTS);
          eventsRef.current = next;
          writeJson(EVENTS_KEY, next);
          setEvents(next);
          // Oldest first, so notifications come in the order runs ended.
          [...fresh].reverse().forEach((event) => onEndedRef.current(event));
        }
      } catch {
        // The next poll tries again.
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_SECONDS * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchActivity]);

  const unread = events.filter((event) => !seenAt || event.endedAt > seenAt).length;

  const markSeen = useCallback(() => {
    const latest = events[0]?.endedAt ?? new Date().toISOString();
    setSeenAt(latest);
    writeJson(SEEN_KEY, latest);
  }, [events]);

  const clear = useCallback(() => {
    eventsRef.current = [];
    setEvents([]);
    writeJson(EVENTS_KEY, []);
  }, []);

  return { events, live, unread, markSeen, clear };
}
