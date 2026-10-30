import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  loadFacilityStatusOnce: vi.fn(),
  listMicroscopes: vi.fn(),
  createMicroscope: vi.fn(),
  updateMicroscope: vi.fn(),
  deleteMicroscope: vi.fn(),
  listSamples: vi.fn(),
  createSample: vi.fn(),
  updateSample: vi.fn(),
  deleteSample: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("@/components/common/PageMeta", () => ({ default: () => null }));
vi.mock("@/components/common/PageBreadCrumb", () => ({ default: ({ pageTitle }: { pageTitle: string }) => <h1>{pageTitle}</h1> }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import FacilityPage from "@/pages/Facility/FacilityPage";

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/facility" element={<><FacilityPage /><Where /></>} />
        <Route path="/facility/:tab" element={<><FacilityPage /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("The Facility page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listMicroscopes.mockResolvedValue([]);
    facilityMocks.listSamples.mockResolvedValue([]);
  });

  it("opens the first tab the user may use, with its own address", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: ["facility.manage"] });
    renderAt("/facility");

    expect(screen.getByRole("heading", { name: "Facility" })).toBeInTheDocument();
    expect(await screen.findByText("No samples yet.", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Samples & grids", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Microscopes" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/facility/samples"));
  });

  it("does not open a tab the user may not use: it goes to one they may", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: ["facility.sessions"] });
    renderAt("/facility/microscopes");

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/facility/samples"));
    expect(screen.queryByRole("tab", { name: "Microscopes" })).not.toBeInTheDocument();
    expect(facilityMocks.listMicroscopes).not.toHaveBeenCalled();
  });

  it("has nothing for whom has no facility permission", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: [] });
    renderAt("/facility/samples");

    expect(await screen.findByText(/There is nothing for you here/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("shows nothing of the facility when the installation runs none", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: false, permissions: [] });
    renderAt("/facility");

    expect(await screen.findByText(/when this installation runs a facility/)).toBeInTheDocument();
  });
});
