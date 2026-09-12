import type { VolumeAxis, VolumeClipBounds } from "./volume-3d-types";

type QuaternionLike = {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
} | null | undefined;

type QuaternionTuple = [number, number, number, number];
type Vec3 = [number, number, number];

type AxisVisual = {
  axis: VolumeAxis;
  color: string;
  vector: Vec3;
};

type ClipBoundary = "min" | "max";

const SVG_NS = "http://www.w3.org/2000/svg";
const GIZMO_SIZE = 96;
const ORIGIN_X = 48;
const ORIGIN_Y = 52;
const AXIS_LENGTH = 28;
const CLIP_EPSILON = 0.0001;

const AXES: AxisVisual[] = [
  { axis: "x", color: "#ef4444", vector: [1, 0, 0] },
  { axis: "y", color: "#22c55e", vector: [0, 1, 0] },
  { axis: "z", color: "#3b82f6", vector: [0, 0, 1] },
];

export type VolumeOrientationGizmo = {
  updateOrientation: (
    cameraQuaternion: QuaternionLike,
    objectQuaternion?: QuaternionLike,
  ) => void;
  setClipBounds: (bounds: VolumeClipBounds) => void;
  dispose: () => void;
};

export function createVolumeOrientationGizmo(
  host: HTMLElement,
  initialClipBounds: VolumeClipBounds,
): VolumeOrientationGizmo {
  const root = document.createElement("div");
  root.setAttribute("data-volume-orientation-gizmo", "true");
  Object.assign(root.style, {
    position: "absolute",
    right: "8px",
    bottom: "8px",
    width: `${GIZMO_SIZE}px`,
    height: `${GIZMO_SIZE}px`,
    pointerEvents: "none",
    zIndex: "3",
  });

  const svg = createSvgElement("svg");
  svg.setAttribute("viewBox", `0 0 ${GIZMO_SIZE} ${GIZMO_SIZE}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  root.appendChild(svg);

  const planesLayer = createSvgElement("g");
  const axesLayer = createSvgElement("g");
  const labelsLayer = createSvgElement("g");
  svg.append(planesLayer, axesLayer, labelsLayer);

  const origin = createSvgElement("circle");
  origin.setAttribute("cx", String(ORIGIN_X));
  origin.setAttribute("cy", String(ORIGIN_Y));
  origin.setAttribute("r", "2.4");
  origin.setAttribute("fill", "#475569");
  axesLayer.appendChild(origin);

  const axisNodes = new Map<
    VolumeAxis,
    { line: SVGLineElement; label: SVGTextElement }
  >();

  for (const config of AXES) {
    const line = createSvgElement("line");
    line.setAttribute("data-axis-line", config.axis);
    line.setAttribute("stroke", config.color);
    line.setAttribute("stroke-width", "2.8");
    line.setAttribute("stroke-linecap", "round");
    axesLayer.appendChild(line);

    const label = createSvgElement("text");
    label.setAttribute("data-axis-label", config.axis);
    label.setAttribute("fill", config.color);
    label.setAttribute("font-size", "11");
    label.setAttribute("font-weight", "700");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("paint-order", "stroke");
    label.setAttribute("stroke", "rgba(255,255,255,0.92)");
    label.setAttribute("stroke-width", "3");
    label.textContent = config.axis.toUpperCase();
    labelsLayer.appendChild(label);

    axisNodes.set(config.axis, { line, label });
  }

  const clipPlaneNodes = new Map<string, SVGPolygonElement>();

  for (const config of AXES) {
    for (const boundary of ["min", "max"] as ClipBoundary[]) {
      const polygon = createSvgElement("polygon");
      polygon.setAttribute("data-clip-axis", config.axis);
      polygon.setAttribute("data-clip-bound", boundary);
      polygon.setAttribute("fill", config.color);
      polygon.setAttribute("fill-opacity", boundary === "min" ? "0.18" : "0.11");
      polygon.setAttribute("stroke", config.color);
      polygon.setAttribute("stroke-opacity", "0.72");
      polygon.setAttribute("stroke-width", "1.2");
      polygon.setAttribute("stroke-linejoin", "round");
      polygon.style.display = "none";
      planesLayer.appendChild(polygon);
      clipPlaneNodes.set(`${config.axis}:${boundary}`, polygon);
    }
  }

  let clipBounds = cloneClipBounds(initialClipBounds);
  let relativeQuaternion: QuaternionTuple = [0, 0, 0, 1];

  const project = (point: Vec3) => {
    const rotated = rotateVector(point, relativeQuaternion);
    return {
      x: ORIGIN_X + rotated[0] * AXIS_LENGTH,
      y: ORIGIN_Y - rotated[1] * AXIS_LENGTH,
      depth: rotated[2],
    };
  };

  const render = () => {
    const projectedOrigin = project([0, 0, 0]);

    for (const config of AXES) {
      const node = axisNodes.get(config.axis);
      if (!node) continue;

      const endpoint = project(config.vector);
      node.line.setAttribute("x1", formatCoordinate(projectedOrigin.x));
      node.line.setAttribute("y1", formatCoordinate(projectedOrigin.y));
      node.line.setAttribute("x2", formatCoordinate(endpoint.x));
      node.line.setAttribute("y2", formatCoordinate(endpoint.y));

      const dx = endpoint.x - projectedOrigin.x;
      const dy = endpoint.y - projectedOrigin.y;
      const length = Math.hypot(dx, dy);
      const offsetX = length > 1 ? (dx / length) * 6 : 5;
      const offsetY = length > 1 ? (dy / length) * 6 : -5;

      node.label.setAttribute("x", formatCoordinate(endpoint.x + offsetX));
      node.label.setAttribute("y", formatCoordinate(endpoint.y + offsetY));
    }

    const visiblePlanes: Array<{
      polygon: SVGPolygonElement;
      points: string;
      depth: number;
    }> = [];

    for (const config of AXES) {
      for (const boundary of ["min", "max"] as ClipBoundary[]) {
        const polygon = clipPlaneNodes.get(`${config.axis}:${boundary}`);
        if (!polygon) continue;

        const position =
          boundary === "min"
            ? clipBounds[config.axis][0]
            : clipBounds[config.axis][1];

        const visible =
          boundary === "min"
            ? position > CLIP_EPSILON
            : position < 1 - CLIP_EPSILON;

        if (!visible) {
          polygon.style.display = "none";
          continue;
        }

        const projected = clipPlaneCorners(config.axis, position).map(project);
        polygon.style.display = "";
        visiblePlanes.push({
          polygon,
          points: projected
            .map((point) => `${formatCoordinate(point.x)},${formatCoordinate(point.y)}`)
            .join(" "),
          depth:
            projected.reduce((sum, point) => sum + point.depth, 0) /
            projected.length,
        });
      }
    }

    visiblePlanes
      .sort((a, b) => a.depth - b.depth)
      .forEach(({ polygon, points }) => {
        polygon.setAttribute("points", points);
        planesLayer.appendChild(polygon);
      });
  };

  const setClipBounds = (bounds: VolumeClipBounds) => {
    clipBounds = cloneClipBounds(bounds);
    render();
  };

  const updateOrientation = (
    cameraQuaternion: QuaternionLike,
    objectQuaternion?: QuaternionLike,
  ) => {
    const cameraInverse = invertQuaternion(toQuaternion(cameraQuaternion));
    relativeQuaternion = multiplyQuaternions(
      cameraInverse,
      toQuaternion(objectQuaternion),
    );
    render();
  };

  render();
  host.appendChild(root);

  return {
    updateOrientation,
    setClipBounds,
    dispose: () => {
      if (root.parentElement === host) {
        host.removeChild(root);
      }
    },
  };
}

function clipPlaneCorners(axis: VolumeAxis, position: number): Vec3[] {
  const p = clamp01(position);

  if (axis === "x") {
    return [
      [p, 0, 0],
      [p, 1, 0],
      [p, 1, 1],
      [p, 0, 1],
    ];
  }

  if (axis === "y") {
    return [
      [0, p, 0],
      [1, p, 0],
      [1, p, 1],
      [0, p, 1],
    ];
  }

  return [
    [0, 0, p],
    [1, 0, p],
    [1, 1, p],
    [0, 1, p],
  ];
}

function cloneClipBounds(bounds: VolumeClipBounds): VolumeClipBounds {
  return {
    x: [clamp01(bounds.x[0]), clamp01(bounds.x[1])],
    y: [clamp01(bounds.y[0]), clamp01(bounds.y[1])],
    z: [clamp01(bounds.z[0]), clamp01(bounds.z[1])],
  };
}

function toQuaternion(quaternion: QuaternionLike): QuaternionTuple {
  const x = finiteOr(quaternion?.x, 0);
  const y = finiteOr(quaternion?.y, 0);
  const z = finiteOr(quaternion?.z, 0);
  const w = finiteOr(quaternion?.w, 1);
  const length = Math.hypot(x, y, z, w);

  if (length < 1e-8) return [0, 0, 0, 1];
  return [x / length, y / length, z / length, w / length];
}

function invertQuaternion(
  quaternion: QuaternionTuple,
): QuaternionTuple {
  return [
    -quaternion[0],
    -quaternion[1],
    -quaternion[2],
    quaternion[3],
  ];
}

function multiplyQuaternions(
  a: QuaternionTuple,
  b: QuaternionTuple,
): QuaternionTuple {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;

  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotateVector(
  vector: Vec3,
  quaternion: QuaternionTuple,
): Vec3 {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;

  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0";
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}
