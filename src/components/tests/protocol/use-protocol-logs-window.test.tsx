import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProtocolLogs } from "@/hooks/useProtocolLogs";

describe("useProtocolLogs initial window", () => {
  it("opens at the tail instead of replaying historical chunks", async () => {
    const fetchProtocolLogChannels = vi.fn().mockResolvedValue({
      channels: [{ id: "stdout", label: "stdout" }],
    });
    const fetchProtocolLogWindow = vi.fn().mockResolvedValue({
      channel: "stdout",
      content: "last lines\n",
      startOffset: 950,
      endOffset: 1000,
      sizeBytes: 1000,
    });
    const fetchProtocolLogsChunk = vi.fn().mockResolvedValue({ chunks: [] });
    const svc = { fetchProtocolLogChannels, fetchProtocolLogWindow, fetchProtocolLogsChunk };
    const { result, unmount } = renderHook(() =>
      useProtocolLogs({ svc, enabled: true, projectId: 1, protocolId: 7, protocolStatus: "running" })
    );
    await waitFor(() => expect(result.current.activeLogText).toContain("last lines"));
    expect(fetchProtocolLogWindow).toHaveBeenCalledWith(1, 7, "stdout", expect.any(Object));
    expect(fetchProtocolLogsChunk).not.toHaveBeenCalledWith(1, 7, { stdout: 0 });
    unmount();
  });

  it("does not overlap slow polling calls", async () => {
    let finish: ((value: any) => void) | undefined;
    const svc = {
      fetchProtocolLogChannels: vi.fn().mockResolvedValue({ channels: [{ id: "stdout", label: "stdout" }] }),
      fetchProtocolLogWindow: vi.fn().mockResolvedValue({
        channel: "stdout", content: "tail\n", startOffset: 50, endOffset: 60, sizeBytes: 60,
      }),
      fetchProtocolLogsChunk: vi.fn(() => new Promise(resolve => { finish = resolve; })),
    };
    const { result, unmount } = renderHook(() =>
      useProtocolLogs({ svc, enabled: true, projectId: 1, protocolId: 7, protocolStatus: "running" })
    );
    await waitFor(() => expect(result.current.activeLogText).toContain("tail"));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2150)); });
    expect(svc.fetchProtocolLogsChunk).toHaveBeenCalledTimes(1);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2150)); });
    expect(svc.fetchProtocolLogsChunk).toHaveBeenCalledTimes(1);
    await act(async () => finish?.({ chunks: [] }));
    unmount();
  }, 8000);
});
