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
    default: ({ data, layout }: { data?: Array<{ type?: string; x?: number[] }>; layout?: any }) => (
        <div
            data-testid="mock-plotly"
            data-x-values={JSON.stringify(data?.[0]?.x ?? [])}
            data-x-range={JSON.stringify(layout?.xaxis?.range ?? null)}
        >
            {data?.[0]?.type ?? "plot"}
        </div>
    ),
}));

vi.mock("../../analyze/gpu-volume-view", () => ({
    default: ({ resetViewKey = 0, cameraCommand, clipBounds, slicePosition, sliceVisibility }: any) => (
        <div
            data-testid="mock-gpu-volume"
            data-reset-view-key={resetViewKey}
            data-camera-preset={cameraCommand?.preset ?? ""}
            data-camera-key={cameraCommand?.key ?? 0}
            data-clip-x={JSON.stringify(clipBounds?.x ?? [])}
            data-slice-x={slicePosition?.x ?? ""}
            data-slice-x-visible={String(Boolean(sliceVisibility?.x))}
        >
            Mock GpuVolumeView
        </div>
    ),
}));

vi.mock("../../analyze/mesh-volume-view", () => ({
    default: ({ resetViewKey = 0, cameraCommand, clipBounds, slicePosition, sliceVisibility }: any) => (
        <div
            data-testid="mock-mesh-volume"
            data-reset-view-key={resetViewKey}
            data-camera-preset={cameraCommand?.preset ?? ""}
            data-camera-key={cameraCommand?.key ?? 0}
            data-clip-x={JSON.stringify(clipBounds?.x ?? [])}
            data-slice-x={slicePosition?.x ?? ""}
            data-slice-x-visible={String(Boolean(sliceVisibility?.x))}
        >
            Mock MeshVolumeView
        </div>
    ),
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

        await waitFor(() => {
            expect(screen.getByText("-1.200")).toBeInTheDocument();
            expect(screen.getByText("2.800")).toBeInTheDocument();
            expect(screen.getByText("0.700")).toBeInTheDocument();
            expect(screen.getByText("0.900")).toBeInTheDocument();
        });
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
                    maxDim: 256,
                    method: "stride",
                    maxTriangles: 500000,
                }),
            );
        });

        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();
    });

    it("opens true GPU volume rendering from the 3D mode selector", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "volume" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeData3d).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({ maxDim: 256, method: "stride" }),
            );
        });

        expect(await screen.findByText("Mock GpuVolumeView")).toBeInTheDocument();
        expect(screen.queryByText("Hide dust")).not.toBeInTheDocument();
        expect(screen.getByText("Density window")).toBeInTheDocument();
    });

    it("reuses loaded 3D data when switching render modes", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();
        expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "mesh" }));
        await new Promise((resolve) => window.setTimeout(resolve, 30));
        expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "volume" }));
        expect(await screen.findByText("Mock GpuVolumeView")).toBeInTheDocument();
        expect(serviceMocks.getVolumeData3d).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "surface" }));
        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();
        expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "volume" }));
        expect(await screen.findByText("Mock GpuVolumeView")).toBeInTheDocument();
        expect(serviceMocks.getVolumeData3d).toHaveBeenCalledTimes(1);
    });

    it("deduplicates an identical surface request while it is still loading", async () => {
        const deferred = createDeferred<ReturnType<typeof makeSurfaceMesh>>();
        serviceMocks.getVolumeSurfaceMesh.mockReturnValue(deferred.promise);

        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole("button", { name: "mesh" }));
        await new Promise((resolve) => window.setTimeout(resolve, 30));
        expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(1);

        deferred.resolve(makeSurfaceMesh());
        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();
    });

    it("expands the 3D canvas and restores its panels with Escape", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Expand 3D view" }));
        expect(screen.queryByText("Volumes")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Controls" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Restore 3D panels" })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(await screen.findByText("Volumes")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Controls" })).toBeInTheDocument();
    });

    it("resets the active 3D renderer without reloading its data", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(await screen.findByText("Mock MeshVolumeView")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Reset 3D view" }));
        expect(screen.getByTestId("mock-mesh-volume")).toHaveAttribute("data-reset-view-key", "1");
        expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "volume" }));
        expect(await screen.findByText("Mock GpuVolumeView")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Reset 3D view" }));
        expect(screen.getByTestId("mock-gpu-volume")).toHaveAttribute("data-reset-view-key", "2");
        expect(serviceMocks.getVolumeData3d).toHaveBeenCalledTimes(1);
    });

    it("updates clipping and synchronized slice planes without reloading 3D data", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        const meshViewer = await screen.findByTestId("mock-mesh-volume");
        expect(meshViewer).toHaveAttribute("data-clip-x", "[0,1]");
        expect(meshViewer).toHaveAttribute("data-slice-x", "0.5");
        expect(meshViewer).toHaveAttribute("data-slice-x-visible", "false");

        const surfaceCalls = serviceMocks.getVolumeSurfaceMesh.mock.calls.length;
        fireEvent.change(screen.getByRole("slider", { name: "X clipping minimum" }), { target: { value: "2" } });
        fireEvent.change(screen.getByRole("slider", { name: "X 3D slice position" }), { target: { value: "5" } });
        fireEvent.click(screen.getByRole("button", { name: "X slice plane" }));

        await waitFor(() => {
            expect(JSON.parse(screen.getByTestId("mock-mesh-volume").getAttribute("data-clip-x") || "[]")[0]).toBeCloseTo(2 / 6);
            expect(Number(screen.getByTestId("mock-mesh-volume").getAttribute("data-slice-x"))).toBeCloseTo(5 / 6);
            expect(screen.getByTestId("mock-mesh-volume")).toHaveAttribute("data-slice-x-visible", "true");
        });

        expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalledTimes(surfaceCalls);
        fireEvent.click(screen.getByRole("button", { name: "Reset" }));
        expect(screen.getByTestId("mock-mesh-volume")).toHaveAttribute("data-clip-x", "[0,1]");
    });

    it("sends repeatable principal-axis camera commands to the active renderer", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(await screen.findByTestId("mock-mesh-volume")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
        expect(screen.queryByText("Choose view", { selector: '[role="combobox"]' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Appearance" }));

        const chooseCameraPreset = async (label: string) => {
            fireEvent.mouseDown(screen.getByText("Choose view", { selector: '[role="combobox"]' }));
            fireEvent.click(await screen.findByText(label, { selector: "li" }));
        };

        await chooseCameraPreset("Right (+X)");
        expect(screen.getByTestId("mock-mesh-volume")).toHaveAttribute("data-camera-preset", "right");
        expect(screen.getByTestId("mock-mesh-volume")).toHaveAttribute("data-camera-key", "1");

        await chooseCameraPreset("Right (+X)");
        expect(screen.getByTestId("mock-mesh-volume")).toHaveAttribute("data-camera-key", "2");
    });

    it("switches to metadata mode when metadata is available", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Metadata" }));

        expect(
            await screen.findByText("Mock MetadataViewer volumeOutput"),
        ).toBeInTheDocument();
    });

    it("loads a robust histogram view when opening the histogram tab", async () => {
        serviceMocks.getVolumeHistogram.mockResolvedValueOnce({
            binEdges: [0, 1, 2, 1000],
            counts: [1000, 1000, 1],
        });

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

        const plot = await screen.findByTestId("mock-plotly");
        expect(screen.getByText("bar")).toBeInTheDocument();
        expect(JSON.parse(plot.getAttribute("data-x-values") || "[]")).toEqual([0.5, 1.5]);

        const range = JSON.parse(plot.getAttribute("data-x-range") || "null");
        expect(range[0]).toBeLessThan(0.5);
        expect(range[1]).toBeGreaterThan(1.5);
        expect(range[1]).toBeLessThan(10);
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
            cmap: "gray",
        });
    });

    it("steps each orthogonal plane with the wheel and keyboard", async () => {
        renderViewer();

        const zView = await screen.findByRole("application", { name: "Z (XY) slice view" });
        expect(zView).toHaveAttribute("aria-valuetext", "3 of 5");

        await waitFor(() => {
            const readyCall = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.find((call) => call[4] === 2 && call[5]?.axis === "z" && Number.isFinite(call[5]?.windowMin));
            expect(readyCall).toBeTruthy();
        });

        fireEvent.wheel(zView, { deltaY: 100 });

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                3,
                expect.objectContaining({ axis: "z" }),
            );
        });

        expect(zView).toHaveAttribute("aria-valuetext", "4 of 5");

        const zCenterCallsBeforeReturn = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.filter((call) => call[4] === 2 && call[5]?.axis === "z").length;

        fireEvent.keyDown(zView, { key: "ArrowLeft" });

        await waitFor(() => {
            expect(zView).toHaveAttribute("aria-valuetext", "3 of 5");
        });

        await new Promise((resolve) => window.setTimeout(resolve, 30));
        const zCenterCallsAfterReturn = serviceMocks.fetchVolumeSliceObjectUrl.mock.calls.filter((call) => call[4] === 2 && call[5]?.axis === "z").length;
        expect(zCenterCallsAfterReturn).toBe(zCenterCallsBeforeReturn);
    });

    it("moves the synchronized MPR crosshair by clicking an orthogonal view", async () => {
        renderViewer();

        const zView = await screen.findByRole("application", { name: "Z (XY) slice view" });
        vi.spyOn(zView, "getBoundingClientRect").mockReturnValue({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 700,
            bottom: 600,
            width: 700,
            height: 600,
            toJSON: () => ({}),
        });

        fireEvent.click(zView, { clientX: 600, clientY: 500 });

        expect(screen.getByRole("application", { name: "X (YZ) slice view" })).toHaveAttribute("aria-valuetext", "6 of 7");
        expect(screen.getByRole("application", { name: "Y (XZ) slice view" })).toHaveAttribute("aria-valuetext", "5 of 6");

        await waitFor(() => {
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                5,
                expect.objectContaining({ axis: "x" }),
            );
            expect(serviceMocks.fetchVolumeSliceObjectUrl).toHaveBeenCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                4,
                expect.objectContaining({ axis: "y" }),
            );
        });
    });

    it("focuses an orthogonal plane and restores all views with Escape", async () => {
        renderViewer();

        const zView = await screen.findByRole("application", { name: "Z (XY) slice view" });
        fireEvent.doubleClick(zView);

        expect(screen.getByRole("application", { name: "Z (XY) slice view" })).toBeVisible();
        expect(screen.queryByRole("application", { name: "Y (XZ) slice view" })).not.toBeInTheDocument();
        expect(screen.queryByRole("application", { name: "X (YZ) slice view" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Restore 3 views" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Restore 3 views" }));
        expect(await screen.findByRole("application", { name: "Y (XZ) slice view" })).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: "Maximize Z (XY) view" }));
        fireEvent.keyDown(window, { key: "Escape" });

        expect(screen.getByRole("application", { name: "Y (XZ) slice view" })).toBeVisible();
        expect(screen.getByRole("application", { name: "Z (XY) slice view" })).toBeVisible();
        expect(screen.getByRole("application", { name: "X (YZ) slice view" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Restore 3 views" })).not.toBeInTheDocument();
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
            cmap: "gray",
        });
    });

    it("uses the same global intensity window for all orthogonal slices", async () => {
        renderViewer();

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        await waitFor(() => {
            const calls =
                serviceMocks.fetchVolumeSliceObjectUrl.mock.calls;

            const latestByAxis = new Map<string, any>();

            for (const call of calls) {
                const options = call[5];
                const axis = options?.axis;

                if (
                    axis &&
                    Number.isFinite(options?.windowMin) &&
                    Number.isFinite(options?.windowMax)
                ) {
                    latestByAxis.set(axis, options);
                }
            }

            expect(latestByAxis.size).toBe(3);

            const x = latestByAxis.get("x");
            const y = latestByAxis.get("y");
            const z = latestByAxis.get("z");

            expect(x.windowMin).toBeCloseTo(y.windowMin, 6);
            expect(x.windowMin).toBeCloseTo(z.windowMin, 6);

            expect(x.windowMax).toBeCloseTo(y.windowMax, 6);
            expect(x.windowMax).toBeCloseTo(z.windowMax, 6);

            expect(x.windowMin).toBeCloseTo(0.00875, 5);
            expect(x.windowMax).toBeCloseTo(2.965, 5);
        });
    });

    it("reloads surface mesh after changing quality", async () => {
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
                    maxDim: 256,
                    method: "stride",
                }),
            );
        });

        const qualitySelect = screen.getAllByRole("combobox")[0];
        fireEvent.mouseDown(qualitySelect);
        fireEvent.click(
            await screen.findByText("Fast", { selector: "li" }),
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Reload data" }),
        );

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenLastCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 128,
                    method: "stride",
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

        const interpSelect = screen.getAllByRole("combobox")[2];
        fireEvent.mouseDown(interpSelect);

        fireEvent.click(
            await screen.findByText("nearest", {
                selector: '[role="option"]',
            }),
        );

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
                    maxDim: 256,
                    method: "stride",
                }),
            );
        });

        const methodSelect = screen.getByText(
            "stride",
            { selector: '[role="combobox"]' },
        );

        fireEvent.mouseDown(methodSelect);

        fireEvent.click(
            await screen.findByText("binning", { selector: "li" }),
        );

        fireEvent.click(screen.getByRole("button", { name: "Reload data" }));

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenLastCalledWith(
                1,
                2,
                "volumeOutput",
                1,
                expect.objectContaining({
                    maxDim: 256,
                    method: "binning",
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
    it("does not start 3D work while the viewer is inactive", async () => {
        const { rerender } = render(<VolumeViewer projectId={1} protocolId={2} outputName="volumeOutput" pointerClass="SetOfVolumes" active={false} />);

        expect(await screen.findByText("Vol A")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        await new Promise((resolve) => window.setTimeout(resolve, 50));
        expect(serviceMocks.fetchVolumeSliceObjectUrl).not.toHaveBeenCalled();
        expect(serviceMocks.getVolumeSurfaceMesh).not.toHaveBeenCalled();

        rerender(<VolumeViewer projectId={1} protocolId={2} outputName="volumeOutput" pointerClass="SetOfVolumes" active />);

        await waitFor(() => {
            expect(serviceMocks.getVolumeSurfaceMesh).toHaveBeenCalled();
        });
    });
});
