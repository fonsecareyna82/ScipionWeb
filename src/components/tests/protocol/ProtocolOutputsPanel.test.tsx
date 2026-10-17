import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolOutputsPanel from "@/components/protocol/ProtocolOutputsPanel";

const mockFetchOutputPreview = vi.fn();
const mockResolveAnalyzeViewer = vi.fn();

const mockProjectService = {
  fetchOutputPreview: mockFetchOutputPreview,
  resolveAnalyzeViewer: mockResolveAnalyzeViewer,
};

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: () => mockProjectService,
}));

vi.mock("@/components/analyze/analyze-output-dialog", () => ({
  default: ({
    open,
    outputName,
    protocolLabel,
  }: {
    open: boolean;
    outputName: string;
    protocolLabel?: string;
  }) =>
    open ? (
      <div data-testid="analyze-output-dialog">
        {protocolLabel}::{outputName}
      </div>
    ) : null,
}));

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof ProtocolOutputsPanel>> = {},
) {
  render(
    <ProtocolOutputsPanel
      projectId={1}
      protocolId={2}
      protocolLabel="My Protocol"
      outputsFromApi={[]}
      {...overrides}
    />,
  );
}

describe("ProtocolOutputsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFetchOutputPreview.mockResolvedValue(null);
    mockResolveAnalyzeViewer.mockResolvedValue({
      handled: false,
    });

    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(
        URL,
        "revokeObjectURL",
        {
          configurable: true,
          value: vi.fn(),
        },
      );
    }
  });

  it("renders empty outputs state and disables analyze button when there are no outputs", () => {
    renderComponent({
      outputsFromApi: [],
    });

    expect(screen.getByText("No outputs for this protocol.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze output" })).toBeDisabled();
  });

  it("renders scalar outputs locally without requesting a preview", () => {
    renderComponent({
      outputsFromApi: [
        {
          outputName: "boxsize",
          info: "256",
          paramClass: "PointerParam",
          pointerClass: "Integer",
        },
      ],
    });

    expect(
      screen.getByText("boxsize: 256"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Output value"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Integer"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("256"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole(
        "button",
        { name: "Analyze output" },
      ),
    ).not.toBeInTheDocument();

    expect(
      mockFetchOutputPreview,
    ).not.toHaveBeenCalled();

    expect(
      mockResolveAnalyzeViewer,
    ).not.toHaveBeenCalled();
  });

  it("shows an error when projectId or protocolId is missing", async () => {
    renderComponent({
      projectId: null,
      protocolId: 2,
      outputsFromApi: [
        {
          outputName: "outputA",
          info: "Output A",
        },
      ],
    });

    expect(
      await screen.findByText("Missing projectId or protocolId"),
    ).toBeInTheDocument();
  });

  it("auto-selects the first output, fetches its preview and renders text preview", async () => {
    mockFetchOutputPreview.mockResolvedValue({
      kind: "text",
      text: "This is the first preview",
    });

    renderComponent({
      outputsFromApi: [
        {
          outputName: "outputA",
          info: "Output A",
        },
      ],
    });

    await waitFor(() => {
      expect(mockFetchOutputPreview).toHaveBeenCalledWith(
        "1",
        "2",
        "outputA",
        expect.objectContaining({
          signal: expect.anything(),
        }),
      );
    });

    expect(await screen.findByText("This is the first preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze output" })).toBeEnabled();
  });

  it("renders image previews without output-specific presentation", async () => {
    mockFetchOutputPreview.mockResolvedValue({
      kind: "image",
      url: "blob:image-preview",
      meta: {
        type: "movie-set",
        rowCount: 10,
      },
      downloadUrl: "",
    });

    renderComponent({
      outputsFromApi: [
        {
          outputName: "outputMovies",
          info: "Movies (10 items)",
        },
      ],
    });

    const image = await screen.findByRole(
      "img",
      {
        name: "outputMovies",
      },
    );

    expect(image).toHaveAttribute(
      "src",
      "blob:image-preview",
    );

    expect(
      screen.queryByText(
        /representative movies/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("fetches and renders the selected output preview when clicking another output", async () => {
    mockFetchOutputPreview.mockImplementation(
      async (_projectId: string, _protocolId: string, outputName: string) => {
        if (outputName === "outputA") {
          return { kind: "text", text: "Preview A" };
        }
        if (outputName === "outputB") {
          return { kind: "text", text: "Preview B" };
        }
        return null;
      },
    );

    renderComponent({
      outputsFromApi: [
        {
          outputName: "outputA",
          info: "Output A",
        },
        {
          outputName: "outputB",
          info: "Output B",
        },
      ],
    });

    expect(await screen.findByText("Preview A")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Output B"));

    await waitFor(() => {
      expect(mockFetchOutputPreview).toHaveBeenCalledWith(
        "1",
        "2",
        "outputB",
        expect.objectContaining({
          signal: expect.anything(),
        }),
      );
    });

    expect(await screen.findByText("Preview B")).toBeInTheDocument();
  });

  it("shows preview errors when fetchOutputPreview fails", async () => {
    mockFetchOutputPreview.mockRejectedValue(new Error("Failed to load preview from backend"));

    renderComponent({
      outputsFromApi: [
        {
          outputName: "outputA",
          info: "Output A",
        },
      ],
    });

    expect(
      await screen.findByText("Failed to load preview from backend"),
    ).toBeInTheDocument();
  });

  it("keeps the selected output when an earlier output disappears", async () => {
    mockFetchOutputPreview.mockImplementation(async (_project, _protocol, outputName) => ({
      kind: "text", text: `Preview ${outputName}`,
    }));
    const outputs = ["outputA", "outputB", "outputC"].map((outputName) => ({ outputName, info: outputName }));
    const { rerender } = render(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={outputs} />);
    await screen.findByText("Preview outputA");
    fireEvent.click(screen.getByText("outputB"));
    await screen.findByText("Preview outputB");
    rerender(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={outputs.slice(1)} />);
    await waitFor(() => expect(mockFetchOutputPreview.mock.lastCall?.[2]).toBe("outputB"));
    expect(await screen.findByText("Preview outputB")).toBeInTheDocument();
  });

  it("keeps the displayed order when refreshed outputs arrive reversed", async () => {
    const outputs = [
      { outputName: "outputA", info: "Output A", pointerClass: "Integer" },
      { outputName: "outputB", info: "Output B", pointerClass: "Integer" },
    ];
    const { rerender } = render(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={outputs} />);
    rerender(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={[...outputs].reverse()} />);
    const first = screen.getByText("outputA: Output A");
    const second = screen.getByText("outputB: Output B");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    { projectId: 1, protocolId: 3 },
    { projectId: 3, protocolId: 2 },
  ])("starts with the new output order and selection when switching scope to %j", async (scope) => {
    mockFetchOutputPreview.mockImplementation(async (_project, _protocol, outputName) => ({
      kind: "text", text: `Preview ${outputName}`,
    }));
    const outputs = ["outputA", "outputB", "outputC"].map((outputName) => ({ outputName, info: outputName }));
    const { rerender } = render(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={outputs} />);
    await screen.findByText("Preview outputA");
    fireEvent.click(screen.getByText("outputB"));
    await screen.findByText("Preview outputB");
    rerender(<ProtocolOutputsPanel {...scope} outputsFromApi={[...outputs].reverse()} />);
    expect(await screen.findByText("Preview outputC")).toBeInTheDocument();
    expect(mockFetchOutputPreview.mock.lastCall?.slice(0, 3)).toEqual([
      String(scope.projectId), String(scope.protocolId), "outputC",
    ]);
    expect(screen.getByText("outputC").compareDocumentPosition(screen.getByText("outputA")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("falls back to the first remaining output and clears selection on an empty list", async () => {
    mockFetchOutputPreview.mockImplementation(async (_project, _protocol, outputName) => ({
      kind: "text", text: `Preview ${outputName}`,
    }));
    const outputs = ["outputA", "outputB"].map((outputName) => ({ outputName, info: outputName }));
    const { rerender } = render(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={outputs} />);
    await screen.findByText("Preview outputA");
    fireEvent.click(screen.getByText("outputB"));
    await screen.findByText("Preview outputB");
    rerender(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={[outputs[0]]} />);
    await screen.findByText("Preview outputA");
    rerender(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={[]} />);
    expect(screen.getByText("No outputs for this protocol.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze output" })).toBeDisabled();
    rerender(<ProtocolOutputsPanel projectId={1} protocolId={2} outputsFromApi={[...outputs].reverse()} />);
    await screen.findByText("Preview outputB");
  });

  it("opens AnalyzeOutputDialog when clicking Analyze results and resolver does not handle it", async () => {
    mockFetchOutputPreview.mockResolvedValue({
      kind: "text",
      text: "Preview A",
    });
    mockResolveAnalyzeViewer.mockResolvedValue({
      handled: false,
    });

    renderComponent({
      protocolLabel: "Import Movies",
      outputsFromApi: [
        {
          outputName: "outputA",
          info: "Output A",
          pointerClass: "SetOfMovies",
        },
      ],
    });

    expect(await screen.findByText("Preview A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Analyze output" }));

    await waitFor(() => {
      expect(mockResolveAnalyzeViewer).toHaveBeenCalled();
    });

    expect(await screen.findByTestId("analyze-output-dialog")).toBeInTheDocument();
    expect(screen.getByText("Import Movies::outputA")).toBeInTheDocument();
  });
});


describe("RED 129: the output action is explicitly scoped", () => {
  it("labels output analysis separately and preserves the selected output resolver", async () => {
    mockFetchOutputPreview.mockResolvedValue(null);
    mockResolveAnalyzeViewer.mockResolvedValue({ handled: false });
    renderComponent({ outputsFromApi: [
      { outputName: "outputA", info: "Output A" },
      { outputName: "outputB", info: "Output B" },
    ] });
    fireEvent.click(screen.getByText("Output B"));
    fireEvent.click(screen.getByRole("button", { name: "Analyze output" }));
    await waitFor(() => {
      expect(mockResolveAnalyzeViewer).toHaveBeenCalledWith(
        expect.objectContaining({ outputName: "outputB", protocolId: "2" }),
      );
    });
    expect(await screen.findByTestId("analyze-output-dialog")).toHaveTextContent("outputB");
  });
});
