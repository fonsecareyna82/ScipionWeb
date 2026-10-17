import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolViewerDiscoveryDialog from "@/components/protocol/ProtocolViewerDiscoveryDialog";

const fetchProtocolViewerCandidates = vi.fn();
const fetchProtocolViewerRuntimePreview = vi.fn();
const runProtocolViewerAction = vi.fn();
// Stable service identity: an unstable mock re-triggers the loading effects.
const mockProjectService = {
  fetchProtocolViewerCandidates, fetchProtocolViewerRuntimePreview, runProtocolViewerAction,
};
vi.mock("@/ProjectServiceContext", () => ({useProjectService: () => mockProjectService}));
vi.mock("@/components/analyze/analyze-output-dialog", () => ({
  default: (props: {outputName: string; displayName?: string; protocolId: number;
    outputRaw: {pointerClass?: string} | null; metadataFile?: {initialTable?: string | null} | null}) => (
    <div data-testid="analyze-output-dialog">
      {`${props.protocolId}|${props.outputName}|${props.displayName ?? ""}|${props.outputRaw?.pointerClass ?? ""}|${props.metadataFile?.initialTable ?? ""}`}
    </div>
  ),
}));

const viewerId = "xmipp3.viewers.XmippCL2DViewer";
const viewer = {id: viewerId, name: "XmippCL2DViewer", webReady: false};

function field(name: string, label: string, control = "text", extras: Record<string, unknown> = {}) {
  return {
    name, label, control, readOnly: true, executionAllowed: false,
    hidden: false, hiddenAttributeAvailable: true, pending: false,
    visibility: "visible", visible: true, conditionState: "none", hasCondition: false,
    ...extras,
  };
}

function runtimePreview(overrides: Record<string, unknown> = {}) {
  return {
    status: "runtime-preview", source: "isolated-worker",
    projectId: 1, protocolId: "7", viewerId,
    fieldsDiscovered: 3, omittedFields: 0,
    webReady: false, renderable: false, executionAllowed: false,
    sections: [{label: "Visualization", fields: [
      field("doShowLastLevel", "Level to visualize", "select", {choices: ["last", "selection"], default: "0"}),
      field("classesToShow", "What to show", "select", {choices: ["classes", "cores"], default: "0"}),
      field("showConvergence", "Visualize convergence", "label"),
    ], groups: []}],
    actions: ["classesToShow", "showConvergence"],
    ...overrides,
  };
}

function actionReply(action: string, items: unknown[], extra: Record<string, unknown> = {}) {
  return {status: "viewer-action", projectId: 1, protocolId: "7", viewerId, action,
    items, messages: [], omittedItems: 0, ...extra};
}

function renderDialog(projectId: number | string = 1, protocolId: number | string = 7) {
  return render(<ProtocolViewerDiscoveryDialog open onClose={vi.fn()} projectId={projectId} protocolId={protocolId} />);
}

async function form() {
  renderDialog();
  return screen.findByTestId("protocol-viewer-runtime-preview");
}

describe("protocol viewers built from the plugin's runtime form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProtocolViewerCandidates.mockResolvedValue({viewers: [viewer], runtimePreviewAvailable: true});
    fetchProtocolViewerRuntimePreview.mockResolvedValue(runtimePreview());
  });

  it("opens the only viewer's form directly with the exact protocol identity", async () => {
    await form();
    expect(fetchProtocolViewerRuntimePreview).toHaveBeenCalledTimes(1);
    const [projectId, protocolId, id, opts] = fetchProtocolViewerRuntimePreview.mock.calls[0];
    expect([projectId, protocolId, id]).toEqual(["1", "7", viewerId]);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the static description when the server does not offer runtime viewers", async () => {
    fetchProtocolViewerCandidates.mockResolvedValue({viewers: [viewer]});
    renderDialog();
    fireEvent.click(await screen.findByRole("button", {name: "Show details for XmippCL2DViewer"}));
    expect(screen.getByTestId("protocol-viewer-details")).toBeInTheDocument();
    expect(fetchProtocolViewerRuntimePreview).not.toHaveBeenCalled();
  });

  it("shows an eye only next to the fields the viewer can show", async () => {
    const result = await form();
    expect(within(result).getByRole("button", {name: "Show What to show"})).toBeInTheDocument();
    expect(within(result).getByRole("button", {name: "Show Visualize convergence"})).toBeInTheDocument();
    expect(within(result).queryByRole("button", {name: "Show Level to visualize"})).not.toBeInTheDocument();
  });

  it("rejects forms for another protocol or claiming execution rights", async () => {
    fetchProtocolViewerRuntimePreview.mockResolvedValue(runtimePreview({protocolId: "8"}));
    renderDialog();
    expect(await screen.findByText("The viewer form could not be read.")).toBeInTheDocument();
  });

  it("sends the current form values with the action and renders plots, tables and text", async () => {
    runProtocolViewerAction.mockResolvedValue(actionReply("showConvergence", [
      {kind: "plot", title: "Similarity", mediaType: "image/png", data: "iVBORw0KGgo="},
      {kind: "table", title: "Sizes", message: "", header: ["class", "size"], rows: [[1, 10]], truncated: false},
      {kind: "text", title: "Hierarchy", files: [{name: "h.txt", path: "Runs/h.txt", content: "1 -> 2", truncated: false, missing: false}]},
      {kind: "unsupported", viewClass: "ChimeraView", reason: "desktop_command", detail: ""},
    ], {messages: [{level: "warning", title: "", text: "Level 4 only"}]}));
    const result = await form();
    fireEvent.mouseDown(within(result).getByRole("combobox", {name: "Level to visualize"}));
    fireEvent.click(await screen.findByRole("option", {name: "selection"}));
    fireEvent.click(within(result).getByRole("button", {name: "Show Visualize convergence"}));

    const results = await screen.findByTestId("protocol-viewer-action-results");
    expect(runProtocolViewerAction).toHaveBeenCalledWith(
      "1", "7", viewerId, "showConvergence",
      {doShowLastLevel: 1, classesToShow: 0}, expect.objectContaining({signal: expect.any(AbortSignal)}));
    expect(within(results).getByRole("img", {name: "Similarity"})).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(within(results).getByRole("cell", {name: "10"})).toBeInTheDocument();
    expect(within(results).getByText("1 -> 2")).toBeInTheDocument();
    expect(within(results).getByText(/Opens an external desktop program/)).toBeInTheDocument();
    expect(within(results).getByText("Level 4 only")).toBeInTheDocument();
  });

  it("opens a single file result in the metadata viewer on the requested block", async () => {
    runProtocolViewerAction.mockResolvedValue(actionReply("showConvergence", [{
      kind: "data", viewClass: "DataView", title: "level_classes.xmd", format: "metadata",
      table: "info", index: null, viewParams: {}, output: null,
      path: "Runs/000115/extra/level_classes.xmd", fileToken: "vf.abc.def",
    }]));
    const result = await form();
    fireEvent.click(within(result).getByRole("button", {name: "Show Visualize convergence"}));
    expect(await screen.findByTestId("analyze-output-dialog"))
      .toHaveTextContent("7|vf.abc.def|info@level_classes.xmd||info");
  });

  it("opens stored outputs, also from other protocols, with the output viewers", async () => {
    runProtocolViewerAction.mockResolvedValue(actionReply("classesToShow", [
      {kind: "data", viewClass: "ObjectView", title: "movies", format: "metadata", table: null, index: null,
        viewParams: {}, output: {protocolId: 2, outputName: "outputMovies", className: "SetOfMovies"},
        path: null, fileToken: null},
      {kind: "data", viewClass: "ClassesView", title: "classes.sqlite", format: "metadata", table: null, index: null,
        viewParams: {}, output: null, path: "Runs/classes.sqlite", fileToken: "vf.x.y"},
    ]));
    const result = await form();
    fireEvent.click(within(result).getByRole("button", {name: "Show What to show"}));
    const results = await screen.findByTestId("protocol-viewer-action-results");
    expect(screen.queryByTestId("analyze-output-dialog")).not.toBeInTheDocument();
    fireEvent.click(within(results).getAllByRole("button", {name: "Open"})[0]);
    expect(screen.getByTestId("analyze-output-dialog")).toHaveTextContent("2|outputMovies|outputMovies|SetOfMovies|");
    fireEvent.click(within(results).getAllByRole("button", {name: "Open"})[1]);
    expect(screen.getByTestId("analyze-output-dialog")).toHaveTextContent("7|vf.x.y|classes.sqlite|SetOfClasses2D|");
  });

  it("shows the viewer's own validation messages when an action fails", async () => {
    runProtocolViewerAction.mockRejectedValue(Object.assign(new Error("validation_failed"), {
      code: "validation_failed", messages: ["Select at least one level"],
    }));
    const result = await form();
    fireEvent.click(within(result).getByRole("button", {name: "Show What to show"}));
    expect(await screen.findByText("Select at least one level")).toBeInTheDocument();
  });

  it("drops results that belong to a different action", async () => {
    runProtocolViewerAction.mockResolvedValue(actionReply("otherAction", []));
    const result = await form();
    fireEvent.click(within(result).getByRole("button", {name: "Show What to show"}));
    expect(await screen.findByText("The viewer answer could not be read.")).toBeInTheDocument();
  });

  it("does not show a stale form when the protocol changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    fetchProtocolViewerRuntimePreview.mockReturnValueOnce(new Promise(resolve => {resolveFirst = resolve;}));
    const {rerender} = renderDialog(1, 7);
    await waitFor(() => expect(fetchProtocolViewerRuntimePreview).toHaveBeenCalledTimes(1));
    const firstSignal = fetchProtocolViewerRuntimePreview.mock.calls[0][3].signal as AbortSignal;
    fetchProtocolViewerRuntimePreview.mockResolvedValue(runtimePreview({protocolId: "8"}));
    rerender(<ProtocolViewerDiscoveryDialog open onClose={vi.fn()} projectId={1} protocolId={8} />);
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
    resolveFirst(runtimePreview());
    await screen.findByTestId("protocol-viewer-runtime-preview");
    expect(fetchProtocolViewerRuntimePreview.mock.calls[fetchProtocolViewerRuntimePreview.mock.calls.length - 1].slice(0, 3)).toEqual(["1", "8", viewerId]);
  });
});
