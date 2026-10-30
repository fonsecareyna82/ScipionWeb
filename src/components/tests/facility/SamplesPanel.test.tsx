import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listSamples: vi.fn(),
  createSample: vi.fn(),
  updateSample: vi.fn(),
  deleteSample: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("@/api/access", () => ({ listGroupNames: vi.fn().mockResolvedValue([{ id: 3, name: "Shannon lab" }]) }));
vi.mock("@/api/projects", () => ({
  listUsers: vi.fn().mockResolvedValue([{ id: 8, email: "gaoxin@example.org", firstName: "Gao", lastName: "Xin" }]),
}));
vi.mock("@/api/auth", () => ({ loadCurrentUserOnce: vi.fn().mockResolvedValue({ id: 1, email: "me@example.org" }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import SamplesPanel from "@/pages/Facility/SamplesPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {}, selectSx: {}, menuPaperSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const grid = (id: number, position: number, gridNumber: number, gridType: string, status = "stored") => ({
  id, position, gridNumber, gridType, concentration: "0.3", specimen: "Dimer +5mM MnCl2", status, notes: "",
});

const nz251 = {
  id: 1, code: "NZ251", description: "nsp9 complexes", groupId: 3, groupName: "Shannon lab", ownerId: 8,
  ownerEmail: "gaoxin@example.org", ownerName: "Gao Xin", accessRoute: "Instruct PID 45466", notes: "",
  boxes: [{ id: 10, label: "1", vitrificationCode: "NZ251.2", vitrifiedOn: "2026-09-28", notes: "",
            grids: [grid(100, 1, 1, "Graphene"), grid(101, 2, 2, "CuRh 1.2", "loaded")] }],
};

describe("The samples and grids of the facility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listSamples.mockResolvedValue([nz251]);
  });

  it("lists each sample with its boxes and the grid in each position", async () => {
    render(<SamplesPanel {...styles} canEdit />);

    expect(await screen.findByText("NZ251")).toBeInTheDocument();
    expect(screen.getByText(/Group Shannon lab · owner Gao Xin · Instruct PID 45466 · 1 box, 2 grids \(1 loaded\)/))
      .toBeInTheDocument();
    expect(screen.getByText(/NZ251.2 · 28 Sept? 2026/)).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("CuRh 1.2")).toBeInTheDocument();
  });

  it("searches by code or description", async () => {
    render(<SamplesPanel {...styles} canEdit />);
    await screen.findByText("NZ251");

    fireEvent.change(screen.getByLabelText("Search samples"), { target: { value: "nsp9" } });

    await waitFor(() => expect(facilityMocks.listSamples).toHaveBeenLastCalledWith("nsp9"));
  });

  it("creates a sample with a box of four grid rows, keeping only the rows filled in", async () => {
    facilityMocks.createSample.mockResolvedValue({ ...nz251, id: 2 });
    render(<SamplesPanel {...styles} canEdit />);
    await screen.findByText("NZ251");

    fireEvent.click(screen.getByRole("button", { name: "New sample" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "NZ260" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add box" }));
    fireEvent.change(within(dialog).getByLabelText("Vitrification"), { target: { value: "NZ260.1" } });
    const types = within(dialog).getAllByLabelText("Grid type");
    expect(types).toHaveLength(4);
    fireEvent.change(types[0], { target: { value: "Au 1.2" } });
    fireEvent.change(within(dialog).getAllByLabelText("Grid number")[0], { target: { value: "7" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.createSample).toHaveBeenCalled());
    const payload = facilityMocks.createSample.mock.calls[0][0];
    expect(payload).toMatchObject({ code: "NZ260", groupId: null, ownerId: null });
    expect(payload.boxes).toEqual([{ id: null, label: "1", vitrificationCode: "NZ260.1", vitrifiedOn: null, notes: "",
      grids: [{ id: null, position: 1, gridNumber: 7, gridType: "Au 1.2", concentration: "", specimen: "",
                status: "stored", notes: "" }] }]);
  });

  it("edits a sample keeping the ids of its boxes and grids", async () => {
    facilityMocks.updateSample.mockResolvedValue(nz251);
    render(<SamplesPanel {...styles} canEdit />);
    await screen.findByText("NZ251");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Remove grid" })[0]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.updateSample).toHaveBeenCalled());
    const [sampleId, payload] = facilityMocks.updateSample.mock.calls[0];
    expect(sampleId).toBe(1);
    expect(payload).toMatchObject({ code: "NZ251", groupId: 3, ownerId: 8, accessRoute: "Instruct PID 45466" });
    expect(payload.boxes[0].id).toBe(10);
    expect(payload.boxes[0].vitrifiedOn).toBe("2026-09-28");
    expect(payload.boxes[0].grids.map((row: { id: number; status: string }) => [row.id, row.status]))
      .toEqual([[101, "loaded"]]);
  });

  it("only lets the staff who keep samples change them", async () => {
    render(<SamplesPanel {...styles} canEdit={false} />);

    expect(await screen.findByText("NZ251")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New sample" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
