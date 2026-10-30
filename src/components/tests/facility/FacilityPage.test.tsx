import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  loadFacilityStatusOnce: vi.fn(),
  listMicroscopes: vi.fn(),
  createMicroscope: vi.fn(),
  updateMicroscope: vi.fn(),
  deleteMicroscope: vi.fn(),
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
  });

  it("opens the first tab the user may use, with its own address", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: ["facility.manage"] });
    renderAt("/facility");

    expect(screen.getByRole("heading", { name: "Facility" })).toBeInTheDocument();
    expect(await screen.findByText("No microscopes yet.", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Microscopes", selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/facility/microscopes"));
  });

  it("does not open a tab the user may not use", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: ["facility.sessions"] });
    renderAt("/facility/microscopes");

    expect(await screen.findByText(/There is nothing for you here/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(facilityMocks.listMicroscopes).not.toHaveBeenCalled();
  });

  it("shows nothing of the facility when the installation runs none", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: false, permissions: [] });
    renderAt("/facility");

    expect(await screen.findByText(/when this installation runs a facility/)).toBeInTheDocument();
  });
});
