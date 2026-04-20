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
    mockResolveAnalyzeViewer.mockResolvedValue({ handled: false });
  });

  it("renders empty outputs state and disables analyze button when there are no outputs", () => {
    renderComponent({
      outputsFromApi: [],
    });

    expect(screen.getByText("No outputs for this protocol.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze results" })).toBeDisabled();
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
      expect(mockFetchOutputPreview).toHaveBeenCalledWith("1", "2", "outputA", undefined);
    });

    expect(await screen.findByText("This is the first preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze results" })).toBeEnabled();
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
      expect(mockFetchOutputPreview).toHaveBeenCalledWith("1", "2", "outputB", undefined);
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

    fireEvent.click(screen.getByRole("button", { name: "Analyze results" }));

    await waitFor(() => {
      expect(mockResolveAnalyzeViewer).toHaveBeenCalled();
    });

    expect(await screen.findByTestId("analyze-output-dialog")).toBeInTheDocument();
    expect(screen.getByText("Import Movies::outputA")).toBeInTheDocument();
  });
});