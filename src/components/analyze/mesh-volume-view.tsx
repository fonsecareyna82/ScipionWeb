import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { VolumeSurfaceMesh } from "@/services/ProjectService";

export type MeshColorMode = "solid" | "density" | "components";

export type MeshVolumeViewProps = {
    mesh: VolumeSurfaceMesh;
    opacity?: number;
    colormap?: string;
    colorMode?: MeshColorMode;
    autoRotate?: boolean;
    displayMode?: "surface" | "mesh";
    autoRotateSpeed?: number;
    cameraStateKey?: string | number | null;
    onError?: (message: string) => void;
    active?: boolean;
};

type MeshCameraState = {
    key: string;
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
    objectQuaternion: [number, number, number, number];
};

type DragState = {
    pointerId: number;
    lastX: number;
    lastY: number;
};

function colorFromColormap(colormap?: string): THREE.Color {
    switch ((colormap || "").toLowerCase()) {
        case "gray":
        case "grey":
            return new THREE.Color(0.82, 0.82, 0.82);
        case "magma":
            return new THREE.Color(0.86, 0.34, 0.20);
        case "plasma":
            return new THREE.Color(0.84, 0.36, 0.62);
        case "inferno":
            return new THREE.Color(0.95, 0.46, 0.18);
        case "cividis":
            return new THREE.Color(0.78, 0.70, 0.36);
        case "turbo":
            return new THREE.Color(0.26, 0.62, 0.92);
        case "viridis":
        default:
            return new THREE.Color(0.32, 0.72, 0.58);
    }
}

const COLORMAP_STOPS: Record<string, number[]> = {
    gray: [0x111111, 0xf3f4f6],
    grey: [0x111111, 0xf3f4f6],
    viridis: [0x440154, 0x31688e, 0x35b779, 0xfde725],
    magma: [0x000004, 0x721f81, 0xf1605d, 0xfcfdbf],
    plasma: [0x0d0887, 0x9c179e, 0xed7953, 0xf0f921],
    inferno: [0x000004, 0x57106e, 0xbc3754, 0xfcffa4],
    cividis: [0x00224e, 0x575d6d, 0xa59c74, 0xfee838],
    turbo: [0x30123b, 0x28bbec, 0xa4fc3c, 0xf9a31b, 0x7a0403],
};

function buildDensityVertexColors(
    mesh: VolumeSurfaceMesh,
    colormap: string,
): Float32Array | null {
    const vertexCount = Math.floor(mesh.vertices.length / 3);
    const values = mesh.values;

    if (!values || values.length < vertexCount || vertexCount === 0) {
        return null;
    }

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return null;
    }

    const stops =
        COLORMAP_STOPS[colormap.toLowerCase()] ??
        COLORMAP_STOPS.viridis;

    const colors = new Float32Array(vertexCount * 3);
    const colorA = new THREE.Color();
    const colorB = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
        const raw = values[i];
        const normalized = Number.isFinite(raw)
            ? Math.max(0, Math.min(1, (raw - min) / (max - min)))
            : 0;

        const position = normalized * (stops.length - 1);
        const lower = Math.floor(position);
        const upper = Math.min(stops.length - 1, lower + 1);
        const mix = position - lower;

        colorA.setHex(stops[lower]);
        colorB.setHex(stops[upper]);
        colorA.lerp(colorB, mix);

        const offset = i * 3;
        colors[offset] = colorA.r;
        colors[offset + 1] = colorA.g;
        colors[offset + 2] = colorA.b;
    }

    return colors;
}

function buildComponentVertexColors(
    mesh: VolumeSurfaceMesh,
): Float32Array | null {
    const vertexCount = Math.floor(mesh.vertices.length / 3);
    const indices = mesh.indices;

    if (!vertexCount || !indices?.length) {
        return null;
    }

    const parent = new Int32Array(vertexCount);
    const rank = new Uint8Array(vertexCount);
    parent.fill(-1);

    const ensureVertex = (index: number) => {
        if (parent[index] === -1) {
            parent[index] = index;
        }
    };

    const findRoot = (index: number) => {
        let root = index;

        while (parent[root] !== root) {
            root = parent[root];
        }

        while (parent[index] !== index) {
            const next = parent[index];
            parent[index] = root;
            index = next;
        }

        return root;
    };

    const unionVertices = (a: number, b: number) => {
        if (
            a < 0 ||
            b < 0 ||
            a >= vertexCount ||
            b >= vertexCount
        ) {
            return;
        }

        ensureVertex(a);
        ensureVertex(b);

        let rootA = findRoot(a);
        let rootB = findRoot(b);

        if (rootA === rootB) return;

        if (rank[rootA] < rank[rootB]) {
            [rootA, rootB] = [rootB, rootA];
        }

        parent[rootB] = rootA;

        if (rank[rootA] === rank[rootB]) {
            rank[rootA]++;
        }
    };

    for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];

        unionVertices(a, b);
        unionVertices(b, c);
        unionVertices(c, a);
    }

    const componentSizes = new Map<number, number>();

    for (let i = 0; i < vertexCount; i++) {
        if (parent[i] === -1) continue;

        const root = findRoot(i);
        parent[i] = root;
        componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
    }

    const componentOrder = new Map(
        [...componentSizes.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([root], index) => [root, index]),
    );

    const colors = new Float32Array(vertexCount * 3);
    const color = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
        const offset = i * 3;

        if (parent[i] === -1) {
            colors[offset] = 0.5;
            colors[offset + 1] = 0.5;
            colors[offset + 2] = 0.5;
            continue;
        }

        const component = componentOrder.get(parent[i]) ?? 0;
        const hue = (component * 0.61803398875 + 0.03) % 1;

        color.setHSL(hue, 0.78, 0.56);

        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
    }

    return colors;
}

function applyMeshVertexColors(
    geometry: THREE.BufferGeometry,
    mesh: VolumeSurfaceMesh,
    colorMode: MeshColorMode,
    colormap: string,
): boolean {
    const colors =
        colorMode === "density"
            ? buildDensityVertexColors(mesh, colormap)
            : colorMode === "components"
                ? buildComponentVertexColors(mesh)
                : null;

    if (!colors) {
        geometry.deleteAttribute("color");
        return false;
    }

    geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(colors, 3),
    );

    return true;
}

function disposeObject3d(root: THREE.Object3D): void {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        const material = mesh.material;
        if (Array.isArray(material)) {
            material.forEach((m) => m.dispose());
        } else if (material) {
            material.dispose();
        }
    });
}

function toNumberTuple(values: number[]): [number, number, number] {
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

function toQuaternionTuple(values: number[]): [number, number, number, number] {
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}

function rotateObjectInScreenSpace(
    object: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    dx: number,
    dy: number,
) {
    const dragScale = 0.0075;
    const cameraDirection = new THREE.Vector3();
    const screenRight = new THREE.Vector3();
    const screenUp = new THREE.Vector3();
    const horizontalRotation = new THREE.Quaternion();
    const verticalRotation = new THREE.Quaternion();
    const dragRotation = new THREE.Quaternion();

    camera.getWorldDirection(cameraDirection).normalize();
    screenRight.crossVectors(cameraDirection, camera.up).normalize();
    screenUp.copy(camera.up).normalize();

    horizontalRotation.setFromAxisAngle(screenUp, dx * dragScale);
    verticalRotation.setFromAxisAngle(screenRight, dy * dragScale);
    dragRotation.multiplyQuaternions(horizontalRotation, verticalRotation);

    object.quaternion.premultiply(dragRotation);
}

export default function MeshVolumeView({
    mesh,
    opacity = 1,
    displayMode = "surface",
    colormap = "gray",
    colorMode = "solid",
    autoRotate = false,
    autoRotateSpeed = 3.8,
    cameraStateKey = "default",
    onError,
    active = true,
}: MeshVolumeViewProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const autoRotateRef = useRef(autoRotate);
    const activeRef = useRef(active);
    const autoRotateSpeedRef = useRef(autoRotateSpeed);

    const currentCameraStateKey = useMemo(() => String(cameraStateKey ?? "default"), [cameraStateKey]);

    const cameraStateRef = useRef<MeshCameraState | null>(null);
    const onErrorRef = useRef(onError);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const geometryRef = useRef<THREE.BufferGeometry | null>(null);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        const geometry = geometryRef.current;
        const material = materialRef.current;

        if (!geometry || !material) return;

        const usesVertexColors = applyMeshVertexColors(
            geometry,
            mesh,
            colorMode,
            colormap,
        );

        material.vertexColors = usesVertexColors;

        if (usesVertexColors) {
            material.color.setRGB(1, 1, 1);
        } else {
            material.color.copy(colorFromColormap(colormap));
        }

        material.needsUpdate = true;
    }, [colorMode, colormap, mesh]);

    useEffect(() => {
        const material = materialRef.current;
        if (!material) return;

        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.wireframe = displayMode === "mesh";
        material.needsUpdate = true;
    }, [opacity, displayMode]);

    useEffect(() => {
        autoRotateRef.current = autoRotate;
    }, [autoRotate]);

    useEffect(() => {
        autoRotateSpeedRef.current = autoRotateSpeed;
    }, [autoRotateSpeed]);

    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        if (!mesh?.vertices?.length || !mesh?.indices?.length) {
            onErrorRef.current?.("Surface mesh is empty.");
            return;
        }

        let renderer: THREE.WebGLRenderer | null = null;
        let frameId = 0;
        let dragState: DragState | null = null;

        try {
            const scene = new THREE.Scene();
            scene.background = null;

            const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
            camera.position.set(0.9, -1.45, 0.9);

            renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
            });
            renderer.setClearColor(0x000000, 0);

            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.05;
            host.innerHTML = "";
            host.style.cursor = "grab";
            host.style.touchAction = "none";

            renderer.domElement.style.width = "100%";
            renderer.domElement.style.height = "100%";
            renderer.domElement.style.display = "block";
            renderer.domElement.style.outline = "none";
            renderer.domElement.style.touchAction = "none";

            host.appendChild(renderer.domElement);

            const controls = new OrbitControls(camera, host);
            controls.enabled = true;
            controls.enableRotate = false;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.zoomSpeed = 0.85;
            controls.panSpeed = 0.55;

            controls.mouseButtons = {
                LEFT: null as any,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
            };

            controls.touches = {
                ONE: null as any,
                TWO: THREE.TOUCH.DOLLY_PAN,
            };
            controls.target.set(0, 0, 0);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(mesh.vertices), 3),
            );

            if (mesh.normals?.length === mesh.vertices.length) {
                geometry.setAttribute(
                    "normal",
                    new THREE.BufferAttribute(new Float32Array(mesh.normals), 3),
                );
            }

            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));

            if (!mesh.normals?.length) {
                geometry.computeVertexNormals();
            }

            geometry.computeBoundingSphere();

            const usesVertexColors = applyMeshVertexColors(
                geometry,
                mesh,
                colorMode,
                colormap,
            );

            geometryRef.current = geometry;

            const material = new THREE.MeshStandardMaterial({
                color: usesVertexColors
                    ? new THREE.Color(1, 1, 1)
                    : colorFromColormap(colormap),
                vertexColors: usesVertexColors,
                roughness: 0.58,
                metalness: 0.0,
                transparent: opacity < 1,
                opacity,
                wireframe: displayMode === "mesh",
                side: THREE.DoubleSide,
            });

            materialRef.current = material;

            const surface = new THREE.Mesh(geometry, material);
            const surfacePivot = new THREE.Group();
            surfacePivot.add(surface);
            scene.add(surfacePivot);

            const saveCameraState = () => {
                cameraStateRef.current = {
                    key: currentCameraStateKey,
                    position: toNumberTuple(camera.position.toArray()),
                    target: toNumberTuple(controls.target.toArray()),
                    zoom: camera.zoom,
                    objectQuaternion: toQuaternionTuple(surfacePivot.quaternion.toArray()),
                };
            };

            controls.addEventListener("change", saveCameraState);

            const ambient = new THREE.AmbientLight(0xffffff, 0.22);
            scene.add(ambient);

            const key = new THREE.DirectionalLight(0xffffff, 1.55);
            key.position.set(1.5, -2.0, 2.0);
            scene.add(key);

            const fill = new THREE.DirectionalLight(0xffffff, 0.35);
            fill.position.set(-1.5, -0.5, 0.8);
            scene.add(fill);

            const rim = new THREE.DirectionalLight(0xffffff, 0.55);
            rim.position.set(-0.5, 1.5, -1.5);
            scene.add(rim);

            const resize = () => {
                const width = Math.max(1, host.clientWidth);
                const height = Math.max(1, host.clientHeight);

                renderer?.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            };

            const observer = new ResizeObserver(resize);
            observer.observe(host);
            resize();

            const sphere = geometry.boundingSphere;
            const radius = Math.max(0.5, sphere?.radius ?? 0.5);
            camera.near = Math.max(0.001, radius / 100);
            camera.far = Math.max(100, radius * 100);

            const savedCameraState = cameraStateRef.current;
            if (savedCameraState?.key === currentCameraStateKey) {
                camera.position.fromArray(savedCameraState.position);
                camera.zoom = savedCameraState.zoom;
                controls.target.fromArray(savedCameraState.target);
                surfacePivot.quaternion.fromArray(savedCameraState.objectQuaternion);
            } else {
                camera.position.set(radius * 1.15, -radius * 2.0, radius * 1.15);
                controls.target.copy(sphere?.center ?? new THREE.Vector3(0, 0, 0));
                surfacePivot.quaternion.identity();
            }

            camera.updateProjectionMatrix();
            controls.update();
            saveCameraState();

            const stopViewerEvent = (event: Event) => {
                event.stopPropagation();

                if (event.type === "contextmenu") {
                    event.preventDefault();
                }
            };

            const handlePointerDown = (event: PointerEvent) => {
                stopViewerEvent(event);

                if (event.button !== 0) return;

                event.preventDefault();
                dragState = {
                    pointerId: event.pointerId,
                    lastX: event.clientX,
                    lastY: event.clientY,
                };
                host.style.cursor = "grabbing";
                host.setPointerCapture?.(event.pointerId);
            };

            const handlePointerMove = (event: PointerEvent) => {
                stopViewerEvent(event);

                if (!dragState || dragState.pointerId !== event.pointerId) return;

                event.preventDefault();
                const dx = event.clientX - dragState.lastX;
                const dy = event.clientY - dragState.lastY;
                dragState.lastX = event.clientX;
                dragState.lastY = event.clientY;

                rotateObjectInScreenSpace(surfacePivot, camera, dx, dy);
                saveCameraState();
            };

            const endDrag = (event: PointerEvent) => {
                stopViewerEvent(event);

                if (!dragState || dragState.pointerId !== event.pointerId) return;

                event.preventDefault();
                dragState = null;
                host.style.cursor = "grab";
                host.releasePointerCapture?.(event.pointerId);
                saveCameraState();
            };

            const viewerEvents = ["wheel", "contextmenu"] as const;

            viewerEvents.forEach((eventName) => {
                host.addEventListener(eventName, stopViewerEvent, { passive: false });
            });
            host.addEventListener("pointerdown", handlePointerDown, { passive: false });
            host.addEventListener("pointermove", handlePointerMove, { passive: false });
            host.addEventListener("pointerup", endDrag, { passive: false });
            host.addEventListener("pointercancel", endDrag, { passive: false });

            const clock = new THREE.Clock();

            const animate = () => {
                frameId = window.requestAnimationFrame(animate);
                const dt = clock.getDelta();

                if (!activeRef.current) return;

                if (autoRotateRef.current) {
                    surfacePivot.rotation.z += dt * (autoRotateSpeedRef.current / 10);
                }

                controls.update();
                renderer?.render(scene, camera);
            };

            animate();

            return () => {
                saveCameraState();
                window.cancelAnimationFrame(frameId);
                observer.disconnect();

                controls.removeEventListener("change", saveCameraState);

                viewerEvents.forEach((eventName) => {
                    host.removeEventListener(eventName, stopViewerEvent);
                });
                host.removeEventListener("pointerdown", handlePointerDown);
                host.removeEventListener("pointermove", handlePointerMove);
                host.removeEventListener("pointerup", endDrag);
                host.removeEventListener("pointercancel", endDrag);

                host.style.cursor = "";
                host.style.touchAction = "";

                controls.dispose();
                disposeObject3d(scene);
                renderer?.dispose();

                if (renderer?.domElement.parentElement === host) {
                    host.removeChild(renderer.domElement);
                }
                materialRef.current = null;
                geometryRef.current = null;
            };
        } catch (error: any) {
            renderer?.dispose();
            onErrorRef.current?.(error?.message || "Failed to render surface mesh.");
        }

    }, [mesh, currentCameraStateKey]);

    return (
        <div
            ref={hostRef}
            style={{
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
            }}
        />
    );
}
