import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProtocolLogs } from "@/hooks/useProtocolLogs";

function fixture() {
  const fetchProtocolLogWindow = vi.fn().mockImplementation(async (
    _project: number, _protocol: number, _channel: string,
    opts?: { endOffset?: number },
  ) => {
    if (opts?.endOffset !== undefined) {
      return {
        channel: "stdout", content: "older line\nERROR target\nolder tail\n",
        startOffset: 10, endOffset: 90, sizeBytes: 1000,
      };
    }
    return {
      channel: "stdout", content: "latest log line\n",
      startOffset: 950, endOffset: 1000, sizeBytes: 1000,
    };
  });
  const fetchProtocolLogSearch = vi.fn()
    .mockResolvedValueOnce({
      matches: [{ offset: 20, text: "ERROR old" }],
      nextOffset: 50, sizeBytes: 1000, done: false,
    })
    .mockResolvedValueOnce({
      matches: [{ offset: 900, text: "ERROR recent" }],
      nextOffset: 1000, sizeBytes: 1000, done: true,
    });
  const svc = {
    fetchProtocolLogChannels: vi.fn().mockResolvedValue({
      channels: [{ id: "stdout", label: "Output" }],
    }),
    fetchProtocolLogsChunk: vi.fn().mockResolvedValue({ chunks: [] }),
    fetchProtocolLogWindow,
    fetchProtocolLogSearch,
  };
  return { svc, fetchProtocolLogWindow, fetchProtocolLogSearch };
}

describe("useProtocolLogs global log navigation", () => {
  it("searches consecutive backend pages, not just visible log text", async () => {
    const { svc, fetchProtocolLogSearch } = fixture();
    const { result, unmount } = renderHook(() => useProtocolLogs({
      svc, enabled: true, projectId: 1, protocolId: 7, protocolStatus: "running",
    }));
    await waitFor(() => expect(result.current.activeLogText).toContain("latest log line"));
    let found: { matches: Array<{ offset: number }>; complete: boolean } | undefined;
    await act(async () => { found = await result.current.onSearchAll("stdout", "ERROR"); });
    expect(found).toEqual({
      matches: [
        { offset: 20, text: "ERROR old" },
        { offset: 900, text: "ERROR recent" },
      ],
      complete: true,
    });
    expect(fetchProtocolLogSearch).toHaveBeenCalledTimes(2);
    expect(fetchProtocolLogSearch).toHaveBeenNthCalledWith(
      2, 1, 7, "stdout", "ERROR", expect.objectContaining({ startOffset: 50 }),
    );
    unmount();
  });

  it("jumps to an old matching byte offset, then restores the live tail", async () => {
    const { svc, fetchProtocolLogWindow } = fixture();
    const { result, unmount } = renderHook(() => useProtocolLogs({
      svc, enabled: true, projectId: 1, protocolId: 7, protocolStatus: "running",
    }));
    await waitFor(() => expect(result.current.activeLogText).toContain("latest log line"));
    await act(async () => { await result.current.onNavigateToOffset(20); });
    expect(result.current.activeLogText).toContain("ERROR target");
    expect(fetchProtocolLogWindow).toHaveBeenCalledWith(
      1, 7, "stdout", expect.objectContaining({ endOffset: expect.any(Number) }),
    );
    await act(async () => { await result.current.onClearLogSearch(); });
    expect(result.current.activeLogText).toContain("latest log line");
    unmount();
  });
});
