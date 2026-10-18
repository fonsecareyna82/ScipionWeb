// Isosurface of a volume computed in the browser (naive surface nets): one
// vertex per cell the surface crosses, at the mean of its edge crossings, and
// one quad per crossed edge. Fast enough to follow a threshold slider; the API
// computes the final surface with marching cubes when the slider is released.
//
// The vertices use the frame of the API meshes: centered on the box of the
// volume and scaled by its largest side, so both surfaces line up.

export type SurfaceGrid = {
    values: ArrayLike<number>;
    dims: { x: number; y: number; z: number };
    // zyx: x varies fastest (a C array of shape z, y, x).
    order: "zyx" | "xyz";
};

export type SurfaceNetsMesh = {
    vertices: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
};

// The 12 edges of a cell as pairs of corners (corner bits: 1 x, 2 y, 4 z).
const CUBE_EDGES = (() => {
    const edges: number[] = [];
    for (let corner = 0; corner < 8; corner++) {
        for (const axisBit of [1, 2, 4]) {
            const other = corner ^ axisBit;
            if (corner <= other) edges.push(corner, other);
        }
    }
    return new Int32Array(edges);
})();

// For each inside/outside pattern of the 8 corners, the edges it crosses.
const EDGE_TABLE = (() => {
    const table = new Int32Array(256);
    for (let mask = 0; mask < 256; mask++) {
        let edgeMask = 0;
        for (let edge = 0; edge < 12; edge++) {
            const a = (mask >> CUBE_EDGES[2 * edge]) & 1;
            const b = (mask >> CUBE_EDGES[2 * edge + 1]) & 1;
            if (a !== b) edgeMask |= 1 << edge;
        }
        table[mask] = edgeMask;
    }
    return table;
})();

class GrowingFloats {
    data = new Float32Array(3 * 4096);
    length = 0;
    push3(a: number, b: number, c: number) {
        if (this.length + 3 > this.data.length) {
            const larger = new Float32Array(this.data.length * 2);
            larger.set(this.data);
            this.data = larger;
        }
        this.data[this.length++] = a;
        this.data[this.length++] = b;
        this.data[this.length++] = c;
    }
}

class GrowingIndices {
    data = new Uint32Array(6 * 4096);
    length = 0;
    push3(a: number, b: number, c: number) {
        if (this.length + 3 > this.data.length) {
            const larger = new Uint32Array(this.data.length * 2);
            larger.set(this.data);
            this.data = larger;
        }
        this.data[this.length++] = a;
        this.data[this.length++] = b;
        this.data[this.length++] = c;
    }
}

// The surface where the volume crosses level, with the density inside it
// (values above level). Normals point out of the density.
export function surfaceNets(grid: SurfaceGrid, level: number): SurfaceNetsMesh {
    const nx = grid.dims.x;
    const ny = grid.dims.y;
    const nz = grid.dims.z;
    const values = grid.values;
    const vertices = new GrowingFloats();
    const normals = new GrowingFloats();
    const indices = new GrowingIndices();
    if (nx < 2 || ny < 2 || nz < 2 || values.length < nx * ny * nz || !Number.isFinite(level)) {
        return { vertices: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };
    }

    const sx = grid.order === "xyz" ? ny * nz : 1;
    const sy = grid.order === "xyz" ? nz : nx;
    const sz = grid.order === "xyz" ? 1 : nx * ny;
    const cornerOffsets = new Int32Array(8);
    for (let corner = 0; corner < 8; corner++) {
        cornerOffsets[corner] = (corner & 1 ? sx : 0) + (corner & 2 ? sy : 0) + (corner & 4 ? sz : 0);
    }

    const scale = Math.max(nx, ny, nz);
    const centerX = nx / 2 - 0.5;
    const centerY = ny / 2 - 0.5;
    const centerZ = nz / 2 - 0.5;

    // Vertex of each cell in the current and previous z layers of cells.
    const cellsX = nx - 1;
    const cellsY = ny - 1;
    const layerSize = cellsX * cellsY;
    let currentLayer = new Int32Array(layerSize).fill(-1);
    let previousLayer = new Int32Array(layerSize).fill(-1);
    const corners = new Float64Array(8);
    const position = [0, 0, 0];

    for (let z = 0; z < nz - 1; z++) {
        [currentLayer, previousLayer] = [previousLayer, currentLayer];
        currentLayer.fill(-1);
        for (let y = 0; y < ny - 1; y++) {
            for (let x = 0; x < nx - 1; x++) {
                const base = x * sx + y * sy + z * sz;
                let mask = 0;
                for (let corner = 0; corner < 8; corner++) {
                    const value = values[base + cornerOffsets[corner]];
                    corners[corner] = value;
                    if (value > level) mask |= 1 << corner;
                }
                if (mask === 0 || mask === 0xff) continue;

                const edgeMask = EDGE_TABLE[mask];
                position[0] = 0;
                position[1] = 0;
                position[2] = 0;
                let crossings = 0;
                for (let edge = 0; edge < 12; edge++) {
                    if (!(edgeMask & (1 << edge))) continue;
                    const a = CUBE_EDGES[2 * edge];
                    const b = CUBE_EDGES[2 * edge + 1];
                    const delta = corners[b] - corners[a];
                    const t = delta !== 0 ? (level - corners[a]) / delta : 0.5;
                    for (let axis = 0; axis < 3; axis++) {
                        const bit = 1 << axis;
                        const fromA = a & bit ? 1 : 0;
                        const fromB = b & bit ? 1 : 0;
                        position[axis] += fromA + (fromB - fromA) * t;
                    }
                    crossings++;
                }

                // Gradient of the cell; the normal points to lower density.
                const gx = (corners[1] - corners[0]) + (corners[3] - corners[2]) + (corners[5] - corners[4]) + (corners[7] - corners[6]);
                const gy = (corners[2] - corners[0]) + (corners[3] - corners[1]) + (corners[6] - corners[4]) + (corners[7] - corners[5]);
                const gz = (corners[4] - corners[0]) + (corners[5] - corners[1]) + (corners[6] - corners[2]) + (corners[7] - corners[3]);
                const length = Math.hypot(gx, gy, gz) || 1;

                const vertexIndex = vertices.length / 3;
                vertices.push3(
                    (x + position[0] / crossings - centerX) / scale,
                    (y + position[1] / crossings - centerY) / scale,
                    (z + position[2] / crossings - centerZ) / scale,
                );
                normals.push3(-gx / length, -gy / length, -gz / length);
                currentLayer[x + y * cellsX] = vertexIndex;

                // A quad around each of the three edges leaving corner 0 that
                // the surface crosses, joining the four cells around it.
                for (let axis = 0; axis < 3; axis++) {
                    if (!(edgeMask & (1 << axis))) continue;
                    const u = (axis + 1) % 3;
                    const v = (axis + 2) % 3;
                    const cell = [x, y, z];
                    if (cell[u] === 0 || cell[v] === 0) continue;
                    const lookup = (du: number, dv: number) => {
                        const at = [x, y, z];
                        at[u] -= du;
                        at[v] -= dv;
                        const layer = at[2] === z ? currentLayer : previousLayer;
                        return layer[at[0] + at[1] * cellsX];
                    };
                    const a = vertexIndex;
                    const b = lookup(1, 0);
                    const c = lookup(1, 1);
                    const d = lookup(0, 1);
                    if (b < 0 || c < 0 || d < 0) continue;
                    // Corner 0 inside: the density is behind the quad along +axis.
                    if (mask & 1) {
                        indices.push3(a, b, c);
                        indices.push3(a, c, d);
                    } else {
                        indices.push3(a, c, b);
                        indices.push3(a, d, c);
                    }
                }
            }
        }
    }

    const mesh = {
        vertices: vertices.data.slice(0, vertices.length),
        normals: normals.data.slice(0, normals.length),
        indices: indices.data.slice(0, indices.length),
    };
    orientTriangles(mesh);
    return mesh;
}

// Turns every triangle to face where its vertex normals point, so that the
// front faces look out of the density.
function orientTriangles(mesh: SurfaceNetsMesh) {
    const { vertices: p, normals: n, indices } = mesh;
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3;
        const b = indices[i + 1] * 3;
        const c = indices[i + 2] * 3;
        const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
        const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
        const fx = aby * acz - abz * acy;
        const fy = abz * acx - abx * acz;
        const fz = abx * acy - aby * acx;
        const nx = n[a] + n[b] + n[c];
        const ny = n[a + 1] + n[b + 1] + n[c + 1];
        const nz = n[a + 2] + n[b + 2] + n[c + 2];
        if (fx * nx + fy * ny + fz * nz < 0) {
            const swap = indices[i + 1];
            indices[i + 1] = indices[i + 2];
            indices[i + 2] = swap;
        }
    }
}
