import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { setClippingSliceImage, updateClippingSliceUvs } from "../../analyze/mesh-clipping-slices";
import type { VolumeAxis, VolumeClipBounds } from "../../analyze/volume-3d-types";

const bounds: VolumeClipBounds = { x: [0.1, 0.6], y: [0.2, 0.7], z: [0.3, 0.8] };
describe("mesh clipping images", () => {
  it.each(["x", "y", "z"] as VolumeAxis[])("maps %s slice pixels to the correct volume coordinates after rotation and cropping", axis => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    updateClippingSliceUvs(geometry, axis, bounds);
    const plane = new THREE.Mesh(geometry);
    if (axis === "x") { plane.rotation.y = Math.PI / 2; plane.scale.set(0.5, 0.5, 1); plane.position.set(0.1, 0.45, 0.55); }
    if (axis === "y") { plane.rotation.x = -Math.PI / 2; plane.scale.set(0.5, 0.5, 1); plane.position.set(0.35, 0.2, 0.55); }
    if (axis === "z") { plane.scale.set(0.5, 0.5, 1); plane.position.set(0.35, 0.45, 0.3); }
    plane.updateMatrixWorld();
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(plane.matrixWorld);
      expect(uv.getX(i)).toBeCloseTo(axis === "x" ? point.y : point.x);
      expect(uv.getY(i)).toBeCloseTo(axis === "z" ? point.y : point.z);
    }
    geometry.dispose();
  });
  it("reuses an unchanged texture, disposes replacements and preserves the image row direction", () => {
    const material = new THREE.MeshBasicMaterial();
    const image = new Image();
    setClippingSliceImage(material, image);
    const first = material.map!;
    const dispose = vi.spyOn(first, "dispose");
    setClippingSliceImage(material, image);
    expect(material.map).toBe(first);
    expect(dispose).not.toHaveBeenCalled();
    expect(first.flipY).toBe(false);
    expect(first.generateMipmaps).toBe(false);
    setClippingSliceImage(material, new Image());
    expect(dispose).toHaveBeenCalledOnce();
    const lastDispose = vi.spyOn(material.map!, "dispose");
    setClippingSliceImage(material, null);
    expect(lastDispose).toHaveBeenCalledOnce();
    expect(material.map).toBeNull();
    material.dispose();
  });
});
