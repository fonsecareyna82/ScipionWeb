import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  changePassword: vi.fn(),
  myStorageQuotas: vi.fn(),
  getOwnComputeUsage: vi.fn(),
}));

vi.mock("@/api/auth", () => ({
  getUserProfile: api.getUserProfile,
  updateUserProfile: api.updateUserProfile,
  changePassword: api.changePassword,
}));
vi.mock("@/api/storage", () => ({ myStorageQuotas: api.myStorageQuotas }));
vi.mock("@/api/usage", () => ({
  getOwnComputeUsage: api.getOwnComputeUsage,
  formatHours: (hours: number) => `${hours} h`,
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/common/PageMeta", () => ({ default: () => null }));

import UserProfiles from "@/pages/UserProfiles";

const user = {
  id: 3, email: "ana@example.org", firstName: "Ana", lastName: "Ruiz", institution: "CNB",
  position: "Postdoc", phone: null, country: "Spain", city: "Madrid", postalCode: "28049",
  isVerified: true, createdAt: "2026-03-02T10:00:00Z", isSystemAdmin: false, permissions: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UserProfiles />
    </MemoryRouter>,
  );
}

describe("UserProfiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getUserProfile.mockResolvedValue(user);
    api.myStorageQuotas.mockResolvedValue([
      { kind: "user", targetId: 3, name: null, limitBytes: 1024 ** 4, usedBytes: 512 * 1024 ** 3, percent: 50,
        full: false },
    ]);
    api.getOwnComputeUsage.mockResolvedValue({ runs: 12, hours: 30, gpuHours: 8, failed: 0, running: 0,
      since: "", until: "" });
  });

  it("shows the person, their account and their usage", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Ana Ruiz" })).toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
    expect(screen.getByText("Postdoc · CNB")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    // An empty field says so, never "undefined" or "null"
    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    expect(screen.queryByText(/undefined|null/)).not.toBeInTheDocument();
    expect(await screen.findByText("512 GB of 1 TB")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("8 h")).toBeInTheDocument();
  });

  it("saves only the fields a user may change", async () => {
    api.updateUserProfile.mockResolvedValue({ ...user, institution: "ESRF" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("Institution"), { target: { value: " ESRF " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateUserProfile).toHaveBeenCalledTimes(1));
    const sent = api.updateUserProfile.mock.calls[0][0];
    expect(sent.institution).toBe("ESRF");
    expect(Object.keys(sent).sort()).toEqual(
      ["city", "country", "firstName", "institution", "lastName", "phone", "position", "postalCode"]);
    expect(await screen.findByText("Postdoc · ESRF")).toBeInTheDocument();
  });

  it("does not save without a first name", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The first name cannot be empty.")).toBeInTheDocument();
    expect(api.updateUserProfile).not.toHaveBeenCalled();
  });
});
