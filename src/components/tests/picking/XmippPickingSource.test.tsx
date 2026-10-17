import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Coords2dViewer, { type Coords2dDataSource } from "@/components/analyze/coords2d-viewer";
import { isXmippPickingProtocol, xmippPickingSource } from "@/components/picking/xmippPickingSource";
import type { ProjectService } from "@/services/ProjectService";

const outputService = {
  listCoords2dMicrographs: vi.fn(),
  fetchCoords2dForMicrograph: vi.fn(),
  fetchCoords2dMicrographImageObjectUrl: vi.fn(),
  fetchCoords2dMicrographThumbnailObjectUrl: vi.fn(),
  createCoords2dOutputFromCurrentCoordinates: vi.fn(),
};
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => outputService }));

// jsdom has no ResizeObserver; the viewer only uses it to follow its size.
class NoResizeObserver {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
}
vi.stubGlobal("ResizeObserver", NoResizeObserver);

function fakeImage() {
  return Promise.resolve({ url: "blob:micrograph", revoke: () => undefined, originalWidth: 400, originalHeight: 300 });
}

function pickingSource(overrides: Partial<Coords2dDataSource> = {}): Coords2dDataSource {
  return {
    key: "picking:7:116",
    listMicrographs: vi.fn().mockResolvedValue({
      micrographs: [{ id: "4", index: 1, fileName: "Runs/mic_DW.mrc", label: "ja_115-1_0001.tif", particles: 26 }],
      totalMicrographs: 1, totalPicks: 26, boxSize: 99,
    }),
    fetchCoordinates: vi.fn().mockResolvedValue([{ id: "m0", micId: "4", x: 100, y: 120 }]),
    fetchImage: vi.fn().mockImplementation(fakeImage),
    fetchThumbnail: vi.fn().mockImplementation(fakeImage),
    createOutput: vi.fn(),
    saveMicrograph: vi.fn().mockResolvedValue(undefined),
    saveBoxSize: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Xmipp picking session in the coordinates viewer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognises the protocols that use Xmipp's picker", () => {
    expect(isXmippPickingProtocol("XmippProtParticlePicking")).toBe(true);
    expect(isXmippPickingProtocol("SphireProtCRYOLOPicking")).toBe(false);
    expect(isXmippPickingProtocol(null)).toBe(false);
  });

  it("maps every viewer operation to the protocol's picking session", async () => {
    const service = {
      fetchPickingSession: vi.fn().mockResolvedValue({ micrographs: [] }),
      fetchPickingParticles: vi.fn().mockResolvedValue({ coordinates: [{ id: "m0", micId: "4", x: 1, y: 2 }], automatic: [] }),
      fetchPickingMicrographImageObjectUrl: vi.fn().mockImplementation(fakeImage),
      savePickingParticles: vi.fn().mockResolvedValue(undefined),
      savePickingSettings: vi.fn().mockResolvedValue(undefined),
      createPickingCoordinates: vi.fn().mockResolvedValue({ success: true, outputName: "outputCoordinates" }),
    } as unknown as ProjectService;
    const source = xmippPickingSource(service, "7", "116");
    await source.listMicrographs();
    expect(await source.fetchCoordinates("4")).toEqual([{ id: "m0", micId: "4", x: 1, y: 2 }]);
    await source.fetchImage("4", { size: 2200 });
    await source.saveMicrograph!("4", [{ x: 10, y: 20 }]);
    await source.saveBoxSize!(120);
    await source.createOutput({ micrographs: [] });
    expect(service.fetchPickingSession).toHaveBeenCalledWith("7", "116");
    expect(service.fetchPickingMicrographImageObjectUrl).toHaveBeenCalledWith("7", "116", "4", { size: 2200 });
    expect(service.savePickingParticles).toHaveBeenCalledWith("7", "116", "4", [{ x: 10, y: 20 }]);
    expect(service.savePickingSettings).toHaveBeenCalledWith("7", "116", 120);
    expect(service.createPickingCoordinates).toHaveBeenCalledWith("7", "116");
  });

  it("reads from the given source instead of a coordinates output", async () => {
    const source = pickingSource();
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" title="Particle picking" source={source} />);
    expect(await screen.findByText("(99)")).toBeInTheDocument();
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    expect(screen.getByText(/Particle picking/)).toBeInTheDocument();
    expect(outputService.listCoords2dMicrographs).not.toHaveBeenCalled();
    expect(outputService.fetchCoords2dForMicrograph).not.toHaveBeenCalled();
  });

  it("saves a new particle size in the session after a short pause", async () => {
    const source = pickingSource();
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
    expect(await screen.findByText("(99)")).toBeInTheDocument();
    expect(source.saveBoxSize).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(await screen.findByText("(100)")).toBeInTheDocument();
    await waitFor(() => expect(source.saveBoxSize).toHaveBeenCalledWith(100), { timeout: 3000 });
  });
});
