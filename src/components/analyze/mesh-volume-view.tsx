import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { VolumeSurfaceMesh } from "@/services/ProjectService";
import {
    clampNormalized,
    normalizeVolumeClipBounds,
    type VolumeAxis,
    type VolumeCameraCommand,
    type VolumeClipBounds,
    type VolumeSlicePosition,
    type VolumeSliceVisibility,
} from "./volume-3d-types";

export type MeshColorMode = "solid" | "density" | "components";

export type MeshVolumeViewProps = {
    mesh: VolumeSurfaceMesh;
    opacity?: number;
    colormap?: string;
    colorMode?: MeshColorMode;
    autoRotate?: boolean;
    displayMode?: "surface" | "mesh";
    autoRotateSpeed?: number;
    resetViewKey?: number;
    cameraCommand?: VolumeCameraCommand | null;
    clipBounds?: VolumeClipBounds;
    slicePosition?: VolumeSlicePosition;
    sliceVisibility?: VolumeSliceVisibility;
    slicePlaneOpacity?: number;
    onSlicePositionChange?: (axis: VolumeAxis, position: number) => void;
    onSlicePositionChangeEnd?: () => void;
    cameraStateKey?: string | number | null;
    cameraStateRef?: MutableRefObject<MeshCameraState | null>;
    onError?: (message: string) => void;
    active?: boolean;
};

export type MeshCameraState = {
    key: string;
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
    objectQuaternion: [number, number, number, number];
};

type DragState = {
    kind: "rotate";
    pointerId: number;
    lastX: number;
    lastY: number;
};

type SlicePlaneDragState = {
    kind: "slice";
    pointerId: number;
    axis: VolumeAxis;
    startPosition: number;
    startX: number;
    startY: number;
    screenAxisX: number;
    screenAxisY: number;
    normalizedStep: number;
};

type ViewerDragState = DragState | SlicePlaneDragState;

const GTAO_BLEND_INTENSITY = 0.88;
const GTAO_RESOLUTION_SCALE = 1.0;
const GTAO_MOTION_RESOLUTION_SCALE = 0.62;

const GTAO_PARAMETERS = {
    radius: 0.12,
    distanceExponent: 1.25,
    thickness: 1.0,
    distanceFallOff: 0.8,
    scale: 1.0,
    samples: 24,
    screenSpaceRadius: false,
};

const GTAO_DENOISE_PARAMETERS = {
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 4,
    radiusExponent: 1,
    rings: 2,
    samples: 16,
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

function getMeshVolumeLocalBounds(mesh: VolumeSurfaceMesh, fallback: THREE.Box3 | null): THREE.Box3 {
    const dims = mesh.dims;
    const center = mesh.center;
    const scale = Number(mesh.scale);

    if (Array.isArray(dims) && dims.length >= 3 && Array.isArray(center) && center.length >= 3 && Number.isFinite(scale) && scale > 0) {
        const dimsXyz = mesh.order === "xyz" ? dims : [dims[2], dims[1], dims[0]];
        return new THREE.Box3(
            new THREE.Vector3((0 - center[0]) / scale, (0 - center[1]) / scale, (0 - center[2]) / scale),
            new THREE.Vector3((Math.max(1, dimsXyz[0]) - 1 - center[0]) / scale, (Math.max(1, dimsXyz[1]) - 1 - center[1]) / scale, (Math.max(1, dimsXyz[2]) - 1 - center[2]) / scale),
        );
    }

    return fallback?.clone() ?? new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
}

function normalizedBoundsToBox3(volumeBounds: THREE.Box3, bounds: VolumeClipBounds): THREE.Box3 {
    return new THREE.Box3(
        new THREE.Vector3(
            THREE.MathUtils.lerp(volumeBounds.min.x, volumeBounds.max.x, bounds.x[0]),
            THREE.MathUtils.lerp(volumeBounds.min.y, volumeBounds.max.y, bounds.y[0]),
            THREE.MathUtils.lerp(volumeBounds.min.z, volumeBounds.max.z, bounds.z[0]),
        ),
        new THREE.Vector3(
            THREE.MathUtils.lerp(volumeBounds.min.x, volumeBounds.max.x, bounds.x[1]),
            THREE.MathUtils.lerp(volumeBounds.min.y, volumeBounds.max.y, bounds.y[1]),
            THREE.MathUtils.lerp(volumeBounds.min.z, volumeBounds.max.z, bounds.z[1]),
        ),
    );
}

function configureLocalClippingPlanes(planes: THREE.Plane[], volumeBounds: THREE.Box3, bounds: VolumeClipBounds): void {
    const clipped = normalizedBoundsToBox3(volumeBounds, bounds);
    planes[0].set(new THREE.Vector3(1, 0, 0), -clipped.min.x);
    planes[1].set(new THREE.Vector3(-1, 0, 0), clipped.max.x);
    planes[2].set(new THREE.Vector3(0, 1, 0), -clipped.min.y);
    planes[3].set(new THREE.Vector3(0, -1, 0), clipped.max.y);
    planes[4].set(new THREE.Vector3(0, 0, 1), -clipped.min.z);
    planes[5].set(new THREE.Vector3(0, 0, -1), clipped.max.z);
}

function isClippingActive(bounds: VolumeClipBounds): boolean {
    return (["x", "y", "z"] as VolumeAxis[]).some(
        (axis) => bounds[axis][0] > 0.0001 || bounds[axis][1] < 0.9999,
    );
}

function createMeshSlicePlane(axis: VolumeAxis, clippingPlanes: THREE.Plane[]): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const colors: Record<VolumeAxis, number> = { x: 0xef4444, y: 0x22c55e, z: 0x3b82f6 };
    const material = new THREE.MeshBasicMaterial({
        color: colors[axis],
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
        clippingPlanes,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    plane.userData.volumeAxis = axis;
    plane.renderOrder = 4;

    if (axis === "x") plane.rotation.y = Math.PI / 2;
    if (axis === "y") plane.rotation.x = -Math.PI / 2;
    return plane;
}

function updateMeshSlicePlane(
    plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    axis: VolumeAxis,
    volumeBounds: THREE.Box3,
    normalizedPosition: number,
    visible: boolean,
    opacity: number,
): void {
    const size = volumeBounds.getSize(new THREE.Vector3());
    const center = volumeBounds.getCenter(new THREE.Vector3());
    const position = clampNormalized(normalizedPosition);

    if (axis === "x") {
        plane.scale.set(size.z, size.y, 1);
        center.x = THREE.MathUtils.lerp(volumeBounds.min.x, volumeBounds.max.x, position);
    } else if (axis === "y") {
        plane.scale.set(size.x, size.z, 1);
        center.y = THREE.MathUtils.lerp(volumeBounds.min.y, volumeBounds.max.y, position);
    } else {
        plane.scale.set(size.x, size.y, 1);
        center.z = THREE.MathUtils.lerp(volumeBounds.min.z, volumeBounds.max.z, position);
    }

    plane.position.copy(center);
    plane.visible = visible && opacity > 0.001;
    plane.material.opacity = opacity;
    plane.material.needsUpdate = true;
}

function getVectorAxis(vector: THREE.Vector3, axis: VolumeAxis): number {
    if (axis === "x") return vector.x;
    if (axis === "y") return vector.y;
    return vector.z;
}

function setVectorAxis(vector: THREE.Vector3, axis: VolumeAxis, value: number): void {
    if (axis === "x") vector.x = value;
    else if (axis === "y") vector.y = value;
    else vector.z = value;
}

function cameraPresetDirection(preset: VolumeCameraCommand["preset"]): THREE.Vector3 {
    if (preset === "front") return new THREE.Vector3(0, 0, 1);
    if (preset === "back") return new THREE.Vector3(0, 0, -1);
    if (preset === "left") return new THREE.Vector3(-1, 0, 0);
    if (preset === "right") return new THREE.Vector3(1, 0, 0);
    if (preset === "top") return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, -1, 0);
}

function cameraPresetUp(preset: VolumeCameraCommand["preset"]): THREE.Vector3 {
    if (preset === "top") return new THREE.Vector3(0, 0, -1);
    if (preset === "bottom") return new THREE.Vector3(0, 0, 1);
    return new THREE.Vector3(0, 1, 0);
}

export default function MeshVolumeView({
    mesh,
    opacity = 1,
    displayMode = "surface",
    colormap = "gray",
    colorMode = "solid",
    autoRotate = false,
    autoRotateSpeed = 3.8,
    resetViewKey = 0,
    cameraCommand = null,
    clipBounds,
    slicePosition = { x: 0.5, y: 0.5, z: 0.5 },
    sliceVisibility = { x: false, y: false, z: false },
    slicePlaneOpacity = 0.32,
    onSlicePositionChange,
    onSlicePositionChangeEnd,
    cameraStateKey = "default",
    cameraStateRef: externalCameraStateRef,
    onError,
    active = true,
}: MeshVolumeViewProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const autoRotateRef = useRef(autoRotate);
    const activeRef = useRef(active);
    const autoRotateSpeedRef = useRef(autoRotateSpeed);

    const currentCameraStateKey = useMemo(() => String(cameraStateKey ?? "default"), [cameraStateKey]);

    const internalCameraStateRef = useRef<MeshCameraState | null>(null);
    const cameraStateRef = externalCameraStateRef ?? internalCameraStateRef;
    const onErrorRef = useRef(onError);
    const materialRef = useRef<THREE.MeshLambertMaterial | null>(null);
    const geometryRef = useRef<THREE.BufferGeometry | null>(null);
    const requestRenderRef = useRef<() => void>(() => undefined);
    const resetViewRef = useRef<() => void>(() => undefined);
    const applyCameraCommandRef = useRef<(command: VolumeCameraCommand) => void>(() => undefined);
    const applyClipBoundsRef = useRef<() => void>(() => undefined);
    const applySlicePlanesRef = useRef<() => void>(() => undefined);
    const onSlicePositionChangeRef = useRef(onSlicePositionChange);
    const onSlicePositionChangeEndRef = useRef(onSlicePositionChangeEnd);
    const normalizedClipBounds = useMemo(() => normalizeVolumeClipBounds(clipBounds), [clipBounds]);
    const clipBoundsRef = useRef(normalizedClipBounds);
    const slicePositionRef = useRef(slicePosition);
    const sliceVisibilityRef = useRef(sliceVisibility);
    const slicePlaneOpacityRef = useRef(slicePlaneOpacity);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        onSlicePositionChangeRef.current = onSlicePositionChange;
        onSlicePositionChangeEndRef.current = onSlicePositionChangeEnd;
    }, [onSlicePositionChange, onSlicePositionChangeEnd]);

    useEffect(() => {
        clipBoundsRef.current = normalizedClipBounds;
        applyClipBoundsRef.current();
    }, [normalizedClipBounds]);

    useEffect(() => {
        slicePositionRef.current = slicePosition;
        sliceVisibilityRef.current = sliceVisibility;
        slicePlaneOpacityRef.current = slicePlaneOpacity;
        applySlicePlanesRef.current();
    }, [slicePosition, sliceVisibility, slicePlaneOpacity]);

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
        requestRenderRef.current();
    }, [colorMode, colormap, mesh]);

    useEffect(() => {
        const material = materialRef.current;
        if (!material) return;

        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.wireframe = displayMode === "mesh";
        material.needsUpdate = true;
        requestRenderRef.current();
    }, [opacity, displayMode]);

    useEffect(() => {
        autoRotateRef.current = autoRotate;
        requestRenderRef.current();
    }, [autoRotate]);

    useEffect(() => {
        autoRotateSpeedRef.current = autoRotateSpeed;
    }, [autoRotateSpeed]);

    useEffect(() => {
        activeRef.current = active;
        if (active) requestRenderRef.current();
    }, [active]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        if (!mesh?.vertices?.length || !mesh?.indices?.length) {
            onErrorRef.current?.("Surface mesh is empty.");
            return;
        }

        let renderer: THREE.WebGLRenderer | null = null;
        let composer: EffectComposer | null = null;
        let gtaoPass: GTAOPass | null = null;
        let outputPass: OutputPass | null = null;
        let frameId: number | null = null;
        let dragState: ViewerDragState | null = null;

        try {
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0xe7ecf3);

            const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
            camera.position.set(0.9, -1.45, 0.9);

            const OrientationAxes = (THREE as any).AxesHelper as typeof THREE.AxesHelper | undefined;
            const orientationAxes = OrientationAxes ? new OrientationAxes(0.18) : null;

            if (orientationAxes) {
                const axesMaterial = orientationAxes.material as THREE.LineBasicMaterial;
                axesMaterial.depthTest = false;
                axesMaterial.depthWrite = false;
                axesMaterial.transparent = true;
                axesMaterial.opacity = 0.95;
                axesMaterial.toneMapped = false;
                orientationAxes.renderOrder = 1000;
                camera.add(orientationAxes);
                scene.add(camera);
            }

            renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
            });
            renderer.setClearColor(0xe7ecf3, 1);

            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.NoToneMapping;
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

            geometry.computeVertexNormals();
            geometry.normalizeNormals();
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();

            const usesVertexColors = applyMeshVertexColors(
                geometry,
                mesh,
                colorMode,
                colormap,
            );

            geometryRef.current = geometry;

            const material = new THREE.MeshLambertMaterial({
                color: usesVertexColors
                    ? new THREE.Color(1, 1, 1)
                    : colorFromColormap(colormap),
                vertexColors: usesVertexColors,
                flatShading: false,
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

            const volumeBounds = getMeshVolumeLocalBounds(mesh, geometry.boundingBox);
            const localClipPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
            const worldClipPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
            material.clippingPlanes = worldClipPlanes;
            renderer.localClippingEnabled = true;

            const slicePlanes = {
                x: createMeshSlicePlane("x", worldClipPlanes),
                y: createMeshSlicePlane("y", worldClipPlanes),
                z: createMeshSlicePlane("z", worldClipPlanes),
            };
            surfacePivot.add(slicePlanes.x, slicePlanes.y, slicePlanes.z);

            const updateClipBounds = () => {
                const bounds = clipBoundsRef.current;
                configureLocalClippingPlanes(localClipPlanes, volumeBounds, bounds);
                surfacePivot.updateMatrixWorld(true);
                localClipPlanes.forEach((plane, index) => {
                    worldClipPlanes[index].copy(plane).applyMatrix4(surfacePivot.matrixWorld);
                });

                if (gtaoPass) {
                    gtaoPass.enabled = !isClippingActive(bounds);
                }

                requestRenderRef.current();
            };

            const updateSlicePlanes = () => {
                const position = slicePositionRef.current;
                const visibility = sliceVisibilityRef.current;
                const planeOpacity = Math.max(0, Math.min(1, slicePlaneOpacityRef.current));
                updateMeshSlicePlane(slicePlanes.x, "x", volumeBounds, position.x, visibility.x, planeOpacity);
                updateMeshSlicePlane(slicePlanes.y, "y", volumeBounds, position.y, visibility.y, planeOpacity);
                updateMeshSlicePlane(slicePlanes.z, "z", volumeBounds, position.z, visibility.z, planeOpacity);
                requestRenderRef.current();
            };

            applyClipBoundsRef.current = updateClipBounds;
            applySlicePlanesRef.current = updateSlicePlanes;
            updateClipBounds();
            updateSlicePlanes();

            const saveCameraState = () => {
                cameraStateRef.current = {
                    key: currentCameraStateKey,
                    position: toNumberTuple(camera.position.toArray()),
                    target: toNumberTuple(controls.target.toArray()),
                    zoom: camera.zoom,
                    objectQuaternion: toQuaternionTuple(surfacePivot.quaternion.toArray()),
                };
            };

            const ambient = new THREE.AmbientLight(0xffffff, 0.10);
            scene.add(ambient);

            const key = new THREE.DirectionalLight(0xffffff, 1.45);
            key.position.set(1.6, -2.2, 2.0);
            scene.add(key);

            const fill = new THREE.DirectionalLight(0xffffff, 0.22);
            fill.position.set(-1.5, -0.8, 0.8);
            scene.add(fill);

            const rim = new THREE.DirectionalLight(0xffffff, 0.28);
            rim.position.set(-0.6, 1.5, -1.4);
            scene.add(rim);

            composer = new EffectComposer(renderer);

            const renderPass = new RenderPass(scene, camera);
            renderPass.clearAlpha = 0;
            composer.addPass(renderPass);

            gtaoPass = new GTAOPass(scene, camera, 1, 1);
            gtaoPass.blendIntensity = GTAO_BLEND_INTENSITY;
            gtaoPass.updateGtaoMaterial(GTAO_PARAMETERS);
            gtaoPass.updatePdMaterial(GTAO_DENOISE_PARAMETERS);
            gtaoPass.enabled = !isClippingActive(clipBoundsRef.current);
            composer.addPass(gtaoPass);

            outputPass = new OutputPass();
            composer.addPass(outputPass);

            const clock = new THREE.Clock();
            const baseDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
            let controlsInteracting = false;
            let appliedDpr = -1;
            let appliedGtaoScale = -1;

            const updateOrientationAxes = () => {
                if (!orientationAxes) return;

                const distance = 2.0;
                const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
                const halfWidth = halfHeight * camera.aspect;
                const margin = Math.min(halfWidth, halfHeight) * 0.28;

                orientationAxes.position.set(halfWidth - margin, -halfHeight + margin, -distance);
                orientationAxes.quaternion
                    .copy(camera.quaternion)
                    .invert()
                    .multiply(surfacePivot.quaternion);
            };

            const applyRenderQuality = (force = false) => {
                if (!renderer || !composer || !gtaoPass) return;

                const width = Math.max(1, host.clientWidth);
                const height = Math.max(1, host.clientHeight);
                const moving = autoRotateRef.current || controlsInteracting || dragState != null;
                const desiredDpr = moving ? Math.min(baseDpr, 1) : baseDpr;
                const gtaoScale = moving ? GTAO_MOTION_RESOLUTION_SCALE : GTAO_RESOLUTION_SCALE;

                if (!force && desiredDpr === appliedDpr && gtaoScale === appliedGtaoScale) return;

                appliedDpr = desiredDpr;
                appliedGtaoScale = gtaoScale;
                renderer.setPixelRatio(desiredDpr);
                renderer.setSize(width, height, false);
                composer.setPixelRatio(desiredDpr);
                composer.setSize(width, height);
                gtaoPass.setSize(Math.max(1, Math.floor(width * gtaoScale)), Math.max(1, Math.floor(height * gtaoScale)));
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                updateOrientationAxes();
            };

            const renderFrame = () => {
                frameId = null;
                if (!activeRef.current || document.visibilityState === "hidden") return;

                const dt = Math.min(clock.getDelta(), 0.1);
                applyRenderQuality();

                if (autoRotateRef.current) {
                    surfacePivot.rotation.z += dt * (autoRotateSpeedRef.current / 10);
                    saveCameraState();
                }

                const controlsChanged = controls.update();
                surfacePivot.updateMatrixWorld(true);
                localClipPlanes.forEach((plane, index) => {
                    worldClipPlanes[index].copy(plane).applyMatrix4(surfacePivot.matrixWorld);
                });
                updateOrientationAxes();
                composer?.render(dt);

                if (autoRotateRef.current || controlsChanged) requestRender();
            };

            const requestRender = () => {
                if (frameId != null || !activeRef.current || document.visibilityState === "hidden") return;
                frameId = window.requestAnimationFrame(renderFrame);
            };

            requestRenderRef.current = requestRender;

            const handleControlsChange = () => {
                saveCameraState();
                requestRender();
            };

            const handleControlsStart = () => {
                controlsInteracting = true;
                requestRender();
            };

            const handleControlsEnd = () => {
                controlsInteracting = false;
                requestRender();
            };

            const handleVisibilityChange = () => {
                if (document.visibilityState !== "hidden") requestRender();
            };

            controls.addEventListener("change", handleControlsChange);
            controls.addEventListener("start", handleControlsStart);
            controls.addEventListener("end", handleControlsEnd);
            document.addEventListener("visibilitychange", handleVisibilityChange);

            const resize = () => {
                applyRenderQuality(true);
                requestRender();
            };

            const observer = new ResizeObserver(resize);
            observer.observe(host);
            resize();

            const sphere = geometry.boundingSphere;
            const radius = Math.max(0.5, sphere?.radius ?? 0.5);
            camera.near = Math.max(0.001, radius / 100);
            camera.far = Math.max(100, radius * 100);

            const resetView = () => {
                camera.position.set(radius * 1.15, -radius * 2.0, radius * 1.15);
                camera.up.set(0, 1, 0);
                camera.zoom = 1;
                controls.target.copy(sphere?.center ?? new THREE.Vector3(0, 0, 0));
                surfacePivot.quaternion.identity();
                camera.updateProjectionMatrix();
                controls.update();
                saveCameraState();
                requestRender();
            };

            resetViewRef.current = resetView;

            const applyCameraCommand = (command: VolumeCameraCommand) => {
                const target = sphere?.center ?? new THREE.Vector3(0, 0, 0);
                const currentDistance = camera.position.distanceTo(controls.target);
                const distance = Number.isFinite(currentDistance) && currentDistance > 0.1 ? currentDistance : radius * 2.5;

                surfacePivot.quaternion.identity();
                controls.target.copy(target);
                camera.up.copy(cameraPresetUp(command.preset));
                camera.position.copy(target).addScaledVector(cameraPresetDirection(command.preset), distance);
                camera.updateProjectionMatrix();
                controls.update();
                updateClipBounds();
                saveCameraState();
                requestRender();
            };

            applyCameraCommandRef.current = applyCameraCommand;

            const savedCameraState = cameraStateRef.current;
            if (savedCameraState?.key === currentCameraStateKey) {
                camera.position.fromArray(savedCameraState.position);
                camera.zoom = savedCameraState.zoom;
                controls.target.fromArray(savedCameraState.target);
                surfacePivot.quaternion.fromArray(savedCameraState.objectQuaternion);
            } else {
                camera.position.set(radius * 1.15, -radius * 2.0, radius * 1.15);
                camera.up.set(0, 1, 0);
                controls.target.copy(sphere?.center ?? new THREE.Vector3(0, 0, 0));
                surfacePivot.quaternion.identity();
            }

            camera.updateProjectionMatrix();
            controls.update();
            saveCameraState();
            requestRender();

            const stopViewerEvent = (event: Event) => {
                event.stopPropagation();

                if (event.type === "contextmenu") {
                    event.preventDefault();
                }
            };

            const pickSlicePlane = (event: PointerEvent): VolumeAxis | null => {
                const rect = host.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return null;

                const pointer = new THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1,
                );
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(pointer, camera);
                const intersections = raycaster.intersectObjects([slicePlanes.x, slicePlanes.y, slicePlanes.z], false);
                return (intersections[0]?.object.userData.volumeAxis as VolumeAxis | undefined) ?? null;
            };

            const createSlicePlaneDrag = (event: PointerEvent, sliceAxis: VolumeAxis): SlicePlaneDragState => {
                const rect = host.getBoundingClientRect();
                const center = volumeBounds.getCenter(new THREE.Vector3());
                const axisMin = getVectorAxis(volumeBounds.min, sliceAxis);
                const axisMax = getVectorAxis(volumeBounds.max, sliceAxis);
                const startPosition = clampNormalized(slicePositionRef.current[sliceAxis]);
                setVectorAxis(center, sliceAxis, THREE.MathUtils.lerp(axisMin, axisMax, startPosition));

                const normalizedStep = 0.2;
                const shifted = center.clone();
                setVectorAxis(shifted, sliceAxis, getVectorAxis(shifted, sliceAxis) + (axisMax - axisMin) * normalizedStep);
                surfacePivot.updateMatrixWorld(true);

                const projectedStart = surfacePivot.localToWorld(center.clone()).project(camera);
                const projectedEnd = surfacePivot.localToWorld(shifted).project(camera);
                let screenAxisX = (projectedEnd.x - projectedStart.x) * rect.width * 0.5;
                let screenAxisY = -(projectedEnd.y - projectedStart.y) * rect.height * 0.5;

                if (screenAxisX * screenAxisX + screenAxisY * screenAxisY < 64) {
                    screenAxisX = 0;
                    screenAxisY = -Math.max(100, Math.min(rect.width, rect.height) * 0.35);
                }

                return {
                    kind: "slice",
                    pointerId: event.pointerId,
                    axis: sliceAxis,
                    startPosition,
                    startX: event.clientX,
                    startY: event.clientY,
                    screenAxisX,
                    screenAxisY,
                    normalizedStep,
                };
            };

            const handlePointerDown = (event: PointerEvent) => {
                stopViewerEvent(event);

                if (event.button !== 0) return;

                event.preventDefault();

                if (event.shiftKey && onSlicePositionChangeRef.current) {
                    const selectedAxis = pickSlicePlane(event);
                    if (selectedAxis) {
                        dragState = createSlicePlaneDrag(event, selectedAxis);
                        host.style.cursor = "ns-resize";
                        host.setPointerCapture?.(event.pointerId);
                        requestRender();
                        return;
                    }
                }

                dragState = {
                    kind: "rotate",
                    pointerId: event.pointerId,
                    lastX: event.clientX,
                    lastY: event.clientY,
                };
                host.style.cursor = "grabbing";
                host.setPointerCapture?.(event.pointerId);
                requestRender();
            };

            const handlePointerMove = (event: PointerEvent) => {
                stopViewerEvent(event);

                if (!dragState || dragState.pointerId !== event.pointerId) return;

                event.preventDefault();

                if (dragState.kind === "slice") {
                    const denominator = dragState.screenAxisX ** 2 + dragState.screenAxisY ** 2;
                    if (denominator <= 1e-6) return;

                    const deltaX = event.clientX - dragState.startX;
                    const deltaY = event.clientY - dragState.startY;
                    const projectedDelta = (deltaX * dragState.screenAxisX + deltaY * dragState.screenAxisY) / denominator;
                    const nextPosition = clampNormalized(dragState.startPosition + projectedDelta * dragState.normalizedStep);
                    onSlicePositionChangeRef.current?.(dragState.axis, nextPosition);
                    requestRender();
                    return;
                }

                const dx = event.clientX - dragState.lastX;
                const dy = event.clientY - dragState.lastY;
                dragState.lastX = event.clientX;
                dragState.lastY = event.clientY;

                rotateObjectInScreenSpace(surfacePivot, camera, dx, dy);
                saveCameraState();
                requestRender();
            };

            const endDrag = (event: PointerEvent) => {
                stopViewerEvent(event);

                if (!dragState || dragState.pointerId !== event.pointerId) return;

                event.preventDefault();
                const completedSliceDrag = dragState.kind === "slice";
                dragState = null;
                host.style.cursor = "grab";
                host.releasePointerCapture?.(event.pointerId);
                if (completedSliceDrag) onSlicePositionChangeEndRef.current?.();
                saveCameraState();
                requestRender();
            };

            const viewerEvents = ["wheel", "contextmenu"] as const;

            const handleDoubleClick = (event: MouseEvent) => {
                stopViewerEvent(event);
                event.preventDefault();
                resetView();
            };

            viewerEvents.forEach((eventName) => {
                host.addEventListener(eventName, stopViewerEvent, { passive: false });
            });
            host.addEventListener("dblclick", handleDoubleClick);
            host.addEventListener("pointerdown", handlePointerDown, { passive: false });
            host.addEventListener("pointermove", handlePointerMove, { passive: false });
            host.addEventListener("pointerup", endDrag, { passive: false });
            host.addEventListener("pointercancel", endDrag, { passive: false });

            return () => {
                saveCameraState();
                if (frameId != null) window.cancelAnimationFrame(frameId);
                observer.disconnect();

                controls.removeEventListener("change", handleControlsChange);
                controls.removeEventListener("start", handleControlsStart);
                controls.removeEventListener("end", handleControlsEnd);
                document.removeEventListener("visibilitychange", handleVisibilityChange);

                viewerEvents.forEach((eventName) => {
                    host.removeEventListener(eventName, stopViewerEvent);
                });
                host.removeEventListener("dblclick", handleDoubleClick);
                host.removeEventListener("pointerdown", handlePointerDown);
                host.removeEventListener("pointermove", handlePointerMove);
                host.removeEventListener("pointerup", endDrag);
                host.removeEventListener("pointercancel", endDrag);

                host.style.cursor = "";
                host.style.touchAction = "";

                controls.dispose();

                gtaoPass?.dispose();
                outputPass?.dispose();
                composer?.dispose();

                disposeObject3d(scene);
                renderer?.dispose();

                if (renderer?.domElement.parentElement === host) {
                    host.removeChild(renderer.domElement);
                }
                materialRef.current = null;
                geometryRef.current = null;
                requestRenderRef.current = () => undefined;
                resetViewRef.current = () => undefined;
                applyCameraCommandRef.current = () => undefined;
                applyClipBoundsRef.current = () => undefined;
                applySlicePlanesRef.current = () => undefined;
            };
        } catch (error: any) {
            gtaoPass?.dispose();
            outputPass?.dispose();
            composer?.dispose();
            renderer?.dispose();
            requestRenderRef.current = () => undefined;
            applyCameraCommandRef.current = () => undefined;
            applyClipBoundsRef.current = () => undefined;
            applySlicePlanesRef.current = () => undefined;

            onErrorRef.current?.(
                error?.message || "Failed to render surface mesh.",
            );
        }

    }, [mesh, currentCameraStateKey]);

    useEffect(() => {
        if (resetViewKey > 0) resetViewRef.current();
    }, [resetViewKey]);

    useEffect(() => {
        if (cameraCommand) applyCameraCommandRef.current(cameraCommand);
    }, [cameraCommand]);

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
