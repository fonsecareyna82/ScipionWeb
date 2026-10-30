import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listMicroscopes: vi.fn(),
  createMicroscope: vi.fn(),
  updateMicroscope: vi.fn(),
  deleteMicroscope: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MicroscopesPanel from "@/pages/Facility/MicroscopesPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {}, selectSx: {}, menuPaperSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const talos = {
  id: 1, name: "Talos 200kV", model: "Talos Arctica", status: "operational", detectors: "Falcon 4i, Ceta-D",
  energyFilter: "", acquisitionSoftware: "EPU", voltageKv: 200, csMm: 2.7, gainPath: "/data/gains/*Talos*gain*.mrc",
  gainFlip: "none", gainRotation: 0, offloadPath: "/mnt/micros/talos_offload", sessionsEnabled: true, notes: "",
  pixelSizes: [{ magnification: 120000, pixelSize: 0.84 }, { magnification: 92000, pixelSize: 1.14 }],
};

describe("The microscopes of the facility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listMicroscopes.mockResolvedValue([talos]);
  });

  it("lists each microscope with its calibrated pixel sizes", async () => {
    render(<MicroscopesPanel {...styles} />);

    expect(await screen.findByText("Talos 200kV")).toBeInTheDocument();
    expect(screen.getByText(/Talos Arctica · Falcon 4i, Ceta-D · 200 kV · Cs 2.7 mm/)).toBeInTheDocument();
    expect(screen.getByText(/120,000× 0.84 Å, 92,000× 1.14 Å/)).toBeInTheDocument();
  });

  it("creates a microscope with its calibration table, leaving empty rows out", async () => {
    facilityMocks.createMicroscope.mockResolvedValue({ ...talos, id: 2 });
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "New microscope" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Krios G5" } });
    fireEvent.change(within(dialog).getByLabelText("Spherical aberration, Cs (mm)"), { target: { value: "2.7" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add magnification" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add magnification" }));
    const magnifications = within(dialog).getAllByLabelText("Magnification");
    fireEvent.change(magnifications[0], { target: { value: "105000" } });
    fireEvent.change(within(dialog).getAllByLabelText("Pixel size")[0], { target: { value: "0.83" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.createMicroscope).toHaveBeenCalled());
    const payload = facilityMocks.createMicroscope.mock.calls[0][0];
    expect(payload).toMatchObject({ name: "Krios G5", csMm: 2.7, voltageKv: null, status: "operational",
                                     gainFlip: "none", gainRotation: 0, sessionsEnabled: false });
    expect(payload.pixelSizes).toEqual([{ magnification: 105000, pixelSize: 0.83 }]);
    expect(facilityMocks.listMicroscopes).toHaveBeenCalledTimes(2);
  });

  it("edits a microscope keeping its table, and removes a row", async () => {
    facilityMocks.updateMicroscope.mockResolvedValue(talos);
    render(<MicroscopesPanel {...styles} />);
    await screen.findByText("Talos 200kV");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByLabelText("Magnification")).toHaveLength(2);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Remove magnification" })[1]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.updateMicroscope).toHaveBeenCalled());
    const [microscopeId, payload] = facilityMocks.updateMicroscope.mock.calls[0];
    expect(microscopeId).toBe(1);
    expect(payload).toMatchObject({ name: "Talos 200kV", csMm: 2.7, voltageKv: 200, sessionsEnabled: true });
    expect(payload.pixelSizes).toEqual([{ magnification: 120000, pixelSize: 0.84 }]);
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
});
