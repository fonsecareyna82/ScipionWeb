import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolLogsPanel from "@/components/protocol/ProtocolLogsPanel";

type LogChannel = {
    id: string;
    label: string;
};

function renderComponent(
    overrides: Partial<React.ComponentProps<typeof ProtocolLogsPanel>> = {},
) {
    const setActiveLogChannelId = vi.fn();
    const updateStickToBottom = vi.fn();
    const logsContainerRef = createRef<HTMLDivElement>();

    const sortedLogChannels: LogChannel[] = [
        { id: "stdout", label: "stdout" },
        { id: "stderr", label: "stderr" },
    ];

    render(
        <ProtocolLogsPanel
            sortedLogChannels={sortedLogChannels as any}
            activeLogChannelId="stdout"
            setActiveLogChannelId={setActiveLogChannelId}
            activeLogText={"first line\nsecond line"}
            logsError={null}
            logsContainerRef={logsContainerRef}
            updateStickToBottom={updateStickToBottom}
            {...overrides}
        />,
    );

    return {
        setActiveLogChannelId,
        updateStickToBottom,
        logsContainerRef,
    };
}

describe("ProtocolLogsPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the available log channel tabs", () => {
        renderComponent();

        expect(screen.getByRole("tab", { name: "stdout" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "stderr" })).toBeInTheDocument();
    });

    it("calls setActiveLogChannelId when selecting another tab", () => {
        const { setActiveLogChannelId } = renderComponent();

        fireEvent.click(screen.getByRole("tab", { name: "stderr" }));

        expect(setActiveLogChannelId).toHaveBeenCalledWith("stderr");
    });

    it("renders log lines with line numbers", () => {
        renderComponent({
            activeLogText: "first line\nsecond line",
        });

        expect(screen.getByText("00001:")).toBeInTheDocument();
        expect(screen.getByText("00002:")).toBeInTheDocument();
        expect(screen.getByText("first line")).toBeInTheDocument();
        expect(screen.getByText("second line")).toBeInTheDocument();
    });

    it("shows the empty state when there are no logs", () => {
        renderComponent({
            activeLogText: "",
        });

        expect(screen.getByText("No logs yet.")).toBeInTheDocument();
    });

    it("renders the logs error message when present", () => {
        renderComponent({
            logsError: "Failed to fetch logs",
        });

        expect(screen.getByText("Failed to fetch logs")).toBeInTheDocument();
    });

    it("colors line numbers blue for non-stderr channels", () => {
        renderComponent({
            activeLogChannelId: "stdout",
            activeLogText: "hello",
        });

        expect(screen.getByText("00001:")).toHaveStyle({
            color: "rgb(96, 165, 250)",
        });
    });

    it("colors line numbers red for stderr channel", () => {
        renderComponent({
            activeLogChannelId: "stderr",
            activeLogText: "error line",
        });

        expect(screen.getByText("00001:")).toHaveStyle({
            color: "rgb(248, 113, 113)",
        });
    });

    it("parses ansi-colored text", () => {
        renderComponent({
            activeLogText: "\u001b[31merror\u001b[0m ok",
        });

        expect(screen.getByText("error")).toHaveStyle({
            color: "rgb(248, 113, 113)",
        });
        expect(screen.getByText(/ok/)).toBeInTheDocument();
    });

    it("calls updateStickToBottom on scroll", () => {
        const { updateStickToBottom, logsContainerRef } = renderComponent({
            activeLogText: "line 1\nline 2\nline 3",
        });

        expect(logsContainerRef.current).not.toBeNull();

        fireEvent.scroll(logsContainerRef.current!);

        expect(updateStickToBottom).toHaveBeenCalledTimes(1);
    });

    it("assigns the logs container ref", () => {
        const { logsContainerRef } = renderComponent();

        expect(logsContainerRef.current).not.toBeNull();
    });

    it("renders carriage-return progress updates as separate lines", () => {
        renderComponent({
            activeLogText:
                "1/70 progress\r\b\b\b2/70 progress\r\b\b\b3/70 progress",
        });

        expect(screen.getByText("00001:")).toBeInTheDocument();
        expect(screen.getByText("00002:")).toBeInTheDocument();
        expect(screen.getByText("00003:")).toBeInTheDocument();

        expect(screen.getByText("1/70 progress")).toBeInTheDocument();
        expect(screen.getByText("2/70 progress")).toBeInTheDocument();
        expect(screen.getByText("3/70 progress")).toBeInTheDocument();
    });
});
