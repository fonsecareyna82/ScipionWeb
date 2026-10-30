import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listMicroscopes: vi.fn(),
  createMicroscope: vi.fn(),
  updateMicroscope: vi.fn(),
  deleteMicroscope: vi.fn(),
  fetchMicroscopePhotoUrl: vi.fn(),
  uploadMicroscopePhoto: vi.fn(),
  deleteMicroscopePhoto: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MicroscopesPanel from "@/pages/Facility/MicroscopesPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {}, selectSx: {}, menuPaperSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const falcon = {
  id: 11, name: "Falcon 4i", metadataName: "BM-Falcon", energyFiltered: false, gainPath: "/data/gains/*Talos*gain*.mrc",
  gainFlip: "none", gainRotation: 0, notes: "",
  pixelSizes: [{ magnification: 120000, pixelSize: 0.84 }, { magnification: 92000, pixelSize: 1.14 }],
};
const ceta = {
  id: 12, name: "Ceta-D", metadataName: "", energyFiltered: false, gainPath: "", gainFlip: "vertical", gainRotation: 90,
  notes: "microED", pixelSizes: [],
};
const talos = {
  id: 1, name: "Talos 200kV", model: "Talos Arctica", status: "operational", energyFilter: "", acquisitionSoftware: "EPU",
  voltageKv: 200, csMm: 2.7, offloadPath: "/mnt/micros/talos_offload", sessionsEnabled: true, notes: "",
  detectors: [falcon, ceta],
};

describe("The microscopes of the facility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listMicroscopes.mockResolvedValue([talos]);
    facilityMocks.fetchMicroscopePhotoUrl.mockResolvedValue("blob:talos-photo");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:chosen"), revokeObjectURL: vi.fn() }));
  });

  it("lists each microscope with the calibrated pixel sizes of each detector", async () => {
    render(<MicroscopesPanel {...styles} />);

    expect(await screen.findByText("Talos 200kV")).toBeInTheDocument();
    expect(screen.getByText(/Talos Arctica · Falcon 4i, Ceta-D · 200 kV · Cs 2.7 mm/)).toBeInTheDocument();
    expect(screen.getByText("Falcon 4i (BM-Falcon): 120,000× 0.84 Å, 92,000× 1.14 Å")).toBeInTheDocument();
    expect(screen.getByText("Ceta-D: nominal pixel sizes")).toBeInTheDocument();
  });

  it("creates a microscope with a detector and its calibration table, leaving empty rows out", async () => {
    facilityMocks.createMicroscope.mockResolvedValue({ ...talos, id: 2 });
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "New microscope" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Krios G5" } });
    fireEvent.change(within(dialog).getByLabelText("Spherical aberration, Cs (mm)"), { target: { value: "2.7" } });
    fireEvent.change(within(dialog).getByLabelText("Detector"), { target: { value: "K3" } });
    fireEvent.change(within(dialog).getByLabelText("Name in the movies' metadata"), { target: { value: "EF-K3" } });
    fireEvent.click(within(dialog).getByLabelText("Behind the energy filter"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add magnification" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add magnification" }));
    const magnifications = within(dialog).getAllByLabelText("Magnification");
    fireEvent.change(magnifications[0], { target: { value: "105000" } });
    fireEvent.change(within(dialog).getAllByLabelText("Pixel size")[0], { target: { value: "0.83" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.createMicroscope).toHaveBeenCalled());
    const payload = facilityMocks.createMicroscope.mock.calls[0][0];
    expect(payload).toMatchObject({ name: "Krios G5", csMm: 2.7, voltageKv: null, status: "operational",
                                     sessionsEnabled: false });
    expect(payload.detectors).toEqual([{ id: null, name: "K3", metadataName: "EF-K3", energyFiltered: true, gainPath: "",
                                         gainFlip: "none", gainRotation: 0, notes: "",
                                         pixelSizes: [{ magnification: 105000, pixelSize: 0.83 }] }]);
    expect(facilityMocks.listMicroscopes).toHaveBeenCalledTimes(2);
  });

  it("leaves out the detector of a new microscope left empty", async () => {
    facilityMocks.createMicroscope.mockResolvedValue({ ...talos, id: 2 });
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "New microscope" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Glacios" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.createMicroscope).toHaveBeenCalled());
    expect(facilityMocks.createMicroscope.mock.calls[0][0].detectors).toEqual([]);
  });

  it("edits a microscope keeping its detectors' ids, removes a row and a detector", async () => {
    facilityMocks.updateMicroscope.mockResolvedValue(talos);
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    const falconBox = within(dialog).getByRole("group", { name: "Detector Falcon 4i" });
    expect(within(falconBox).getAllByLabelText("Magnification")).toHaveLength(2);
    fireEvent.click(within(falconBox).getAllByRole("button", { name: "Remove magnification" })[1]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove detector Ceta-D" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.updateMicroscope).toHaveBeenCalled());
    const [microscopeId, payload] = facilityMocks.updateMicroscope.mock.calls[0];
    expect(microscopeId).toBe(1);
    expect(payload).toMatchObject({ name: "Talos 200kV", csMm: 2.7, voltageKv: 200, sessionsEnabled: true });
    expect(payload.detectors).toEqual([{ ...falcon, pixelSizes: [{ magnification: 120000, pixelSize: 0.84 }] }]);
  });

  it("deletes a microscope after confirming", async () => {
    facilityMocks.deleteMicroscope.mockResolvedValue(null);
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(facilityMocks.deleteMicroscope).toHaveBeenCalledWith(1));
  });

  it("shows the photo of a microscope that has one, and its icon otherwise", async () => {
    facilityMocks.listMicroscopes.mockResolvedValue([{ ...talos, photoUpdatedAt: "2026-10-30T18:00:00Z" },
                                                     { ...talos, id: 2, name: "Krios G5", photoUpdatedAt: null }]);
    render(<MicroscopesPanel {...styles} />);

    expect(await screen.findByRole("img", { name: "Photo of Talos 200kV" })).toHaveAttribute("src", "blob:talos-photo");
    expect(facilityMocks.fetchMicroscopePhotoUrl).toHaveBeenCalledWith(1, "2026-10-30T18:00:00Z");
    expect(screen.queryByRole("img", { name: "Photo of Krios G5" })).not.toBeInTheDocument();
  });

  it("uploads the photo chosen when the microscope is saved", async () => {
    facilityMocks.updateMicroscope.mockResolvedValue(talos);
    facilityMocks.uploadMicroscopePhoto.mockResolvedValue(talos);
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    const photo = new File(["jpeg"], "talos.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialog).getByLabelText("Photo file"), { target: { files: [photo] } });
    expect(await within(dialog).findByRole("img", { name: "Photo of Talos 200kV" })).toHaveAttribute("src", "blob:chosen");
    expect(facilityMocks.uploadMicroscopePhoto).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.uploadMicroscopePhoto).toHaveBeenCalledWith(1, photo));
  });

  it("removes the stored photo when the microscope is saved", async () => {
    facilityMocks.listMicroscopes.mockResolvedValue([{ ...talos, photoUpdatedAt: "2026-10-30T18:00:00Z" }]);
    facilityMocks.updateMicroscope.mockResolvedValue(talos);
    facilityMocks.deleteMicroscopePhoto.mockResolvedValue(talos);
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove photo" }));
    expect(within(dialog).getByRole("button", { name: "Add photo" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.deleteMicroscopePhoto).toHaveBeenCalledWith(1));
    expect(facilityMocks.uploadMicroscopePhoto).not.toHaveBeenCalled();
  });
});
