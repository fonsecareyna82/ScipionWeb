import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
    MESH_LIGHTING_PRESETS,
    buildGeometricVertexColors,
    colormapCssGradient,
    fitMeshInView,
    meshUnitLength,
} from "../../analyze/mesh-render-style";

// A box from -1 to 1 in X, -0.5 to 0.5 in Y and Z, as its 8 corners.
const box = new Float32Array([
    -1, -0.5, -0.5, 1, -0.5, -0.5, -1, 0.5, -0.5, 1, 0.5, -0.5,
    -1, -0.5, 0.5, 1, -0.5, 0.5, -1, 0.5, 0.5, 1, 0.5, 0.5,
]);

describe("mesh render style", () => {
    it("fits the whole mesh in view with a margin", () => {
        const fit = fitMeshInView(box, new THREE.Quaternion(), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), 35, 1, 1);
        expect(fit).not.toBeNull();
        // Seen along -Z on a square view, the X extent (half width 1) decides.
        expect(fit!.halfHeight).toBeCloseTo(1);
        const tan = Math.tan(THREE.MathUtils.degToRad(17.5));
        expect(fit!.distance).toBeCloseTo(1 / tan + 0.5);
        expect(fit!.target.length()).toBeCloseTo(0);

        const wide = fitMeshInView(box, new THREE.Quaternion(), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), 35, 4, 1);
        expect(wide!.halfHeight).toBeCloseTo(0.5);
    });

    it("follows the rotation of the mesh", () => {
        const quarterTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        const fit = fitMeshInView(box, quarterTurn, new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), 35, 4, 1);
        // The long side is now vertical.
        expect(fit!.halfHeight).toBeCloseTo(1);
    });

    it("colors by distance from the center and by height", () => {
        const vertices = new Float32Array([0, 0, 0, 0, 1, 0, 0, -2, 0]);
        const radial = buildGeometricVertexColors(vertices, "radial", "gray")!;
        expect([radial.min, radial.max]).toEqual([0, 2]);
        // The center is the darkest, the farthest vertex the lightest.
        expect(radial.colors[0]).toBeLessThan(radial.colors[3]);
        expect(radial.colors[3]).toBeLessThan(radial.colors[6]);

        const height = buildGeometricVertexColors(vertices, "height", "gray")!;
        expect([height.min, height.max]).toEqual([-2, 1]);
        expect(height.colors[6]).toBeLessThan(height.colors[0]);
        expect(height.colors[0]).toBeLessThan(height.colors[3]);
        expect(buildGeometricVertexColors(new Float32Array(), "radial", "gray")).toBeNull();
    });

    it("measures a mesh unit in the original volume", () => {
        // Scaled by 64 voxels of a volume reduced from 256 to 128.
        expect(meshUnitLength({ scale: 64, dims: [128, 128, 128], sourceDims: [256, 256, 256] }, 1.5)).toBe(192);
        expect(meshUnitLength({ scale: 64 }, 2)).toBe(128);
        expect(meshUnitLength({}, 2)).toBeNull();
    });

    it("has a CSS gradient for the legend and flat lighting without shading", () => {
        expect(colormapCssGradient("gray")).toBe("linear-gradient(to right, #111111 0%, #f3f4f6 100%)");
        expect(MESH_LIGHTING_PRESETS.flat).toMatchObject({ key: 0, fill: 0, rim: 0, occlusion: 0 });
    });
});
