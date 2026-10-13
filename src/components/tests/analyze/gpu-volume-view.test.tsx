import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

        addScalar(value: number) {
            this.x += value;
            this.y += value;
            this.z += value;
            return this;
        }

        addScaledVector(v: Vector3, scale: number) {
            this.x += v.x * scale;
            this.y += v.y * scale;
            this.z += v.z * scale;
            return this;
        }

        length() {
            return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        }

        crossVectors(a: Vector3, b: Vector3) {
            const x = a.y * b.z - a.z * b.y;
            const y = a.z * b.x - a.x * b.z;
            const z = a.x * b.y - a.y * b.x;
            return this.set(x, y, z);
        }

        distanceTo(v: Vector3) {
            const dx = this.x - v.x;
            const dy = this.y - v.y;
            const dz = this.z - v.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
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

        project() {
            return this;
        }
    }

    class Quaternion {
        x = 0;
        y = 0;
        z = 0;
        w = 1;

        clone() {
            const out = new Quaternion();
            out.x = this.x; out.y = this.y; out.z = this.z; out.w = this.w;
            return out;
        }

        identity() {
            this.x = 0; this.y = 0; this.z = 0; this.w = 1;
            return this;
        }

        setFromAxisAngle(axis: Vector3, angle: number) {
            const half = angle / 2;
            const s = Math.sin(half);
            this.x = axis.x * s;
            this.y = axis.y * s;
            this.z = axis.z * s;
            this.w = Math.cos(half);
            return this;
        }

        multiplyQuaternions(a: Quaternion, b: Quaternion) {
            const ax = a.x, ay = a.y, az = a.z, aw = a.w;
            const bx = b.x, by = b.y, bz = b.z, bw = b.w;
            this.x = ax * bw + aw * bx + ay * bz - az * by;
            this.y = ay * bw + aw * by + az * bx - ax * bz;
            this.z = az * bw + aw * bz + ax * by - ay * bx;
            this.w = aw * bw - ax * bx - ay * by - az * bz;
            return this;
        }

        premultiply(q: Quaternion) {
            return this.multiplyQuaternions(q, this.clone());
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
        up = new Vector3(0, 1, 0);

        constructor() {
            threeState.lastCamera = this;
        }

        updateProjectionMatrix() { }
        getWorldDirection(target: Vector3) {
            return target.set(0, 0, -1);
        }
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
        quaternion = new Quaternion();
        matrixWorld = new Matrix4();

        constructor(geometry: unknown, material: unknown) {
            this.geometry = geometry;
            this.material = material;
            threeState.lastMesh = this;
        }

        updateMatrixWorld() { }
        worldToLocal(vector: Vector3) { return vector; }
        localToWorld(vector: Vector3) { return vector; }
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
        pixelRatio = 1;

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
        setPixelRatio(value: number) { this.pixelRatio = value; }
        setSize(width: number, height: number, updateStyle = true) {
            // Three.js behavior: framebuffer dimensions scale with DPR;
            // CSS dimensions update only when updateStyle !== false.
            this.domElement.width = Math.floor(width * this.pixelRatio);
            this.domElement.height = Math.floor(height * this.pixelRatio);
            if (updateStyle) {
                this.domElement.style.width = `${width}px`;
                this.domElement.style.height = `${height}px`;
            }
        }
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
        Quaternion,
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
        target = {
            x: 0,
            y: 0,
            z: 0,
            set: vi.fn(function (this: any, x: number, y: number, z: number) {
                this.x = x;
                this.y = y;
                this.z = z;
                return this;
            }),
            clone() {
                return { x: this.x, y: this.y, z: this.z };
            },
        };
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

    it("updates clipping and synchronized slice-plane uniforms without rebuilding the renderer", async () => {
        const props = makeProps();
        const { rerender } = render(<GpuVolumeView {...props} />);

        await waitFor(() => {
            expect(threeState.lastMaterial).not.toBeNull();
        });

        const renderer = threeState.lastRenderer;
        const material = threeState.lastMaterial;
        const texture = material.uniforms.uTex.value;
        expect(material.uniforms.uSliceVisible.value).toMatchObject({ x: 0, y: 0, z: 0 });
        rerender(
            <GpuVolumeView
                {...props}
                clipBounds={{ x: [0.2, 0.8], y: [0.1, 0.9], z: [0.3, 1] }}
                sliceVisibility={{ x: true, y: false, z: true }}
                slicePlaneOpacity={0.44}
            />,
        );

        await waitFor(() => {
            expect(threeState.lastMaterial.uniforms.uClipMin.value).toMatchObject({ x: 0.2, y: 0.1, z: 0.3 });
            expect(threeState.lastMaterial.uniforms.uClipMax.value).toMatchObject({ x: 0.8, y: 0.9, z: 1 });
            expect(threeState.lastMaterial.uniforms.uSliceVisible.value).toMatchObject({ x: 1, y: 0, z: 1 });
            expect(threeState.lastMaterial.uniforms.uSliceOpacity.value).toBe(0.44);
        });

        expect(threeState.lastRenderer).toBe(renderer);
        expect(threeState.lastMaterial).toBe(material);
        expect(threeState.lastMaterial.uniforms.uTex.value).toBe(texture);
    });

    it("snaps the existing camera to repeatable principal-axis commands", async () => {
        const { rerender } = render(<GpuVolumeView {...makeProps({ cameraCommand: null })} />);

        await waitFor(() => {
            expect(threeState.lastCamera).not.toBeNull();
        });

        rerender(<GpuVolumeView {...makeProps({ cameraCommand: { preset: "right", key: 1 } })} />);

        await waitFor(() => {
            expect(threeState.lastCamera.position.x).toBeGreaterThan(0);
            expect(threeState.lastCamera.position.y).toBeCloseTo(0);
            expect(threeState.lastCamera.position.z).toBeCloseTo(0);
        });

        rerender(<GpuVolumeView {...makeProps({ cameraCommand: { preset: "top", key: 2 } })} />);

        await waitFor(() => {
            expect(threeState.lastCamera.position.x).toBeCloseTo(0);
            expect(threeState.lastCamera.position.y).toBeGreaterThan(0);
            expect(threeState.lastCamera.position.z).toBeCloseTo(0);
            expect(threeState.lastCamera.up).toMatchObject({ x: 0, y: 0, z: -1 });
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

    it("resets the camera when resetViewKey changes", async () => {
        const { rerender } = render(<GpuVolumeView {...makeProps({ resetViewKey: 0 })} />);

        await waitFor(() => {
            expect(threeState.lastCamera).not.toBeNull();
        });

        threeState.lastCamera.position.set(9, 8, 7);
        rerender(<GpuVolumeView {...makeProps({ resetViewKey: 1 })} />);

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


    describe("GPU volume interaction stability", () => {
        function installFrameQueue(): FrameRequestCallback[] {
            const frames: FrameRequestCallback[] = [];
            vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
                frames.push(callback);
                return frames.length;
            }));
            return frames;
        }

        function flushFrame(frames: FrameRequestCallback[]) {
            const nextFrame = frames.shift();
            if (!nextFrame) throw new Error("Expected a pending GPU render frame");
            act(() => { nextFrame(performance.now()); });
        }

        it("keeps raycasting sample count unchanged when pressing and releasing the mouse in Volume mode", async () => {
            const frames = installFrameQueue();
            render(<GpuVolumeView {...makeProps({ renderMode: "volume" })} />);
            await waitFor(() => expect(threeState.lastMaterial).not.toBeNull());

            flushFrame(frames);
            const idleSteps = Number(threeState.lastMaterial.uniforms.uSteps.value);
            expect(idleSteps).toBeGreaterThan(0);

            fireEvent.pointerDown(threeState.lastRenderer.domElement);
            flushFrame(frames);
            expect(threeState.lastMaterial.uniforms.uSteps.value).toBe(idleSteps);

            fireEvent.pointerUp(window);
            flushFrame(frames);
            expect(threeState.lastMaterial.uniforms.uSteps.value).toBe(idleSteps);
        });

        it("does not resize GPU pixel density at the start/end of a Volume drag", async () => {
            vi.stubGlobal("devicePixelRatio", 2);
            const frames = installFrameQueue();
            render(<GpuVolumeView {...makeProps({ renderMode: "volume" })} />);
            await waitFor(() => expect(threeState.lastRenderer).not.toBeNull());

            flushFrame(frames);
            const renderer = threeState.lastRenderer;
            const ratioSpy = vi.spyOn(renderer, "setPixelRatio");

            fireEvent.pointerDown(renderer.domElement);
            flushFrame(frames);
            expect(ratioSpy).not.toHaveBeenCalled();

            fireEvent.pointerUp(window);
            flushFrame(frames);
            expect(ratioSpy).not.toHaveBeenCalled();
        });

        it("preserves adaptive performance for Surface mode", async () => {
            vi.stubGlobal("devicePixelRatio", 2);
            const frames = installFrameQueue();
            render(<GpuVolumeView {...makeProps({ renderMode: "surface" })} />);
            await waitFor(() => expect(threeState.lastMaterial).not.toBeNull());

            flushFrame(frames);
            const idleSteps = Number(threeState.lastMaterial.uniforms.uSteps.value);
            const ratioSpy = vi.spyOn(threeState.lastRenderer, "setPixelRatio");

            fireEvent.pointerDown(threeState.lastRenderer.domElement);
            flushFrame(frames);

            expect(Number(threeState.lastMaterial.uniforms.uSteps.value)).toBeLessThan(idleSteps);
            expect(ratioSpy).toHaveBeenCalledWith(1);
        });
    });


    describe("GPU volume canvas centering and free rotation", () => {
        it("keeps HiDPI canvas CSS dimensions equal to the viewer, not the device-pixel framebuffer", async () => {
            vi.stubGlobal("devicePixelRatio", 2);
            const previousWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
            const previousHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
            Object.defineProperty(HTMLElement.prototype, "clientWidth", {
                configurable: true,
                get: () => 480,
            });
            Object.defineProperty(HTMLElement.prototype, "clientHeight", {
                configurable: true,
                get: () => 320,
            });

            try {
                render(<GpuVolumeView {...makeProps({ renderMode: "volume" })} />);
                await waitFor(() => expect(threeState.lastRenderer).not.toBeNull());
                const canvas = threeState.lastRenderer.domElement as HTMLCanvasElement;
                expect(canvas.width).toBe(960);
                expect(canvas.height).toBe(640);
                // Critical: the DOM canvas must occupy 480x320 CSS pixels,
                // otherwise its rendered center lands to the lower right.
                expect(canvas.style.width).toBe("480px");
                expect(canvas.style.height).toBe("320px");
            } finally {
                if (previousWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", previousWidth);
                else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
                if (previousHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", previousHeight);
                else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
            }
        });

        it("rotates a Volume freely beyond the vertical pole without clamped OrbitControls rotation", async () => {
            render(<GpuVolumeView {...makeProps({ renderMode: "volume" })} />);
            await waitFor(() => expect(threeState.lastControls).not.toBeNull());

            // OrbitControls limits vertical rotation at the poles. We need
            // free object rotation, as in the existing MeshVolumeView.
            expect(threeState.lastControls.enableRotate).toBe(false);

            const canvas = threeState.lastRenderer.domElement as HTMLCanvasElement;
            const drag = (eventType: string, y: number) => {
                canvas.dispatchEvent(new MouseEvent(eventType, {
                    bubbles: true, button: 0, clientX: 100, clientY: y,
                }));
            };
            drag("pointerdown", 100);
            for (let y = 200; y <= 600; y += 100) drag("pointermove", y);
            drag("pointerup", 600);

            // 500 pixels x 0.0075 radians/pixel = 3.75rad (> PI).
            // A quaternion past the half-turn has a negative w component.
            expect(threeState.lastMesh.quaternion.w).toBeLessThan(0);
        });
    });

});
