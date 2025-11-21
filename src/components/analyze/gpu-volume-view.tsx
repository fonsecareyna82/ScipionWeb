import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type GpuVolumeViewProps = {
    values: number[];
    dims: { x: number; y: number; z: number };
    order?: "zyx" | "xyz";
    spacing?: [number, number, number];
    rangeMin: number;
    rangeMax: number;
    isoMin: number;
    isoMax: number;
    opacity: number;
    colormap: string; // renamed
    onError?: (msg: string) => void;
};

const VERT = `
  varying vec3 vPos;
  varying vec3 vCamLocal;

  uniform mat4 uInvModel;

  void main() {
    vPos = position;
    vCamLocal = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  precision highp sampler3D;

  varying vec3 vPos;
  varying vec3 vCamLocal;

  uniform sampler3D uTex;
  uniform float uIsoMin;
  uniform float uIsoMax;
  uniform float uOpacity;
  uniform int uSteps;
  uniform int uCmap;

  vec3 palette5(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
    float x = clamp(t, 0.0, 1.0) * 4.0;
    if (x < 1.0) return mix(c0, c1, x);
    if (x < 2.0) return mix(c1, c2, x - 1.0);
    if (x < 3.0) return mix(c2, c3, x - 2.0);
    return mix(c3, c4, x - 3.0);
  }

  vec3 viridis(float t) {
    return palette5(
      t,
      vec3(0.267, 0.005, 0.329),
      vec3(0.283, 0.141, 0.458),
      vec3(0.254, 0.265, 0.530),
      vec3(0.207, 0.372, 0.553),
      vec3(0.993, 0.906, 0.144)
    );
  }

  vec3 magma(float t) {
    return palette5(
      t,
      vec3(0.001, 0.000, 0.014),
      vec3(0.213, 0.066, 0.333),
      vec3(0.549, 0.118, 0.360),
      vec3(0.855, 0.180, 0.110),
      vec3(0.987, 0.991, 0.749)
    );
  }

  vec3 inferno(float t) {
    return palette5(
      t,
      vec3(0.002, 0.000, 0.014),
      vec3(0.273, 0.074, 0.458),
      vec3(0.578, 0.148, 0.404),
      vec3(0.865, 0.317, 0.118),
      vec3(0.988, 0.998, 0.645)
    );
  }

  vec3 plasma(float t) {
    return palette5(
      t,
      vec3(0.050, 0.030, 0.527),
      vec3(0.386, 0.114, 0.769),
      vec3(0.667, 0.213, 0.559),
      vec3(0.902, 0.411, 0.272),
      vec3(0.940, 0.975, 0.131)
    );
  }

  vec3 cividis(float t) {
    return palette5(
      t,
      vec3(0.000, 0.135, 0.304),
      vec3(0.235, 0.294, 0.433),
      vec3(0.489, 0.458, 0.410),
      vec3(0.741, 0.638, 0.248),
      vec3(0.995, 0.909, 0.217)
    );
  }

  vec3 turbo(float x) {
    x = clamp(x, 0.0, 1.0);
    vec4 v = vec4(1.0, x, x*x, x*x*x);
    vec4 kR = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
    vec4 kG = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
    vec4 kB = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
    return clamp(vec3(dot(v, kR), dot(v, kG), dot(v, kB)), 0.0, 1.0);
  }

  vec3 cmap(float t) {
    if (uCmap == 1) return vec3(t);      // gray
    if (uCmap == 2) return magma(t);
    if (uCmap == 3) return inferno(t);
    if (uCmap == 4) return plasma(t);
    if (uCmap == 5) return cividis(t);
    if (uCmap == 6) return turbo(t);
    return viridis(t);                  // default
  }

  bool intersectBox(vec3 ro, vec3 rd, out float t0, out float t1) {
    vec3 boxMin = vec3(-0.5);
    vec3 boxMax = vec3(0.5);
    vec3 invRd = 1.0 / rd;

    vec3 tMin = (boxMin - ro) * invRd;
    vec3 tMax = (boxMax - ro) * invRd;
    vec3 t1v = min(tMin, tMax);
    vec3 t2v = max(tMin, tMax);

    t0 = max(max(t1v.x, t1v.y), t1v.z);
    t1 = min(min(t2v.x, t2v.y), t2v.z);
    return t1 >= max(t0, 0.0);
  }

  void main() {
    vec3 ro = vCamLocal;
    vec3 rd = normalize(vPos - vCamLocal);

    float t0, t1;
    if (!intersectBox(ro, rd, t0, t1)) discard;

    float dt = (t1 - t0) / float(uSteps);
    vec4 acc = vec4(0.0);

    float denom = max(1e-5, (uIsoMax - uIsoMin));

    for (int i = 0; i < 512; i++) {
      if (i >= uSteps) break;

      float tRay = t0 + dt * (float(i) + 0.5);
      vec3 p = ro + rd * tRay;
      vec3 uvw = p + 0.5;

      float d = texture(uTex, uvw).r;
      float tnorm = clamp((d - uIsoMin) / denom, 0.0, 1.0);

      float inside = smoothstep(0.0, 0.03, tnorm) *
                     (1.0 - smoothstep(0.97, 1.0, tnorm));

      if (inside > 0.0) {
        vec3 col = cmap(tnorm);
        float a = inside * uOpacity * dt * 30.0;
        a = clamp(a, 0.0, 1.0);

        acc.rgb += (1.0 - acc.a) * col * a;
        acc.a   += (1.0 - acc.a) * a;

        if (acc.a > 0.98) break;
      }
    }

    if (acc.a <= 0.001) discard;
    gl_FragColor = acc;
  }
`;

function cmapToId(name: string) {
    const n = (name || "viridis").toLowerCase();
    if (n === "gray" || n === "grey") return 1;
    if (n === "magma") return 2;
    if (n === "inferno") return 3;
    if (n === "plasma") return 4;
    if (n === "cividis") return 5;
    if (n === "turbo") return 6;
    return 0; // viridis default
}

function buildUint8Texture(
    values: number[],
    dims: { x: number; y: number; z: number },
    vmin: number,
    vmax: number,
) {
    const { x, y, z } = dims;
    const n = x * y * z;
    const out = new Uint8Array(n);

    const scale = vmax > vmin ? 255.0 / (vmax - vmin) : 1.0;
    for (let i = 0; i < n; i++) {
        const v = values[i] ?? vmin;
        out[i] = Math.max(0, Math.min(255, (v - vmin) * scale));
    }

    const Tex3D = (THREE as any).Data3DTexture || (THREE as any).DataTexture3D;
    const tex = new Tex3D(out, x, y, z);

    tex.format = (THREE as any).RedFormat ?? THREE.RGBFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;

    if ((tex as any).isData3DTexture) {
        (tex as any).internalFormat = "R8";
    }

    return tex as THREE.Data3DTexture;
}

export default function GpuVolumeView({
    values,
    dims,
    spacing,
    rangeMin,
    rangeMax,
    isoMin,
    isoMax,
    opacity,
    colormap,
    onError,
}: GpuVolumeViewProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const uInvModelRef = useRef<THREE.Matrix4 | null>(null);
    const rafRef = useRef<number | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    const [webgl2Ok, setWebgl2Ok] = useState(true);

    const scaleVec = useMemo(() => {
        const sp = spacing ?? [1, 1, 1];
        const dx = dims.x * sp[0];
        const dy = dims.y * sp[1];
        const dz = dims.z * sp[2];
        const m = Math.max(dx, dy, dz) || 1;
        return new THREE.Vector3(dx / m, dy / m, dz / m);
    }, [dims, spacing]);

    const tex = useMemo(() => {
        if (!values?.length) return null;
        return buildUint8Texture(values, dims, rangeMin, rangeMax);
    }, [values, dims, rangeMin, rangeMax]);

    const isoMinNorm = useMemo(() => {
        return rangeMax > rangeMin
            ? (isoMin - rangeMin) / (rangeMax - rangeMin)
            : 0.0;
    }, [isoMin, rangeMin, rangeMax]);

    const isoMaxNorm = useMemo(() => {
        return rangeMax > rangeMin
            ? (isoMax - rangeMin) / (rangeMax - rangeMin)
            : 1.0;
    }, [isoMax, rangeMin, rangeMax]);

    const cmapId = useMemo(() => cmapToId(colormap), [colormap]);

    // Init scene ONCE when texture first appears.
    useEffect(() => {
        if (!tex || !mountRef.current || rendererRef.current) return;

        const mount = mountRef.current;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
        camera.position.set(1.8, 1.2, 1.8);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        renderer.setClearColor(0x000000, 0);
        rendererRef.current = renderer;
        mount.appendChild(renderer.domElement);

        const isWebgl2 = (renderer.capabilities as any).isWebGL2;
        setWebgl2Ok(isWebgl2);
        if (!isWebgl2) {
            onError?.("WebGL2 is required for GPU volume rendering.");
            return;
        }

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.6;
        controls.zoomSpeed = 0.8;

        // Disable OrbitControls wheel listener to avoid passive preventDefault warnings.
        // Disable OrbitControls wheel listener to avoid passive preventDefault warnings.
        controls.enableZoom = false;
        controlsRef.current = controls;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            const camera = cameraRef.current;
            const ctrls = controlsRef.current;
            if (!camera || !ctrls) return;

            const zoomFactor = 1.1;
            const scale = e.deltaY < 0 ? 1 / zoomFactor : zoomFactor;

            // Vector from target to camera
            const dir = new THREE.Vector3()
                .subVectors(camera.position, ctrls.target);

            const dist = dir.length();
            const newDist = Math.max(0.05, dist * scale);

            dir.setLength(newDist);
            camera.position.copy(ctrls.target).add(dir);
            camera.updateProjectionMatrix();

            ctrls.update();
        };

        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });


        const geometry = new THREE.BoxGeometry(1, 1, 1);

        const uInvModel = new THREE.Matrix4();
        uInvModelRef.current = uInvModel;

        const material = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: {
                uTex: { value: tex },
                uIsoMin: { value: isoMinNorm },
                uIsoMax: { value: isoMaxNorm },
                uOpacity: { value: opacity },
                uSteps: { value: 256 },
                uCmap: { value: cmapId },
                uInvModel: { value: uInvModel },
            },
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
        });
        materialRef.current = material;

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.copy(scaleVec);
        meshRef.current = mesh;
        scene.add(mesh);

        const resize = () => {
            const w = mount.clientWidth;
            const h = mount.clientHeight;
            if (w <= 0 || h <= 0) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };

        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(mount);

        const animate = () => {
            if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
            if (meshRef.current && uInvModelRef.current) {
                meshRef.current.updateMatrixWorld();
                uInvModelRef.current.copy(meshRef.current.matrixWorld).invert();
            }
            controls.update();
            renderer.render(scene, camera);
            rafRef.current = requestAnimationFrame(animate);
        };
        animate();

        cleanupRef.current = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            renderer.domElement.removeEventListener("wheel", onWheel);
            controls.dispose();
            geometry.dispose();
            material.dispose();
            tex.dispose();
            scene.clear();
            mount.removeChild(renderer.domElement);
            renderer.dispose();

            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
            controlsRef.current = null;
            meshRef.current = null;
            materialRef.current = null;
            uInvModelRef.current = null;
            rafRef.current = null;
        };
    }, [tex, isoMinNorm, isoMaxNorm, opacity, cmapId, scaleVec, onError]);

    // Dispose everything on unmount only.
    useEffect(() => {
        return () => cleanupRef.current?.();
    }, []);

    // Swap texture on reload WITHOUT resetting camera/controls.
    const prevTexRef = useRef<THREE.Data3DTexture | null>(null);
    useEffect(() => {
        const mat = materialRef.current;
        if (!tex || !mat) return;
        if (prevTexRef.current === tex) return;

        mat.uniforms.uTex.value = tex;
        prevTexRef.current?.dispose();
        prevTexRef.current = tex;
    }, [tex]);

    // Update uniforms live (appearance-only).
    useEffect(() => {
        const mat = materialRef.current;
        if (!mat) return;
        mat.uniforms.uIsoMin.value = isoMinNorm;
        mat.uniforms.uIsoMax.value = isoMaxNorm;
        mat.uniforms.uOpacity.value = opacity;
        mat.uniforms.uCmap.value = cmapId;
    }, [isoMinNorm, isoMaxNorm, opacity, cmapId]);

    // Update scale live.
    useEffect(() => {
        meshRef.current?.scale.copy(scaleVec);
    }, [scaleVec]);

    if (!tex) return <div style={{ width: "100%", height: "100%" }} />;

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {!webgl2Ok && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.92)",
                        zIndex: 2,
                        fontSize: 14,
                    }}
                >
                    WebGL2 is required for GPU volume rendering.
                </div>
            )}
            <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
        </div>
    );
}
