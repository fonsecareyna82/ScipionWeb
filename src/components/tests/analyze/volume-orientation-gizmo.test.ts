import { afterEach, describe, expect, it } from "vitest";
import { createVolumeOrientationGizmo } from "../../analyze/volume-orientation-gizmo";

const FULL_BOUNDS = {
  x: [0, 1] as [number, number],
  y: [0, 1] as [number, number],
  z: [0, 1] as [number, number],
};

describe("VolumeOrientationGizmo", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders labeled, thicker X/Y/Z axes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const gizmo = createVolumeOrientationGizmo(host, FULL_BOUNDS);
    const root = host.querySelector(
      '[data-volume-orientation-gizmo="true"]',
    );

    expect(root).not.toBeNull();
    expect(root?.querySelector('[data-axis-label="x"]')?.textContent).toBe("X");
    expect(root?.querySelector('[data-axis-label="y"]')?.textContent).toBe("Y");
    expect(root?.querySelector('[data-axis-label="z"]')?.textContent).toBe("Z");
    expect(
      root?.querySelector('[data-axis-line="x"]')?.getAttribute("stroke-width"),
    ).toBe("2.8");

    gizmo.dispose();
    expect(
      host.querySelector('[data-volume-orientation-gizmo="true"]'),
    ).toBeNull();
  });

  it("moves clipping planes inside the orientation axes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const gizmo = createVolumeOrientationGizmo(host, FULL_BOUNDS);
    const xMin = host.querySelector(
      '[data-clip-axis="x"][data-clip-bound="min"]',
    ) as SVGPolygonElement;

    expect(xMin.style.display).toBe("none");

    gizmo.setClipBounds({
      ...FULL_BOUNDS,
      x: [0.25, 1],
    });
    const firstPoints = xMin.getAttribute("points");

    expect(xMin.style.display).toBe("");
    expect(firstPoints).toBeTruthy();

    gizmo.setClipBounds({
      ...FULL_BOUNDS,
      x: [0.6, 1],
    });

    expect(xMin.getAttribute("points")).not.toBe(firstPoints);
    gizmo.dispose();
  });
});
