// How the surface mesh is drawn: lighting presets, background, silhouettes,
// depth cue, projection and the colorings computed from the geometry.
import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

export type MeshLighting = "default" | "full" | "soft" | "flat";
export type MeshBackground = "light" | "white" | "black" | "gradient";
export type MeshProjection = "perspective" | "orthographic";
export type MeshGeometricColoring = "radial" | "height";

export type MeshRenderStyle = {
    lighting: MeshLighting;
    // Silhouette width in CSS pixels; 0 draws none.
    outlineWidth: number;
    background: MeshBackground;
    depthCue: boolean;
    projection: MeshProjection;
    // Color of the solid surface; null uses the tint of the colormap.
    surfaceColor: string | null;
};

export const DEFAULT_MESH_RENDER_STYLE: MeshRenderStyle = {
    lighting: "default",
    outlineWidth: 0,
    background: "light",
    depthCue: false,
    projection: "perspective",
    surfaceColor: null,
};

export type MeshLightingPreset = {
    ambient: number;
    key: number;
    fill: number;
    rim: number;
    // Strength of the ambient occlusion (0 turns it off).
    occlusion: number;
    specular: number;
    shininess: number;
};

// Directional lights move with the camera, as in a molecular viewer: the key
// light comes from the upper left, the fill from the lower right and the rim
// from behind.
export const MESH_LIGHT_POSITIONS = {
    key: new THREE.Vector3(-1.2, 1.4, 2.0),
    fill: new THREE.Vector3(1.5, -0.7, 1.0),
    rim: new THREE.Vector3(0.4, 1.2, -2.0),
};

export const MESH_LIGHTING_PRESETS: Record<MeshLighting, MeshLightingPreset> = {
    default: { ambient: 0.16, key: 1.35, fill: 0.25, rim: 0.3, occlusion: 0.88, specular: 0.12, shininess: 28 },
    full: { ambient: 0.3, key: 1.15, fill: 0.35, rim: 0.35, occlusion: 1.0, specular: 0.18, shininess: 40 },
    soft: { ambient: 0.85, key: 0.35, fill: 0.12, rim: 0.1, occlusion: 1.0, specular: 0.0, shininess: 1 },
    flat: { ambient: 1.0, key: 0, fill: 0, rim: 0, occlusion: 0, specular: 0.0, shininess: 1 },
};

export type MeshBackgroundStyle = {
    // Top and bottom colors (equal for a plain background).
    top: number;
    bottom: number;
    outline: number;
    legendText: string;
};

export const MESH_BACKGROUNDS: Record<MeshBackground, MeshBackgroundStyle> = {
    light: { top: 0xe7ecf3, bottom: 0xe7ecf3, outline: 0x000000, legendText: "#1f2937" },
    white: { top: 0xffffff, bottom: 0xffffff, outline: 0x000000, legendText: "#1f2937" },
    black: { top: 0x000000, bottom: 0x000000, outline: 0x000000, legendText: "#e5e7eb" },
    gradient: { top: 0xf8fafc, bottom: 0xb8c4d4, outline: 0x000000, legendText: "#1f2937" },
};

// The color the depth cue fades into: the middle of the background.
export function backgroundFogColor(background: MeshBackground): THREE.Color {
    const style = MESH_BACKGROUNDS[background];
    return new THREE.Color(style.top).lerp(new THREE.Color(style.bottom), 0.5);
}

export function createBackgroundTexture(background: MeshBackground): THREE.Texture | THREE.Color {
    const style = MESH_BACKGROUNDS[background];
    if (style.top === style.bottom || typeof document === "undefined") {
        return new THREE.Color(style.top);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return backgroundFogColor(background);
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, `#${new THREE.Color(style.top).getHexString()}`);
    gradient.addColorStop(1, `#${new THREE.Color(style.bottom).getHexString()}`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export const COLORMAP_STOPS: Record<string, number[]> = {
    gray: [0x111111, 0xf3f4f6],
    grey: [0x111111, 0xf3f4f6],
    viridis: [0x440154, 0x31688e, 0x35b779, 0xfde725],
    magma: [0x000004, 0x721f81, 0xf1605d, 0xfcfdbf],
    plasma: [0x0d0887, 0x9c179e, 0xed7953, 0xf0f921],
    inferno: [0x000004, 0x57106e, 0xbc3754, 0xfcffa4],
    cividis: [0x00224e, 0x575d6d, 0xa59c74, 0xfee838],
    turbo: [0x30123b, 0x28bbec, 0xa4fc3c, 0xf9a31b, 0x7a0403],
};

export function colormapStops(colormap: string): number[] {
    return COLORMAP_STOPS[(colormap || "").toLowerCase()] ?? COLORMAP_STOPS.viridis;
}

// The color of the colormap at t in [0, 1], written into target.
export function sampleColormap(stops: number[], t: number, target: THREE.Color, scratch = new THREE.Color()): THREE.Color {
    const position = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(stops.length - 1, lower + 1);
    target.setHex(stops[lower]);
    return target.lerp(scratch.setHex(stops[upper]), position - lower);
}

export function colormapCssGradient(colormap: string, direction = "to right"): string {
    const stops = colormapStops(colormap);
    const parts = stops.map((stop, index) => {
        const percent = stops.length > 1 ? (index / (stops.length - 1)) * 100 : 0;
        return `#${stop.toString(16).padStart(6, "0")} ${percent.toFixed(0)}%`;
    });
    return `linear-gradient(${direction}, ${parts.join(", ")})`;
}

export type GeometricColors = {
    colors: Float32Array;
    // Range of the colored quantity, in mesh units.
    min: number;
    max: number;
};

// Colors by distance from the center of the mesh (radial) or by height along
// Y (height), as in a molecular viewer. The vertices are centered by the API.
export function buildGeometricVertexColors(
    vertices: ArrayLike<number>,
    coloring: MeshGeometricColoring,
    colormap: string,
): GeometricColors | null {
    const vertexCount = Math.floor(vertices.length / 3);
    if (!vertexCount) return null;

    const quantity = new Float32Array(vertexCount);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
        const x = vertices[i * 3];
        const y = vertices[i * 3 + 1];
        const z = vertices[i * 3 + 2];
        const value = coloring === "radial" ? Math.sqrt(x * x + y * y + z * z) : y;
        quantity[i] = value;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

    const span = max - min || 1;
    const stops = colormapStops(colormap);
    const colors = new Float32Array(vertexCount * 3);
    const color = new THREE.Color();
    const scratch = new THREE.Color();
    for (let i = 0; i < vertexCount; i++) {
        sampleColormap(stops, (quantity[i] - min) / span, color, scratch);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    return { colors, min, max };
}

// Length of one mesh unit in the original volume: the API scales the mesh by
// its largest extent, measured in voxels of the reduced volume.
export function meshUnitLength(
    mesh: { scale?: number; dims?: number[]; sourceDims?: number[] },
    voxelSize: number,
): number | null {
    const scale = Number(mesh.scale);
    if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(voxelSize) || voxelSize <= 0) return null;
    const reduced = Number(mesh.dims?.[2]);
    const source = Number(mesh.sourceDims?.[2]);
    const binning = reduced > 0 && source > 0 ? source / reduced : 1;
    return scale * binning * voxelSize;
}

// Points of the mesh used to fit it in view: every vertex up to maxPoints.
function sampledVertices(vertices: ArrayLike<number>, maxPoints: number): Float32Array {
    const vertexCount = Math.floor(vertices.length / 3);
    const stride = Math.max(1, Math.ceil(vertexCount / maxPoints));
    const points = new Float32Array(Math.ceil(vertexCount / stride) * 3);
    let offset = 0;
    for (let i = 0; i < vertexCount; i += stride) {
        points[offset++] = vertices[i * 3];
        points[offset++] = vertices[i * 3 + 1];
        points[offset++] = vertices[i * 3 + 2];
    }
    return points.subarray(0, offset);
}

export type ViewFit = {
    // Distance from the target along the view direction (perspective).
    distance: number;
    // Half of the visible height at that distance.
    halfHeight: number;
    target: THREE.Vector3;
};

// The camera distance that shows every vertex, seen along viewDirection (from
// the camera to the target) with the given up, rotation of the mesh, vertical
// field of view and aspect ratio, with a margin around it.
export function fitMeshInView(
    vertices: ArrayLike<number>,
    rotation: THREE.Quaternion,
    viewDirection: THREE.Vector3,
    up: THREE.Vector3,
    fovDegrees: number,
    aspect: number,
    margin = 1.12,
): ViewFit | null {
    const points = sampledVertices(vertices, 20000);
    if (!points.length) return null;

    const forward = viewDirection.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(right, forward).normalize();
    const point = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < points.length; i += 3) {
        point.set(points[i], points[i + 1], points[i + 2]).applyQuaternion(rotation);
        const coords = [point.dot(right), point.dot(cameraUp), point.dot(forward)];
        min.set(Math.min(min.x, coords[0]), Math.min(min.y, coords[1]), Math.min(min.z, coords[2]));
        max.set(Math.max(max.x, coords[0]), Math.max(max.y, coords[1]), Math.max(max.z, coords[2]));
    }

    const center = min.clone().add(max).multiplyScalar(0.5);
    const target = new THREE.Vector3()
        .addScaledVector(right, center.x)
        .addScaledVector(cameraUp, center.y)
        .addScaledVector(forward, center.z);
    const halfHeight = Math.max((max.y - min.y) / 2, (max.x - min.x) / 2 / Math.max(aspect, 1e-6), 1e-3) * margin;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
    // The front of the mesh is closer to the camera than its center.
    const distance = halfHeight / tanHalfFov + (max.z - min.z) / 2;
    return { distance, halfHeight, target };
}

// Directions sampled around each pixel (each one on both sides).
const OUTLINE_SAMPLES = 4;

// Silhouettes where the depth jumps, drawn on the nearer side of the jump, as
// a molecular viewer does. The depth comes from its own render of the scene.
// A jump is where the depth bends (its second difference across the pixel),
// so a surface seen at a grazing angle, steep but smooth, draws no line.
export const MeshOutlineShader = {
    uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        tDepth: { value: null as THREE.Texture | null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.01 },
        cameraFar: { value: 100 },
        thickness: { value: 1 },
        depthJump: { value: 0.03 },
        outlineColor: { value: new THREE.Color(0x000000) },
    },
    defines: {
        PERSPECTIVE_CAMERA: 1,
        OUTLINE_SAMPLES,
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float thickness;
        uniform float depthJump;
        uniform vec3 outlineColor;
        varying vec2 vUv;

        float sceneDepth(vec2 uv) {
            float depth = texture2D(tDepth, uv).x;
            if (depth >= 0.999999) return 1.0e6;
            #if PERSPECTIVE_CAMERA == 1
                return -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
            #else
                return -orthographicDepthToViewZ(depth, cameraNear, cameraFar);
            #endif
        }

        void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            float center = sceneDepth(vUv);
            float edge = 0.0;
            vec2 texel = thickness / resolution;
            for (int i = 0; i < OUTLINE_SAMPLES; i++) {
                float angle = 3.14159265359 * float(i) / float(OUTLINE_SAMPLES);
                vec2 offset = vec2(cos(angle), sin(angle)) * texel;
                float bend = sceneDepth(vUv + offset) + sceneDepth(vUv - offset) - 2.0 * center;
                edge = max(edge, smoothstep(depthJump * 0.5, depthJump, bend));
            }
            gl_FragColor = vec4(mix(base.rgb, outlineColor, edge), max(base.a, edge));
        }
    `,
};

export class MeshOutlinePass extends Pass {
    // Width in CSS pixels; the pass is turned off at 0.
    width = 0;
    // Smallest depth jump that draws a line, in scene units.
    depthJump = 0.03;
    readonly material: THREE.ShaderMaterial;
    private readonly depthTarget: THREE.WebGLRenderTarget;
    private readonly depthMaterial: THREE.MeshBasicMaterial;
    private readonly quad: FullScreenQuad;

    constructor(
        private readonly scene: THREE.Scene,
        public camera: THREE.Camera,
        // The material whose clipping and wireframe the depth render follows.
        private readonly sourceMaterial: THREE.Material & { wireframe?: boolean },
    ) {
        super();
        this.depthTarget = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
        this.depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
        this.material = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(MeshOutlineShader.uniforms),
            defines: { ...MeshOutlineShader.defines },
            vertexShader: MeshOutlineShader.vertexShader,
            fragmentShader: MeshOutlineShader.fragmentShader,
        });
        this.setCamera(camera);
        this.quad = new FullScreenQuad(this.material);
    }

    setCamera(camera: THREE.Camera): void {
        this.camera = camera;
        this.material.defines.PERSPECTIVE_CAMERA = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? 1 : 0;
        this.material.needsUpdate = true;
    }

    setSize(width: number, height: number): void {
        this.depthTarget.setSize(width, height);
        this.material.uniforms.resolution.value.set(width, height);
    }

    render(
        renderer: THREE.WebGLRenderer,
        writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget,
    ): void {
        const { scene } = this;
        const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
        const hidden: THREE.Object3D[] = [];
        scene.traverse((object) => {
            if (object.userData.outlineHidden && object.visible) {
                object.visible = false;
                hidden.push(object);
            }
        });
        const background = scene.background;
        const fog = scene.fog;
        const overrideMaterial = scene.overrideMaterial;
        this.depthMaterial.clippingPlanes = this.sourceMaterial.clippingPlanes;
        this.depthMaterial.wireframe = !!this.sourceMaterial.wireframe;
        scene.background = null;
        scene.fog = null;
        scene.overrideMaterial = this.depthMaterial;
        renderer.setRenderTarget(this.depthTarget);
        renderer.clear();
        renderer.render(scene, camera);
        scene.background = background;
        scene.fog = fog;
        scene.overrideMaterial = overrideMaterial;
        hidden.forEach((object) => { object.visible = true; });

        const uniforms = this.material.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        uniforms.tDepth.value = this.depthTarget.depthTexture;
        uniforms.cameraNear.value = camera.near;
        uniforms.cameraFar.value = camera.far;
        uniforms.thickness.value = Math.max(0.5, this.width * renderer.getPixelRatio());
        uniforms.depthJump.value = this.depthJump;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
    }

    dispose(): void {
        this.depthTarget.depthTexture?.dispose();
        this.depthTarget.dispose();
        this.depthMaterial.dispose();
        this.material.dispose();
        this.quad.dispose();
    }
}
