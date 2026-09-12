export type VolumeAxis = "x" | "y" | "z";

export type VolumeClipBounds = Record<VolumeAxis, [number, number]>;

export type VolumeSlicePosition = Record<VolumeAxis, number>;

export type VolumeSliceVisibility = Record<VolumeAxis, boolean>;

export type VolumeCameraPreset =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom";

export type VolumeCameraCommand = {
  preset: VolumeCameraPreset;
  key: number;
};

export function createFullVolumeClipBounds(): VolumeClipBounds {
  return {
    x: [0, 1],
    y: [0, 1],
    z: [0, 1],
  };
}

export function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeVolumeClipBounds(bounds?: VolumeClipBounds): VolumeClipBounds {
  const fallback = createFullVolumeClipBounds();
  if (!bounds) return fallback;

  return {
    x: normalizeRange(bounds.x),
    y: normalizeRange(bounds.y),
    z: normalizeRange(bounds.z),
  };
}

function normalizeRange(range?: [number, number]): [number, number] {
  if (!range) return [0, 1];
  const first = clampNormalized(range[0]);
  const second = clampNormalized(range[1]);
  return first <= second ? [first, second] : [second, first];
}
