import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProtocolFailureBox from "@/components/protocol/ProtocolFailureBox";
import ProtocolLogsPanel from "@/components/protocol/ProtocolLogsPanel";

const service: { fetchProtocolFailure: ReturnType<typeof vi.fn> } = { fetchProtocolFailure: vi.fn() };
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => service }));

const gpuFailure = {
    failed: true,
    cause: { id: "gpu-out-of-memory", category: "gpu", title: "The GPU ran out of memory",
        hint: "Try a smaller box size." },
    error: { text: "RuntimeError: CUDA error: out of memory", line: 1832, channel: "stderr" },
    command: { text: "refine --gpu 0", line: 40, channel: "stdout" },
    traceback: [],
    hasLogs: true,
};

describe("ProtocolFailureBox", () => {
    beforeEach(() => service.fetchProtocolFailure.mockReset());

    it("says the cause, what to try, the error and the command, and goes to the error in the log", async () => {
        service.fetchProtocolFailure.mockResolvedValue(gpuFailure);
        const onShowInLog = vi.fn();
        render(<ProtocolFailureBox projectId={7} protocolId={123} onShowInLog={onShowInLog} />);

        const box = await screen.findByTestId("protocol-failure");
        expect(box).toHaveTextContent("The GPU ran out of memory");
        expect(box).toHaveTextContent("Try a smaller box size.");
        expect(box).toHaveTextContent("RuntimeError: CUDA error: out of memory (line 1832 of stderr)");
        expect(box).toHaveTextContent("refine --gpu 0");
        fireEvent.click(screen.getByRole("button", { name: /show in log/i }));
        expect(onShowInLog).toHaveBeenCalledWith(gpuFailure.error);
        expect(service.fetchProtocolFailure).toHaveBeenCalledWith(7, 123);
    });

    it("shows the error alone for an unknown one, and nothing for a protocol that did not fail", async () => {
        service.fetchProtocolFailure.mockResolvedValue({ ...gpuFailure, cause: null });
        const { unmount } = render(<ProtocolFailureBox projectId={7} protocolId={123} />);
        const box = await screen.findByTestId("protocol-failure");
        expect(box).not.toHaveTextContent("The GPU ran out of memory");
        expect(box).toHaveTextContent("RuntimeError: CUDA error: out of memory");
        expect(screen.queryByRole("button", { name: /show in log/i })).not.toBeInTheDocument();
        unmount();

        service.fetchProtocolFailure.mockResolvedValue({ failed: false });
        render(<ProtocolFailureBox projectId={7} protocolId={124} />);
        await waitFor(() => expect(service.fetchProtocolFailure).toHaveBeenCalledTimes(2));
        expect(screen.queryByTestId("protocol-failure")).not.toBeInTheDocument();
    });

    it("says so when the logs do not say why", async () => {
        service.fetchProtocolFailure.mockResolvedValue({ failed: true, cause: null, error: null, command: null,
            traceback: [], hasLogs: false });
        render(<ProtocolFailureBox projectId={7} protocolId={125} />);
        expect(await screen.findByText("It left no log to say why.")).toBeInTheDocument();
    });
});

describe("ProtocolLogsPanel asked to search", () => {
    it("opens the asked log and searches it for the error", async () => {
        const onSearchAll = vi.fn().mockResolvedValue({ matches: [{ offset: 900, text: "CUDA error" }], complete: true });
        const onNavigateToOffset = vi.fn().mockResolvedValue(undefined);
        const setActiveLogChannelId = vi.fn();
        const props = {
            sortedLogChannels: [{ id: "stdout", label: "Output" }, { id: "stderr", label: "Errors" }],
            setActiveLogChannelId, activeLogText: "", logsError: null, logsContainerRef: { current: null },
            updateStickToBottom: vi.fn(), onSearchAll, onNavigateToOffset,
            requestedSearch: { channel: "stderr", query: "RuntimeError: CUDA error", nonce: 1 },
        };
        const { rerender } = render(<ProtocolLogsPanel {...props} activeLogChannelId="stdout" />);
        expect(setActiveLogChannelId).toHaveBeenCalledWith("stderr");
        expect(onSearchAll).not.toHaveBeenCalled();

        rerender(<ProtocolLogsPanel {...props} activeLogChannelId="stderr" />);
        await waitFor(() => expect(onSearchAll).toHaveBeenCalledWith("stderr", "RuntimeError: CUDA error"));
        await waitFor(() => expect(onNavigateToOffset).toHaveBeenCalledWith(900));
        expect(screen.getByRole("textbox", { name: /search logs/i })).toHaveValue("RuntimeError: CUDA error");
        // The same request is not searched again
        rerender(<ProtocolLogsPanel {...props} activeLogChannelId="stderr" />);
        expect(onSearchAll).toHaveBeenCalledTimes(1);
    });
});
