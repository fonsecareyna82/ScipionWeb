import * as THREE from "three";
import type { VolumeAxis, VolumeClipBounds } from "./volume-3d-types";

// API images: XY has rows Y/columns X; XZ rows Z/columns X; YZ rows Z/columns Y.
// Account for the plane rotations, and crop the UVs instead of stretching a full image.
export function updateClippingSliceUvs(geometry: THREE.PlaneGeometry, axis: VolumeAxis, bounds: VolumeClipBounds) {
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const lerp = (range: [number, number], t: number) => THREE.MathUtils.lerp(range[0], range[1], t);
  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i) + 0.5;
    const v = positions.getY(i) + 0.5;
    if (axis === "x") uv.setXY(i, lerp(bounds.y, v), lerp(bounds.z, 1 - u));
    else if (axis === "y") uv.setXY(i, lerp(bounds.x, u), lerp(bounds.z, 1 - v));
    else uv.setXY(i, lerp(bounds.x, u), lerp(bounds.y, v));
  }
  uv.needsUpdate = true;
}

export function setClippingSliceImage(material: THREE.MeshBasicMaterial, image: HTMLImageElement | null) {
  if ((material.map?.image ?? null) === image) return;
  const hadTexture = !!material.map;
  material.map?.dispose();
  material.map = null;
  if (image) {
    const texture = new THREE.Texture(image);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    material.map = texture;
  }
  if (hadTexture !== !!material.map) material.needsUpdate = true;
}
