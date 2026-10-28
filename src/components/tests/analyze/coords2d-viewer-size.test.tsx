import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Coords2dViewer, { type Coords2dDataSource } from "@/components/analyze/coords2d-viewer";

vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => ({}) }));

class NoResizeObserver {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}

// jsdom neither draws on a canvas nor loads images: record the circles drawn, and let an
// image "load" with the size its url says
const arcs: number[][] = [];
function fakeContext() {
  return new Proxy({}, {
    get: (_target, name) => {
      if (name === "arc") return (...args: number[]) => arcs.push(args);
      if (name === "getImageData") return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (name === "measureText") return () => ({ width: 10 });
      return () => undefined;
    },
    set: () => true,
  });
}
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
  arcs.length = 0;
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  vi.stubGlobal("Image", LoadingImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => fakeContext() as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function sourceWithSlowImages() {
  const preview = deferred<unknown>();
  const source: Coords2dDataSource = {
    key: "coordinates:7:40",
    // As the server lists them: without their size
    listMicrographs: vi.fn().mockResolvedValue({
      micrographs: [{ id: "1", index: 1, fileName: "mic_1.mrc", label: "mic_1.mrc", particles: 1 }],
      totalMicrographs: 1, totalPicks: 1, boxSize: 200,
    }),
    fetchCoordinates: vi.fn().mockResolvedValue([{ id: "p1", micId: "1", x: 2000, y: 1500 }]),
    fetchImage: vi.fn().mockReturnValue(new Promise(() => undefined)),
    fetchThumbnail: vi.fn().mockReturnValue(preview.promise),
    createOutput: vi.fn(),
  };
  return { source, preview };
}

describe("The coordinates viewer before the micrograph image arrives", () => {
  it("draws the coordinates only once it knows the size of the micrograph", async () => {
    const { source, preview } = sourceWithSlowImages();
    render(<Coords2dViewer projectId={7} protocolId={40} protocolLabel="picking" outputName="outputCoordinates"
                           source={source} />);

    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalled());
    await new Promise((done) => setTimeout(done, 50));
    // Fitted to the coordinates alone, one particle filled the whole view
    expect(arcs).toHaveLength(0);

    preview.resolve({ url: "blob:preview:512:384", revoke: () => undefined, originalWidth: 4000, originalHeight: 3000 });

    await waitFor(() => expect(arcs.length).toBeGreaterThan(0));
    const radius = arcs[arcs.length - 1][2];
    // A box of 200 on a 4000 x 3000 micrograph fitted to the view
    expect(radius).toBeLessThan(40);
  });
});
