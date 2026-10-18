import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { setClippingSliceImage, updateClippingSliceUvs } from "./mesh-clipping-slices";
import type { ClippingSliceImages } from "./use-clipping-slice-images";
import type { VolumeSurfaceMesh } from "@/services/ProjectService";
import {
    clampNormalized,
    normalizeVolumeClipBounds,
    type VolumeAxis,
    type VolumeCameraCommand,
    type VolumeClipBounds,
    type VolumeSliceVisibility,
} from "./volume-3d-types";
import {
    createVolumeOrientationGizmo,
    type VolumeOrientationGizmo,
} from "./volume-orientation-gizmo";
import {
    DEFAULT_MESH_RENDER_STYLE,
    MESH_BACKGROUNDS,
    MESH_LIGHTING_PRESETS,
    MESH_LIGHT_POSITIONS,
    MeshOutlinePass,
    backgroundFogColor,
    buildGeometricVertexColors,
    colormapCssGradient,
    colormapStops,
    createBackgroundTexture,
    fitMeshInView,
    sampleColormap,
    type MeshRenderStyle,
} from "./mesh-render-style";
import { createClippingCaps } from "./mesh-clipping-caps";
import { canvasToPng, exportScale, type VolumeImageCapture } from "./volume-image-export";

// A surface computed in the browser (the live threshold, the inner level).
export type MeshSurfaceArrays = {
    vertices: ArrayLike<number>;
    normals?: ArrayLike<number>;
    indices: ArrayLike<number>;
};

export type MeshColorMode = "solid" | "density" | "components" | "radial" | "height";

// Length of one mesh unit (the API scales the mesh to a unit size) for the legend.
export type MeshLengthScale = {
    unitLength: number | null;
    unit: string;
};

type MeshColorLegend = {
    label: string;
    min: number;
    max: number;
    gradient: string;
};

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
    sliceImages?: ClippingSliceImages;
    sliceVisibility?: VolumeSliceVisibility;
    slicePlaneOpacity?: number;
    cameraStateKey?: string | number | null;
    cameraStateRef?: MutableRefObject<MeshCameraState | null>;
    onError?: (message: string) => void;
    active?: boolean;
    renderStyle?: MeshRenderStyle;
    lengthScale?: MeshLengthScale;
    // Shown instead of mesh while the threshold moves, in the same frame.
    previewMesh?: MeshSurfaceArrays | null;
    // A second, opaque surface at a higher level, inside a transparent mesh.
    innerMesh?: MeshSurfaceArrays | null;
    innerColor?: string;
    // Set by the view: saves the current view as a PNG.
    captureRef?: MutableRefObject<VolumeImageCapture | null>;
};

export type MeshCameraState = {
    key: string;
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
    objectQuaternion: [number, number, number, number];
    // Visible half height of the orthographic camera at zoom 1.
    orthoHalfHeight?: number;
};

type DragState = {
    kind: "rotate";
    pointerId: number;
    lastX: number;
    lastY: number;
};

const CAMERA_FOV = 35;
// Silhouettes appear where the depth jumps by this fraction of the mesh size.
const OUTLINE_DEPTH_JUMP = 0.03;
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

    const stops = colormapStops(colormap);

    const colors = new Float32Array(vertexCount * 3);
    const colorA = new THREE.Color();
    const colorB = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
        const raw = values[i];
        const normalized = Number.isFinite(raw)
            ? Math.max(0, Math.min(1, (raw - min) / (max - min)))
            : 0;

        sampleColormap(stops, normalized, colorA, colorB);

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
): { usesVertexColors: boolean; range: [number, number] | null } {
    let colors: Float32Array | null = null;
    let range: [number, number] | null = null;

    if (colorMode === "density") {
        colors = buildDensityVertexColors(mesh, colormap);
    } else if (colorMode === "components") {
        colors = buildComponentVertexColors(mesh);
    } else if (colorMode === "radial" || colorMode === "height") {
        const geometric = buildGeometricVertexColors(mesh.vertices, colorMode, colormap);
        colors = geometric?.colors ?? null;
        range = geometric ? [geometric.min, geometric.max] : null;
    }

    if (!colors) {
        geometry.deleteAttribute("color");
        return { usesVertexColors: false, range: null };
    }

    geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(colors, 3),
    );

    return { usesVertexColors: true, range };
}

function meshColorLegend(
    colorMode: MeshColorMode,
    colormap: string,
    range: [number, number] | null,
    lengthScale: MeshLengthScale | undefined,
): MeshColorLegend | null {
    if (!range || (colorMode !== "radial" && colorMode !== "height")) return null;
    const unitLength = lengthScale?.unitLength;
    const factor = unitLength && Number.isFinite(unitLength) ? unitLength : 1;
    const shift = colorMode === "height" ? range[0] : 0;
    return {
        label: colorMode === "radial" ? "Distance from center" : "Height",
        min: (range[0] - shift) * factor,
        max: (range[1] - shift) * factor,
        gradient: colormapCssGradient(colormap),
    };
}

function formatLegendValue(value: number, unit: string): string {
    const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function surfaceColor(colormap: string, renderStyle: MeshRenderStyle): THREE.Color {
    return renderStyle.surfaceColor ? new THREE.Color(renderStyle.surfaceColor) : colorFromColormap(colormap);
}

function setCameraFrustum(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, aspect: number, halfHeight: number) {
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        (camera as THREE.PerspectiveCamera).aspect = aspect;
    } else {
        const ortho = camera as THREE.OrthographicCamera;
        ortho.top = halfHeight;
        ortho.bottom = -halfHeight;
        ortho.left = -halfHeight * aspect;
        ortho.right = halfHeight * aspect;
    }
    camera.updateProjectionMatrix();
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
    camera: THREE.Camera,
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

function createMeshSlicePlane(
    axis: VolumeAxis,
): THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
> {
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    plane.userData.volumeAxis = axis;
    plane.userData.outlineHidden = true;
    plane.renderOrder = 4;

    if (axis === "x") plane.rotation.y = Math.PI / 2;
    if (axis === "y") plane.rotation.x = -Math.PI / 2;
    return plane;
}

function updateMeshSlicePlane(
    plane: THREE.Mesh<
        THREE.PlaneGeometry,
        THREE.MeshBasicMaterial
    >,
    axis: VolumeAxis,
    volumeBounds: THREE.Box3,
    clipBounds: VolumeClipBounds,
    normalizedPosition: number,
    visible: boolean,
    opacity: number,
): void {
    const clippedBounds =
        normalizedBoundsToBox3(
            volumeBounds,
            clipBounds,
        );

    const size = clippedBounds.getSize(
        new THREE.Vector3(),
    );

    const center = clippedBounds.getCenter(
        new THREE.Vector3(),
    );

    const position =
        clampNormalized(
            normalizedPosition,
        );

    if (axis === "x") {
        plane.scale.set(
            size.z,
            size.y,
            1,
        );

        center.x = THREE.MathUtils.lerp(
            volumeBounds.min.x,
            volumeBounds.max.x,
            position,
        );
    } else if (axis === "y") {
        plane.scale.set(
            size.x,
            size.z,
            1,
        );

        center.y = THREE.MathUtils.lerp(
            volumeBounds.min.y,
            volumeBounds.max.y,
            position,
        );
    } else {
        plane.scale.set(
            size.x,
            size.y,
            1,
        );

        center.z = THREE.MathUtils.lerp(
            volumeBounds.min.z,
            volumeBounds.max.z,
            position,
        );
    }

    plane.position.copy(center);
    plane.visible = visible && opacity > 0.001 && !!plane.material.map;

    plane.material.opacity = opacity;
    updateClippingSliceUvs(plane.geometry, axis, clipBounds);
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

function buildSurfaceGeometry(source: MeshSurfaceArrays): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(source.vertices), 3));
    // The normals of the API (and of the browser surfaces) come from the
    // volume: they are smoother than those of the triangles.
    const hasNormals = source.normals?.length === source.vertices.length;
    if (hasNormals) {
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(source.normals!), 3));
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(source.indices), 1));
    if (!hasNormals) geometry.computeVertexNormals();
    geometry.normalizeNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
}

function asColorSource(source: MeshSurfaceArrays, mesh: VolumeSurfaceMesh): VolumeSurfaceMesh {
    // A browser surface has no density values; it keeps the rest of the mesh.
    return source === mesh ? mesh : { ...mesh, ...source, values: undefined } as VolumeSurfaceMesh;
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
    sliceImages,
    sliceVisibility = { x: false, y: false, z: false },
    slicePlaneOpacity = 0.05,
    cameraStateKey = "default",
    cameraStateRef: externalCameraStateRef,
    onError,
    active = true,
    renderStyle = DEFAULT_MESH_RENDER_STYLE,
    lengthScale,
    previewMesh = null,
    innerMesh = null,
    innerColor = "#e8a33d",
    captureRef,
}: MeshVolumeViewProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const autoRotateRef = useRef(autoRotate);
    const activeRef = useRef(active);
    const autoRotateSpeedRef = useRef(autoRotateSpeed);

    const currentCameraStateKey = useMemo(() => String(cameraStateKey ?? "default"), [cameraStateKey]);

    const internalCameraStateRef = useRef<MeshCameraState | null>(null);
    const cameraStateRef = externalCameraStateRef ?? internalCameraStateRef;
    const onErrorRef = useRef(onError);
    const materialRef = useRef<THREE.MeshPhongMaterial | null>(null);
    const renderStyleRef = useRef(renderStyle);
    const applyRenderStyleRef = useRef<() => void>(() => undefined);
    const [colorRange, setColorRange] = useState<[number, number] | null>(null);
    const projection = renderStyle.projection;
    const geometryRef = useRef<THREE.BufferGeometry | null>(null);
    const meshRef = useRef(mesh);
    meshRef.current = mesh;
    const displayed: MeshSurfaceArrays = previewMesh?.indices.length ? previewMesh : mesh;
    const displayedRef = useRef(displayed);
    displayedRef.current = displayed;
    const colorModeRef = useRef(colorMode);
    colorModeRef.current = colorMode;
    const colormapRef = useRef(colormap);
    colormapRef.current = colormap;
    const innerMeshRef = useRef(innerMesh);
    innerMeshRef.current = innerMesh;
    const innerColorRef = useRef(innerColor);
    innerColorRef.current = innerColor;
    const opacityRef = useRef(opacity);
    opacityRef.current = opacity;
    const displayModeRef = useRef(displayMode);
    displayModeRef.current = displayMode;
    const applyGeometryRef = useRef<() => void>(() => undefined);
    const applyInnerRef = useRef<() => void>(() => undefined);
    const hasMesh = !!(mesh?.vertices?.length && mesh?.indices?.length);
    const captureRefRef = useRef(captureRef);
    captureRefRef.current = captureRef;
    const requestRenderRef = useRef<() => void>(() => undefined);
    const resetViewRef = useRef<() => void>(() => undefined);
    const applyCameraCommandRef = useRef<(command: VolumeCameraCommand) => void>(() => undefined);
    const applyClipBoundsRef = useRef<() => void>(() => undefined);
    const applySlicePlanesRef = useRef<() => void>(() => undefined);
    const normalizedClipBounds = useMemo(() => normalizeVolumeClipBounds(clipBounds), [clipBounds]);
    const clipBoundsRef = useRef(normalizedClipBounds);
    const sliceImagesRef = useRef(sliceImages);
    const sliceVisibilityRef = useRef(sliceVisibility);
    const slicePlaneOpacityRef = useRef(slicePlaneOpacity);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        clipBoundsRef.current = normalizedClipBounds;
        applyClipBoundsRef.current();
    }, [normalizedClipBounds]);

    useEffect(() => {
        sliceImagesRef.current = sliceImages;
        sliceVisibilityRef.current = sliceVisibility;
        slicePlaneOpacityRef.current = slicePlaneOpacity;
        applySlicePlanesRef.current();
    }, [sliceImages, sliceVisibility, slicePlaneOpacity]);

    useEffect(() => {
        const geometry = geometryRef.current;
        const material = materialRef.current;

        if (!geometry || !material) return;

        const { usesVertexColors, range } = applyMeshVertexColors(
            geometry,
            asColorSource(displayedRef.current, meshRef.current),
            colorMode,
            colormap,
        );

        material.vertexColors = usesVertexColors;

        if (usesVertexColors) {
            material.color.setRGB(1, 1, 1);
        } else {
            material.color.copy(surfaceColor(colormap, renderStyleRef.current));
        }

        setColorRange(range);
        material.needsUpdate = true;
        applyRenderStyleRef.current();
    }, [colorMode, colormap, renderStyle.surfaceColor]);

    useEffect(() => {
        applyGeometryRef.current();
    }, [displayed]);

    useEffect(() => {
        applyInnerRef.current();
    }, [innerMesh, innerColor]);

    useEffect(() => {
        renderStyleRef.current = renderStyle;
        applyRenderStyleRef.current();
    }, [renderStyle]);

    useEffect(() => {
        const material = materialRef.current;
        if (!material) return;

        material.opacity = opacity;
        material.transparent = opacity < 1;
        // A see-through surface must not hide the inner one behind it.
        material.depthWrite = opacity >= 1;
        material.wireframe = displayMode === "mesh";
        material.needsUpdate = true;
        applyRenderStyleRef.current();
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

        if (!hasMesh) {
            onErrorRef.current?.("Surface mesh is empty.");
            return;
        }
        const mesh = meshRef.current;

        let renderer: THREE.WebGLRenderer | null = null;
        let composer: EffectComposer | null = null;
        let gtaoPass: GTAOPass | null = null;
        let outlinePass: MeshOutlinePass | null = null;
        let outputPass: OutputPass | null = null;
        let smaaPass: SMAAPass | null = null;
        let orientationGizmo: VolumeOrientationGizmo | null = null;
        let frameId: number | null = null;
        let dragState: DragState | null = null;

        try {
            const scene = new THREE.Scene();
            const perspective = projection === "perspective";
            const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective
                ? new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.01, 100)
                : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
            camera.position.set(0.9, -1.45, 0.9);
            // The lights are children of the camera, so they follow it.
            scene.add(camera);
            const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) / 2);

            renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                stencil: true,
                powerPreference: "high-performance",
            });

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

            const geometry = buildSurfaceGeometry(displayedRef.current);

            const sphere = geometry.boundingSphere;
            const radius = Math.max(0.5, sphere?.radius ?? 0.5);
            camera.near = Math.max(0.001, radius / 100);
            camera.far = Math.max(100, radius * 100);

            const { usesVertexColors, range: initialColorRange } = applyMeshVertexColors(
                geometry,
                asColorSource(displayedRef.current, mesh),
                colorModeRef.current,
                colormapRef.current,
            );
            setColorRange(initialColorRange);

            geometryRef.current = geometry;

            const material = new THREE.MeshPhongMaterial({
                color: usesVertexColors
                    ? new THREE.Color(1, 1, 1)
                    : surfaceColor(colormapRef.current, renderStyleRef.current),
                vertexColors: usesVertexColors,
                flatShading: false,
                transparent: opacityRef.current < 1,
                depthWrite: opacityRef.current >= 1,
                opacity: opacityRef.current,
                wireframe: displayModeRef.current === "mesh",
                side: THREE.DoubleSide,
            });

            materialRef.current = material;

            const surface = new THREE.Mesh(geometry, material);
            const surfacePivot = new THREE.Group();
            surfacePivot.add(surface);
            scene.add(surfacePivot);

            const innerMaterial = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide });
            const inner = new THREE.Mesh(new THREE.BufferGeometry(), innerMaterial);
            inner.visible = false;
            surfacePivot.add(inner);

            orientationGizmo = createVolumeOrientationGizmo(
                host,
                clipBoundsRef.current,
            );

            let volumeBounds = getMeshVolumeLocalBounds(mesh, geometry.boundingBox);
            let boundsMesh = mesh;
            const localClipPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
            const worldClipPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
            material.clippingPlanes = worldClipPlanes;
            innerMaterial.clippingPlanes = worldClipPlanes;
            renderer.localClippingEnabled = true;
            const caps = createClippingCaps(worldClipPlanes, surfacePivot, scene, geometry);

            // The caps close the opaque surface: the inner one when the
            // outer is see-through.
            const updateCaps = () => {
                const bounds = clipBoundsRef.current;
                const activePlanes = (["x", "y", "z"] as VolumeAxis[]).flatMap((axis) => [
                    bounds[axis][0] > 0.0001,
                    bounds[axis][1] < 0.9999,
                ]);
                const innerCapped = inner.visible && material.transparent;
                const capped = innerCapped ? inner : surface;
                caps.setGeometry(capped.geometry);
                caps.setColor(innerCapped || !material.vertexColors ? (capped.material as THREE.MeshPhongMaterial).color : new THREE.Color(0xb8bec8));
                const solid = innerCapped || !material.transparent;
                caps.setActive(renderStyleRef.current.caps && solid && displayModeRef.current !== "mesh", activePlanes);
            };

            const slicePlanes = {
                x: [
                    createMeshSlicePlane("x"),
                    createMeshSlicePlane("x"),
                ],
                y: [
                    createMeshSlicePlane("y"),
                    createMeshSlicePlane("y"),
                ],
                z: [
                    createMeshSlicePlane("z"),
                    createMeshSlicePlane("z"),
                ],
            };
            surfacePivot.add(
                slicePlanes.x[0],
                slicePlanes.x[1],
                slicePlanes.y[0],
                slicePlanes.y[1],
                slicePlanes.z[0],
                slicePlanes.z[1],
            );

            const updateClipBounds = () => {
                const bounds = clipBoundsRef.current;
                configureLocalClippingPlanes(localClipPlanes, volumeBounds, bounds);
                surfacePivot.updateMatrixWorld(true);
                localClipPlanes.forEach((plane, index) => {
                    worldClipPlanes[index].copy(plane).applyMatrix4(surfacePivot.matrixWorld);
                });

                updateOcclusion();
                updateCaps();

                orientationGizmo?.setClipBounds(bounds);
                requestRenderRef.current();
                updateSlicePlanes();
            };

            const updateSlicePlanes = () => {
                const bounds = clipBoundsRef.current;
                const visibility = sliceVisibilityRef.current;

                const planeOpacity = Math.max(
                    0,
                    Math.min(
                        1,
                        slicePlaneOpacityRef.current,
                    ),
                );

                for (const axis of ["x", "y", "z"] as VolumeAxis[]) {
                    for (const side of [0, 1] as const) {
                        const plane = slicePlanes[axis][side];
                        const distinctFace = side === 0 || Math.abs(bounds[axis][1] - bounds[axis][0]) > 1e-6;
                        setClippingSliceImage(plane.material, distinctFace ? sliceImagesRef.current?.[axis][side] ?? null : null);
                        updateMeshSlicePlane(plane, axis, volumeBounds, bounds, bounds[axis][side], visibility[axis] && distinctFace, planeOpacity);
                    }
                }
                requestRenderRef.current();
            };

            applyClipBoundsRef.current = updateClipBounds;
            applySlicePlanesRef.current = updateSlicePlanes;
            updateClipBounds();

            const saveCameraState = () => {
                cameraStateRef.current = {
                    key: currentCameraStateKey,
                    position: toNumberTuple(camera.position.toArray()),
                    target: toNumberTuple(controls.target.toArray()),
                    zoom: camera.zoom,
                    objectQuaternion: toQuaternionTuple(surfacePivot.quaternion.toArray()),
                    orthoHalfHeight: perspective ? undefined : orthoHalfHeight,
                };
            };

            const ambient = new THREE.AmbientLight(0xffffff, 0);
            scene.add(ambient);

            const addCameraLight = (position: THREE.Vector3) => {
                const light = new THREE.DirectionalLight(0xffffff, 0);
                light.position.copy(position);
                camera.add(light);
                camera.add(light.target);
                return light;
            };
            const keyLight = addCameraLight(MESH_LIGHT_POSITIONS.key);
            const fillLight = addCameraLight(MESH_LIGHT_POSITIONS.fill);
            const rimLight = addCameraLight(MESH_LIGHT_POSITIONS.rim);

            // Multisampling smooths the edges of the surface; the passes after
            // the scene render would otherwise lose the antialiasing of the canvas.
            const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
                type: THREE.HalfFloatType,
                stencilBuffer: true,
                samples: renderer.capabilities.isWebGL2 ? 4 : 0,
            });
            composer = new EffectComposer(renderer, composerTarget);

            const renderPass = new RenderPass(scene, camera);
            renderPass.clearAlpha = 0;
            composer.addPass(renderPass);

            gtaoPass = new GTAOPass(scene, camera, 1, 1);
            gtaoPass.updateGtaoMaterial(GTAO_PARAMETERS);
            gtaoPass.updatePdMaterial(GTAO_DENOISE_PARAMETERS);
            if (!perspective) {
                // GTAOPass only reads the camera type from its shader defaults.
                const occlusionMaterials = gtaoPass as unknown as Record<string, THREE.ShaderMaterial | undefined>;
                for (const name of ["gtaoMaterial", "depthRenderMaterial"]) {
                    const shader = occlusionMaterials[name];
                    if (shader?.defines) {
                        shader.defines.PERSPECTIVE_CAMERA = 0;
                        shader.needsUpdate = true;
                    }
                }
            }
            composer.addPass(gtaoPass);

            outlinePass = new MeshOutlinePass(scene, camera, material);
            outlinePass.depthJump = 2 * radius * OUTLINE_DEPTH_JUMP;
            composer.addPass(outlinePass);

            outputPass = new OutputPass();
            composer.addPass(outputPass);

            smaaPass = new SMAAPass(1, 1);
            composer.addPass(smaaPass);

            let backgroundTexture: THREE.Texture | null = null;

            function updateOcclusion() {
                if (!gtaoPass) return;
                const occlusion = MESH_LIGHTING_PRESETS[renderStyleRef.current.lighting].occlusion;
                gtaoPass.blendIntensity = occlusion;
                // The occlusion of a see-through surface would darken what is behind it.
                gtaoPass.enabled = occlusion > 0 && !isClippingActive(clipBoundsRef.current) && opacityRef.current >= 1;
            }

            const updateDepthCue = () => {
                if (!(scene.fog instanceof THREE.Fog)) return;
                const distance = camera.position.distanceTo(controls.target);
                scene.fog.near = Math.max(0, distance - radius * 0.4);
                scene.fog.far = distance + radius * 1.4;
            };

            const applyRenderStyle = () => {
                const style = renderStyleRef.current;
                const preset = MESH_LIGHTING_PRESETS[style.lighting];
                ambient.intensity = preset.ambient;
                keyLight.intensity = preset.key;
                fillLight.intensity = preset.fill;
                rimLight.intensity = preset.rim;
                material.specular.setScalar(preset.specular);
                material.shininess = preset.shininess;
                innerMaterial.specular.setScalar(preset.specular);
                innerMaterial.shininess = preset.shininess;
                updateOcclusion();
                updateCaps();

                backgroundTexture?.dispose();
                const background = createBackgroundTexture(style.background);
                backgroundTexture = background instanceof THREE.Texture ? background : null;
                scene.background = background;

                const hadFog = scene.fog != null;
                scene.fog = style.depthCue ? new THREE.Fog(backgroundFogColor(style.background), 1, 2) : null;
                updateDepthCue();
                if (hadFog !== (scene.fog != null)) {
                    material.needsUpdate = true;
                    innerMaterial.needsUpdate = true;
                }

                if (outlinePass && smaaPass) {
                    outlinePass.width = Math.max(0, style.outlineWidth);
                    outlinePass.enabled = outlinePass.width > 0;
                    outlinePass.material.uniforms.outlineColor.value.setHex(MESH_BACKGROUNDS[style.background].outline);
                    // The silhouettes come from a depth image without multisampling.
                    smaaPass.enabled = outlinePass.enabled;
                }
                requestRenderRef.current();
            };

            const clock = new THREE.Clock();
            const baseDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
            let orthoHalfHeight = radius * 2.6 * tanHalfFov;
            let controlsInteracting = false;
            let appliedDpr = -1;
            let appliedGtaoScale = -1;

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
                setCameraFrustum(camera, width / height, orthoHalfHeight);
            };

            // Renders the view again at a multiple of its screen size.
            const capture: VolumeImageCapture = async ({ scale, transparent }) => {
                if (!renderer || !composer) throw new Error("The 3D view is not ready.");
                const width = Math.max(1, host.clientWidth);
                const height = Math.max(1, host.clientHeight);
                const ratio = exportScale(width, height, scale, Math.min(8192, renderer.capabilities.maxTextureSize));
                const background = scene.background;
                if (transparent) scene.background = null;
                try {
                    renderer.setPixelRatio(ratio);
                    renderer.setSize(width, height, false);
                    composer.setPixelRatio(ratio);
                    composer.setSize(width, height);
                    setCameraFrustum(camera, width / height, orthoHalfHeight);
                    surfacePivot.updateMatrixWorld(true);
                    localClipPlanes.forEach((plane, index) => {
                        worldClipPlanes[index].copy(plane).applyMatrix4(surfacePivot.matrixWorld);
                    });
                    updateDepthCue();
                    caps.update();
                    composer.render(0);
                    return await canvasToPng(renderer.domElement, null);
                } finally {
                    scene.background = background;
                    applyRenderQuality(true);
                    requestRender();
                }
            };
            if (captureRefRef.current) captureRefRef.current.current = capture;

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
                updateDepthCue();
                surfacePivot.updateMatrixWorld(true);
                localClipPlanes.forEach((plane, index) => {
                    worldClipPlanes[index].copy(plane).applyMatrix4(surfacePivot.matrixWorld);
                });
                orientationGizmo?.updateOrientation(
                    camera.quaternion,
                    surfacePivot.quaternion,
                );
                caps.update();
                composer?.render(dt);

                if (autoRotateRef.current || controlsChanged) requestRender();
            };

            const requestRender = () => {
                if (frameId != null || !activeRef.current || document.visibilityState === "hidden") return;
                frameId = window.requestAnimationFrame(renderFrame);
            };

            requestRenderRef.current = requestRender;
            applyRenderStyleRef.current = applyRenderStyle;

            // Replaces the surface (a new level, or the live threshold)
            // without rebuilding the view: the camera stays where it is.
            const applyGeometry = () => {
                const source = displayedRef.current;
                if (!source?.vertices?.length || !source?.indices?.length) return;
                if (geometryRef.current && surface.geometry === geometryRef.current && geometryRef.current.userData.source === source) return;
                const next = buildSurfaceGeometry(source);
                next.userData.source = source;
                const { usesVertexColors: colored, range } = applyMeshVertexColors(
                    next,
                    asColorSource(source, meshRef.current),
                    colorModeRef.current,
                    colormapRef.current,
                );
                const previous = surface.geometry;
                surface.geometry = next;
                geometryRef.current = next;
                previous.dispose();
                if (material.vertexColors !== colored) {
                    material.vertexColors = colored;
                    material.color.copy(colored ? new THREE.Color(1, 1, 1) : surfaceColor(colormapRef.current, renderStyleRef.current));
                    material.needsUpdate = true;
                }
                setColorRange(range);
                if (meshRef.current !== boundsMesh) {
                    boundsMesh = meshRef.current;
                    volumeBounds = getMeshVolumeLocalBounds(boundsMesh, next.boundingBox);
                }
                updateClipBounds();
            };
            geometry.userData.source = displayedRef.current;
            applyGeometryRef.current = applyGeometry;

            const applyInner = () => {
                const source = innerMeshRef.current;
                const previous = inner.geometry;
                if (source?.indices?.length) {
                    inner.geometry = buildSurfaceGeometry(source);
                    inner.visible = true;
                } else {
                    inner.geometry = new THREE.BufferGeometry();
                    inner.visible = false;
                }
                previous.dispose();
                innerMaterial.color.set(innerColorRef.current);
                updateCaps();
                requestRender();
            };
            applyInnerRef.current = applyInner;
            applyInner();
            applyRenderStyle();

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

            const viewAspect = () => Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);

            // Shows the whole mesh seen along direction (from the camera to the mesh).
            const fitView = (direction: THREE.Vector3, up: THREE.Vector3) => {
                const fit = fitMeshInView(displayedRef.current.vertices, surfacePivot.quaternion, direction, up, CAMERA_FOV, viewAspect());
                const target = fit?.target ?? sphere?.center ?? new THREE.Vector3(0, 0, 0);
                const distance = fit?.distance ?? radius * 2.6;
                controls.target.copy(target);
                camera.up.copy(up);
                camera.position.copy(target).addScaledVector(direction.clone().normalize(), -distance);
                camera.zoom = 1;
                orthoHalfHeight = fit?.halfHeight ?? distance * tanHalfFov;
                setCameraFrustum(camera, viewAspect(), orthoHalfHeight);
            };

            const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(-1.15, 2.0, -1.15);

            const resetView = () => {
                surfacePivot.quaternion.identity();
                fitView(DEFAULT_VIEW_DIRECTION, new THREE.Vector3(0, 1, 0));
                controls.update();
                saveCameraState();
                requestRender();
            };

            resetViewRef.current = resetView;

            const applyCameraCommand = (command: VolumeCameraCommand) => {
                surfacePivot.quaternion.identity();
                fitView(cameraPresetDirection(command.preset).negate(), cameraPresetUp(command.preset));
                controls.update();
                updateClipBounds();
                saveCameraState();
                requestRender();
            };

            applyCameraCommandRef.current = applyCameraCommand;

            const savedCameraState = cameraStateRef.current;
            if (savedCameraState?.key === currentCameraStateKey) {
                const target = new THREE.Vector3().fromArray(savedCameraState.target);
                const offset = new THREE.Vector3().fromArray(savedCameraState.position).sub(target);
                const savedZoom = savedCameraState.zoom > 0 ? savedCameraState.zoom : 1;
                // Visible half height at the target, kept when the projection changes.
                const visibleHalfHeight = savedCameraState.orthoHalfHeight != null
                    ? savedCameraState.orthoHalfHeight / savedZoom
                    : (offset.length() * tanHalfFov) / savedZoom;
                controls.target.copy(target);
                surfacePivot.quaternion.fromArray(savedCameraState.objectQuaternion);
                if (perspective) {
                    camera.zoom = 1;
                    camera.position.copy(target).add(offset.setLength(Math.max(camera.near * 2, visibleHalfHeight / tanHalfFov)));
                } else {
                    camera.position.copy(target).add(offset);
                    orthoHalfHeight = savedCameraState.orthoHalfHeight ?? offset.length() * tanHalfFov;
                    camera.zoom = orthoHalfHeight / Math.max(1e-6, visibleHalfHeight);
                }
            } else {
                surfacePivot.quaternion.identity();
                fitView(DEFAULT_VIEW_DIRECTION, new THREE.Vector3(0, 1, 0));
            }

            resize();
            controls.update();
            saveCameraState();
            requestRender();

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
                dragState = null;
                host.style.cursor = "grab";
                host.releasePointerCapture?.(event.pointerId);
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
                outlinePass?.dispose();
                outputPass?.dispose();
                smaaPass?.dispose();
                composer?.dispose();
                backgroundTexture?.dispose();
                caps.dispose();
                orientationGizmo?.dispose();
                orientationGizmo = null;

                for (const pair of Object.values(slicePlanes)) pair.forEach(plane => setClippingSliceImage(plane.material, null));
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
                applyRenderStyleRef.current = () => undefined;
                applyGeometryRef.current = () => undefined;
                applyInnerRef.current = () => undefined;
                if (captureRefRef.current?.current === capture) captureRefRef.current.current = null;
            };
        } catch (error: any) {
            gtaoPass?.dispose();
            outlinePass?.dispose();
            outputPass?.dispose();
            smaaPass?.dispose();
            composer?.dispose();
            orientationGizmo?.dispose();
            renderer?.dispose();
            requestRenderRef.current = () => undefined;
            applyCameraCommandRef.current = () => undefined;
            applyClipBoundsRef.current = () => undefined;
            applySlicePlanesRef.current = () => undefined;
            applyRenderStyleRef.current = () => undefined;

            onErrorRef.current?.(
                error?.message || "Failed to render surface mesh.",
            );
        }

        // The surface itself changes through applyGeometry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMesh, currentCameraStateKey, projection]);

    useEffect(() => {
        if (resetViewKey > 0) resetViewRef.current();
    }, [resetViewKey]);

    useEffect(() => {
        if (cameraCommand) applyCameraCommandRef.current(cameraCommand);
    }, [cameraCommand]);

    const legend = meshColorLegend(colorMode, colormap, colorRange, lengthScale);
    const legendUnit = lengthScale?.unitLength ? lengthScale.unit : "";
    const legendText = MESH_BACKGROUNDS[renderStyle.background].legendText;

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
                position: "relative",
            }}
        >
            <div
                ref={hostRef}
                style={{
                    width: "100%",
                    height: "100%",
                    minWidth: 0,
                    minHeight: 0,
                    overflow: "hidden",
                    position: "relative",
                }}
            />
            {legend && (
                <div
                    role="img"
                    aria-label={`${legend.label} color scale`}
                    style={{
                        position: "absolute",
                        left: 12,
                        bottom: 12,
                        color: legendText,
                        fontSize: 11,
                        pointerEvents: "none",
                        textShadow: legendText === "#1f2937" ? "none" : "0 1px 2px rgba(0,0,0,0.6)",
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>{legend.label}</div>
                    <div style={{ width: 140, height: 8, borderRadius: 4, background: legend.gradient }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                        <span>{formatLegendValue(legend.min, legendUnit)}</span>
                        <span>{formatLegendValue(legend.max, legendUnit)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
