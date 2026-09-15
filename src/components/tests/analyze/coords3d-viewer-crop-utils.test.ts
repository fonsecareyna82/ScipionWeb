import { describe, expect, it, vi } from "vitest";

import {
    cropSliceImageToDataUrl,
    getSlicePlaneCoords,
    getSlicePlaneDims,
} from "../../analyze/coords3d-viewer";

describe("getSlicePlaneDims", () => {
    const dims: [number, number, number] = [100, 80, 60];

    it("returns [dimX, dimY] for the z axis", () => {
        expect(getSlicePlaneDims(dims, "z")).toEqual([100, 80]);
    });

    it("returns [dimY, dimZ] for the x axis", () => {
        expect(getSlicePlaneDims(dims, "x")).toEqual([80, 60]);
    });

    it("returns [dimX, dimZ] for the y axis", () => {
        expect(getSlicePlaneDims(dims, "y")).toEqual([100, 60]);
    });

    it("returns null when dims is null or has a non-positive dimension", () => {
        expect(getSlicePlaneDims(null, "z")).toBeNull();
        expect(getSlicePlaneDims([0, 80, 60], "z")).toBeNull();
    });
});

describe("getSlicePlaneCoords", () => {
    const point = { x: 10, y: 20, z: 30 };

    it("returns [x, y] for the z axis", () => {
        expect(getSlicePlaneCoords(point, "z")).toEqual([10, 20]);
    });

    it("returns [y, z] for the x axis", () => {
        expect(getSlicePlaneCoords(point, "x")).toEqual([20, 30]);
    });

    it("returns [x, z] for the y axis", () => {
        expect(getSlicePlaneCoords(point, "y")).toEqual([10, 30]);
    });
});

describe("cropSliceImageToDataUrl", () => {
    function makeFakeImage(naturalWidth: number, naturalHeight: number): HTMLImageElement {
        return { naturalWidth, naturalHeight } as HTMLImageElement;
    }

    it("returns null when the image has no natural size", () => {
        const result = cropSliceImageToDataUrl(
            makeFakeImage(0, 0),
            100,
            80,
            50,
            40,
            16,
            96,
        );
        expect(result).toBeNull();
    });

    it("returns null when the plane dimensions are non-positive", () => {
        const result = cropSliceImageToDataUrl(
            makeFakeImage(200, 160),
            0,
            80,
            50,
            40,
            16,
            96,
        );
        expect(result).toBeNull();
    });

    it("draws the correctly-scaled source rect and returns the encoded data URL", () => {
        const drawImage = vi.fn();
        const toDataURL = vi.fn(() => "data:image/webp;base64,FAKE");

        vi.spyOn(document, "createElement").mockImplementationOnce(() => {
            return {
                width: 0,
                height: 0,
                getContext: () => ({ drawImage }),
                toDataURL,
            } as unknown as HTMLCanvasElement;
        });

        // 200x160 natural image over a 100x80-unit plane -> scale 2x on
        // both axes. Point at plane (50, 40) with a 16-unit crop box ->
        // source rect centered at (100, 80), sized 32x32.
        const result = cropSliceImageToDataUrl(
            makeFakeImage(200, 160),
            100,
            80,
            50,
            40,
            16,
            96,
        );

        expect(drawImage).toHaveBeenCalledWith(
            expect.anything(),
            84, // srcX = 100 - 32/2
            64, // srcY = 80 - 32/2
            32, // srcW
            32, // srcH
            0,
            0,
            96,
            96,
        );
        expect(toDataURL).toHaveBeenCalledWith("image/webp", 0.85);
        expect(result).toBe("data:image/webp;base64,FAKE");
    });
});
