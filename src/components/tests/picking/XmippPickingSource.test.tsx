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

// jsdom loads no images: let the micrograph load, so the viewer learns its size (from the
// image's original size) and fits it into the view as in a browser.
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 400;
  naturalHeight = 300;
  set src(_url: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
vi.stubGlobal("Image", LoadingImage);

// The box size is shown in its number field, next to the slider
async function expectBoxSize(value: number) {
  const field = await screen.findByRole("spinbutton", { name: "Box size in pixels" });
  await waitFor(() => expect(field).toHaveValue(value));
}

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

// A click on the canvas only hits a particle once the micrograph's particles and image are in: on a
// slow machine (CI) a click before that picks a new particle instead of selecting the existing one.
async function waitForMicrographShown(particles: number) {
  expect(await screen.findByText(new RegExp(`^${particles} particles?`), {}, { timeout: 5000 })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(), { timeout: 5000 });
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
      fetchPickingParticles: vi.fn().mockResolvedValue({ coordinates: [{ id: "m0", micId: "4", x: 1, y: 2 }], threshold: 0.4 }),
      fetchPickingMicrographImageObjectUrl: vi.fn().mockImplementation(fakeImage),
      savePickingParticles: vi.fn().mockResolvedValue(undefined),
      savePickingSettings: vi.fn().mockResolvedValue(undefined),
      createPickingCoordinates: vi.fn().mockResolvedValue({ success: true, outputName: "outputCoordinates" }),
    } as unknown as ProjectService;
    const source = xmippPickingSource(service, "7", "116");
    await source.listMicrographs();
    // Ids are unique across micrographs in the viewer, and plain in the session.
    expect(await source.fetchCoordinates("4")).toEqual([{ id: "4:m0", micId: "4", x: 1, y: 2 }]);
    await source.fetchImage("4", { size: 2200 });
    expect(source.getThreshold!("4")).toBe(0.4);
    await source.saveMicrograph!("4", [{ id: "4:a3", x: 10, y: 20 }, { id: "17", x: 5, y: 6 }], 0.6);
    expect(source.getThreshold!("4")).toBe(0.6);
    await source.saveBoxSize!(120);
    await source.createOutput({ micrographs: [] });
    expect(service.fetchPickingSession).toHaveBeenCalledWith("7", "116");
    expect(service.fetchPickingMicrographImageObjectUrl).toHaveBeenCalledWith("7", "116", "4", { size: 2200 });
    expect(service.savePickingParticles).toHaveBeenCalledWith(
      "7", "116", "4", [{ id: "a3", x: 10, y: 20 }, { x: 5, y: 6 }], 0.6);
    expect(service.savePickingSettings).toHaveBeenCalledWith("7", "116", 120);
    expect(service.createPickingCoordinates).toHaveBeenCalledWith("7", "116");
  });

  it("reads from the given source instead of a coordinates output", async () => {
    const source = pickingSource();
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" title="Particle picking" source={source} />);
    await expectBoxSize(99);
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    expect(screen.getByText(/Particle picking/)).toBeInTheDocument();
    expect(outputService.listCoords2dMicrographs).not.toHaveBeenCalled();
    expect(outputService.fetchCoords2dForMicrograph).not.toHaveBeenCalled();
  });

  it("saves a new particle size in the session after a short pause", async () => {
    const source = pickingSource();
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
    await expectBoxSize(99);
    expect(source.saveBoxSize).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    await expectBoxSize(100);
    await waitFor(() => expect(source.saveBoxSize).toHaveBeenCalledWith(100), { timeout: 3000 });
  });

  it("shows a threshold for automatic particles and saves it with the micrograph", async () => {
    const source = pickingSource({
      fetchCoordinates: vi.fn().mockResolvedValue([
        { id: "m0", micId: "4", x: 100, y: 120 },
        { id: "a0", micId: "4", x: 300, y: 320, score: 0.9, kind: "automatic" },
      ]),
      getThreshold: () => 0.2,
    });
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
    const slider = await screen.findByRole("slider", { name: "Automatic particles threshold" });
    expect(await screen.findByText("0.20")).toBeInTheDocument();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(await screen.findByText("0.21")).toBeInTheDocument();
    await waitFor(() => expect(source.saveMicrograph).toHaveBeenCalled(), { timeout: 3000 });
    const [micId, coordinates, threshold] = (source.saveMicrograph as any).mock.calls.at(-1);
    expect([micId, threshold]).toEqual(["4", 0.21]);
    expect(coordinates.map((point: { id?: string }) => point.id)).toEqual(["m0", "a0"]);
  });

  it("moves a particle grabbed with the picking tool instead of adding another", async () => {
    const source = pickingSource();
    const { container } = render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    await expectBoxSize(99);
    await waitForMicrographShown(1);
    fireEvent.click(screen.getByRole("button", { name: "Particle picker" }));
    const canvas = container.querySelector("canvas")!;
    // jsdom has no layout: the micrograph is fitted into a canvas of no size,
    // so the particle (100, 120) covers the point the pointer is at.
    const at = { x: 0, y: 0 };

    // A click on the particle adds nothing.
    fireEvent.mouseDown(canvas, { clientX: at.x, clientY: at.y });
    fireEvent.mouseUp(canvas, { clientX: at.x, clientY: at.y });
    expect(await screen.findByText(/^1 particles?/)).toBeInTheDocument();

    // Dragging it moves it.
    fireEvent.mouseDown(canvas, { clientX: at.x, clientY: at.y });
    fireEvent.mouseMove(canvas, { clientX: at.x + 40, clientY: at.y + 30 });
    fireEvent.mouseUp(canvas, { clientX: at.x + 40, clientY: at.y + 30 });
    await waitFor(() => expect(source.saveMicrograph).toHaveBeenCalled(), { timeout: 3000 });
    const [, coordinates] = (source.saveMicrograph as any).mock.calls.at(-1);
    expect(coordinates).toHaveLength(1);
    expect(coordinates[0].id).toBe("m0");
    expect([coordinates[0].x, coordinates[0].y]).not.toEqual([100, 120]);
  });

  it("has no threshold when the micrograph has only manual particles", async () => {
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={pickingSource({ getThreshold: () => 0 })} />);
    await expectBoxSize(99);
    expect(screen.queryByRole("slider", { name: "Automatic particles threshold" })).not.toBeInTheDocument();
  });

  it("trains on the current micrograph and moves on with Next, reloading the particles", async () => {
    const train = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn().mockResolvedValue(undefined);
    const source = pickingSource({
      listMicrographs: vi.fn().mockResolvedValue({
        micrographs: [
          { id: "4", index: 1, fileName: "a.mrc", label: "first.tif", particles: 26 },
          { id: "5", index: 2, fileName: "b.mrc", label: "second.tif", particles: 0 },
        ],
        totalMicrographs: 2, totalPicks: 26, boxSize: 99,
      }),
      supervised: { train, next },
    });
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    fireEvent.click(await screen.findByRole("button", { name: "Train" }));
    await waitFor(() => expect(train).toHaveBeenCalledWith("4"));
    await waitFor(() => expect((source.fetchCoordinates as any).mock.calls.filter((c: unknown[]) => c[0] === "4").length).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(next).toHaveBeenCalledWith("4", "5"));
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("5"));
    // Both micrographs were changed by the picker.
    await waitFor(() => expect(screen.getAllByRole("cell", { name: "Yes" })).toHaveLength(2));
  });

  it("fixes the box size once the picker is trained, as the desktop picker", async () => {
    const micrographs = [{ id: "4", index: 1, fileName: "a.mrc", label: "first.tif", particles: 26 }];
    const source = pickingSource({
      listMicrographs: vi.fn()
        .mockResolvedValueOnce({ micrographs, totalMicrographs: 1, totalPicks: 26, boxSize: 99 })
        .mockResolvedValue({ micrographs, totalMicrographs: 1, totalPicks: 26, boxSize: 99, boxSizeEditable: false }),
      supervised: { train: vi.fn().mockResolvedValue(undefined), next: vi.fn() },
    });
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
    await expectBoxSize(99);
    expect(screen.getAllByRole("slider")[0]).not.toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Train" }));
    expect(await screen.findByText("Fixed by the trained picker")).toBeInTheDocument();
    expect(screen.getAllByRole("slider")[0]).toBeDisabled();
  });

  it("offers no supervised buttons for coordinates outputs", async () => {
    render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={pickingSource()} />);
    await expectBoxSize(99);
    expect(screen.queryByRole("button", { name: "Train" })).not.toBeInTheDocument();
  });
});

describe("Xmipp picker tools in the coordinates viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { window.localStorage.clear(); } catch { /* no storage */ }
  });

  function templatesSource(overrides: Partial<NonNullable<Coords2dDataSource["templates"]>> = {}) {
    return {
      pick: vi.fn().mockImplementation(async (_micId, x, y) => ({ x: x + 3, y: y - 2 })),
      moved: vi.fn().mockResolvedValue(undefined),
      fetchImage: vi.fn().mockResolvedValue({ url: "blob:templates", revoke: vi.fn(), count: 2,
        originalWidth: null, originalHeight: null }),
      getNumber: vi.fn().mockReturnValue(2),
      setNumber: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function renderPicker(source: Coords2dDataSource) {
    return render(<Coords2dViewer projectId={7} protocolId={116} protocolLabel="Xmipp picking"
      outputName="picking" source={source} />);
  }

  it("maps the templates and the explored percentage to the picking session", async () => {
    const service = {
      fetchPickingSession: vi.fn().mockResolvedValue({ micrographs: [], templatesNum: 3, autopickPercent: 60 }),
      pickPickingParticle: vi.fn().mockResolvedValue({ x: 12, y: 13, centered: true, templatesFilled: 1, templatesReady: true }),
      pickingParticleMoved: vi.fn().mockResolvedValue(undefined),
      fetchPickingTemplatesObjectUrl: vi.fn().mockResolvedValue(null),
      savePickingSettings: vi.fn().mockResolvedValue(undefined),
      trainPickingClassifier: vi.fn(),
      correctPickingAndAutopickNext: vi.fn(),
    } as unknown as ProjectService;
    const source = xmippPickingSource(service, "7", "116");
    await source.listMicrographs();
    expect(source.templates!.getNumber()).toBe(3);
    expect(source.supervised!.getAutopickPercent!()).toBe(60);
    expect(await source.templates!.pick("4", 10, 11, true)).toEqual({ x: 12, y: 13 });
    expect(service.pickPickingParticle).toHaveBeenCalledWith("7", "116", "4", 10, 11, true);
    await source.templates!.moved("4", 5, 6);
    expect(service.pickingParticleMoved).toHaveBeenCalledWith("7", "116", "4", 5, 6);
    expect(await source.templates!.fetchImage({ size: 96 })).toBeNull();
    await source.templates!.setNumber(4);
    await source.supervised!.setAutopickPercent!(80);
    expect(service.savePickingSettings).toHaveBeenCalledWith("7", "116", { templatesNum: 4 });
    expect(service.savePickingSettings).toHaveBeenCalledWith("7", "116", { autopickPercent: 80 });
    expect(source.templates!.getNumber()).toBe(4);
    expect(source.supervised!.getAutopickPercent!()).toBe(80);
  });

  it("centers a new particle on the templates and saves it there", async () => {
    const templates = templatesSource();
    const source = pickingSource({ fetchCoordinates: vi.fn().mockResolvedValue([]), templates });
    const { container } = renderPicker(source);
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    fireEvent.click(screen.getByRole("button", { name: "Particle picker" }));
    const canvas = container.querySelector("canvas")!;
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(canvas, { clientX: 0, clientY: 0 });
    await waitFor(() => expect(templates.pick).toHaveBeenCalled());
    const [micId, x, y, center] = templates.pick.mock.calls[0];
    expect([micId, center]).toEqual(["4", true]);
    await waitFor(() => expect(source.saveMicrograph).toHaveBeenCalled(), { timeout: 3000 });
    const [, coordinates] = (source.saveMicrograph as any).mock.calls.at(-1);
    expect(coordinates).toHaveLength(1);
    expect([coordinates[0].x, coordinates[0].y]).toEqual([x + 3, y - 2]);
  });

  it("can pick without centering, and a moved particle joins the templates", async () => {
    const templates = templatesSource();
    const source = pickingSource({ templates });
    const { container } = renderPicker(source);
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    await waitForMicrographShown(1);
    const centerButton = await screen.findByRole("button", { name: "Center" });
    expect(centerButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(centerButton);
    expect(centerButton).toHaveAttribute("aria-pressed", "false");
    const canvas = container.querySelector("canvas")!;
    // Dragging the existing particle (jsdom: it covers the pointer).
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 20 });
    fireEvent.mouseUp(canvas, { clientX: 30, clientY: 20 });
    await waitFor(() => expect(templates.moved).toHaveBeenCalled());
    expect(templates.moved.mock.calls[0][0]).toBe("4");
    expect(templates.pick).not.toHaveBeenCalled();
  });

  it("deletes with Shift + click and with the Delete key, and hides markers with Space", async () => {
    const source = pickingSource({
      fetchCoordinates: vi.fn().mockResolvedValue([
        { id: "m0", micId: "4", x: 100, y: 120 },
        { id: "m1", micId: "4", x: 300, y: 320 },
      ]),
    });
    const { container } = renderPicker(source);
    await waitFor(() => expect(source.fetchCoordinates).toHaveBeenCalledWith("4"));
    await expectBoxSize(99);
    await waitForMicrographShown(2);
    const canvas = container.querySelector("canvas")!;
    // A click selects a particle; Delete removes it.
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(canvas, { clientX: 0, clientY: 0 });
    expect(await screen.findByText(/^x=/)).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: "Delete" });
    await waitFor(() => expect(source.saveMicrograph).toHaveBeenCalled(), { timeout: 3000 });
    expect((source.saveMicrograph as any).mock.calls.at(-1)[1]).toHaveLength(1);
    // Shift + click removes the other one.
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0, shiftKey: true });
    fireEvent.mouseUp(canvas, { clientX: 0, clientY: 0, shiftKey: true });
    await waitFor(() => expect((source.saveMicrograph as any).mock.calls.at(-1)[1]).toEqual([]), { timeout: 3000 });

    fireEvent.keyDown(canvas, { key: " " });
    expect(screen.getByRole("button", { name: "Show markers" })).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: "e" });
    expect(screen.getByRole("spinbutton", { name: "Eraser size" })).toHaveValue(100);
  });

  it("shows the templates and rebuilds them with another number", async () => {
    const templates = templatesSource();
    const source = pickingSource({ templates });
    renderPicker(source);
    fireEvent.click(await screen.findByRole("button", { name: "Templates" }));
    expect(await screen.findByAltText("Picking templates")).toHaveAttribute("src", "blob:templates");
    const number = screen.getByRole("spinbutton", { name: "Number of templates" });
    expect(number).toHaveValue(2);
    fireEvent.change(number, { target: { value: "4" } });
    fireEvent.keyDown(number, { key: "Enter" });
    await waitFor(() => expect(templates.setNumber).toHaveBeenCalledWith(4));
    await waitFor(() => expect(templates.fetchImage).toHaveBeenCalledTimes(2));
  });

  it("saves the explored percentage of the automatic picking", async () => {
    const setAutopickPercent = vi.fn().mockResolvedValue(undefined);
    const source = pickingSource({
      supervised: { train: vi.fn(), next: vi.fn(), getAutopickPercent: () => 50, setAutopickPercent },
    });
    renderPicker(source);
    const explore = await screen.findByRole("spinbutton", { name: "Explore percentage" });
    expect(explore).toHaveValue(50);
    fireEvent.change(explore, { target: { value: "70" } });
    fireEvent.blur(explore);
    await waitFor(() => expect(setAutopickPercent).toHaveBeenCalledWith(70));
  });
});
