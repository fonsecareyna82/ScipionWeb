import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  loadFacilityStatusOnce: vi.fn(),
  listFacilityAlerts: vi.fn(),
  acknowledgeFacilityAlert: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import FacilityAlertsBanner from "@/components/facility/FacilityAlertsBanner";

const stalled = {
  id: 5, kind: "stalled", sessionId: 3, sessionName: "S3", datasetId: 9, folder: "S3_DATA_01", projectId: null,
  protocolId: "", microscopeName: "Titan Krios G5", openedAt: new Date(Date.now() - 5 * 60000).toISOString(),
  message: "S3_DATA_01 (session S3, Titan Krios G5) has had no new movie for 25 minutes (412 movies so far).",
  resolvedAt: null, acknowledgedAt: null, acknowledgedBy: null, emailedAt: null, emailError: null,
};

function renderBanner() {
  return render(<MemoryRouter><FacilityAlertsBanner /></MemoryRouter>);
}

describe("The facility's alerts banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: ["facility.sessions"] });
  });

  it("is red while nobody is on an alert, and someone takes it", async () => {
    facilityMocks.listFacilityAlerts.mockResolvedValue([stalled]);
    facilityMocks.acknowledgeFacilityAlert.mockResolvedValue({
      ...stalled, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 2, acknowledgedByName: "Javier Collado" });
    renderBanner();

    expect(await screen.findByText("1 facility alert nobody is on yet")).toBeInTheDocument();
    expect(screen.getByText(stalled.message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the sessions" })).toHaveAttribute("href", "/facility/sessions");
    fireEvent.click(screen.getByRole("button", { name: /I'm on it/ }));

    await waitFor(() => expect(facilityMocks.acknowledgeFacilityAlert).toHaveBeenCalledWith(5));
    expect(await screen.findByText("1 facility alert being handled")).toBeInTheDocument();
    expect(screen.getByText(/Javier Collado is on it/)).toBeInTheDocument();
  });

  it("shows nothing without alerts, and nothing to whom is not of the facility's staff", async () => {
    facilityMocks.listFacilityAlerts.mockResolvedValue([]);
    const { unmount } = renderBanner();
    await waitFor(() => expect(facilityMocks.listFacilityAlerts).toHaveBeenCalled());
    expect(screen.queryByTestId("facility-alerts")).not.toBeInTheDocument();
    unmount();

    vi.clearAllMocks();
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: [] });
    facilityMocks.listFacilityAlerts.mockResolvedValue([stalled]);
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(facilityMocks.listFacilityAlerts).not.toHaveBeenCalled();
    expect(screen.queryByTestId("facility-alerts")).not.toBeInTheDocument();
  });

  it("lets those who only watch see the alerts without taking them", async () => {
    facilityMocks.loadFacilityStatusOnce.mockResolvedValue({ enabled: true, permissions: ["facility.monitor"] });
    facilityMocks.listFacilityAlerts.mockResolvedValue([stalled]);
    renderBanner();

    expect(await screen.findByText(stalled.message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /I'm on it/ })).not.toBeInTheDocument();
  });
});
