import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    listCoords3dTomograms: vi.fn(),
    fetchCoords3dForTomogram: vi.fn(),
    fetchCoords3dTomogramSliceObjectUrl: vi.fn(),
    createCoords3dOutputFromPoints: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

vi.mock("react-hot-toast", () => ({
    default: toastMock,
}));

vi.mock("lucide-react", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("lucide-react");

    return {
        ...actual,
        HelpCircle: (props: Record<string, unknown>) => (
            <svg data-testid="help-icon" {...props} />
        ),
    };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
    OrbitControls: class {
        enableDamping = true;
        dampingFactor = 0.08;
        rotateSpeed = 0.8;
        zoomSpeed = 0.9;
        panSpeed = 0.8;
        screenSpacePanning = true;
        target = { set: vi.fn() };
        update = vi.fn();
        dispose = vi.fn();
        constructor() { }
    },
}));

vi.mock("../../analyze/metadata-viewer", () => ({
    MetadataViewer: ({ outputName }: { outputName: string }) => (
        <div>Mock MetadataViewer {outputName}</div>
    ),
}));

vi.mock("three", () => {
    class Vector3 {
        x: number;
        y: number;
        z: number;
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x: number, y: number, z: number) {
            this.x = x;
            this.y = y;
            this.z = z;
            return this;
        }
        copy(v: Vector3) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
        clone() {
            return new Vector3(this.x, this.y, this.z);
        }
    }

    class Vector2 {
        x: number;
        y: number;
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }
    }

    class Color {
        r = 1;
        g = 1;
        b = 1;
        value: unknown;
        constructor(value?: unknown) {
            this.value = value;
        }
        set(value: unknown) {
            this.value = value;
            return this;
        }
        setHSL() {
            return this;
        }
        clone() {
            return new Color(this.value);
        }
        lerp() {
            return this;
        }
    }

    class Object3D {
        children: Object3D[] = [];
        position = new Vector3();
        rotation = new Vector3();
        scale = new Vector3(1, 1, 1);
        visible = true;
        renderOrder = 0;
        add(...objs: Object3D[]) {
            this.children.push(...objs);
        }
        clear() {
            this.children = [];
        }
        traverse(cb: (obj: Object3D) => void) {
            cb(this);
            this.children.forEach((c) => c.traverse(cb));
        }
        localToWorld(v: Vector3) {
            return v;
        }
    }

    class Group extends Object3D { }
    class Scene extends Object3D { }
    class AmbientLight extends Object3D { }
    class DirectionalLight extends Object3D { }

    class PerspectiveCamera extends Object3D {
        aspect = 1;
        updateProjectionMatrix() { }
    }

    class BufferAttribute {
        array: unknown;
        itemSize: number;
        constructor(array: unknown, itemSize: number) {
            this.array = array;
            this.itemSize = itemSize;
        }
    }

    class BufferGeometry {
        attributes: Record<string, unknown> = {};
        boundingSphere: unknown = null;
        setAttribute(name: string, attr: unknown) {
            this.attributes[name] = attr;
            return this;
        }
        setFromPoints() {
            return this;
        }
        computeBoundingSphere() { }
        dispose() { }
    }

    class Sphere {
        constructor(
            public center: Vector3,
            public radius: number,
        ) { }
    }

    class Material {
        opacity = 1;
        transparent = false;
        color = new Color();
        map: unknown = null;
        needsUpdate = false;
        dispose() { }
    }

    class LineBasicMaterial extends Material {
        constructor(params: Record<string, unknown> = {}) {
            super();
            Object.assign(this, params);
        }
    }

    class MeshBasicMaterial extends Material {
        side: unknown;
        depthWrite = false;
        depthTest = false;
        constructor(params: Record<string, unknown> = {}) {
            super();
            Object.assign(this, params);
            this.color = new Color(params.color);
        }
    }

    class MeshPhongMaterial extends Material {
        constructor(params: Record<string, unknown> = {}) {
            super();
            Object.assign(this, params);
            this.color = new Color(params.color);
        }
    }

    class PointsMaterial extends Material {
        size = 1;
        sizeAttenuation = false;
        vertexColors = false;
        alphaTest = 0;
        constructor(params: Record<string, unknown> = {}) {
            super();
            Object.assign(this, params);
        }
    }

    class Mesh extends Object3D {
        geometry: any;
        material: any;
        constructor(geometry: unknown, material: unknown) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }

    class Points extends Object3D {
        geometry: any;
        material: any;
        constructor(geometry: unknown, material: unknown) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }

    class Line extends Object3D {
        geometry: any;
        material: any;
        constructor(geometry: unknown, material: unknown) {
            super();
            this.geometry = geometry;
            this.material = material;
        }
    }

    class LineSegments extends Line { }

    class BoxGeometry {
        dispose() { }
    }

    class PlaneGeometry {
        dispose() { }
    }

    class SphereGeometry {
        dispose() { }
    }

    class EdgesGeometry {
        dispose() { }
        constructor(_: unknown) { }
    }

    class Texture {
        colorSpace: unknown;
        minFilter: unknown;
        magFilter: unknown;
        wrapS: unknown;
        wrapT: unknown;
        generateMipmaps = false;
        center = { set: vi.fn() };
        rotation = 0;
        needsUpdate = false;
        dispose() { }
    }

    class CanvasTexture extends Texture {
        constructor(_: unknown) {
            super();
        }
    }

    class TextureLoader {
        load(
            _url: string,
            onLoad?: (texture: Texture) => void,
            _onProgress?: unknown,
            _onError?: unknown,
        ) {
            onLoad?.(new Texture());
        }
    }

    class WebGLRenderer {
        domElement = document.createElement("canvas");
        outputColorSpace: unknown;
        setPixelRatio() { }
        setClearColor() { }
        setSize() { }
        render() { }
        dispose() { }
    }

    class Raycaster {
        params: Record<string, unknown> = {};
        setFromCamera() { }
        intersectObject() {
            return [];
        }
    }

    return {
        Vector3,
        Vector2,
        Color,
        Object3D,
        Group,
        Scene,
        AmbientLight,
        DirectionalLight,
        PerspectiveCamera,
        BufferAttribute,
        BufferGeometry,
        Sphere,
        LineBasicMaterial,
        MeshBasicMaterial,
        MeshPhongMaterial,
        PointsMaterial,
        Mesh,
        Points,
        Line,
        LineSegments,
        BoxGeometry,
        PlaneGeometry,
        SphereGeometry,
        EdgesGeometry,
        Texture,
        CanvasTexture,
        TextureLoader,
        WebGLRenderer,
        Raycaster,
        SRGBColorSpace: "srgb",
        LinearFilter: "linear",
        ClampToEdgeWrapping: "clamp",
        DoubleSide: "double",
    };
});

import Coords3dViewer from "../../analyze/coords3d-viewer";

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

function makeTomograms() {
    return [
        {
            tomoId: "t1",
            label: "Tomo A",
            dims: [100, 80, 60],
            nCoords: 3,
        },
        {
            tomoId: "t2",
            label: "Tomo B",
            dims: [90, 70, 50],
            nCoords: 1,
        },
    ];
}

function makeCoordsForTomogram(tomoId: string) {
    if (tomoId === "t2") {
        return {
            tomoId: "t2",
            coords: [
                {
                    id: "p4",
                    x: 8,
                    y: 10,
                    z: 12,
                    classId: "C",
                    score: 0.3,
                },
            ],
        };
    }

    return {
        tomoId: "t1",
        coords: [
            {
                id: "p1",
                x: 10,
                y: 20,
                z: 30,
                classId: "A",
                score: 0.1,
            },
            {
                id: "p2",
                x: 14,
                y: 24,
                z: 34,
                classId: "B",
                score: 0.5,
            },
            {
                id: "p3",
                x: 18,
                y: 28,
                z: 38,
                classId: "A",
                score: 0.9,
            },
        ],
    };
}

function makeSliceUrl(axis: string, index: number) {
    return {
        url: `blob:${axis}-${index}`,
        revoke: vi.fn(),
    };
}

function renderViewer() {
    return render(
        <Coords3dViewer
            projectId={1}
            protocolId={2}
            outputName="coordsOutput"
            hideMetadataAction={false}
        />,
    );
}

function getNthHelpButton(index: number): HTMLButtonElement {
    const icon = screen.getAllByTestId("help-icon")[index];
    const button = icon.closest("button");

    if (!button) {
        throw new Error(`Help button ${index} was not found`);
    }

    return button as HTMLButtonElement;
}

vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
vi.stubGlobal("cancelAnimationFrame", vi.fn());

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    return {
        clearRect: vi.fn(),
        createRadialGradient: () => ({
            addColorStop: vi.fn(),
        }),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
    } as any;
});

describe("Coords3dViewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        class ResizeObserverMock {
            observe() { }
            disconnect() { }
            unobserve() { }
        }

        vi.stubGlobal("ResizeObserver", ResizeObserverMock);

        serviceMocks.listCoords3dTomograms.mockResolvedValue(makeTomograms());

        serviceMocks.fetchCoords3dForTomogram.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tomoId: string,
            ) => makeCoordsForTomogram(String(tomoId)),
        );

        serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                _tomoId: string,
                sliceIndex: number,
                options?: { axis?: string },
            ) => makeSliceUrl(String(options?.axis ?? "z"), Number(sliceIndex)),
        );

        serviceMocks.createCoords3dOutputFromPoints.mockResolvedValue({ success: true });
    });

    it("shows a loading state while tomograms are pending", async () => {
        const deferred = createDeferred<ReturnType<typeof makeTomograms>>();
        serviceMocks.listCoords3dTomograms.mockReturnValueOnce(deferred.promise);

        renderViewer();

        expect(await screen.findByText("Loading tomograms…")).toBeInTheDocument();

        deferred.resolve([]);

        await waitFor(() => {
            expect(
                screen.getByText("No tomograms for this coordinates set."),
            ).toBeInTheDocument();
        });
    });

    it("shows an error when tomograms loading fails", async () => {
        serviceMocks.listCoords3dTomograms.mockRejectedValueOnce(
            new Error("Tomograms failed"),
        );

        renderViewer();

        await waitFor(() => {
            expect(screen.getByText("Tomograms failed")).toBeInTheDocument();
        });
    });

    it("shows the empty state when no tomograms are returned", async () => {
        serviceMocks.listCoords3dTomograms.mockResolvedValueOnce([]);

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No tomograms for this coordinates set."),
            ).toBeInTheDocument();
        });
    });

    it("auto-selects the first tomogram and loads its coordinates and Z slice", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchCoords3dForTomogram).toHaveBeenCalledWith(
                1,
                2,
                "coordsOutput",
                "t1",
            );
        });

        await waitFor(() => {
            expect(serviceMocks.fetchCoords3dTomogramSliceObjectUrl).toHaveBeenCalledWith(
                1,
                expect.any(Number),
                "coordsOutput",
                "t1",
                30,
                {
                    axis: "z",
                    cmap: "gray",
                    format: "webp",
                    normalize: "minmax",
                    scale: 1,
                    signal: expect.any(AbortSignal),
                },
            );
        });

        expect(screen.getByText("Total 3")).toBeInTheDocument();
        expect(screen.getByText("Single view")).toBeInTheDocument();
    });

    it("filters coordinates by class", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        const classSelect = screen.getByRole("combobox");
        fireEvent.mouseDown(classSelect);
        fireEvent.click(await screen.findByText("A"));

        await waitFor(() => {
            expect(screen.getByText("Shown 2")).toBeInTheDocument();
        });
    });

    it("switches to metadata mode", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Metadata" }));

        expect(
            await screen.findByText("Mock MetadataViewer coordsOutput"),
        ).toBeInTheDocument();
    });


    it("opens the help dialog from the filters panel", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(getNthHelpButton(0));

        const dialog = await screen.findByRole("dialog");

        expect(within(dialog).getByText("Slice layout")).toBeInTheDocument();
        expect(
            within(dialog).getByText(
                /Choose between a single XY slice or the orthogonal 3-views layout/i,
            ),
        ).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });
    it("switches from single view to 3 views and loads X/Y slices", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();
        expect(screen.getByText("Single view")).toBeInTheDocument();

        const beforeCalls = serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mock.calls.length;

        fireEvent.click(screen.getByRole("button", { name: "3 Views" }));

        await waitFor(() => {
            expect(serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mock.calls.length).toBeGreaterThan(
                beforeCalls,
            );
        });

        const calls = serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mock.calls;
        const xCalls = calls.filter((call) => call[5]?.axis === "x");
        const yCalls = calls.filter((call) => call[5]?.axis === "y");

        expect(xCalls.length).toBeGreaterThan(0);
        expect(yCalls.length).toBeGreaterThan(0);

        expect(await screen.findByText("3 views")).toBeInTheDocument();
    });

    it("moves the X and Y slice sliders in 3-views mode", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3 Views" }));

        await waitFor(() => {
            expect(serviceMocks.fetchCoords3dTomogramSliceObjectUrl).toHaveBeenCalled();
        });

        const beforeCalls = serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mock.calls.length;
        const sliders = screen.getAllByRole("slider");

        fireEvent.keyDown(sliders[1], { key: "ArrowRight" });
        fireEvent.keyDown(sliders[2], { key: "ArrowRight" });

        await waitFor(() => {
            expect(serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mock.calls.length).toBeGreaterThan(
                beforeCalls,
            );
        });

        const calls = serviceMocks.fetchCoords3dTomogramSliceObjectUrl.mock.calls;
        const xCalls = calls.filter((call) => call[5]?.axis === "x");
        const yCalls = calls.filter((call) => call[5]?.axis === "y");

        expect(xCalls.length).toBeGreaterThan(0);
        expect(yCalls.length).toBeGreaterThan(0);
    });

    it("applies a score-range filter", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        const sliders = screen.getAllByRole("slider");
        const scoreUpperThumb = sliders[2];

        await act(async () => {
            scoreUpperThumb.focus();
            fireEvent.keyDown(scoreUpperThumb, { key: "Home" });
        });

        await waitFor(() => {
            expect(screen.getByText("Shown 1")).toBeInTheDocument();
        });
    });

    it("limits the number of shown points with maxPoints", async () => {
        const manyPoints = Array.from({ length: 2001 }, (_, i) => ({
            id: `p-${i}`,
            x: i % 100,
            y: i % 80,
            z: i % 60,
            classId: "A",
            score: (i % 100) / 100,
        }));

        serviceMocks.fetchCoords3dForTomogram.mockImplementationOnce(
            async () => ({
                tomoId: "t1",
                coords: manyPoints,
            }),
        );

        renderViewer();

        expect(await screen.findByText("Total 2,001")).toBeInTheDocument();

        const sliders = screen.getAllByRole("slider");
        const maxPointsSlider = sliders[sliders.length - 1];

        fireEvent.keyDown(maxPointsSlider, { key: "Home" });

        await waitFor(() => {
            expect(screen.getByText("Shown 667")).toBeInTheDocument();
        });
    });

    it("changes brightness and contrast and then resets them", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

        const sliders = screen.getAllByRole("slider");
        const brightnessSlider = sliders[1];
        const contrastSlider = sliders[2];

        expect(brightnessSlider).toHaveAttribute("aria-valuenow", "1");
        expect(contrastSlider).toHaveAttribute("aria-valuenow", "1");

        fireEvent.keyDown(brightnessSlider, { key: "ArrowRight" });
        fireEvent.keyDown(contrastSlider, { key: "ArrowRight" });

        await waitFor(() => {
            expect(brightnessSlider.getAttribute("aria-valuenow")).not.toBe("1");
            expect(contrastSlider.getAttribute("aria-valuenow")).not.toBe("1");
        });

        fireEvent.click(screen.getByRole("button", { name: "Reset" }));

        await waitFor(() => {
            expect(brightnessSlider).toHaveAttribute("aria-valuenow", "1");
            expect(contrastSlider).toHaveAttribute("aria-valuenow", "1");
        });
    });

    it("switches to 3D Map and shows the 3D overlay", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        expect(
            await screen.findByText(/3D map · drag orbit · wheel zoom/i),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("button", { name: "Reset 3D camera" }),
        ).toBeInTheDocument();
    });

    it("clicks the Reset 3D camera button", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));

        const resetButton = await screen.findByRole("button", {
            name: "Reset 3D camera",
        });

        fireEvent.click(resetButton);

        expect(resetButton).toBeInTheDocument();
    });

    it("toggles show slice planes in 3D appearance mode", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(
            await screen.findByText(/3D map · drag orbit · wheel zoom/i),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

        const showSlicePlanes = screen.getByLabelText("Show slice planes");

        expect(showSlicePlanes).toBeChecked();

        fireEvent.click(showSlicePlanes);
        expect(showSlicePlanes).not.toBeChecked();

        fireEvent.click(showSlicePlanes);
        expect(showSlicePlanes).toBeChecked();
    });

    it("toggles show volume box and show axes in 3D appearance mode", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(
            await screen.findByText(/3D map · drag orbit · wheel zoom/i),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

        const showBox = screen.getByLabelText("Show volume box");
        const showAxes = screen.getByLabelText("Show axes");

        expect(showBox).toBeChecked();
        expect(showAxes).toBeChecked();

        fireEvent.click(showBox);
        fireEvent.click(showAxes);

        expect(showBox).not.toBeChecked();
        expect(showAxes).not.toBeChecked();
    });

    it("toggles sync 3D click to slices", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        expect(
            await screen.findByText(/3D map · drag orbit · wheel zoom/i),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

        const syncPick = screen.getByLabelText("Sync 3D click to slices");

        expect(syncPick).toBeChecked();

        fireEvent.click(syncPick);
        expect(syncPick).not.toBeChecked();

        fireEvent.click(syncPick);
        expect(syncPick).toBeChecked();
    });

    it("changes the 3D color mode", async () => {
        renderViewer();

        expect(await screen.findByText("Total 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "3D Map" }));
        fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

        const colorModeSelect = screen
            .getAllByRole("combobox")
            .find((el) => el.textContent?.trim() === "Class");

        expect(colorModeSelect).toBeDefined();

        fireEvent.mouseDown(colorModeSelect!);
        fireEvent.click(await screen.findByText("Score"));

        expect(screen.getAllByText("Score").length).toBeGreaterThan(0);
    });
});