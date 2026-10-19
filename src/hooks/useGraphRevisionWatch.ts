import { useEffect, useRef, type MutableRefObject } from "react";
import type { Id, ProjectRevision } from "@/services/ProjectService";

type GraphRevisionWatchOptions = {
  projectId: Id | null | undefined;
  fetchRevision?: (projectId: Id) => Promise<ProjectRevision>;
  /** How often to check (the "workflows auto refresh" setting); 0 or less turns it off. */
  intervalSeconds: number;
  /** The revision the graph shows; a reload of the graph updates it. */
  revisionRef: MutableRefObject<string | null>;
  /** True while the graph is being reloaded anyway. */
  isBusy: () => boolean;
  /** Reload the whole graph. */
  onChanged: () => Promise<void> | void;
};

/** Checks are never closer than this, whatever the setting. */
const MINIMUM_INTERVAL_SECONDS = 5;

/**
 * Changes made in another tab or by another user. Only active protocols are
 * refreshed every second; for the rest, a cheap fingerprint of the graph is
 * checked every intervalSeconds (and when the tab comes back), and the whole
 * graph is reloaded only when it changed. Not while the user holds a mouse
 * button (dragging, selecting) or the tab is hidden.
 */
export function useGraphRevisionWatch({
  projectId, fetchRevision, intervalSeconds, revisionRef, isBusy, onChanged,
}: GraphRevisionWatchOptions): void {
  const pointerDownRef = useRef(false);
  const isBusyRef = useRef(isBusy);
  const onChangedRef = useRef(onChanged);
  // The callers pass new functions on every render; only whether there is one matters.
  const fetchRevisionRef = useRef(fetchRevision);
  isBusyRef.current = isBusy;
  onChangedRef.current = onChanged;
  fetchRevisionRef.current = fetchRevision;
  const canFetch = Boolean(fetchRevision);

  useEffect(() => {
    const down = () => {
      pointerDownRef.current = true;
    };
    const up = () => {
      pointerDownRef.current = false;
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);

  useEffect(() => {
    if (projectId == null || !canFetch || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return;
    }

    let cancelled = false;
    let checking = false;
    revisionRef.current = null;

    const checkRevision = async () => {
      if (cancelled || checking || document.visibilityState !== "visible"
        || pointerDownRef.current || isBusyRef.current()) {
        return;
      }
      checking = true;
      try {
        const fetchNow = fetchRevisionRef.current;
        if (!fetchNow) return;
        const { revision } = await fetchNow(projectId);
        if (cancelled || !revision) return;
        const known = revisionRef.current;
        revisionRef.current = revision;
        if (known !== null && known !== revision) {
          await onChangedRef.current();
        }
      } catch {
        // The next check tries again.
      } finally {
        checking = false;
      }
    };

    void checkRevision();
    const timerId = window.setInterval(
      () => void checkRevision(),
      Math.max(MINIMUM_INTERVAL_SECONDS, intervalSeconds) * 1000,
    );
    const handleVisible = () => {
      if (document.visibilityState === "visible") void checkRevision();
    };
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [canFetch, intervalSeconds, projectId, revisionRef]);
}
