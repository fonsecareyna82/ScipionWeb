import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Coords2dViewer, { type Coords2dDataSource } from "@/components/analyze/coords2d-viewer";

vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => ({}) }));

class NoResizeObserver {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}

function fakeContext() {
  return new Proxy({}, {
    get: (_target, name) => {
      if (name === "getImageData") return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (name === "measureText") return () => ({ width: 10 });
      return () => undefined;
    },
    set: () => true,
  });
}
// An image "loads" with the size its url says
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(url: string) {
    const [width, height] = url.split(":").slice(-2).map(Number);
    this.naturalWidth = width;
    this.naturalHeight = height;
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  vi.stubGlobal("Image", LoadingImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => fakeContext() as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function source(boxSize: number): Coords2dDataSource {
  return {
    key: `coordinates:7:${boxSize}`,
    listMicrographs: vi.fn().mockResolvedValue({
      micrographs: [{ id: "1", index: 1, fileName: "mic_1.mrc", label: "mic_1.mrc", particles: 1 }],
      totalMicrographs: 1, totalPicks: 1, boxSize,
    }),
    fetchCoordinates: vi.fn().mockResolvedValue([{ id: "p1", micId: "1", x: 2000, y: 1500 }]),
    fetchImage: vi.fn().mockReturnValue(new Promise(() => undefined)),
    fetchThumbnail: vi.fn().mockResolvedValue({
      url: "blob:preview:512:384", revoke: () => undefined, originalWidth: 4000, originalHeight: 3000,
    }),
    createOutput: vi.fn(),
  };
}

function renderViewer(boxSize: number) {
  render(<Coords2dViewer projectId={7} protocolId={40} protocolLabel="picking" outputName="outputCoordinates"
                         source={source(boxSize)} />);
  return screen.findByRole("spinbutton", { name: "Box size in pixels" });
}

describe("The box size of the coordinates viewer", () => {
  it("keeps a stored box larger than the old slider top", async () => {
    const field = await renderViewer(400);
    await waitFor(() => expect(field).toHaveValue(400));
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "400");
  });

  it("takes a typed size up to the micrograph's smaller side, and the slider reaches it", async () => {
    const field = await renderViewer(100);
    await waitFor(() => expect(field).toHaveValue(100));
    // A quarter of the 3000 px side
    await waitFor(() => expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "750"));

    fireEvent.change(field, { target: { value: "900" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field).toHaveValue(900);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "900");

    fireEvent.change(field, { target: { value: "99999" } });
    fireEvent.blur(field);
    expect(field).toHaveValue(3000);
  });
});
