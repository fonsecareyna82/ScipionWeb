import { describe, expect, it } from "vitest";
import { surfaceNets } from "../../analyze/surface-nets";

// A ball of radius r (voxels) centered at (cx, cy, cz), stored zyx.
function ball(n: number, r: number, cx = (n - 1) / 2, cy = (n - 1) / 2, cz = (n - 1) / 2) {
    const values = new Float32Array(n * n * n);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        values[x + n * (y + n * z)] = r - Math.hypot(x - cx, y - cy, z - cz);
    }
    return { values, dims: { x: n, y: n, z: n }, order: "zyx" as const };
}

describe("surface nets", () => {
    it("builds a closed surface of the ball in the frame of the box", () => {
        const n = 24;
        const mesh = surfaceNets(ball(n, 7), 0);
        const vertexCount = mesh.vertices.length / 3;
        expect(vertexCount).toBeGreaterThan(100);

        for (let i = 0; i < vertexCount; i++) {
            const radius = Math.hypot(mesh.vertices[3 * i], mesh.vertices[3 * i + 1], mesh.vertices[3 * i + 2]) * n;
            expect(Math.abs(radius - 7)).toBeLessThan(0.6);
        }

        // Every edge is shared by exactly two triangles, in opposite directions.
        const edges = new Map<string, number>();
        for (let i = 0; i < mesh.indices.length; i += 3) {
            for (let k = 0; k < 3; k++) {
                const a = mesh.indices[i + k];
                const b = mesh.indices[i + (k + 1) % 3];
                edges.set(`${a}-${b}`, (edges.get(`${a}-${b}`) ?? 0) + 1);
            }
        }
        for (const [edge, count] of edges) {
            const [a, b] = edge.split("-");
            expect(count).toBe(1);
            expect(edges.get(`${b}-${a}`)).toBe(1);
        }
    });

    it("points the normals and the triangles out of the density", () => {
        const mesh = surfaceNets(ball(20, 6), 0);
        const p = mesh.vertices;
        for (let i = 0; i < p.length; i += 3) {
            expect(p[i] * mesh.normals[i] + p[i + 1] * mesh.normals[i + 1] + p[i + 2] * mesh.normals[i + 2]).toBeGreaterThan(0);
        }
        let outward = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const [a, b, c] = [mesh.indices[i] * 3, mesh.indices[i + 1] * 3, mesh.indices[i + 2] * 3];
            const ab = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
            const ac = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
            const face = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
            if (face[0] * p[a] + face[1] * p[a + 1] + face[2] * p[a + 2] > 0) outward++;
        }
        expect(outward).toBe(mesh.indices.length / 3);
    });

    it("keeps the place of the density in the box and reads both layouts", () => {
        const n = 20;
        const offCenter = ball(n, 4, 14.5, 9.5, 9.5);
        const zyx = surfaceNets(offCenter, 0);
        let meanX = 0;
        for (let i = 0; i < zyx.vertices.length; i += 3) meanX += zyx.vertices[i];
        expect(meanX / (zyx.vertices.length / 3)).toBeCloseTo(5 / n, 2);

        // The same volume stored with z varying fastest.
        const xyz = new Float32Array(n * n * n);
        for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            xyz[z + n * (y + n * x)] = offCenter.values[x + n * (y + n * z)];
        }
        const other = surfaceNets({ values: xyz, dims: offCenter.dims, order: "xyz" }, 0);
        expect(other.vertices.length).toBe(zyx.vertices.length);
    });

    it("returns an empty surface when the level misses the volume", () => {
        expect(surfaceNets(ball(10, 3), 100).indices.length).toBe(0);
        expect(surfaceNets(ball(10, 3), Number.NaN).indices.length).toBe(0);
    });
});
