import { describe, expect, it } from "vitest";
import { getMetadataImageCellUrl } from "@/api/projects";

const params = (contrastMode?: any) =>
  new URL(getMetadataImageCellUrl(7, 106, "outputClasses", "objects", 0, "stack", { contrastMode }), "http://x").searchParams;

describe("metadata image contrast modes", () => {
  it("asks the server for enhanced class images and the 3D view", () => {
    expect(params("enhanced").get("contrastMode")).toBe("enhanced");
    expect(params("enhanced").get("volumeView")).toBe("surface");
    expect(params("enhanced-projection").get("volumeView")).toBe("projection");
    expect(params("enhanced-slice").get("volumeView")).toBe("slice");
  });

  it("leaves other images as they are", () => {
    expect(params("original").get("contrastMode")).toBe("original");
    expect(params("original").get("volumeView")).toBeNull();
    expect(params(undefined).get("contrastMode")).toBeNull();
  });
});
