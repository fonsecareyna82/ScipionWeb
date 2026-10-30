import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const logsHook = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useProtocolLogs", () => ({
  useProtocolLogs: (options: any) => {
    logsHook(options);
    return {
      sortedLogChannels: [], activeLogChannelId: null, setActiveLogChannelId: vi.fn(), activeLogText: "",
      logsError: null, logsContainerRef: { current: null }, updateStickToBottom: vi.fn(), onLoadFullLog: vi.fn(),
      onSearchAll: vi.fn(), onNavigateToOffset: vi.fn(), onClearLogSearch: vi.fn(),
    };
  },
}));
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => ({}) }));
vi.mock("@/components/protocol/ProtocolLogsPanel", () => ({ default: () => <div>The logs</div> }));
vi.mock("@/components/protocol/ProtocolSummaryPanel", () => ({
  default: (props: any) => <div>The summary of {props.protocolId}</div>,
}));
vi.mock("@/components/protocol/ProtocolAnalyzeAction", () => ({ default: () => null }));

import WorkflowLogsDock from "@/components/projects/WorkflowLogsDock";

describe("WorkflowLogsDock tabs", () => {
  it("shows the selected protocol's summary or its logs, reading the logs only on their tab", () => {
    render(<WorkflowLogsDock projectId={7} protocolId="5" protocolLabel="CTF" height={300}
                             onHeightChange={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("The logs")).toBeInTheDocument();
    expect(logsHook).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));

    expect(screen.getByText("The summary of 5")).toBeInTheDocument();
    expect(screen.queryByText("The logs")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
    expect(logsHook).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });
});
