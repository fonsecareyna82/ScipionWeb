import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphRevisionWatch } from "@/hooks/useGraphRevisionWatch";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useGraphRevisionWatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function watch(revisions: string[], busy = () => false) {
    const fetchRevision = vi.fn().mockImplementation(async () => ({
      revision: revisions.length > 1 ? revisions.shift()! : revisions[0], protocols: 1,
    }));
    const onChanged = vi.fn();
    const revisionRef = { current: null as string | null };
    const hook = renderHook(() => useGraphRevisionWatch({
      projectId: 7, fetchRevision, intervalSeconds: 15, revisionRef, isBusy: busy, onChanged,
    }));
    return { fetchRevision, onChanged, revisionRef, hook };
  }

  it("reloads the graph only when its revision changed", async () => {
    const { fetchRevision, onChanged, revisionRef } = watch(["a", "a", "b", "b"]);
    await flush();
    expect(fetchRevision).toHaveBeenCalledWith(7);
    expect(revisionRef.current).toBe("a");
    await act(async () => { vi.advanceTimersByTime(15000); });
    await flush();
    expect(onChanged).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(15000); });
    await flush();
    expect(onChanged).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(15000); });
    await flush();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("does not take its own reload for a change elsewhere", async () => {
    const { onChanged, revisionRef } = watch(["a", "b"]);
    await flush();
    // The page reloaded the graph after an action of this tab: it knows "b" now.
    revisionRef.current = "b";
    await act(async () => { vi.advanceTimersByTime(15000); });
    await flush();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("waits while the tab is hidden, the mouse is held or the graph reloads, and checks on return", async () => {
    let busy = false;
    const { fetchRevision, onChanged } = watch(["a", "b"], () => busy);
    await flush();
    const calls = fetchRevision.mock.calls.length;

    setVisibility("hidden");
    await act(async () => { vi.advanceTimersByTime(15000); });
    window.dispatchEvent(new Event("pointerdown"));
    setVisibility("visible");
    await act(async () => { vi.advanceTimersByTime(15000); });
    window.dispatchEvent(new Event("pointerup"));
    busy = true;
    await act(async () => { vi.advanceTimersByTime(15000); });
    await flush();
    expect(fetchRevision).toHaveBeenCalledTimes(calls);

    busy = false;
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(fetchRevision).toHaveBeenCalledTimes(calls + 1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("is off without the setting or the service, and never checks more often than every 5 s", async () => {
    const fetchRevision = vi.fn().mockResolvedValue({ revision: "a", protocols: 0 });
    const revisionRef = { current: null as string | null };
    renderHook(() => useGraphRevisionWatch({
      projectId: 7, fetchRevision, intervalSeconds: 0, revisionRef, isBusy: () => false, onChanged: vi.fn(),
    }));
    renderHook(() => useGraphRevisionWatch({
      projectId: 7, fetchRevision: undefined, intervalSeconds: 15, revisionRef, isBusy: () => false, onChanged: vi.fn(),
    }));
    await flush();
    expect(fetchRevision).not.toHaveBeenCalled();

    renderHook(() => useGraphRevisionWatch({
      projectId: 7, fetchRevision, intervalSeconds: 1, revisionRef, isBusy: () => false, onChanged: vi.fn(),
    }));
    await flush();
    await act(async () => { vi.advanceTimersByTime(4000); });
    await flush();
    expect(fetchRevision).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1000); });
    await flush();
    expect(fetchRevision).toHaveBeenCalledTimes(2);
  });
});
