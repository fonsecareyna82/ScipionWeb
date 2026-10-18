import { describe, expect, it } from "vitest";
import { metadataImageRequestSize } from "../../analyze/metadata-viewer";

describe("metadata image request size", () => {
    it("asks for the device pixels of the cell, in steps of 64", () => {
        expect(metadataImageRequestSize(200, 1)).toBe(256);
        expect(metadataImageRequestSize(200, 2)).toBe(448);
        expect(metadataImageRequestSize(200, 3)).toBe(448);
        expect(metadataImageRequestSize(640, 2)).toBe(1024);
        expect(metadataImageRequestSize(128, 1)).toBe(128);
    });
});
