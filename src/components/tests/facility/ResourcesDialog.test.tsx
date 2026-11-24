import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listResources: vi.fn(), listMicroscopes: vi.fn(), createResource: vi.fn(), updateResource: vi.fn(), deleteResource: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ResourcesDialog from "@/pages/Facility/ResourcesDialog";

const krios = { id: 1, name: "Krios G5", microscopeId: 4, microscopeName: "Krios G5", runsSessions: true, color: "#2563eb",
                unit: "session", minHours: 24, maxHours: 72, dayStart: "09:00", requiresAuthorization: true, active: true, notes: "" };
const vitrobot = { ...krios, id: 2, name: "Vitrobot", microscopeId: null, microscopeName: null, runsSessions: false,
                   unit: "hour", minHours: null, maxHours: 4, requiresAuthorization: false, active: false };
const styles = { fieldSx: {}, colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" } };

describe("Facility resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listResources.mockResolvedValue([krios, vitrobot]);
    facilityMocks.listMicroscopes.mockResolvedValue([{ id: 4, name: "Krios G5" }]);
    facilityMocks.updateResource.mockResolvedValue(krios);
  });

  it("lists each resource with what it is and how it is booked", async () => {
    render(<ResourcesDialog {...styles} onClose={vi.fn()} />);
    expect(await screen.findByText("2 resources")).toBeInTheDocument();
    expect(screen.getByText("Makes sessions")).toBeInTheDocument();
    expect(screen.getByText("Needs training")).toBeInTheDocument();
    expect(screen.getByText("Not in use")).toBeInTheDocument();
    expect(screen.getByText("24–72 h")).toBeInTheDocument();
    expect(screen.getByText("day from 09:00")).toBeInTheDocument();
  });

  it("changes how a resource is booked, with its colour and switches", async () => {
    render(<ResourcesDialog {...styles} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Change Krios G5" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Charged" })).getByRole("button", { name: "By hour" }));
    fireEvent.click(screen.getByRole("button", { name: "Colour #059669" }));
    fireEvent.click(screen.getByLabelText("Needs training to use it"));
    fireEvent.click(screen.getByRole("button", { name: "Save resource" }));

    await waitFor(() => expect(facilityMocks.updateResource).toHaveBeenCalled());
    expect(facilityMocks.updateResource.mock.calls[0]).toEqual([1, expect.objectContaining({
      unit: "hour", color: "#059669", requiresAuthorization: false, minHours: 24, maxHours: 72 })]);
  });

  it("goes back to the list without saving", async () => {
    render(<ResourcesDialog {...styles} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add resource" }));
    expect(screen.getByText("New resource")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All resources" }));
    expect(await screen.findByText("2 resources")).toBeInTheDocument();
    expect(facilityMocks.createResource).not.toHaveBeenCalled();
  });
});
