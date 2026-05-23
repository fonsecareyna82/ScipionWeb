import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { VolumeSurfaceMesh } from "@/services/ProjectService";

export type MeshVolumeViewProps = {
    mesh: VolumeSurfaceMesh;
    opacity?: number;
    colormap?: string;
    autoRotate?: boolean;
    displayMode?: "surface" | "mesh";
    autoRotateSpeed?: number;
    onError?: (message: string) => void;
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

export default function MeshVolumeView({
    mesh,
    opacity = 1,
    displayMode = "surface",
    colormap = "gray",
    autoRotate = false,
    autoRotateSpeed = 3.8,
    onError,
}: MeshVolumeViewProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const autoRotateRef = useRef(autoRotate);
    const autoRotateSpeedRef = useRef(autoRotateSpeed);

    const onErrorRef = useRef(onError);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        const material = materialRef.current;
        if (!material) return;

        material.color.copy(colorFromColormap(colormap));
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.wireframe = displayMode === "mesh";
        material.needsUpdate = true;
    }, [colormap, opacity, displayMode]);

    useEffect(() => {
        autoRotateRef.current = autoRotate;
    }, [autoRotate]);

    useEffect(() => {
        autoRotateSpeedRef.current = autoRotateSpeed;
    }, [autoRotateSpeed]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        if (!mesh?.vertices?.length || !mesh?.indices?.length) {
            onErrorRef.current?.("Surface mesh is empty.");
            return;
        }

        let renderer: THREE.WebGLRenderer | null = null;
        let frameId = 0;

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
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.rotateSpeed = 0.75;
            controls.zoomSpeed = 0.85;
            controls.panSpeed = 0.55;

            controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
            };

            controls.touches = {
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN,
            };
            controls.target.set(0, 0, 0);

            const stopViewerEvent = (event: Event) => {
                event.stopPropagation();

                if (event.type === "contextmenu") {
                    event.preventDefault();
                }
            };

            const viewerEvents = [
                "pointerdown",
                "pointermove",
                "pointerup",
                "pointercancel",
                "wheel",
                "contextmenu",
            ] as const;

            viewerEvents.forEach((eventName) => {
                host.addEventListener(eventName, stopViewerEvent, { passive: false });
            });

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

            const material = new THREE.MeshStandardMaterial({
                color: colorFromColormap(colormap),
                roughness: 0.78,
                metalness: 0.02,
                transparent: opacity < 1,
                opacity,
                wireframe: displayMode === "mesh",
                side: THREE.DoubleSide,
            });

            materialRef.current = material;

            const surface = new THREE.Mesh(geometry, material);
            scene.add(surface);

            const ambient = new THREE.AmbientLight(0xffffff, 0.55);
            scene.add(ambient);

            const key = new THREE.DirectionalLight(0xffffff, 1.2);
            key.position.set(1.5, -2.0, 2.0);
            scene.add(key);

            const fill = new THREE.DirectionalLight(0xffffff, 0.45);
            fill.position.set(-2.0, 1.5, -1.0);
            scene.add(fill);

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
            camera.position.set(radius * 1.15, -radius * 2.0, radius * 1.15);
            camera.updateProjectionMatrix();

            controls.target.copy(sphere?.center ?? new THREE.Vector3(0, 0, 0));
            controls.update();

            const clock = new THREE.Clock();

            const animate = () => {
                frameId = window.requestAnimationFrame(animate);

                const dt = clock.getDelta();
                if (autoRotateRef.current) {
                    surface.rotation.z += dt * (autoRotateSpeedRef.current / 10);
                }

                controls.update();
                renderer?.render(scene, camera);
            };

            animate();

            return () => {
                window.cancelAnimationFrame(frameId);
                observer.disconnect();

                viewerEvents.forEach((eventName) => {
                    host.removeEventListener(eventName, stopViewerEvent);
                });

                host.style.cursor = "";
                host.style.touchAction = "";

                controls.dispose();
                disposeObject3d(scene);
                renderer?.dispose();

                if (renderer?.domElement.parentElement === host) {
                    host.removeChild(renderer.domElement);
                }
                materialRef.current = null;
            };
        } catch (error: any) {
            renderer?.dispose();
            onErrorRef.current?.(error?.message || "Failed to render surface mesh.");
        }

    }, [mesh]);

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