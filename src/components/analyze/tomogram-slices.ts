// Slices of a tomogram cut in the browser from its reduced volume
// (TomogramVolumeStack): instant for any axis and index, one contrast for the
// whole tomogram. They become small paletted BMP images, so the viewers keep
// showing them as image URLs (SVG images, plane textures) as before.
import type { TomogramVolumeStack } from "@/services/ProjectService";
import { colormapStops } from "./mesh-render-style";

export type SliceAxis = "x" | "y" | "z";

// The slices show mean +/- this many standard deviations, as the previews do.
export const SLICE_WINDOW_SIGMAS = 2;

export type TomogramSlice = {
    width: number;
    height: number;
    // Row by row: for z rows are y and columns x; for y rows are z and
    // columns x; for x rows are z and columns y (as the API cuts them).
    data: Uint8Array;
};

function reducedIndex(volume: TomogramVolumeStack, axis: SliceAxis, index: number): number {
    const [bx, by, bz] = volume.binning;
    const [binning, count] = axis === "z" ? [bz, volume.depth] : axis === "y" ? [by, volume.height] : [bx, volume.width];
    return Math.min(count - 1, Math.max(0, Math.floor(index / Math.max(1, binning))));
}

// The slice at an index of the original tomogram.
export function extractSlice(volume: TomogramVolumeStack, axis: SliceAxis, index: number): TomogramSlice {
    const { width: w, height: h, depth: d, data } = volume;
    const r = reducedIndex(volume, axis, index);
    if (axis === "z") {
        return { width: w, height: h, data: data.subarray(r * w * h, (r + 1) * w * h) };
    }
    if (axis === "y") {
        const out = new Uint8Array(w * d);
        for (let z = 0; z < d; z++) {
            const start = z * w * h + r * w;
            out.set(data.subarray(start, start + w), z * w);
        }
        return { width: w, height: d, data: out };
    }
    const out = new Uint8Array(h * d);
    for (let z = 0; z < d; z++) {
        const plane = z * w * h + r;
        const row = z * h;
        for (let y = 0; y < h; y++) out[row + y] = data[plane + y * w];
    }
    return { width: h, height: d, data: out };
}

// RGB (256 x 3) of each stored level: the contrast window through the colormap.
export function slicePalette(volume: TomogramVolumeStack, colormap: string, sigmas = SLICE_WINDOW_SIGMAS): Uint8Array {
    const stops = colormapStops(colormap).map((hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
    const std = volume.std > 0 ? volume.std : 1;
    const low = volume.mean - sigmas * std;
    const span = 2 * sigmas * std;
    const step = (volume.high - volume.low) / 255;
    const palette = new Uint8Array(256 * 3);
    for (let level = 0; level < 256; level++) {
        const t = Math.min(1, Math.max(0, (volume.low + level * step - low) / span));
        const position = t * (stops.length - 1);
        const lower = Math.floor(position);
        const upper = Math.min(stops.length - 1, lower + 1);
        const mix = position - lower;
        for (let channel = 0; channel < 3; channel++) {
            palette[level * 3 + channel] = Math.round(stops[lower][channel] + (stops[upper][channel] - stops[lower][channel]) * mix);
        }
    }
    return palette;
}

// An 8-bit paletted BMP of the slice (top-down rows): no compression, so it
// is built and decoded in a fraction of a millisecond.
export function encodeBmp8(slice: TomogramSlice, palette: Uint8Array): Uint8Array {
    const { width, height, data } = slice;
    const rowSize = Math.ceil(width / 4) * 4;
    const pixelsOffset = 14 + 40 + 256 * 4;
    const fileSize = pixelsOffset + rowSize * height;
    const bytes = new Uint8Array(fileSize);
    const view = new DataView(bytes.buffer);
    bytes[0] = 0x42; // B
    bytes[1] = 0x4d; // M
    view.setUint32(2, fileSize, true);
    view.setUint32(10, pixelsOffset, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, -height, true); // negative: the first row is the top one
    view.setUint16(26, 1, true);
    view.setUint16(28, 8, true);
    view.setUint32(34, rowSize * height, true);
    view.setInt32(38, 2835, true);
    view.setInt32(42, 2835, true);
    view.setUint32(46, 256, true);
    for (let level = 0; level < 256; level++) {
        const entry = 54 + level * 4;
        bytes[entry] = palette[level * 3 + 2];
        bytes[entry + 1] = palette[level * 3 + 1];
        bytes[entry + 2] = palette[level * 3];
    }
    if (rowSize === width) {
        bytes.set(data, pixelsOffset);
    } else {
        for (let row = 0; row < height; row++) {
            bytes.set(data.subarray(row * width, (row + 1) * width), pixelsOffset + row * rowSize);
        }
    }
    return bytes;
}

// Object URLs of the slices made from one volume and colormap, the least
// recently used revoked past a limit.
export class SliceUrlCache {
    private readonly urls = new Map<string, string>();

    constructor(private readonly limit = 48) { }

    get(volume: TomogramVolumeStack, palette: Uint8Array, axis: SliceAxis, index: number): string {
        const key = `${axis}|${reducedIndex(volume, axis, index)}`;
        const cached = this.urls.get(key);
        if (cached) {
            this.urls.delete(key);
            this.urls.set(key, cached);
            return cached;
        }
        const bmp = encodeBmp8(extractSlice(volume, axis, index), palette);
        const url = URL.createObjectURL(new Blob([bmp], { type: "image/bmp" }));
        this.urls.set(key, url);
        while (this.urls.size > this.limit) {
            const [oldestKey, oldestUrl] = this.urls.entries().next().value as [string, string];
            this.urls.delete(oldestKey);
            URL.revokeObjectURL(oldestUrl);
        }
        return url;
    }

    clear(): void {
        this.urls.forEach((url) => URL.revokeObjectURL(url));
        this.urls.clear();
    }
}
