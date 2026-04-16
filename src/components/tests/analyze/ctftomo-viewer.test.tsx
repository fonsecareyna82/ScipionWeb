import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    listOutputCTFTomoSeries: vi.fn(),
    fetchCTFTomoSeriesViews: vi.fn(),
    fetchCTFPsdImage: vi.fn(),
    createNewSetOfCTFTomoSeries: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

vi.mock("react-hot-toast", () => ({
    default: toastMocks,
}));

vi.mock("react-plotly.js", () => ({
    default: ({
        onHover,
        onUnhover,
        onClick,
    }: {
        onHover?: (event: unknown) => void;
        onUnhover?: () => void;
        onClick?: (event: unknown) => void;
    }) => (
        <div data-testid="mock-plotly">
            <button
                type="button"
                onClick={() =>
                    onHover?.({
                        points: [{ customdata: ["ctf1-v1"] }],
                    })
                }
            >
                hover-point-1
            </button>

            <button
                type="button"
                onClick={() =>
                    onClick?.({
                        points: [{ customdata: ["ctf1-v1"] }],
                        event: { button: 0 },
                    })
                }
            >
                click-point-1
            </button>

            <button
                type="button"
                onClick={() =>
                    onHover?.({
                        points: [{ customdata: ["ctf1-v2"] }],
                    })
                }
            >
                hover-point-2
            </button>

            <button
                type="button"
                onClick={() =>
                    onClick?.({
                        points: [{ customdata: ["ctf1-v2"] }],
                        event: { button: 0 },
                    })
                }
            >
                click-point-2
            </button>

            <button type="button" onClick={() => onUnhover?.()}>
                unhover
            </button>
        </div>
    ),
}));

vi.mock("../../analyze/metadata-viewer", () => ({
    MetadataViewer: ({ outputName }: { outputName: string }) => (
        <div>Mock MetadataViewer {outputName}</div>
    ),
}));

import CTFTomoViewer from "../../analyze/ctftomo-viewer";

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

function getButtonFromIconTestId(testId: string): HTMLButtonElement {
    const icon = screen.getByTestId(testId);
    const button = icon.closest("button");

    if (!button) {
        throw new Error(`Button for icon ${testId} was not found`);
    }

    return button as HTMLButtonElement;
}

function makeSeriesList() {
    return [
        {
            id: "CTF1",
            label: "CTF Series 1",
            nViews: 2,
            excluded: false,
        },
        {
            id: "CTF2",
            label: "CTF Series 2",
            nViews: 1,
            excluded: false,
        },
    ];
}

function makeViewsPayload(seriesId: string) {
    if (seriesId === "CTF2") {
        return {
            ctfSeriesId: "CTF2",
            label: "CTF Series 2",
            frames: [
                {
                    viewId: "ctf2-v1",
                    index: 0,
                    order: 0,
                    tiltAngle: 5,
                    excluded: false,
                    defocusU: 25000,
                    defocusV: 24000,
                    astigmatism: 1000,
                    resolution: 8.5,
                    ccValue: 0.91,
                    psdFile: "/psd/ctf2.png",
                },
            ],
        };
    }

    return {
        ctfSeriesId: "CTF1",
        label: "CTF Series 1",
        frames: [
            {
                viewId: "ctf1-v1",
                index: 0,
                order: 0,
                tiltAngle: -30,
                excluded: false,
                defocusU: 22000,
                defocusV: 21000,
                astigmatism: 1000,
                resolution: 9.2,
                ccValue: 0.876,
                psdFile: "/psd/ctf1-a.png",
            },
            {
                viewId: "ctf1-v2",
                index: 1,
                order: 1,
                tiltAngle: 0,
                excluded: false,
                defocusU: 18000,
                defocusV: 17500,
                astigmatism: 500,
                resolution: 7.4,
                ccValue: 0.932,
                psdFile: "/psd/ctf1-b.png",
            },
        ],
    };
}

function renderViewer() {
    return render(
        <CTFTomoViewer
            projectId={1}
            protocolId={2}
            outputName="ctfOutput"
            protocolLabel="Prot A"
        />,
    );
}

describe("CTFTomoViewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(URL, "createObjectURL", {
            writable: true,
            value: vi.fn(() => "blob:psd-1"),
        });

        Object.defineProperty(URL, "revokeObjectURL", {
            writable: true,
            value: vi.fn(),
        });

        serviceMocks.listOutputCTFTomoSeries.mockResolvedValue(makeSeriesList());

        serviceMocks.fetchCTFTomoSeriesViews.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                seriesId: string,
            ) => makeViewsPayload(String(seriesId)),
        );

        serviceMocks.fetchCTFPsdImage.mockResolvedValue(new Blob(["fake-psd"]));

        serviceMocks.createNewSetOfCTFTomoSeries.mockResolvedValue({});
    });

    it("shows the loading state while CTF tomo series are pending", async () => {
        const deferred = createDeferred<ReturnType<typeof makeSeriesList>>();
        serviceMocks.listOutputCTFTomoSeries.mockReturnValueOnce(deferred.promise);

        renderViewer();

        expect(
            await screen.findByText("Loading CTF tomo series…"),
        ).toBeInTheDocument();

        deferred.resolve([]);

        await waitFor(() => {
            expect(
                screen.getByText("No CTF tomo series available for this output."),
            ).toBeInTheDocument();
        });
    });

    it("shows an error when CTF tomo series loading fails", async () => {
        serviceMocks.listOutputCTFTomoSeries.mockRejectedValueOnce(
            new Error("CTF series failed"),
        );

        renderViewer();

        await waitFor(() => {
            expect(screen.getByText("CTF series failed")).toBeInTheDocument();
        });
    });

    it("shows the empty state when no CTF tomo series are returned", async () => {
        serviceMocks.listOutputCTFTomoSeries.mockResolvedValueOnce([]);

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No CTF tomo series available for this output."),
            ).toBeInTheDocument();
        });
    });

    it("auto-selects the first series and loads its views", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchCTFTomoSeriesViews).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                "CTF1",
            );
        });

        expect(screen.getByText("22000.00")).toBeInTheDocument();
        expect(screen.getByText("18000.00")).toBeInTheDocument();
        expect(screen.getByTestId("mock-plotly")).toBeInTheDocument();
    });

    it("filters CTF views in the selected series", async () => {
        renderViewer();

        expect(await screen.findByText("22000.00")).toBeInTheDocument();
        expect(screen.getByText("18000.00")).toBeInTheDocument();

        fireEvent.change(
            screen.getByPlaceholderText("Filter by angle, order or CTF values"),
            { target: { value: "22000" } },
        );

        expect(screen.getByText("22000.00")).toBeInTheDocument();
        expect(screen.queryByText("18000.00")).not.toBeInTheDocument();
    });

    it("switches to metadata mode", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(getButtonFromIconTestId("TableViewIcon"));

        expect(
            await screen.findByText(/Mock MetadataViewer ctfOutput/i),
        ).toBeInTheDocument();
    });

    it("opens and closes the generate dialog", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => {
            expect(
                screen.queryByText("Generate CTF tomo subsets"),
            ).not.toBeInTheDocument();
        });
    });

    it("creates new CTF tomo subsets when confirming", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                {
                    CTF1: {
                        excluded: false,
                        tiltimages: [],
                    },
                    CTF2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
            );
        });

        expect(toastMocks.success).toHaveBeenCalledWith(
            "New CTF tomo series set created successfully.",
        );
    });

    it("opens PSD view when selecting a row with psdFile", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        const row = screen.getByText("22000.00").closest("tr");
        expect(row).not.toBeNull();

        fireEvent.click(row as HTMLElement);

        expect(await screen.findByAltText("PSD view")).toBeInTheDocument();
        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it("opens and closes the help dialog", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Help" }));

        expect(await screen.findByText("CTF tomo viewer help")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        await waitFor(() => {
            expect(screen.queryByText("CTF tomo viewer help")).not.toBeInTheDocument();
        });
    });

    it("shows an error toast when creating subsets fails", async () => {
        serviceMocks.createNewSetOfCTFTomoSeries.mockRejectedValueOnce(
            new Error("Generate failed"),
        );

        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(toastMocks.error).toHaveBeenCalledWith("Generate failed");
        });
    });

    it("includes an excluded row in the generated summary", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        const frameRow = screen.getByText("22000.00").closest("tr");
        expect(frameRow).not.toBeNull();

        const frameCheckbox = within(frameRow as HTMLElement).getByRole("checkbox");
        fireEvent.click(frameCheckbox);

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                {
                    CTF1: {
                        excluded: false,
                        tiltimages: [0],
                    },
                    CTF2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
            );
        });
    });

    it("includes a fully excluded series in the generated summary", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        const seriesRow = screen.getByText("CTF1").closest("tr");
        expect(seriesRow).not.toBeNull();

        const seriesCheckbox = within(seriesRow as HTMLElement).getByRole("checkbox");
        fireEvent.click(seriesCheckbox);

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                {
                    CTF1: {
                        excluded: true,
                        tiltimages: [0, 1],
                    },
                    CTF2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
            );
        });
    });

    it("opens PSD view when clicking a chart point", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "click-point-1" }));

        expect(await screen.findByAltText("PSD view")).toBeInTheDocument();
    });

    it("opens the chart context menu for the hovered point", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));

        const plotContainer = screen.getByTestId("mock-plotly").parentElement;
        expect(plotContainer).not.toBeNull();

        fireEvent.contextMenu(plotContainer as HTMLElement);

        expect(await screen.findByText("Exclude this view")).toBeInTheDocument();
        expect(screen.getByText("Exclude all views (current series)")).toBeInTheDocument();
        expect(screen.getByText("Include all views (current series)")).toBeInTheDocument();
    });

    it("excludes a hovered chart point from the context menu", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));

        const plotContainer = screen.getByTestId("mock-plotly").parentElement;
        expect(plotContainer).not.toBeNull();

        fireEvent.contextMenu(plotContainer as HTMLElement);

        fireEvent.click(await screen.findByText("Exclude this view"));

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                {
                    CTF1: {
                        excluded: false,
                        tiltimages: [0],
                    },
                    CTF2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
            );
        });
    });

    it("excludes all views of the current series from the chart context menu", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));

        const plotContainer = screen.getByTestId("mock-plotly").parentElement;
        expect(plotContainer).not.toBeNull();

        fireEvent.contextMenu(plotContainer as HTMLElement);

        fireEvent.click(await screen.findByText("Exclude all views (current series)"));

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                {
                    CTF1: {
                        excluded: true,
                        tiltimages: [0, 1],
                    },
                    CTF2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
            );
        });
    });

    it("includes all views of the current series from the chart context menu", async () => {
        renderViewer();

        expect(await screen.findByText("Views: 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));

        const plotContainer = screen.getByTestId("mock-plotly").parentElement;
        expect(plotContainer).not.toBeNull();

        fireEvent.contextMenu(plotContainer as HTMLElement);
        fireEvent.click(await screen.findByText("Exclude all views (current series)"));

        fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));
        fireEvent.contextMenu(plotContainer as HTMLElement);
        fireEvent.click(await screen.findByText("Include all views (current series)"));

        fireEvent.click(
            screen.getByRole("button", { name: "Generate subsets" }),
        );

        expect(
            await screen.findByText("Generate CTF tomo subsets"),
        ).toBeInTheDocument();

        const generateButtons = screen.getAllByRole("button", {
            name: "Generate subsets",
        });
        fireEvent.click(generateButtons[1]);

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
                1,
                2,
                "ctfOutput",
                {
                    CTF1: {
                        excluded: false,
                        tiltimages: [],
                    },
                    CTF2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
            );
        });
    });

    it("includes all views of the current series from the chart context menu", async () => {
  renderViewer();

  expect(await screen.findByText("Views: 2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));

  const plotContainer = screen.getByTestId("mock-plotly").parentElement;
  expect(plotContainer).not.toBeNull();

  fireEvent.contextMenu(plotContainer as HTMLElement);
  fireEvent.click(await screen.findByText("Exclude all views (current series)"));

  fireEvent.click(screen.getByRole("button", { name: "hover-point-1" }));
  fireEvent.contextMenu(plotContainer as HTMLElement);
  fireEvent.click(await screen.findByText("Include all views (current series)"));

  fireEvent.click(screen.getByRole("button", { name: "Generate subsets" }));

  expect(
    await screen.findByText("Generate CTF tomo subsets"),
  ).toBeInTheDocument();

  const generateButtons = screen.getAllByRole("button", {
    name: "Generate subsets",
  });
  fireEvent.click(generateButtons[1]);

  await waitFor(() => {
    expect(serviceMocks.createNewSetOfCTFTomoSeries).toHaveBeenCalledWith(
      1,
      2,
      "ctfOutput",
      {
        CTF1: {
          excluded: false,
          tiltimages: [],
        },
        CTF2: {
          excluded: false,
          tiltimages: [],
        },
      },
    );
  });
});

it("opens PSD view when clicking the second chart point", async () => {
  renderViewer();

  expect(await screen.findByText("Views: 2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "click-point-2" }));

  expect(await screen.findByAltText("PSD view")).toBeInTheDocument();
  expect(screen.getAllByText("Selected tilt: 0.00°").length).toBeGreaterThan(0);
});

it("returns from metadata mode back to the viewer", async () => {
  renderViewer();

  expect(await screen.findByText("Views: 2")).toBeInTheDocument();

  fireEvent.click(getButtonFromIconTestId("TableViewIcon"));

  expect(
    await screen.findByText(/Mock MetadataViewer ctfOutput/i),
  ).toBeInTheDocument();

  fireEvent.click(getButtonFromIconTestId("ArrowBackIcon"));

  expect(await screen.findByText("Views: 2")).toBeInTheDocument();
  expect(screen.getByTestId("mock-plotly")).toBeInTheDocument();
  expect(
    screen.queryByText(/Mock MetadataViewer ctfOutput/i),
  ).not.toBeInTheDocument();
});

});