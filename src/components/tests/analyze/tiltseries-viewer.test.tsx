import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    listOutputTiltSeries: vi.fn(),
    fetchTiltSeriesFrames: vi.fn(),
    fetchTiltSeriesViewImageObjectUrl: vi.fn(),
    fetchTiltSeriesViewImagesBatch: vi.fn(),
    createNewSetOfTiltSeries: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
}));

function getButtonFromIconTestId(testId: string): HTMLButtonElement {
    const icon = screen.getByTestId(testId);
    const button = icon.closest("button");

    if (!button) {
        throw new Error(`Button for icon ${testId} was not found`);
    }

    return button as HTMLButtonElement;
}

async function flushMicrotasks() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function expandFirstTiltSeries() {
    expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

    const firstExpandIcon = screen.getAllByTestId("ChevronRightIcon")[0];
    const firstExpandButton = firstExpandIcon.closest("button");

    if (!firstExpandButton) {
        throw new Error("First tilt series expand button was not found");
    }

    fireEvent.click(firstExpandButton);
}

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

vi.mock("@/icons", () => ({
    CloseIcon: (props: Record<string, unknown>) => (
        <svg data-testid="close-icon" {...props} />
    ),
}));

vi.mock("react-hot-toast", () => ({
    default: toastMocks,
}));

vi.mock("../../analyze/metadata-viewer", () => ({
    MetadataViewer: ({ outputName }: { outputName: string }) => (
        <div>Mock MetadataViewer {outputName}</div>
    ),
}));

import TiltSeriesViewer from "../../analyze/tiltseries-viewer";

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

function makeSeriesList() {
    return [
        {
            id: "TS1",
            label: "Series 1",
            nViews: 2,
            tiltAxisAngle: 23.5,
            pixelSize: 1.5,
            dims: [100, 80, 2],
        },
        {
            id: "TS2",
            label: "Series 2",
            nViews: 1,
            tiltAxisAngle: 15.2,
            pixelSize: 2.0,
            dims: [120, 90, 1],
        },
    ];
}

function makeFramesPayload(seriesId: string) {
    if (seriesId === "TS2") {
        return {
            tiltSeriesId: "TS2",
            label: "Series 2",
            tiltAxisAngle: 15.2,
            frames: [
                {
                    viewId: "ts2-v1",
                    index: 0,
                    order: 0,
                    tiltAngle: 5,
                    excluded: false,
                    dose: 0.5,
                    path: "/data/ts2_only.mrc",
                    rot: 0,
                    shiftX: 0,
                    shiftY: 0,
                },
            ],
        };
    }

    return {
        tiltSeriesId: "TS1",
        label: "Series 1",
        tiltAxisAngle: 23.5,
        frames: [
            {
                viewId: "ts1-v1",
                index: 0,
                order: 0,
                tiltAngle: -30,
                excluded: false,
                dose: 1.1,
                path: "/data/first.mrc",
                rot: 0.2,
                shiftX: 1.5,
                shiftY: -0.5,
            },
            {
                viewId: "ts1-v2",
                index: 1,
                order: 1,
                tiltAngle: 0,
                excluded: false,
                dose: 2.2,
                path: "/data/second.mrc",
                rot: 0.4,
                shiftX: 2.5,
                shiftY: -1.5,
            },
        ],
    };
}

function makeFramesPayloadWithCount(
    seriesId: string,
    count: number,
) {
    return {
        tiltSeriesId: seriesId,
        label: `Series ${seriesId}`,
        tiltAxisAngle: 23.5,
        frames: Array.from(
            { length: count },
            (_, index) => ({
                viewId: `${seriesId}-v${index}`,
                index,
                order: index,
                tiltAngle: -60 + index,
                excluded: false,
                dose: index,
                path: `/data/${seriesId}_${index}.mrc`,
                rot: 0,
                shiftX: 0,
                shiftY: 0,
            }),
        ),
    };
}

function renderViewer() {
    return render(
        <TiltSeriesViewer
            projectId={1}
            protocolId={2}
            outputName="tiltOutput"
            protocolLabel="Prot A"
        />,
    );
}

describe("TiltSeriesViewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        serviceMocks.listOutputTiltSeries.mockResolvedValue(makeSeriesList());

        serviceMocks.fetchTiltSeriesFrames.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                seriesId: string,
            ) => makeFramesPayload(String(seriesId)),
        );

        serviceMocks.fetchTiltSeriesViewImageObjectUrl.mockResolvedValue({
            url: "blob:preview-1",
            revoke: vi.fn(),
        });

        serviceMocks.fetchTiltSeriesViewImagesBatch.mockResolvedValue({
            items: [],
            errors: [],
        });

        serviceMocks.createNewSetOfTiltSeries.mockResolvedValue({});
    });

    it("shows the loading state while tilt series are pending", async () => {
        const deferred = createDeferred<ReturnType<typeof makeSeriesList>>();
        serviceMocks.listOutputTiltSeries.mockReturnValueOnce(deferred.promise);

        renderViewer();

        expect(await screen.findByText("Loading tilt series…")).toBeInTheDocument();

        deferred.resolve([]);

        await waitFor(() => {
            expect(
                screen.getByText("No tilt series available for this output."),
            ).toBeInTheDocument();
        });
    });

    it("shows an error when tilt series loading fails", async () => {
        serviceMocks.listOutputTiltSeries.mockRejectedValueOnce(
            new Error("Series failed"),
        );

        renderViewer();

        await waitFor(() => {
            expect(screen.getByText("Series failed")).toBeInTheDocument();
        });
    });

    it("shows the empty state when no tilt series are returned", async () => {
        serviceMocks.listOutputTiltSeries.mockResolvedValueOnce([]);

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No tilt series available for this output."),
            ).toBeInTheDocument();
        });
    });

    it("auto-selects the first series and loads its frames", async () => {
        renderViewer();

        await expandFirstTiltSeries();

        expect(await screen.findByText("/data/first.mrc")).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchTiltSeriesFrames).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                "TS1",
            );
        });

        expect(await screen.findByText("/data/first.mrc")).toBeInTheDocument();
        expect(screen.getByText("View 1 of 2")).toBeInTheDocument();

        await waitFor(() => {
            expect(
                serviceMocks.fetchTiltSeriesViewImageObjectUrl,
            ).toHaveBeenCalledTimes(1);
        });
    });

    it("shows separate headers for tilt series and tilt images", async () => {
        renderViewer();

        expect(await screen.findByText("Tilt series")).toBeInTheDocument();
        expect(screen.getByText("Views")).toBeInTheDocument();
        expect(screen.getByText("Tilt axis")).toBeInTheDocument();
        expect(screen.getByText("Pixel size")).toBeInTheDocument();
        expect(screen.getByText("Dimensions")).toBeInTheDocument();

        expect(screen.queryByText("Tilt image")).not.toBeInTheDocument();

        await expandFirstTiltSeries();

        expect(await screen.findByText("Tilt image")).toBeInTheDocument();
        expect(screen.getByText("Order")).toBeInTheDocument();
        expect(screen.getByText("Tilt angle")).toBeInTheDocument();
        expect(screen.getByText("Dose")).toBeInTheDocument();
        expect(screen.getByText("Path")).toBeInTheDocument();
    });

    it("filters frames within the selected series", async () => {
        renderViewer();

        await expandFirstTiltSeries();

        expect(await screen.findByText("/data/first.mrc")).toBeInTheDocument();
        expect(screen.getByText("/data/second.mrc")).toBeInTheDocument();

        fireEvent.change(
            screen.getByPlaceholderText("Filter by angle, order or path"),
            { target: { value: "second" } },
        );

        expect(screen.queryByText("/data/first.mrc")).not.toBeInTheDocument();
        expect(screen.getByText("/data/second.mrc")).toBeInTheDocument();
    });

    it("switches to metadata mode", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        const previewTitle = screen.getByText("Tilt view preview");
        const previewHeader = previewTitle.closest("div")?.parentElement;

        expect(previewHeader).not.toBeNull();

        const metadataButton = within(previewHeader as HTMLElement).getByRole("button");
        fireEvent.click(metadataButton);

        expect(
            await screen.findByText(/Mock MetadataViewer tiltOutput/i),
        ).toBeInTheDocument();
    });

    it("opens and closes the save dialog", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("Create a new set")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => {
            expect(screen.queryByText("Create a new set")).not.toBeInTheDocument();
        });
    });

    it("creates a new set when confirming Yes", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Create a new set")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Yes" }));

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfTiltSeries).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                {
                    TS1: {
                        excluded: false,
                        tiltimages: [],
                    },
                    TS2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
                false,
            );
        });

        expect(toastMocks.success).toHaveBeenCalledWith(
            "New tilt series set created successfully.",
        );
    });

    it("refreshes the preview on demand", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchTiltSeriesViewImageObjectUrl).toHaveBeenCalled();
        });

        const initialCalls =
            serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length;

        fireEvent.click(getButtonFromIconTestId("RefreshIcon"));

        await waitFor(() => {
            expect(
                serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length,
            ).toBeGreaterThan(initialCalls);
        });
    });

    it("includes the current excluded frame in the save summary", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        fireEvent.click(
            getButtonFromIconTestId("close-icon"),
        );

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Create a new set")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Yes" }));

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfTiltSeries).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                {
                    TS1: {
                        excluded: false,
                        tiltimages: [0],
                    },
                    TS2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
                false,
            );
        });
    });

    it("includes a fully excluded series in the save summary", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        const ts1Row = screen.getByText("TS1").closest("tr");
        expect(ts1Row).not.toBeNull();

        const seriesCheckbox = within(ts1Row as HTMLElement).getByRole("checkbox");
        fireEvent.click(seriesCheckbox);

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Create a new set")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Yes" }));

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfTiltSeries).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                {
                    TS1: {
                        excluded: true,
                        tiltimages: [0, 1],
                    },
                    TS2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
                false,
            );
        });
    });


    it("autoplays to the next tilt", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        vi.useFakeTimers();

        try {
            fireEvent.click(getButtonFromIconTestId("PlayArrowIcon"));

            await flushMicrotasks();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(450);
            });

            await flushMicrotasks();

            expect(screen.getByText("View 2 of 2")).toBeInTheDocument();

            fireEvent.click(getButtonFromIconTestId("StopIcon"));

            await flushMicrotasks();
        } finally {
            vi.useRealTimers();
        }
    }, 10000);


    it("toggles apply alignments in preview requests", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchTiltSeriesViewImageObjectUrl).toHaveBeenCalled();
        });

        const initialCalls =
            serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length;
        const initialLastCall =
            serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls[initialCalls - 1];

        expect(initialLastCall[5]?.applyTransform).toBe(true);

        fireEvent.click(getButtonFromIconTestId("TransformIcon"));

        await waitFor(() => {
            expect(
                serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length,
            ).toBeGreaterThan(initialCalls);
        });

        const nextCalls = serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls;
        const nextLastCall = nextCalls[nextCalls.length - 1];

        expect(nextLastCall[5]?.applyTransform).toBeUndefined();
    });

    it("navigates with previous and next buttons", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        fireEvent.click(getButtonFromIconTestId("ArrowDownwardIcon"));
        expect(await screen.findByText("View 2 of 2")).toBeInTheDocument();

        fireEvent.click(getButtonFromIconTestId("ArrowUpwardIcon"));
        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();
    });

    it("creates a re-stacked set when confirming Re-stack", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Create a new set")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Re-stack" }));

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfTiltSeries).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                {
                    TS1: {
                        excluded: false,
                        tiltimages: [],
                    },
                    TS2: {
                        excluded: false,
                        tiltimages: [],
                    },
                },
                true,
            );
        });

        expect(toastMocks.success).toHaveBeenCalledWith(
            "New re-stacked tilt series set created successfully.",
        );
    });

    it("shows an error toast when creating a new set fails", async () => {
        serviceMocks.createNewSetOfTiltSeries.mockRejectedValueOnce(
            new Error("Create failed"),
        );

        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Create a new set")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Yes" }));

        await waitFor(() => {
            expect(toastMocks.error).toHaveBeenCalledWith("Create failed");
        });
    });

    it("warms the full active tilt series in batches of 24", async () => {
        const frameCount = 50;

        serviceMocks.listOutputTiltSeries.mockResolvedValueOnce([
            {
                id: "TS1",
                label: "Series 1",
                nViews: frameCount,
                tiltAxisAngle: 23.5,
                pixelSize: 1.5,
                dims: [100, 80, frameCount],
            },
        ]);

        serviceMocks.fetchTiltSeriesFrames.mockResolvedValueOnce(
            makeFramesPayloadWithCount(
                "TS1",
                frameCount,
            ),
        );

        serviceMocks.fetchTiltSeriesViewImagesBatch.mockImplementation(
            async (...args: any[]) => {
                const options = args[4];

                return {
                    items: options.indices.map(
                        (index: number) => ({
                            index,
                            dataUrl:
                                "data:image/webp;base64,AA==",
                        }),
                    ),
                    errors: [],
                };
            },
        );

        renderViewer();

        expect(
            await screen.findByText(
                `View 25 of ${frameCount}`,
            ),
        ).toBeInTheDocument();

        await waitFor(() => {
            const warmupCalls =
                serviceMocks.fetchTiltSeriesViewImagesBatch.mock.calls.filter(
                    (call) =>
                        call[4]?.size === 512,
                );

            expect(warmupCalls).toHaveLength(3);
        });

        const warmupCalls =
            serviceMocks.fetchTiltSeriesViewImagesBatch.mock.calls.filter(
                (call) =>
                    call[4]?.size === 512,
            );

        expect(
            warmupCalls.map(
                (call) =>
                    call[4].indices.length,
            ),
        ).toEqual([
            24,
            24,
            2,
        ]);

        expect(
            warmupCalls.flatMap(
                (call) =>
                    call[4].indices,
            ),
        ).toEqual(
            Array.from(
                { length: frameCount },
                (_, index) => index,
            ),
        );

        warmupCalls.forEach((call) => {
            expect(call[4].format).toBe("webp");
            expect(call[4].applyTransform).toBe(true);
            expect(call[4].signal).toBeInstanceOf(
                AbortSignal,
            );
        });
    });


    it("uses the warmed interactive preview while scrubbing", async () => {
        serviceMocks.fetchTiltSeriesViewImagesBatch.mockImplementation(
            async (...args: any[]) => {
                const options = args[4];

                return {
                    items: options.indices.map(
                        (index: number) => ({
                            index,
                            dataUrl:
                                "data:image/webp;base64,AA==",
                        }),
                    ),
                    errors: [],
                };
            },
        );

        renderViewer();

        expect(
            await screen.findByText(
                "View 1 of 2",
            ),
        ).toBeInTheDocument();

        await waitFor(() => {
            expect(
                serviceMocks.fetchTiltSeriesViewImagesBatch.mock.calls.some(
                    (call) =>
                        call[4]?.size === 512 &&
                        call[4]?.indices?.includes(1),
                ),
            ).toBe(true);
        });

        await flushMicrotasks();

        const individualCallsBefore =
            serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length;

        const sliders =
            screen.getAllByRole("slider");

        const tiltSlider =
            sliders[sliders.length - 1];

        fireEvent.change(
            tiltSlider,
            {
                target: {
                    value: "1",
                },
            },
        );

        expect(
            await screen.findByText(
                "View 2 of 2",
            ),
        ).toBeInTheDocument();

        await flushMicrotasks();

        const newIndividualCalls =
            serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.slice(
                individualCallsBefore,
            );

        expect(
            newIndividualCalls.some(
                (call) =>
                    Number(call[4]) === 1 &&
                    call[5]?.size === 512,
            ),
        ).toBe(false);
    });

    it("stops autoplay when switching to metadata", async () => {
        renderViewer();

        expect(await screen.findByText("View 1 of 2")).toBeInTheDocument();

        vi.useFakeTimers();

        try {
            fireEvent.click(getButtonFromIconTestId("PlayArrowIcon"));

            await flushMicrotasks();

            const callsBeforeMetadata =
                serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length;

            fireEvent.click(getButtonFromIconTestId("TableViewIcon"));

            expect(
                screen.getByText(/Mock MetadataViewer tiltOutput/i),
            ).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(900);
            });

            await flushMicrotasks();

            expect(
                serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length,
            ).toBe(callsBeforeMetadata);
        } finally {
            vi.useRealTimers();
        }
    }, 10000);
});