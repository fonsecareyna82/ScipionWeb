import { describe, expect, it } from "vitest";
import { dataUrlToBlob, exportScale, imageFileName } from "../../analyze/volume-image-export";

describe("volume image export", () => {
    it("keeps the longest side of the image within the limit", () => {
        expect(exportScale(900, 600, 4)).toBe(4);
        expect(exportScale(3000, 1000, 4)).toBeCloseTo(8192 / 3000);
        expect(exportScale(900, 600, 4, 1800)).toBe(2);
    });

    it("names the file after the output, the volume and the mode", () => {
        expect(imageFileName("outputVolume", "Vol A (half 1)", "surface")).toBe("outputVolume_Vol_A_half_1_surface.png");
        expect(imageFileName(null, "", undefined)).toBe("volume.png");
    });

    it("turns a data URL into a PNG blob", async () => {
        const blob = dataUrlToBlob(`data:image/png;base64,${btoa("png!")}`);
        expect(blob.type).toBe("image/png");
        expect(blob.size).toBe(4);
    });
});
