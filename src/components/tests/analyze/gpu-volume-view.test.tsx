import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const threeState = vi.hoisted(() => ({
    isWebGL2: true,
    lastRenderer: null as any,
    lastControls: null as any,
    lastMaterial: null as any,
    lastMesh: null as any,
    lastCamera: null as any,
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

        sub(v: Vector3) {
            this.x -= v.x;
            this.y -= v.y;
            this.z -= v.z;
            return this;
        }

        add(v: Vector3) {
            this.x += v.x;
            this.y += v.y;
            this.z += v.z;
            return this;
        }

        length() {
            return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        }

        normalize() {
            const len = this.length() || 1;
            this.x /= len;
            this.y /= len;
            this.z /= len;
            return this;
        }

        setLength(len: number) {
            this.normalize();
            this.x *= len;
            this.y *= len;
            this.z *= len;
            return this;
        }
    }

    class Matrix4 {
        copy() {
            return this;
        }
        invert() {
            return this;
        }
    }

    class Scene {
        children: unknown[] = [];
        add(obj: unknown) {
            this.children.push(obj);
        }
        clear() {
            this.children = [];
        }
    }

    class PerspectiveCamera {
        aspect = 1;
        position = new Vector3();

        constructor() {
            threeState.lastCamera = this;
        }

        updateProjectionMatrix() { }
    }

    class BoxGeometry {
        dispose() { }
    }

    class ShaderMaterial {
        uniforms: Record<string, { value: unknown }>;
        vertexShader: string;
        fragmentShader: string;
        side: unknown;
        transparent: boolean;
        depthWrite: boolean;

        constructor(params: Record<string, any>) {
            this.uniforms = params.uniforms;
            this.vertexShader = params.vertexShader;
            this.fragmentShader = params.fragmentShader;
            this.side = params.side;
            this.transparent = params.transparent;
            this.depthWrite = params.depthWrite;
            threeState.lastMaterial = this;
        }

        dispose() { }
    }

    class Mesh {
        geometry: any;
        material: any;
        scale = new Vector3(1, 1, 1);
        matrixWorld = new Matrix4();

        constructor(geometry: unknown, material: unknown) {
            this.geometry = geometry;
            this.material = material;
            threeState.lastMesh = this;
        }

        updateMatrixWorld() { }
    }

    class Data3DTexture {
        data: Uint8Array | Float32Array;
        width: number;
        height: number;
        depth: number;
        format: unknown;
        type: unknown;
        minFilter: unknown;
        magFilter: unknown;
        wrapS: unknown;
        wrapT: unknown;
        wrapR: unknown;
        unpackAlignment = 1;
        needsUpdate = false;
        internalFormat: unknown;

        constructor(data: Uint8Array | Float32Array, width: number, height: number, depth: number) {
            this.data = data;
            this.width = width;
            this.height = height;
            this.depth = depth;
        }

        dispose() { }
    }

    class WebGLRenderer {
        domElement: HTMLCanvasElement;
        capabilities = { isWebGL2: threeState.isWebGL2 };
        outputColorSpace: unknown;
        disposed = false;
        addedEvents: string[] = [];
        removedEvents: string[] = [];

        constructor() {
            this.domElement = document.createElement("canvas");

            const originalAdd = this.domElement.addEventListener.bind(this.domElement);
            const originalRemove = this.domElement.removeEventListener.bind(this.domElement);

            this.domElement.addEventListener = ((type: string, listener: any, options?: any) => {
                this.addedEvents.push(type);
                return originalAdd(type, listener, options);
            }) as typeof this.domElement.addEventListener;

            this.domElement.removeEventListener = ((type: string, listener: any, options?: any) => {
                this.removedEvents.push(type);
                return originalRemove(type, listener, options);
            }) as typeof this.domElement.removeEventListener;

            threeState.lastRenderer = this;
        }

        setClearColor() { }
        setPixelRatio() { }
        setSize() { }
        render() { }

        dispose() {
            this.disposed = true;
        }
    }

    class Clock {
        getDelta() {
            return 0.016;
        }
    }

    return {
        Vector3,
        Matrix4,
        Scene,
        PerspectiveCamera,
        BoxGeometry,
        ShaderMaterial,
        Mesh,
        Data3DTexture,
        WebGLRenderer,
        Clock,
        BackSide: "back",
        SRGBColorSpace: "srgb",
        RedFormat: "red",
        UnsignedByteType: "ubyte",
        FloatType: "float",
        LinearFilter: "linear",
        ClampToEdgeWrapping: "clamp",
    };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
    OrbitControls: class {
        target = { set: vi.fn() };
        enableDamping = false;
        dampingFactor = 0;
        rotateSpeed = 0;
        panSpeed = 0;
        screenSpacePanning = false;
        zoomSpeed = 0;
        enableZoom = true;
        enablePan = true;
        enableRotate = true;
        minDistance = 0;
        maxDistance = 0;
        autoRotate = false;
        autoRotateSpeed = 0;
        disposed = false;
        listeners: Record<string, Function[]> = {};

        constructor() {
            threeState.lastControls = this;
        }

        update() {
            return false;
        }

        dispose() {
            this.disposed = true;
        }

        addEventListener(name: string, cb: Function) {
            if (!this.listeners[name]) this.listeners[name] = [];
            this.listeners[name].push(cb);
        }

        removeEventListener(
            name: string,
            cb: Function,
        ) {
            this.listeners[name] =
                (this.listeners[name] ?? []).filter(
                    (listener) => listener !== cb,
                );
        }
    },
}));

import GpuVolumeView from "../../analyze/gpu-volume-view";

function makeProps(overrides: Partial<React.ComponentProps<typeof GpuVolumeView>> = {}) {
    return {
        values: Array.from({ length: 8 }, (_, i) => i),
        dims: { x: 2, y: 2, z: 2 },
        order: "xyz" as const,
        spacing: [1, 1, 1] as [number, number, number],
        rangeMin: 0,
        rangeMax: 10,
        isoMin: 1,
        isoMax: 4,
        opacity: 0.5,
        colormap: "viridis",
        shell: 0.12,
        renderMode: "surface" as const,
        autoRotate: false,
        autoRotateSpeed: 0.8,
        onError: vi.fn(),
        ...overrides,
    };
}

describe("GpuVolumeView", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        threeState.isWebGL2 = true;
        threeState.lastRenderer = null;
        threeState.lastControls = null;
        threeState.lastMaterial = null;

        class ResizeObserverMock {
            observe() { }
            disconnect() { }
            unobserve() { }
        }

        vi.stubGlobal("ResizeObserver", ResizeObserverMock);
        vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });

    it("renders an empty shell when there are no values", () => {
        const { container } = render(
            <GpuVolumeView {...makeProps({ values: [] })} />,
        );

        expect(container.firstChild).toBeInTheDocument();
        expect(document.querySelector("canvas")).not.toBeInTheDocument();
    });

    it("shows the WebGL2 error overlay and calls onError when WebGL2 is unavailable", async () => {
        threeState.isWebGL2 = false;
        const onError = vi.fn();

        render(<GpuVolumeView {...makeProps({ onError })} />);

        expect(
            await screen.findByText("WebGL2 is required for GPU volume rendering."),
        ).toBeInTheDocument();

        expect(onError).toHaveBeenCalledWith(
            "WebGL2 is required for GPU volume rendering.",
        );
    });

    it("mounts the renderer and canvas when a valid texture can be built", async () => {
        render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
            expect(threeState.lastMaterial).not.toBeNull();
        });

        expect(document.querySelector("canvas")).toBeInTheDocument();
        expect(
            screen.queryByText("WebGL2 is required for GPU volume rendering."),
        ).not.toBeInTheDocument();
    });

    it("updates shader uniforms when props change", async () => {
        const { rerender } = render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        rerender(
            <GpuVolumeView
                {...makeProps({
                    isoMin: 2,
                    isoMax: 5,
                    opacity: 0.7,
                    colormap: "turbo",
                    renderMode: "volume",
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uIsoMin.value).toBe(0.2);
            expect(threeState.lastMaterial.uniforms.uIsoMax.value).toBe(0.5);
            expect(threeState.lastMaterial.uniforms.uOpacity.value).toBe(0.7);
            expect(threeState.lastMaterial.uniforms.uCmap.value).toBe(6);
            expect(threeState.lastMaterial.uniforms.uIsoMode.value).toBe(0);
        });
    });

    it("updates autoRotate and autoRotateSpeed on the existing controls", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    autoRotate: false,
                    autoRotateSpeed: 0.8,
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastControls).not.toBeNull();
        });

        expect(threeState.lastControls.autoRotate).toBe(false);
        expect(threeState.lastControls.autoRotateSpeed).toBe(0.8);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    autoRotate: true,
                    autoRotateSpeed: 2.5,
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastControls.autoRotate).toBe(true);
            expect(threeState.lastControls.autoRotateSpeed).toBe(2.5);
        });
    });

    it("disposes controls and renderer on unmount", async () => {
        const { unmount } = render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
            expect(threeState.lastControls).not.toBeNull();
        });

        const renderer = threeState.lastRenderer;
        const controls = threeState.lastControls;

        unmount();

        expect(renderer.disposed).toBe(true);
        expect(controls.disposed).toBe(true);
    });


    it.each([
        ["viridis", 0],
        ["gray", 1],
        ["magma", 2],
        ["inferno", 3],
        ["plasma", 4],
        ["cividis", 5],
        ["turbo", 6],
    ])("maps colormap %s to uCmap=%s", async (colormap, expectedId) => {
        const { rerender } = render(
            <GpuVolumeView {...makeProps({ colormap: "viridis" })} />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        rerender(<GpuVolumeView {...makeProps({ colormap })} />);

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uCmap.value).toBe(expectedId);
        });
    });

    it("clamps shell and updates renderMode uniforms", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    shell: 0.01,
                    renderMode: "surface",
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        expect(threeState.lastMaterial.uniforms.uShell.value).toBe(0.02);
        expect(threeState.lastMaterial.uniforms.uIsoMode.value).toBe(1);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    shell: 1.5,
                    renderMode: "volume",
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uShell.value).toBe(1);
            expect(threeState.lastMaterial.uniforms.uIsoMode.value).toBe(0);
        });
    });

    it("updates mesh scale when spacing changes", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 2, y: 2, z: 2 },
                    spacing: [1, 1, 1],
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMesh).not.toBeNull();
        });

        expect(threeState.lastMesh.scale.x).toBe(1);
        expect(threeState.lastMesh.scale.y).toBe(1);
        expect(threeState.lastMesh.scale.z).toBe(1);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 2, y: 2, z: 2 },
                    spacing: [2, 1, 1],
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMesh.scale.x).toBe(1);
            expect(threeState.lastMesh.scale.y).toBe(0.5);
            expect(threeState.lastMesh.scale.z).toBe(0.5);
        });
    });

    it("updates uTexSize when dims change", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 2, y: 2, z: 2 },
                    values: Array.from({ length: 8 }, (_, i) => i),
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        expect(threeState.lastMaterial.uniforms.uTexSize.value.x).toBe(2);
        expect(threeState.lastMaterial.uniforms.uTexSize.value.y).toBe(2);
        expect(threeState.lastMaterial.uniforms.uTexSize.value.z).toBe(2);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 4, y: 2, z: 1 },
                    values: Array.from({ length: 8 }, (_, i) => i),
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uTexSize.value.x).toBe(4);
            expect(threeState.lastMaterial.uniforms.uTexSize.value.y).toBe(2);
            expect(threeState.lastMaterial.uniforms.uTexSize.value.z).toBe(1);
        });
    });

    it("replaces the 3D texture when values change", async () => {
        const valuesA = Array.from({ length: 8 }, (_, i) => i);
        const valuesB = Array.from({ length: 8 }, (_, i) => i + 10);

        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    values: valuesA,
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        const firstTexture = threeState.lastMaterial.uniforms.uTex.value;

        rerender(
            <GpuVolumeView
                {...makeProps({
                    values: valuesB,
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uTex.value).not.toBe(firstTexture);
        });
    });

    it.each([
        ["viridis", 0],
        ["gray", 1],
        ["magma", 2],
        ["inferno", 3],
        ["plasma", 4],
        ["cividis", 5],
        ["turbo", 6],
    ])("maps colormap %s to uCmap=%s", async (colormap, expectedId) => {
        const { rerender } = render(
            <GpuVolumeView {...makeProps({ colormap: "viridis" })} />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        rerender(<GpuVolumeView {...makeProps({ colormap })} />);

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uCmap.value).toBe(expectedId);
        });
    });

    it("clamps shell and updates renderMode uniforms", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    shell: 0.01,
                    renderMode: "surface",
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        expect(threeState.lastMaterial.uniforms.uShell.value).toBe(0.02);
        expect(threeState.lastMaterial.uniforms.uIsoMode.value).toBe(1);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    shell: 1.5,
                    renderMode: "volume",
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uShell.value).toBe(1);
            expect(threeState.lastMaterial.uniforms.uIsoMode.value).toBe(0);
        });
    });

    it("updates mesh scale when spacing changes", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 2, y: 2, z: 2 },
                    spacing: [1, 1, 1],
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMesh).not.toBeNull();
        });

        expect(threeState.lastMesh.scale.x).toBe(1);
        expect(threeState.lastMesh.scale.y).toBe(1);
        expect(threeState.lastMesh.scale.z).toBe(1);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 2, y: 2, z: 2 },
                    spacing: [2, 1, 1],
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMesh.scale.x).toBe(1);
            expect(threeState.lastMesh.scale.y).toBe(0.5);
            expect(threeState.lastMesh.scale.z).toBe(0.5);
        });
    });

    it("updates uTexSize when dims change", async () => {
        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 2, y: 2, z: 2 },
                    values: Array.from({ length: 8 }, (_, i) => i),
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        expect(threeState.lastMaterial.uniforms.uTexSize.value.x).toBe(2);
        expect(threeState.lastMaterial.uniforms.uTexSize.value.y).toBe(2);
        expect(threeState.lastMaterial.uniforms.uTexSize.value.z).toBe(2);

        rerender(
            <GpuVolumeView
                {...makeProps({
                    dims: { x: 4, y: 2, z: 1 },
                    values: Array.from({ length: 8 }, (_, i) => i),
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uTexSize.value.x).toBe(4);
            expect(threeState.lastMaterial.uniforms.uTexSize.value.y).toBe(2);
            expect(threeState.lastMaterial.uniforms.uTexSize.value.z).toBe(1);
        });
    });

    it("replaces the 3D texture when values change", async () => {
        const valuesA = Array.from({ length: 8 }, (_, i) => i);
        const valuesB = Array.from({ length: 8 }, (_, i) => i + 10);

        const { rerender } = render(
            <GpuVolumeView
                {...makeProps({
                    values: valuesA,
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        const firstTexture = threeState.lastMaterial.uniforms.uTex.value;

        rerender(
            <GpuVolumeView
                {...makeProps({
                    values: valuesB,
                })}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uTex.value).not.toBe(firstTexture);
        });
    });


    it("registers the expected canvas interaction listeners", async () => {
        render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
        });

        expect(threeState.lastRenderer.addedEvents).toContain("wheel");
        expect(threeState.lastRenderer.addedEvents).toContain("pointerdown");
        expect(threeState.lastRenderer.addedEvents).toContain("dblclick");
    });

    it("resets the camera on double click", async () => {
        render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
            expect(threeState.lastCamera).not.toBeNull();
        });

        threeState.lastCamera.position.set(9, 8, 7);

        threeState.lastRenderer.domElement.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true }),
        );

        expect(threeState.lastCamera.position.x).toBe(1.8);
        expect(threeState.lastCamera.position.y).toBe(1.2);
        expect(threeState.lastCamera.position.z).toBe(1.8);
    });

    it("removes canvas listeners and disposes resources on unmount", async () => {
        const { unmount } = render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
            expect(threeState.lastControls).not.toBeNull();
        });

        const renderer = threeState.lastRenderer;
        const controls = threeState.lastControls;

        unmount();

        expect(renderer.removedEvents).toContain("wheel");
        expect(renderer.removedEvents).toContain("pointerdown");
        expect(renderer.removedEvents).toContain("dblclick");
        expect(renderer.disposed).toBe(true);
        expect(controls.disposed).toBe(true);
    });

    it("disposes the renderer when WebGL2 is unavailable and the component unmounts", async () => {
        threeState.isWebGL2 = false;

        const { unmount } = render(<GpuVolumeView {...makeProps()} />);

        expect(
            await screen.findByText("WebGL2 is required for GPU volume rendering."),
        ).toBeInTheDocument();

        const renderer = threeState.lastRenderer;
        unmount();

        expect(renderer.disposed).toBe(true);
    });

    it("registers the expected canvas interaction listeners", async () => {
        render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
        });

        expect(threeState.lastRenderer.addedEvents).toContain("wheel");
        expect(threeState.lastRenderer.addedEvents).toContain("pointerdown");
        expect(threeState.lastRenderer.addedEvents).toContain("dblclick");
    });

    it("resets the camera on double click", async () => {
        render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
            expect(threeState.lastCamera).not.toBeNull();
        });

        threeState.lastCamera.position.set(9, 8, 7);

        threeState.lastRenderer.domElement.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true }),
        );

        expect(threeState.lastCamera.position.x).toBe(1.8);
        expect(threeState.lastCamera.position.y).toBe(1.2);
        expect(threeState.lastCamera.position.z).toBe(1.8);
    });

    it("removes canvas listeners and disposes resources on unmount", async () => {
        const { unmount } = render(<GpuVolumeView {...makeProps()} />);

        await waitFor(() => {
            expect(threeState.lastRenderer).not.toBeNull();
            expect(threeState.lastControls).not.toBeNull();
        });

        const renderer = threeState.lastRenderer;
        const controls = threeState.lastControls;

        unmount();

        expect(renderer.removedEvents).toContain("wheel");
        expect(renderer.removedEvents).toContain("pointerdown");
        expect(renderer.removedEvents).toContain("dblclick");
        expect(renderer.disposed).toBe(true);
        expect(controls.disposed).toBe(true);
    });

    it("disposes the renderer when WebGL2 is unavailable and the component unmounts", async () => {
        threeState.isWebGL2 = false;

        const { unmount } = render(<GpuVolumeView {...makeProps()} />);

        expect(
            await screen.findByText("WebGL2 is required for GPU volume rendering."),
        ).toBeInTheDocument();

        const renderer = threeState.lastRenderer;
        unmount();

        expect(renderer.disposed).toBe(true);
    });

});