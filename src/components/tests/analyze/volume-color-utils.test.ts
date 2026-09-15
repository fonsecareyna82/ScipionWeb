import { describe, expect, it, vi } from "vitest";

import {
    buildVolumeSliceOverlayDataUrl,
    buildVolumeSliceOverlayObjectUrl,
    type VolumeRegionLabels,
    type VolumeRenderData,
} from "../../analyze/volume-color-utils";

function makeVolumeData(): VolumeRenderData {
    return {
        dims: { x: 2, y: 2, z: 2 },
        values: [0, 1, 2, 3, 4, 5, 6, 7],
        order: "zyx",
        min: 0,
        max: 7,
    };
}

function makeRegions(): VolumeRegionLabels {
    return {
        dims: { x: 2, y: 2, z: 2 },
        labels: new Uint8Array([0, 1, 1, 0, 0, 1, 1, 0]),
        regionCount: 1,
    };
}

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
        ({
            createImageData: (width: number, height: number) => ({
                data: new Uint8ClampedArray(width * height * 4),
                width,
                height,
            }),
            putImageData: vi.fn(),
        }) as any,
);

vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    () => "data:image/png;base64,FAKE",
);

vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function (this: HTMLCanvasElement, callback: any) {
        callback(new Blob(["fake"], { type: "image/png" }));
    },
);

describe("buildVolumeSliceOverlayDataUrl (sync, toDataURL)", () => {
    it("returns null when the volume data is empty", () => {
        const result = buildVolumeSliceOverlayDataUrl({
            data: { dims: { x: 0, y: 0, z: 0 }, values: [], order: "zyx" },
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 0, y: 0, z: 0 },
            colorMode: "density",
            level: 0,
            opacity: 1,
            colormap: "viridis",
        });

        expect(result).toBeNull();
    });

    it("returns null for components mode without region labels", () => {
        const result = buildVolumeSliceOverlayDataUrl({
            data: makeVolumeData(),
            regions: null,
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 2, y: 2, z: 2 },
            colorMode: "components",
            level: 0,
            opacity: 1,
            colormap: "viridis",
        });

        expect(result).toBeNull();
    });

    it("returns a data URL for valid density-mode data", () => {
        const result = buildVolumeSliceOverlayDataUrl({
            data: makeVolumeData(),
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 2, y: 2, z: 2 },
            colorMode: "density",
            level: 0,
            opacity: 0.8,
            colormap: "viridis",
        });

        expect(result).toBe("data:image/png;base64,FAKE");
    });

    it("returns a data URL for components mode with region labels", () => {
        const result = buildVolumeSliceOverlayDataUrl({
            data: makeVolumeData(),
            regions: makeRegions(),
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 2, y: 2, z: 2 },
            colorMode: "components",
            level: 0,
            opacity: 1,
            colormap: "viridis",
        });

        expect(result).toBe("data:image/png;base64,FAKE");
    });
});

describe("buildVolumeSliceOverlayObjectUrl (async, toBlob)", () => {
    it("resolves null when the volume data is empty, without touching the canvas", async () => {
        const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
        toBlobSpy.mockClear();

        const result = await buildVolumeSliceOverlayObjectUrl({
            data: { dims: { x: 0, y: 0, z: 0 }, values: [], order: "zyx" },
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 0, y: 0, z: 0 },
            colorMode: "density",
            level: 0,
            opacity: 1,
            colormap: "viridis",
        });

        expect(result).toBeNull();
        expect(toBlobSpy).not.toHaveBeenCalled();
    });

    it("resolves null for components mode without region labels", async () => {
        const result = await buildVolumeSliceOverlayObjectUrl({
            data: makeVolumeData(),
            regions: null,
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 2, y: 2, z: 2 },
            colorMode: "components",
            level: 0,
            opacity: 1,
            colormap: "viridis",
        });

        expect(result).toBeNull();
    });

    it("resolves an object URL built from the encoded blob for valid data", async () => {
        const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");
        createObjectURLSpy.mockClear();

        const result = await buildVolumeSliceOverlayObjectUrl({
            data: makeVolumeData(),
            axis: "z",
            sourceIndex: 0,
            sourceDims: { x: 2, y: 2, z: 2 },
            colorMode: "density",
            level: 0,
            opacity: 0.8,
            colormap: "viridis",
        });

        expect(result).toBeTruthy();
        expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

        const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
        expect(blobArg.type).toBe("image/png");
    });
});
