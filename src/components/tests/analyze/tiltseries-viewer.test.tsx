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
            dims: [100, 80, 1],
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

    it("shows separate tilt series and tilt image metadata", async () => {
        renderViewer();

        expect(await screen.findByText("Tilt series")).toBeInTheDocument();
        expect(screen.getByText("Views")).toBeInTheDocument();
        expect(screen.getByText("Tilt axis")).toBeInTheDocument();
        expect(screen.getByText("Pixel size")).toBeInTheDocument();
        expect(screen.getByText("Dimensions")).toBeInTheDocument();

        expect(screen.getByText("100 × 80 × 2")).toBeInTheDocument();

        await expandFirstTiltSeries();

        expect(screen.queryByText("Tilt image")).not.toBeInTheDocument();
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

    it("excludes current-series tilt images matching a numeric column criterion", async () => {
        renderViewer();

        await expandFirstTiltSeries();

        fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Dose" }));

        const dialog = await screen.findByRole("dialog", {
            name: "Exclude tilt images by Dose",
        });

        expect(within(dialog).getByLabelText("Criterion")).toHaveTextContent(
            "Greater than",
        );

        fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Value" }), {
            target: { value: "1.5" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Exclude" }));

        const firstRow = screen.getByText("/data/first.mrc").closest("tr");
        const secondRow = screen.getByText("/data/second.mrc").closest("tr");

        expect(firstRow).not.toBeNull();
        expect(secondRow).not.toBeNull();
        expect(within(firstRow as HTMLElement).getByRole("checkbox")).not.toBeChecked();
        expect(within(secondRow as HTMLElement).getByRole("checkbox")).toBeChecked();
        expect(toastMocks.success).toHaveBeenCalledWith(
            "Excluded 1 tilt image in Series 1.",
        );
    });

    it("uses compact analyze-output styling in the column exclusion dialog", async () => {
        renderViewer();

        await expandFirstTiltSeries();

        fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Dose" }));

        const dialog = await screen.findByRole("dialog", {
            name: "Exclude tilt images by Dose",
        });
        const title = within(dialog).getByRole("heading", {
            name: "Exclude tilt images by Dose",
        });

        expect(dialog).toHaveStyle({ borderRadius: "16px", overflow: "hidden" });
        expect(title).toHaveStyle({
            background: "linear-gradient(180deg, #0b1220 0%, #0a0f1e 100%)",
            fontSize: "0.95rem",
        });

        const criterion = within(dialog).getByRole("combobox", { name: "Criterion" });
        expect(criterion).toHaveStyle({ fontSize: "0.76rem" });

        fireEvent.mouseDown(criterion);

        const firstOption = await screen.findByRole("option", { name: "Greater than" });
        expect(firstOption).toHaveStyle({ fontSize: "0.76rem", minHeight: "34px" });
    });

    it("excludes current-series tilt images matching a text column criterion", async () => {
        renderViewer();

        await expandFirstTiltSeries();

        fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Path" }));

        const dialog = await screen.findByRole("dialog", {
            name: "Exclude tilt images by Path",
        });

        expect(within(dialog).getByLabelText("Criterion")).toHaveTextContent(
            "Contains",
        );

        fireEvent.change(within(dialog).getByRole("textbox", { name: "Value" }), {
            target: { value: "second" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Exclude" }));

        const firstRow = screen.getByText("/data/first.mrc").closest("tr");
        const secondRow = screen.getByText("/data/second.mrc").closest("tr");

        expect(firstRow).not.toBeNull();
        expect(secondRow).not.toBeNull();
        expect(within(firstRow as HTMLElement).getByRole("checkbox")).not.toBeChecked();
        expect(within(secondRow as HTMLElement).getByRole("checkbox")).toBeChecked();
    });

    it("applies a column exclusion criterion to every tilt series in the set", async () => {
        serviceMocks.fetchTiltSeriesFrames.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                seriesId: string,
            ) => {
                const payload = makeFramesPayload(String(seriesId));

                if (seriesId === "TS2") {
                    payload.frames[0].dose = 3.3;
                }

                return payload;
            },
        );

        renderViewer();

        await expandFirstTiltSeries();

        fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Dose" }));

        const dialog = await screen.findByRole("dialog", {
            name: "Exclude tilt images by Dose",
        });

        fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Value" }), {
            target: { value: "1.5" },
        });
        fireEvent.click(
            within(dialog).getByRole("radio", { name: "All tilt series" }),
        );
        fireEvent.click(within(dialog).getByRole("button", { name: "Exclude" }));

        await waitFor(() => {
            expect(serviceMocks.fetchTiltSeriesFrames).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                "TS2",
            );
        });

        expect(toastMocks.success).toHaveBeenCalledWith(
            "Excluded 2 tilt images across 2 tilt series.",
        );

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        fireEvent.click(await screen.findByRole("button", { name: "Yes" }));

        await waitFor(() => {
            expect(serviceMocks.createNewSetOfTiltSeries).toHaveBeenCalledWith(
                1,
                2,
                "tiltOutput",
                {
                    TS1: {
                        excluded: false,
                        tiltimages: [1],
                    },
                    TS2: {
                        excluded: true,
                        tiltimages: [0],
                    },
                },
                false,
            );
        });
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

    it("coalesces rapid slider drag ticks into a single chase fetch instead of one per tick", async () => {
        serviceMocks.fetchTiltSeriesFrames.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                seriesId: string,
            ) => makeFramesPayloadWithCount(String(seriesId), 6),
        );

        const firstFetchGate = createDeferred<void>();

        // Gate by the REQUESTED FRAME INDEX, not by call order -- the very
        // first call is actually the auto-select-on-mount fetch for the
        // center default (index 2), fired before any drag starts and never
        // gated by the scrub-busy ref (isScrubbing is false at that point).
        // The call we want to hold open is the first *manual tick* (index 3).
        let callCount = 0;
        serviceMocks.fetchTiltSeriesViewImageObjectUrl.mockImplementation(
            async (..._args: unknown[]) => {
                callCount += 1;
                const frameIndex = Number(_args[4]);
                if (frameIndex === 3) {
                    await firstFetchGate.promise;
                }
                return { url: `blob:preview-${callCount}`, revoke: vi.fn() };
            },
        );

        renderViewer();

        // 6 frames defaults to the CENTER index (2, i.e. "View 3 of 6") --
        // see the closestIncludedIndex/centerIndex logic that picks the
        // initial selectedRowIndex when frames load.
        expect(await screen.findByText("View 3 of 6")).toBeInTheDocument();
        await flushMicrotasks();

        // The mount-time auto-select fetch (center default, index 2) has
        // already fired and resolved by now -- it is not gated.
        await waitFor(() => {
            expect(serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length).toBe(1);
        });

        const sliders = screen.getAllByRole("slider");
        const tiltSlider = sliders[sliders.length - 1];

        // A real drag (mousedown + mousemove ticks, no mouseup yet) is the
        // only way to reach MUI's pointer-drag path, which calls onChange
        // per tick and defers onChangeCommitted to mouseup. fireEvent.change
        // on the hidden range input instead fires onChange+onChangeCommitted
        // together (that's how a native <input type="range"> behaves), which
        // would end the "scrubbing" state after every single tick and can't
        // exercise the coalescing behavior under test here.
        const sliderRoot = tiltSlider.closest(".MuiSlider-root") as HTMLElement;
        sliderRoot.getBoundingClientRect = () =>
            ({
                left: 0,
                right: 100,
                width: 100,
                top: 0,
                bottom: 10,
                height: 10,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        // min=0, max=5 (sliceSliderMax for 6 frames), step=1, root width=100
        // -> clientX 60/80/100 map to values 3/4/5.
        // First tick: nothing in flight for the scrub-fetch busy ref yet, so
        // this fetch starts for real (and immediately gets stuck on
        // firstFetchGate, since it targets index 3).
        fireEvent.mouseDown(sliderRoot, { button: 0, clientX: 60, clientY: 5 });
        await flushMicrotasks();

        // Simulates the rest of a fast drag: several more ticks fired while
        // that first tick's fetch is still pending. Mouse-move ticks are
        // dispatched on the document, matching where MUI attaches its
        // drag-tracking listeners.
        // buttons: 1 (primary button still held) matters here -- MUI treats
        // a mousemove with buttons === 0 as a stray/missed mouseup and ends
        // the drag right there instead of tracking it.
        fireEvent.mouseMove(document, { clientX: 80, clientY: 5, buttons: 1 });
        fireEvent.mouseMove(document, { clientX: 100, clientY: 5, buttons: 1 });
        await flushMicrotasks();

        // The slider handle itself must still track the drag live...
        expect(await screen.findByText("View 6 of 6")).toBeInTheDocument();
        // ...but only the mount fetch (index 2) and the first tick (index 3)
        // should have actually reached the network -- ticks for 4/5 were
        // coalesced, not each firing (or aborting) their own request.
        expect(serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length).toBe(2);

        firstFetchGate.resolve();
        await flushMicrotasks();

        // Once the in-flight fetch settles, it chases straight to the
        // LATEST position (5, the last tick) -- never 4 along the way.
        await waitFor(() => {
            expect(serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls.length).toBe(3);
        });

        const chaseCallArgs = serviceMocks.fetchTiltSeriesViewImageObjectUrl.mock.calls[2];
        expect(Number(chaseCallArgs[4])).toBe(5);
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