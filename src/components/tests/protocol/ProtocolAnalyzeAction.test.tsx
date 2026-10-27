import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProtocolAnalyzeAction from "@/components/protocol/ProtocolAnalyzeAction";
import WorkflowLogsDock from "@/components/projects/WorkflowLogsDock";

const fetchProtocolViewerCandidates = vi.fn();
const service = { fetchProtocolViewerCandidates };
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => service }));
vi.mock("@/components/protocol/ProtocolViewerDiscoveryDialog", () => ({
  default: (props: { protocolId: string }) => <div data-testid="viewers">{`viewers of ${props.protocolId}`}</div>,
}));
vi.mock("@/components/analyze/analyze-output-dialog", () => ({
  default: (props: { displayName: string }) => <div data-testid="picker">{props.displayName}</div>,
}));
vi.mock("@/hooks/useProtocolLogs", () => ({
  useProtocolLogs: () => ({ sortedLogChannels: [], activeLogChannelId: null, setActiveLogChannelId: vi.fn(),
    activeLogText: "", logsError: null, logsContainerRef: { current: null }, updateStickToBottom: vi.fn(),
    onLoadFullLog: vi.fn(), onSearchAll: vi.fn(), onNavigateToOffset: vi.fn(), onClearLogSearch: vi.fn() }),
}));
vi.mock("@/components/protocol/ProtocolLogsPanel", () => ({ default: () => <div>logs</div> }));

const cl2dViewer = { id: "xmipp3.viewers.XmippCL2DViewer", name: "XmippCL2DViewer", viewerKind: "protocol-form" };

describe("Analyze results of a protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProtocolViewerCandidates.mockResolvedValue({ protocolClassName: "XmippProtCL2D", viewers: [cl2dViewer] });
  });

  it("opens the protocol viewers when it has outputs and a viewer", async () => {
    render(<ProtocolAnalyzeAction projectId={7} protocolId="115" protocolLabel="cl2d" protocolStatus="finished"
      hasOutputs appearance="dock" />);
    fireEvent.click(await screen.findByRole("button", { name: "Analyze results" }));
    expect(screen.getByTestId("viewers")).toHaveTextContent("viewers of 115");
  });

  it("is not offered before the protocol has run", () => {
    render(<ProtocolAnalyzeAction projectId={7} protocolId="115" protocolLabel="cl2d" protocolStatus="saved"
      hasOutputs={false} />);
    expect(fetchProtocolViewerCandidates).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Analyze results" })).not.toBeInTheDocument();
  });

  it("opens the viewer of a protocol whose results are only files, as FSO, which has no outputs", async () => {
    const fsoViewer = { id: "xmipp3.viewers.XmippProtFSOViewer", name: "XmippProtFSOViewer",
                        viewerKind: "protocol-form" };
    fetchProtocolViewerCandidates.mockResolvedValue({ protocolClassName: "XmippProtFSO", viewers: [fsoViewer] });
    render(<ProtocolAnalyzeAction projectId={14} protocolId="17" protocolLabel="fso" protocolStatus="finished"
      hasOutputs={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Analyze results" }));
    expect(screen.getByTestId("viewers")).toHaveTextContent("viewers of 17");
  });

  it("without outputs, viewers of single outputs are nothing to analyze", async () => {
    const volumeViewer = { id: "pwem.viewers.DataViewer", name: "DataViewer", viewerKind: "object" };
    fetchProtocolViewerCandidates.mockResolvedValue({ protocolClassName: "XmippProtFSO", viewers: [volumeViewer] });
    render(<ProtocolAnalyzeAction projectId={14} protocolId="17" protocolLabel="fso" protocolStatus="finished"
      hasOutputs={false} />);
    await waitFor(() => expect(fetchProtocolViewerCandidates).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Analyze results" })).not.toBeInTheDocument();
  });

  it("reopens Xmipp's picker of an interactive picking protocol, learning its class from the server", async () => {
    fetchProtocolViewerCandidates.mockResolvedValue({ protocolClassName: "XmippProtParticlePicking", viewers: [] });
    render(<ProtocolAnalyzeAction projectId={7} protocolId="482" protocolLabel="picking"
      protocolStatus="interactive" hasOutputs={false} appearance="dock" />);
    fireEvent.click(await screen.findByRole("button", { name: "Analyze results" }));
    expect(screen.getByTestId("picker")).toHaveTextContent("Particle picking");
  });

  it("is offered in the workflow logs dock of the selected protocol", async () => {
    render(<WorkflowLogsDock projectId={7} protocolId="115" protocolLabel="cl2d" protocolStatus="finished"
      protocolHasOutputs height={300} onHeightChange={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Analyze results" })).toBeInTheDocument();
    await waitFor(() => expect(fetchProtocolViewerCandidates).toHaveBeenCalledWith("7", "115"));
  });
});
