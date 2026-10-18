// Solid caps where the clipping planes cut a closed surface, so a clipped map
// shows its section instead of its hollow inside. For each plane, the back
// faces of the surface add one to the stencil and its front faces take one
// away: the stencil is not zero where the plane is inside the surface, and the
// cap is drawn there (the technique of the three.js stencil clipping example).
import * as THREE from "three";

// The caps render before the scene, one plane after the other.
const FIRST_RENDER_ORDER = -100;
// Side of the cap planes, larger than any mesh (they fit in a unit box).
const CAP_SIZE = 4;

export type ClippingCaps = {
    // Shows the caps of the planes that cut something (false for the others).
    setActive(enabled: boolean, activePlanes: boolean[]): void;
    setGeometry(geometry: THREE.BufferGeometry): void;
    setColor(color: THREE.Color): void;
    // Places the caps on the clipping planes (world space), every frame.
    update(): void;
    dispose(): void;
};

export function createClippingCaps(
    planes: THREE.Plane[],
    // The parent of the surface, so the stencil meshes move with it.
    surfaceParent: THREE.Object3D,
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
): ClippingCaps {
    const stencilMeshes: THREE.Mesh[] = [];
    const caps: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhongMaterial>[] = [];
    const capGeometry = new THREE.PlaneGeometry(CAP_SIZE, CAP_SIZE);

    planes.forEach((plane, index) => {
        const base = {
            depthWrite: false,
            depthTest: false,
            colorWrite: false,
            stencilWrite: true,
            stencilFunc: THREE.AlwaysStencilFunc,
            clippingPlanes: [plane],
        };
        const back = new THREE.MeshBasicMaterial({
            ...base,
            side: THREE.BackSide,
            stencilFail: THREE.IncrementWrapStencilOp,
            stencilZFail: THREE.IncrementWrapStencilOp,
            stencilZPass: THREE.IncrementWrapStencilOp,
        });
        const front = new THREE.MeshBasicMaterial({
            ...base,
            side: THREE.FrontSide,
            stencilFail: THREE.DecrementWrapStencilOp,
            stencilZFail: THREE.DecrementWrapStencilOp,
            stencilZPass: THREE.DecrementWrapStencilOp,
        });
        for (const material of [back, front]) {
            const stencilMesh = new THREE.Mesh(geometry, material);
            stencilMesh.renderOrder = FIRST_RENDER_ORDER + 3 * index;
            stencilMesh.userData.outlineHidden = true;
            stencilMesh.userData.clippingCap = true;
            stencilMesh.visible = false;
            stencilMeshes.push(stencilMesh);
            surfaceParent.add(stencilMesh);
        }

        const cap = new THREE.Mesh(
            capGeometry,
            new THREE.MeshPhongMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
                clippingPlanes: planes.filter((other) => other !== plane),
                stencilWrite: true,
                stencilRef: 0,
                stencilFunc: THREE.NotEqualStencilFunc,
                stencilFail: THREE.ReplaceStencilOp,
                stencilZFail: THREE.ReplaceStencilOp,
                stencilZPass: THREE.ReplaceStencilOp,
            }),
        );
        cap.renderOrder = FIRST_RENDER_ORDER + 3 * index + 1;
        cap.userData.outlineHidden = true;
        cap.userData.clippingCap = true;
        cap.visible = false;
        // The next plane starts from a clean stencil.
        cap.onAfterRender = (renderer) => renderer.clearStencil();
        caps.push(cap);
        scene.add(cap);
    });

    const target = new THREE.Vector3();

    return {
        setActive(enabled, activePlanes) {
            planes.forEach((_, index) => {
                // three.js hides only what is exactly false.
                const visible = Boolean(enabled && activePlanes[index]);
                caps[index].visible = visible;
                stencilMeshes[2 * index].visible = visible;
                stencilMeshes[2 * index + 1].visible = visible;
            });
        },
        setGeometry(next) {
            stencilMeshes.forEach((stencilMesh) => { stencilMesh.geometry = next; });
        },
        setColor(color) {
            caps.forEach((cap) => cap.material.color.copy(color));
        },
        update() {
            planes.forEach((plane, index) => {
                const cap = caps[index];
                if (!cap.visible) return;
                plane.coplanarPoint(cap.position);
                // The cap faces the side the plane removes, where it is seen from.
                cap.lookAt(target.copy(cap.position).sub(plane.normal));
            });
        },
        dispose() {
            stencilMeshes.forEach((stencilMesh) => {
                surfaceParent.remove(stencilMesh);
                (stencilMesh.material as THREE.Material).dispose();
            });
            caps.forEach((cap) => {
                scene.remove(cap);
                cap.material.dispose();
            });
            capGeometry.dispose();
        },
    };
}
