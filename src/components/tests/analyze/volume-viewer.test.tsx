import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    listOutputVolumes: vi.fn(),
    getVolumeInfo: vi.fn(),
    getVolumeHistogram: vi.fn(),
    fetchVolumeSliceObjectUrl: vi.fn(),
    getVolumeSurfaceMesh: vi.fn(),
    getVolumeData3d: vi.fn(),
}));

function renderViewerWithInvalidMetadataIds() {
    return render(
        <VolumeViewer
            projectId={"abc"}
            protocolId={"def"}
            outputName="volumeOutput"
            pointerClass="SetOfVolumes"
        />,
    );
}


vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

vi.mock("react-plotly.js", () => ({
    default: ({ data }: { data?: Array<{ type?: string }> }) => (
        <div data-testid="mock-plotly">
            {data?.[0]?.type ?? "plot"}
        </div>
    ),
}));

vi.mock("../../analyze/gpu-volume-view", () => ({
    default: () => <div>Mock GpuVolumeView</div>,
}));

vi.mock("../../analyze/mesh-volume-view", () => ({
    default: () => <div>Mock MeshVolumeView</div>,
}));

vi.mock("../../analyze/metadata-viewer", () => ({
    MetadataViewer: ({ outputName }: { outputName: string }) => (
        <div>Mock MetadataViewer {outputName}</div>
    ),
}));

vi.mock("lucide-react", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("lucide-react");

    return {
        ...actual,
        HelpCircle: (props: Record<string, unknown>) => (
            <svg data-testid="help-icon" {...props} />
        ),
        Play: (props: Record<string, unknown>) => (
            <svg data-testid="play-icon" {...props} />
        ),
        Pause: (props: Record<string, unknown>) => (
            <svg data-testid="pause-icon" {...props} />
        ),
    };
});

function getButtonFromTestId(testId: string): HTMLButtonElement {
    const icon = screen.getByTestId(testId);
    const button = icon.closest("button");

    if (!button) {
        throw new Error(`Button for ${testId} was not found`);
    }

    return button as HTMLButtonElement;
}

function getNthButtonFromTestId(testId: string, index: number): HTMLButtonElement {
    const icon = screen.getAllByTestId(testId)[index];
    const button = icon.closest("button");

    if (!button) {
        throw new Error(`Button ${index} for ${testId} was not found`);
    }

    return button as HTMLButtonElement;
}

import VolumeViewer from "../../analyze/volume-viewer";

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

function makeVolumes() {
    return [
        { id: 1, label: "Vol A" },
        { id: 2, label: "Vol B" },
    ];
}

function makeInfo(id: number) {
    if (id === 2) {
        return {
            dims: [8, 10, 12],
            min: -2.5,
            max: 3.2,
            mean: 0.4,
            std: 1.1,
        };
    }

    return {
        dims: [5, 6, 7],
        min: -1.2,
        max: 2.8,
        mean: 0.7,
        std: 0.9,
    };
}

function makeHistogram() {
    return {
        binEdges: [0, 1, 2, 3],
        counts: [4, 2, 1],
    };
}

function makeSliceUrl(axis: string, index: number) {
    return {
        url: `blob:${axis}-${index}`,
        revoke: vi.fn(),
    };
}

function makeSurfaceMesh() {
    return {
        vertices: [
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ],
        indices: [0, 1, 2],
        vertexCount: 3,
        triangleCount: 1,
        level: 0.75,
        rangeMin: -1.2,
        rangeMax: 2.8,
    };
}

function make3dData() {
    return {
        dims: [7, 6, 5],
        values: Array.from({ length: 7 * 6 * 5 }, (_, i) => i / 10),
        order: "xyz",
        min: 0,
        max: 20.9,
    };
}

function renderViewer() {
    return render(
        <VolumeViewer
            projectId={1}
            protocolId={2}
            outputName="volumeOutput"
            pointerClass="SetOfVolumes"
        />,
    );
}

describe("VolumeViewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        class ResizeObserverMock {
            observe() { }
            disconnect() { }
            unobserve() { }
        }

        vi.stubGlobal("ResizeObserver", ResizeObserverMock);

        serviceMocks.listOutputVolumes.mockResolvedValue(makeVolumes());

        serviceMocks.getVolumeInfo.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                volumeId: number,
            ) => makeInfo(Number(volumeId)),
        );

        serviceMocks.getVolumeHistogram.mockResolvedValue(makeHistogram());

        serviceMocks.fetchVolumeSliceObjectUrl.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                _volumeId: number,
                sliceIndex: number,
                options?: { axis?: string },
            ) => makeSliceUrl(String(options?.axis ?? "z"), Number(sliceIndex)),
        );

        serviceMocks.getVolumeSurfaceMesh.mockResolvedValue(makeSurfaceMesh());
        serviceMocks.getVolumeData3d.mockResolvedValue(make3dData());
    });

    it("shows a loading state while the volume list is pending", async () => {
        const deferred = createDeferred<ReturnType<typeof makeVolumes>>();
        serviceMocks.listOutputVolumes.mockReturnValueOnce(deferred.promise);

        renderViewer();

        expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);

        deferred.resolve([]);

        await waitFor(() => {
            expect(
                screen.getByText("No volumes in this output."),
            ).toBeInTheDocument();
        });
    });

    it("shows an error when loading the volume list fails", async () => {
        serviceMocks.listOutputVolumes.mockRejectedValueOnce(
            new Error("Volume list failed"),
        );

        renderViewer();

        await waitFor(() => {
            expect(screen.getByText("Volume list failed")).toBeInTheDocument();
        });
    });

    it("shows the empty state when no volumes are returned", async () => {
        serviceMocks.listOutputVolumes.mockResolvedValueOnce([]);

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No volumes in this output."),
            ).toBeInTheDocument();
        });
    });

    it("auto-selects the first volume and loads its metadata", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.getVolumeInfo).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
            );
        });

        expect(screen.getByText("7 × 6 × 5")).toBeInTheDocument();
        expect(screen.getByText("-1.200")).toBeInTheDocument();
        expect(screen.getByText("2.800")).toBeInTheDocument();
        expect(screen.getByText("0.700")).toBeInTheDocument();
        expect(screen.getByText("0.900")).toBeInTheDocument();
    });

    it("changes the selected volume and refreshes metadata", async () => {
        renderViewer();

        expect(await screen.findByText("Vol B")).toBeInTheDocument();

        fireEvent.click(screen.getByText("Vol B"));

        await waitFor(() => {
            expect(serviceMocks.getVolumeInfo).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                2,
            );
        });

        expect(screen.getByText("12 × 10 × 8")).toBeInTheDocument();
        expect(screen.getByText("-2.500")).toBeInTheDocument();
        expect(screen.getByText("3.200")).toBeInTheDocument();
        expect(screen.getByText("0.400")).toBeInTheDocument();
        expect(screen.getByText("1.100")).toBeInTheDocument();
    });

    it("switches to 3D map mode and loads the surface mesh", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 192,
                    method: "none",
                    maxTriangles: 550000,
                }),
            );
        });

        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();
    });

    it("switches to metadata mode when metadata is available", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Metadata" }));

        expect(
            await screen.findByText("Mock MetadataViewer volumeOutput"),
        ).toBeInTheDocument();
    });

    it("loads the histogram when opening the histogram tab", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Histogram" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeHistogram).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
            );
        });

        expect(await screen.findByTestId("mock-plotly")).toBeInTheDocument();
        expect(screen.getByText("bar")).toBeInTheDocument();
    });

    it("switches from triple slices to single slices and requests the current slice", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        expect(await screen.findByText("Y (XZ)")).toBeInTheDocument();
        expect(screen.getByText("Z (XY)")).toBeInTheDocument();
        expect(screen.getByText("X (YZ)")).toBeInTheDocument();

        const initialCalls = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length;

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length).toBeGreaterThan(
                initialCalls,
            );
        });

        const calls = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls;
        const lastCall = calls[calls.length - 1];

        expect(lastCall[0]).toBe(1);
        expect(lastCall[1]).toBe(2);
        expect(lastCall[2]).toBe("volumeOutput");
        expect(lastCall[3]).toBe(1);
        expect(lastCall[4]).toBe(2);
        expect(lastCall[5]).toMatchObject({
            axis: "z",
            cmap: "viridis",
        });
    });

    it("changes axis in single-slice mode and requests the correct slice axis", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalled();
        });

        const beforeAxisChange = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length;

        fireEvent.click(screen.getByRole("button", { name: "X" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length).toBeGreaterThan(
                beforeAxisChange,
            );
        });

        const calls = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls;
        const xAxisCalls = calls.filter(
            (call) => call[3] === 1 && call[5]?.axis === "x",
        );

        expect(xAxisCalls.length).toBeGreaterThan(0);

        const lastXAxisCall = xAxisCalls[xAxisCalls.length - 1];
        expect(lastXAxisCall[5]).toMatchObject({
            axis: "x",
            cmap: "viridis",
        });
    });

    it("reloads surface mesh after changing maxDim", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 192,
                    method: "none",
                }),
            );
        });

        fireEvent.change(screen.getByDisplayValue("192"), {
            target: { value: "104" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Reload data" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenLastCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 104,
                    method: "none",
                }),
            );
        });
    });

    it("shows a histogram error when histogram loading fails", async () => {
        serviceMocks.getVolumeHistogram.mockRejectedValueOnce(
            new Error("Histogram failed"),
        );

        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Histogram" }));

        await waitFor(() => {
            expect(screen.getByText("Histogram failed")).toBeInTheDocument();
        });
    });

    it("disables metadata mode when project and protocol ids are not numeric", async () => {
        renderViewerWithInvalidMetadataIds();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        const metadataButton = screen.getByRole("button", { name: "Metadata" });
        expect(metadataButton).toBeDisabled();
    });

    it("keeps metadata mode disabled when project and protocol ids are not numeric", async () => {
        renderViewerWithInvalidMetadataIds();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        const metadataButton = screen.getByRole("button", { name: "Metadata" });
        expect(metadataButton).toBeDisabled();
    });

    it("changes the single-slice colormap and refetches the slice", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalled();
        });

        const beforeChange = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length;

        const colormapSelect = screen.getAllByRole("combobox")[0];
        fireEvent.mouseDown(colormapSelect);

        fireEvent.click(await screen.findByText("magma"));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length).toBeGreaterThan(
                beforeChange,
            );
        });

        const calls = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls;
        const lastCall = calls[calls.length - 1];

        expect(lastCall[5]).toMatchObject({
            axis: "z",
            cmap: "magma",
        });
    });

    it("toggles sharpen without refetching the slice", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalled();
        });

        const callCount = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length;

        fireEvent.click(screen.getByRole("button", { name: "on" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length).toBe(callCount);
        });
    });

    it("changes brightness and contrast without refetching the slice", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalled();
        });

        const callCount = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length;
        const sliders = screen.getAllByRole("slider");

        fireEvent.keyDown(sliders[1], { key: "ArrowRight" });
        fireEvent.keyDown(sliders[2], { key: "ArrowRight" });

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.length).toBe(callCount);
        });
    });

    it("toggles play and pause rotation in 3D mode", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalled();
        });

        fireEvent.click(getButtonFromTestId("play-icon"));
        expect(screen.getByTestId("pause-icon")).toBeInTheDocument();

        fireEvent.click(getButtonFromTestId("pause-icon"));
        expect(screen.getByTestId("play-icon")).toBeInTheDocument();
    });

    it("opens a help popover from the controls panel", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(getNthButtonFromTestId("help-icon", 0));

        expect(await screen.findByText("sliceLayout")).toBeInTheDocument();
        expect(
            screen.getByText(/Single shows one slice view at a time/i),
        ).toBeInTheDocument();
    });

    it("changes interpolation in single-slice mode", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalled();
        });

        const interpSelect = screen.getAllByRole("combobox")[1];
        fireEvent.mouseDown(interpSelect);
        fireEvent.click(await screen.findByText("nearest"));

        await waitFor(() => {
            expect(screen.getAllByText("nearest").length).toBeGreaterThan(0);
        });
    });

    it("resets zoom with Fit + reset pan in single-slice mode", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "single" }));

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalled();
        });

        const viewer = screen.getByTitle("Wheel: zoom | Ctrl+drag: pan | Double-click: fit");

        fireEvent.wheel(viewer, { deltaY: -100 });

        await waitFor(() => {
            expect(screen.getAllByText("110%").length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getByRole("button", { name: "Fit + reset pan" }));

        await waitFor(() => {
            expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
        });
    });

    it("reloads surface mesh after changing method3d", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 192,
                    method: "none",
                }),
            );
        });

        const methodSelect = screen.getAllByRole("combobox")[0];
        fireEvent.mouseDown(methodSelect);
        fireEvent.click(await screen.findByText("stride"));

        fireEvent.click(screen.getByRole("button", { name: "Reload data" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenLastCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 192,
                    method: "stride",
                }),
            );
        });
    });

    it("stops auto-rotation when leaving 3D mode", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalled();
        });

        fireEvent.click(getButtonFromTestId("play-icon"));
        expect(screen.getByTestId("pause-icon")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Slices" }));
        expect(screen.queryByTestId("pause-icon")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(await screen.findByTestId("play-icon")).toBeInTheDocument();
    });

    it("returns from Metadata back to Slices", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Metadata" }));
        expect(
            await screen.findByText("Mock MetadataViewer volumeOutput"),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Slices" }));

        expect(await screen.findByText("Y (XZ)")).toBeInTheDocument();
        expect(screen.queryByText("Mock MetadataViewer volumeOutput")).not.toBeInTheDocument();
    });
});
