import { describe, expect, it } from "vitest";

import { imageBatchLimit } from "@/components/analyze/metadata-viewer";

describe("how many image cells one request carries", () => {
  it("spreads a screenful over the free request slots, which the server draws at the same time", () => {
    // 30 visible cells and 4 free slots: 4 requests of up to 8, not one of 30 drawn one after the other
    expect(imageBatchLimit(30, 4)).toBe(8);
    expect(imageBatchLimit(30, 1)).toBe(30);
  });

  it("keeps at least a few cells per request and never more than the batch cap", () => {
    expect(imageBatchLimit(6, 4)).toBe(4);
    expect(imageBatchLimit(200, 2)).toBe(32);
    expect(imageBatchLimit(10, 0)).toBe(10);
  });
});
