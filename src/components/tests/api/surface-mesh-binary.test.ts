import { describe, expect, it } from "vitest";
import { parseVolumeSurfaceMeshBinary } from "@/api/projects";

// Builds a payload the way the API's encodeSurfaceMeshBinary does.
function payload(header: Record<string, unknown>, arrays: Array<[string, "float32" | "uint32", number[]]>) {
  let json = JSON.stringify({ ...header, arrays: arrays.map(([name, type, values]) => ({ name, type, length: values.length })) });
  while ((8 + json.length) % 4) json += " ";
  const headerBytes = new TextEncoder().encode(json);
  const total = 8 + headerBytes.length + arrays.reduce((sum, [, , values]) => sum + values.length * 4, 0);
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("SMSH"), 0);
  new DataView(buffer).setUint32(4, headerBytes.length, true);
  bytes.set(headerBytes, 8);
  let offset = 8 + headerBytes.length;
  for (const [, type, values] of arrays) {
    (type === "uint32" ? new Uint32Array(buffer, offset, values.length) : new Float32Array(buffer, offset, values.length)).set(values);
    offset += values.length * 4;
  }
  return buffer;
}

describe("binary surface mesh", () => {
  it("reads the header and the typed arrays", () => {
    const mesh = parseVolumeSurfaceMeshBinary(payload(
      { kind: "surfaceMesh", level: 0.5, triangleCount: 1, vertexCount: 3 },
      [
        ["vertices", "float32", [0, 0, 0, 1, 0, 0, 0, 1, 0]],
        ["normals", "float32", [0, 0, 1, 0, 0, 1, 0, 0, 1]],
        ["indices", "uint32", [0, 1, 2]],
        ["values", "float32", [0.5, 0.5, 0.5]],
      ],
    ));

    expect(mesh.level).toBe(0.5);
    expect(mesh.triangleCount).toBe(1);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
    expect(Array.from(mesh.vertices)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(mesh.values ?? [])).toEqual([0.5, 0.5, 0.5]);
  });

  it("rejects what is not a mesh", () => {
    expect(() => parseVolumeSurfaceMeshBinary(new TextEncoder().encode("{\"kind\":1}").buffer)).toThrow();
    expect(() => parseVolumeSurfaceMeshBinary(payload({}, [["vertices", "float32", [1]]]).slice(0, -4))).toThrow();
  });
});
