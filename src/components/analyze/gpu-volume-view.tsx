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
  colormap: string;
  shell?: number;
  renderMode?: "volume" | "surface";
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
  uniform vec3 uTexSize;

  uniform float uIsoMin;
  uniform float uIsoMax;
  uniform float uOpacity;
  uniform float uShell;
  uniform int uIsoMode;
  uniform int uSteps;
  uniform int uCmap;
  uniform vec3 uLightDir;

  float sampleD(vec3 uvw) {
    return texture(uTex, uvw).r;
  }

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
    if (uCmap == 1) return vec3(t);
    if (uCmap == 2) return magma(t);
    if (uCmap == 3) return inferno(t);
    if (uCmap == 4) return plasma(t);
    if (uCmap == 5) return cividis(t);
    if (uCmap == 6) return turbo(t);
    return viridis(t);
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
    vec3 texStep = 1.0 / max(uTexSize, vec3(1.0));
    vec3 lightDir = normalize(uLightDir);

    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float tJit = (jitter - 0.5) * dt;

    for (int i = 0; i < 512; i++) {
      if (i >= uSteps) break;

      float tRay = t0 + dt * (float(i) + 0.5) + tJit;
      vec3 p = ro + rd * tRay;
      vec3 uvw = p + 0.5;

      float d = sampleD(uvw);
      float tnorm = clamp((d - uIsoMin) / denom, 0.0, 1.0);

      if (uIsoMode == 0) {
        float band = smoothstep(0.0, 0.02, tnorm) *
                     (1.0 - smoothstep(0.90, 1.0, tnorm));

        if (band > 0.0) {
          vec3 col = cmap(tnorm);

          float ramp = pow(tnorm, 1.6);

          vec3 h = texStep * 2.0;
          float dx = sampleD(uvw + vec3(h.x, 0.0, 0.0)) - sampleD(uvw - vec3(h.x, 0.0, 0.0));
          float dy = sampleD(uvw + vec3(0.0, h.y, 0.0)) - sampleD(uvw - vec3(0.0, h.y, 0.0));
          float dz = sampleD(uvw + vec3(0.0, 0.0, h.z)) - sampleD(uvw - vec3(0.0, 0.0, h.z));
          vec3 grad = vec3(dx, dy, dz);

          float gradMag = length(grad);
          vec3 nrm = gradMag > 1e-6 ? normalize(grad) : vec3(0.0, 0.0, 1.0);

          float ambient = 0.30;
          float diff = max(dot(nrm, lightDir), 0.0);
          vec3 viewDir = normalize(-rd);
          vec3 halfV = normalize(lightDir + viewDir);
          float spec = pow(max(dot(nrm, halfV), 0.0), 32.0);

          col = col * (ambient + (1.0 - ambient) * diff) + spec * 0.15;

          float a = band * ramp * uOpacity * dt * 40.0;
          a = clamp(a, 0.0, 1.0);

          acc.rgb += (1.0 - acc.a) * col * a;
          acc.a   += (1.0 - acc.a) * a;

          if (acc.a > 0.90) break;
        }
      } else {
        float isoLevel = uIsoMax;
        float shellFrac = clamp(uShell, 0.02, 1.0);

        float bandClamped = clamp(denom, 0.02, 0.25);
        float shellHalf = 0.5 * bandClamped * shellFrac;

        float distToIso = abs(d - isoLevel);
        float shell = 1.0 - smoothstep(shellHalf, shellHalf * 1.6, distToIso);

        if (shell > 0.0) {
          vec3 h = texStep * 2.0;
          float dx = sampleD(uvw + vec3(h.x, 0.0, 0.0)) - sampleD(uvw - vec3(h.x, 0.0, 0.0));
          float dy = sampleD(uvw + vec3(0.0, h.y, 0.0)) - sampleD(uvw - vec3(0.0, h.y, 0.0));
          float dz = sampleD(uvw + vec3(0.0, 0.0, h.z)) - sampleD(uvw - vec3(0.0, 0.0, h.z));
          vec3 grad = vec3(dx, dy, dz);

          float gradMag = length(grad);
          vec3 nrm = gradMag > 1e-6 ? normalize(grad) : vec3(0.0, 0.0, 1.0);

          float edge = smoothstep(0.002, 0.03, gradMag);

          vec3 col = cmap(tnorm);

          float ambient = 0.35;
          float diff = max(dot(nrm, lightDir), 0.0);
          vec3 viewDir = normalize(-rd);
          vec3 halfV = normalize(lightDir + viewDir);
          float spec = pow(max(dot(nrm, halfV), 0.0), 48.0);

          col = col * (ambient + (1.0 - ambient) * diff) + spec * 0.2;

          float a = shell * edge * uOpacity * dt * 30.0;
          a = clamp(a, 0.0, 1.0);

          acc.rgb += (1.0 - acc.a) * col * a;
          acc.a   += (1.0 - acc.a) * a;

          if (acc.a > 0.85) break;
        }
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
  return 0;
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
    out[i] = Math.max(0, Math.min(255, Math.round((v - vmin) * scale)));
  }

  const Tex3D = (THREE as any).Data3DTexture as
    | (new (
        data: Uint8Array,
        width: number,
        height: number,
        depth: number,
      ) => THREE.Data3DTexture)
    | undefined;

  if (!Tex3D) {
    throw new Error("Data3DTexture is not available in this Three.js build.");
  }

  const tex = new Tex3D(out, x, y, z);

  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;

  (tex as any).internalFormat = "R8";

  return tex;
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
  shell = 0.12,
  renderMode = "surface",
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

  const prevTexRef = useRef<THREE.Data3DTexture | null>(null);

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
    return rangeMax > rangeMin ? (isoMin - rangeMin) / (rangeMax - rangeMin) : 0.0;
  }, [isoMin, rangeMin, rangeMax]);

  const isoMaxNorm = useMemo(() => {
    return rangeMax > rangeMin ? (isoMax - rangeMin) / (rangeMax - rangeMin) : 1.0;
  }, [isoMax, rangeMin, rangeMax]);

  const cmapId = useMemo(() => cmapToId(colormap), [colormap]);

  const shellClamped = useMemo(() => Math.max(0.02, Math.min(1, shell)), [shell]);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const isWebgl2 = (renderer.capabilities as any).isWebGL2;
    setWebgl2Ok(isWebgl2);

    if (!isWebgl2) {
      onError?.("WebGL2 is required for GPU volume rendering.");

      cleanupRef.current = () => {
        if (renderer.domElement.parentElement === mount) {
          mount.removeChild(renderer.domElement);
        }
        renderer.dispose();
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
      };
      return;
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.9;
    controls.screenSpacePanning = true;
    controls.zoomSpeed = 1.0;
    controls.enableZoom = false;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.minDistance = 0.12;
    controls.maxDistance = 8.0;
    controls.update();
    controlsRef.current = controls;

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const uInvModel = new THREE.Matrix4();
    uInvModelRef.current = uInvModel;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: tex },
        uTexSize: { value: new THREE.Vector3(dims.x, dims.y, dims.z) },
        uIsoMin: { value: isoMinNorm },
        uIsoMax: { value: isoMaxNorm },
        uOpacity: { value: opacity },
        uShell: { value: shellClamped },
        uIsoMode: { value: renderMode === "volume" ? 0 : 1 },
        uSteps: { value: 256 },
        uCmap: { value: cmapId },
        uInvModel: { value: uInvModel },
        uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
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

    const clock = new THREE.Clock();

    const zoomState = {
      targetDistance: 0,
      hasTarget: false,
    };

    const interactionState = {
      isDragging: false,
      lastWheelAt: 0,
      dprApplied: -1,
    };

    const tmpDir = new THREE.Vector3();
    const tmpCamDir = new THREE.Vector3();
    const tmpTarget = new THREE.Vector3();

    const baseDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    const setRendererQuality = (force = false) => {
      const now = performance.now();
      const wheelActive = now - interactionState.lastWheelAt < 160;
      const interactionActive = interactionState.isDragging || wheelActive;
      const desiredDpr = interactionActive ? Math.min(baseDpr, 1.25) : baseDpr;

      if (!force && Math.abs(desiredDpr - interactionState.dprApplied) < 1e-6) {
        return;
      }

      interactionState.dprApplied = desiredDpr;
      renderer.setPixelRatio(desiredDpr);

      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w > 0 && h > 0) {
        renderer.setSize(w, h, false);
      }
    };

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w <= 0 || h <= 0) return;
      setRendererQuality(true);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    controls.addEventListener("start", () => {
      interactionState.isDragging = true;
    });
    controls.addEventListener("end", () => {
      interactionState.isDragging = false;
    });

    const onPointerDown = () => {
      interactionState.isDragging = true;
    };
    const onPointerUp = () => {
      interactionState.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const cam = cameraRef.current;
      const ctrls = controlsRef.current;
      if (!cam || !ctrls) return;

      interactionState.lastWheelAt = performance.now();

      tmpDir.copy(cam.position).sub(ctrls.target);
      let currentDistance = tmpDir.length();
      if (!Number.isFinite(currentDistance) || currentDistance <= 1e-6) {
        currentDistance = 1;
        tmpDir.set(1, 0, 0);
      }

      if (!zoomState.hasTarget) {
        zoomState.targetDistance = currentDistance;
        zoomState.hasTarget = true;
      }

      const deltaNormalized =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * 120
            : e.deltaY;

      const deltaClamped = Math.max(-240, Math.min(240, deltaNormalized));

      const zoomSensitivity = 0.0016;
      const factor = Math.exp(deltaClamped * zoomSensitivity);

      zoomState.targetDistance = clampFloat(
        zoomState.targetDistance * factor,
        ctrls.minDistance,
        ctrls.maxDistance,
      );
    };

    const onDoubleClick = () => {
      const cam = cameraRef.current;
      const ctrls = controlsRef.current;
      if (!cam || !ctrls) return;

      ctrls.target.set(0, 0, 0);
      cam.position.set(1.8, 1.2, 1.8);
      cam.updateProjectionMatrix();
      zoomState.hasTarget = false;
      ctrls.update();
    };

    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);

    resize();

    const animate = () => {
      const rendererNow = rendererRef.current;
      const sceneNow = sceneRef.current;
      const cameraNow = cameraRef.current;
      const controlsNow = controlsRef.current;
      if (!rendererNow || !sceneNow || !cameraNow || !controlsNow) return;

      const dt = Math.min(0.05, clock.getDelta());

      setRendererQuality(false);

      controlsNow.update();

      if (zoomState.hasTarget) {
        tmpCamDir.copy(cameraNow.position).sub(controlsNow.target);
        let distance = tmpCamDir.length();

        if (distance > 1e-6) {
          const targetDistance = clampFloat(
            zoomState.targetDistance,
            controlsNow.minDistance,
            controlsNow.maxDistance,
          );
          const smoothLambda = 14;
          const alpha = 1 - Math.exp(-smoothLambda * dt);
          const nextDistance = distance + (targetDistance - distance) * alpha;

          tmpCamDir.setLength(nextDistance);
          tmpTarget.copy(controlsNow.target);
          cameraNow.position.copy(tmpTarget).add(tmpCamDir);
          cameraNow.updateProjectionMatrix();

          if (Math.abs(targetDistance - nextDistance) < 0.0005) {
            zoomState.targetDistance = targetDistance;
          }
        } else {
          zoomState.hasTarget = false;
        }
      }

      if (meshRef.current && uInvModelRef.current) {
        meshRef.current.updateMatrixWorld();
        uInvModelRef.current.copy(meshRef.current.matrixWorld).invert();
      }

      rendererNow.render(sceneNow, cameraNow);
      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    cleanupRef.current = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }

      ro.disconnect();

      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);

      controls.dispose();
      geometry.dispose();
      material.dispose();

      if (prevTexRef.current) {
        try {
          prevTexRef.current.dispose();
        } catch {
          // Ignore dispose errors.
        }
        prevTexRef.current = null;
      }

      scene.clear();

      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }

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
  }, [
    tex,
    scaleVec,
    dims,
    onError,
    renderMode,
    shellClamped,
    isoMinNorm,
    isoMaxNorm,
    opacity,
    cmapId,
  ]);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  useEffect(() => {
    const mat = materialRef.current;
    if (!tex || !mat) return;
    if (prevTexRef.current === tex) return;

    mat.uniforms.uTex.value = tex;
    mat.uniforms.uTexSize.value.set(dims.x, dims.y, dims.z);

    if (prevTexRef.current) {
      try {
        prevTexRef.current.dispose();
      } catch {
        // Ignore dispose errors.
      }
    }
    prevTexRef.current = tex;
  }, [tex, dims]);

  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uIsoMin.value = isoMinNorm;
    mat.uniforms.uIsoMax.value = isoMaxNorm;
    mat.uniforms.uOpacity.value = opacity;
    mat.uniforms.uShell.value = shellClamped;
    mat.uniforms.uCmap.value = cmapId;
    mat.uniforms.uIsoMode.value = renderMode === "volume" ? 0 : 1;
  }, [isoMinNorm, isoMaxNorm, opacity, shellClamped, cmapId, renderMode]);

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

function clampFloat(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}