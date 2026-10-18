import { describe, expect, it, vi } from "vitest";
import { SliceUrlCache, encodeBmp8, extractSlice, slicePalette } from "../../analyze/tomogram-slices";

// A 4 x 3 x 2 volume (x, y, z) whose voxel holds 100z + 10y + x.
function makeVolume(binning: [number, number, number] = [1, 1, 1]) {
    const width = 4, height = 3, depth = 2;
    const data = new Uint8Array(width * height * depth);
    for (let z = 0; z < depth; z++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        data[z * width * height + y * width + x] = 100 * z + 10 * y + x;
    }
    return {
        width, height, depth, origWidth: width * binning[0], origHeight: height * binning[1], origDepth: depth * binning[2],
        binning, mean: 128, std: 20, low: 28, high: 228, data,
    };
}

describe("tomogram slices", () => {
    it("cuts each axis as the API does", () => {
        const volume = makeVolume();
        // z: rows y, columns x.
        expect(Array.from(extractSlice(volume, "z", 1).data)).toEqual([100, 101, 102, 103, 110, 111, 112, 113, 120, 121, 122, 123]);
        // y: rows z, columns x.
        expect(extractSlice(volume, "y", 2)).toMatchObject({ width: 4, height: 2 });
        expect(Array.from(extractSlice(volume, "y", 2).data)).toEqual([20, 21, 22, 23, 120, 121, 122, 123]);
        // x: rows z, columns y.
        expect(extractSlice(volume, "x", 3)).toMatchObject({ width: 3, height: 2 });
        expect(Array.from(extractSlice(volume, "x", 3).data)).toEqual([3, 13, 23, 103, 113, 123]);
    });

    it("maps original indices onto the reduced volume", () => {
        const volume = makeVolume([2, 2, 4]);
        expect(Array.from(extractSlice(volume, "z", 5).data)[0]).toBe(100);
        expect(Array.from(extractSlice(volume, "x", 7).data)[0]).toBe(3);
        expect(Array.from(extractSlice(volume, "z", 99).data)[0]).toBe(100);
    });

    it("shows mean +/- 2 standard deviations from black to white", () => {
        const palette = slicePalette(makeVolume(), "gray");
        const levelOf = (value: number) => Math.round(((value - 28) / 200) * 255);
        expect(palette[levelOf(128) * 3]).toBeGreaterThan(120);
        expect(palette[levelOf(128) * 3]).toBeLessThan(140);
        expect(palette[levelOf(88) * 3]).toBeLessThan(25);
        expect(palette[levelOf(168) * 3]).toBeGreaterThan(235);
    });

    it("writes a top-down paletted BMP with padded rows", () => {
        const palette = new Uint8Array(256 * 3).map((_, i) => i % 256);
        const bmp = encodeBmp8({ width: 3, height: 2, data: new Uint8Array([1, 2, 3, 4, 5, 6]) }, palette);
        const view = new DataView(bmp.buffer);
        expect(String.fromCharCode(bmp[0], bmp[1])).toBe("BM");
        expect(view.getInt32(18, true)).toBe(3);
        expect(view.getInt32(22, true)).toBe(-2);
        expect(view.getUint16(28, true)).toBe(8);
        const offset = view.getUint32(10, true);
        expect(Array.from(bmp.subarray(offset, offset + 8))).toEqual([1, 2, 3, 0, 4, 5, 6, 0]);
        expect(bmp.length).toBe(offset + 8);
    });

    it("keeps one URL per slice and revokes the oldest", () => {
        const created: string[] = [];
        const revoke = vi.fn();
        const createObjectURL = vi.fn(() => {
            created.push(`blob:${created.length}`);
            return created[created.length - 1];
        });
        Object.assign(URL, { createObjectURL, revokeObjectURL: revoke });
        const cache = new SliceUrlCache(2);
        const volume = makeVolume();
        const palette = slicePalette(volume, "gray");

        const first = cache.get(volume, palette, "z", 0);
        expect(cache.get(volume, palette, "z", 0)).toBe(first);
        cache.get(volume, palette, "z", 1);
        cache.get(volume, palette, "y", 0);

        expect(createObjectURL).toHaveBeenCalledTimes(3);
        expect(revoke).toHaveBeenCalledWith(first);
    });
});
