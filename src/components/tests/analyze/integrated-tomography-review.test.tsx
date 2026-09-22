import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchIntegratedAnalyzeContext: vi.fn(),
  reviewPanelSpy: vi.fn(),
  volumeViewerSpy: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: () => ({
    fetchIntegratedAnalyzeContext: mocks.fetchIntegratedAnalyzeContext,
  }),
}));

vi.mock("../../analyze/volume-viewer", () => ({
  default: (props: {
    onSelectedVolumeChange?: (volume: {
      id: number;
      scipionItemId: number;
      label: string;
    }) => void;
  } & Record<string, unknown>) => {
    mocks.volumeViewerSpy(props);
    return (
      <button
        type="button"
        onClick={() => props.onSelectedVolumeChange?.({
          id: 0,
          scipionItemId: 31,
          label: "Tomo 31",
        })}
      >
        Select tomogram 31
      </button>
    );
  },
}));

vi.mock("../../analyze/tomogram-review-panel", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.reviewPanelSpy(props);
    const selected = props.selectedTomogram as { id?: number } | null;
    const onNextUnreviewed = props.onNextUnreviewed as (() => void) | undefined;
    return (
      <div data-testid="tomogram-review-panel">
        Review target {selected?.id ?? "none"}
        <button type="button" onClick={onNextUnreviewed}>Next unreviewed from panel</button>
      </div>
    );
  },
}));

vi.mock("../../analyze/coords3d-viewer", () => ({
  default: () => <div>Mock Coords3dViewer</div>,
}));

vi.mock("../../analyze/tiltseries-viewer", () => ({
  default: () => <div>Mock TiltSeriesViewer</div>,
}));

vi.mock("../../analyze/ctftomo-viewer", () => ({
  default: () => <div>Mock CTFTomoViewer</div>,
}));

vi.mock("../../analyze/metadata-viewer", () => ({
  MetadataViewer: () => <div>Mock MetadataViewer</div>,
}));

import IntegratedTomographyViewer from "../../analyze/integrated-tomography-viewer";

describe("IntegratedTomographyViewer reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects the selected source tomogram to its review panel", async () => {
    mocks.fetchIntegratedAnalyzeContext.mockResolvedValue({
      root: {
        outputClass: "SetOfTomograms",
      },
      links: {},
      summaries: {
        tomogram: { size: 12 },
      },
      relations: { items: [] },
    });

    render(
      <IntegratedTomographyViewer
        projectId={7}
        protocolId={42}
        outputName="outputTomograms"
        pointerClass="SetOfTomograms"
      />,
    );

    expect(await screen.findByTestId("tomogram-review-panel")).toHaveTextContent(
      "Review target none",
    );

    fireEvent.click(screen.getByRole("button", { name: "Select tomogram 31" }));

    await waitFor(() => {
      expect(screen.getByTestId("tomogram-review-panel")).toHaveTextContent(
        "Review target 31",
      );
      expect(mocks.reviewPanelSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId: 7,
          protocolId: 42,
          outputName: "outputTomograms",
          selectedTomogram: { id: 31, label: "Tomo 31" },
        }),
      );
    });
  });

  it("reviews against the linked tomogram Set instead of the coordinates Set", async () => {
    mocks.fetchIntegratedAnalyzeContext.mockResolvedValue({
      root: {
        outputClass: "SetOfCoordinates3D",
      },
      links: {
        tomogram: {
          status: "available",
          publicProtocolId: 88,
          outputName: "linkedTomograms",
        },
      },
      summaries: {
        coordinates3d: { size: 500 },
        tomogram: { size: 8 },
      },
      relations: { items: [] },
    });

    render(
      <IntegratedTomographyViewer
        projectId={7}
        protocolId={42}
        outputName="outputCoordinates"
        pointerClass="SetOfCoordinates3D"
      />,
    );

    fireEvent.click(await screen.findByText("Tomogram"));

    expect(await screen.findByTestId("tomogram-review-panel")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.reviewPanelSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId: 7,
          protocolId: 88,
          outputName: "linkedTomograms",
          selectedTomogram: null,
        }),
      );
    });
  });

  it("shares review status and filter state with the tomogram list", async () => {
    mocks.fetchIntegratedAnalyzeContext.mockResolvedValue({
      root: {
        outputClass: "SetOfTomograms",
      },
      links: {},
      summaries: {
        tomogram: { size: 12 },
      },
      relations: { items: [] },
    });

    render(
      <IntegratedTomographyViewer
        projectId={7}
        protocolId={42}
        outputName="outputTomograms"
        pointerClass="SetOfTomograms"
      />,
    );

    await screen.findByTestId("tomogram-review-panel");

    const reviewPanelProps = mocks.reviewPanelSpy.mock.lastCall?.[0] as {
      onContextChange?: (context: unknown) => void;
      onReviewFilterChange?: (filter: string) => void;
    };

    reviewPanelProps.onContextChange?.({
      setId: 47,
      schema: null,
      progress: { total: 2, reviewed: 1 },
      reviews: {
        "31": { scipionItemId: 31, reviewed: true },
      },
    });
    reviewPanelProps.onReviewFilterChange?.("pending");

    await waitFor(() => {
      expect(mocks.volumeViewerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          reviewedScipionItemIds: [31],
          reviewFilter: "pending",
        }),
      );
    });
  });


  it("forwards next-unreviewed requests from the panel to the volume viewer", async () => {
    mocks.fetchIntegratedAnalyzeContext.mockResolvedValue({
      root: { outputClass: "SetOfTomograms" },
      links: {},
      summaries: { tomogram: { size: 12 } },
      relations: { items: [] },
    });

    render(
      <IntegratedTomographyViewer
        projectId={7}
        protocolId={42}
        outputName="outputTomograms"
        pointerClass="SetOfTomograms"
      />,
    );

    await screen.findByTestId("tomogram-review-panel");
    expect(mocks.volumeViewerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ nextUnreviewedRequest: 0 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next unreviewed from panel" }));

    await waitFor(() => {
      expect(mocks.volumeViewerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ nextUnreviewedRequest: 1 }),
      );
    });
  });

});
