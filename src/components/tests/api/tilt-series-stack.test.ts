import { describe, expect, it } from "vitest";
import { parseTiltSeriesStack } from "@/api/projects";

function payload(header: Record<string, unknown>, images: Uint8Array[]) {
    let json = JSON.stringify(header);
    while ((8 + json.length) % 4) json += " ";
    const headerBytes = new TextEncoder().encode(json);
    const total = 8 + headerBytes.length + images.reduce((sum, image) => sum + image.length, 0);
    const buffer = new ArrayBuffer(total);
    const bytes = new Uint8Array(buffer);
    bytes.set(new TextEncoder().encode("TSST"), 0);
    new DataView(buffer).setUint32(4, headerBytes.length, true);
    bytes.set(headerBytes, 8);
    let offset = 8 + headerBytes.length;
    for (const image of images) {
        bytes.set(image, offset);
        offset += image.length;
    }
    return buffer;
}

describe("tilt series stack", () => {
    it("reads every frame and its image, skipping the failed ones", () => {
        const stack = parseTiltSeriesStack(payload(
            {
                tiltSeriesId: "TS_1",
                maxDim: 1024,
                flipVertically: true,
                frames: [
                    { index: 4, width: 2, height: 1, mean: 3, std: 1, low: -2, high: 8, rot: 85 },
                    { index: 5, error: "missing" },
                    { index: 6, width: 1, height: 2, mean: 3, std: 1, low: -2, high: 8 },
                ],
            },
            [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
        ));

        expect(stack.tiltSeriesId).toBe("TS_1");
        expect(stack.frames.map((frame) => frame.index)).toEqual([4, 5, 6]);
        expect(Array.from(stack.frames[0].data!)).toEqual([1, 2]);
        expect(stack.frames[1]).toEqual({ index: 5, error: "missing" });
        expect(Array.from(stack.frames[2].data!)).toEqual([3, 4]);
        expect(stack.frames[0].rot).toBe(85);
    });

    it("rejects a truncated stack", () => {
        const buffer = payload({ frames: [{ index: 0, width: 4, height: 4 }] }, [new Uint8Array(3)]);
        expect(() => parseTiltSeriesStack(buffer)).toThrow();
        expect(() => parseTiltSeriesStack(new ArrayBuffer(4))).toThrow();
    });
});
