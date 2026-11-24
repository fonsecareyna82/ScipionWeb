import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  getFacilitySettings: vi.fn(),
  saveFacilitySettings: vi.fn(),
  previewConventions: vi.fn(),
  getRoomScreenLink: vi.fn(),
  makeRoomScreenLink: vi.fn(),
  turnOffRoomScreen: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ConfigurationPanel from "@/pages/Facility/ConfigurationPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const NEUTRAL = "{date:%Y%m%d}_{microscope}_{id:04d}";
const CNB = "{date:%Y_%m_%d}_{user}_{id:06d}";
const answer = {
  settings: { sessionNamePattern: NEUTRAL },
  defaults: { sessionNamePattern: NEUTRAL },
  examples: { session: "20261103_KRIOS_0123", atlas: "20261103_KRIOS_0123_ATLAS", data: [] },
  presets: [{ id: "cnb", label: "CNB-CSIC", settings: { sessionNamePattern: CNB },
              microscope: { dataFolderPattern: "{session}_DATA_{n:02d}", atlasFolderPattern: "{session}_ATLAS", gridSlots: 12 } }],
};

describe("The facility's conventions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    facilityMocks.getFacilitySettings.mockResolvedValue(answer);
    facilityMocks.getRoomScreenLink.mockResolvedValue({ enabled: false, token: null, createdAt: null });
    facilityMocks.previewConventions.mockImplementation(async ({ sessionNamePattern }: any) => {
      if (sessionNamePattern.includes("{owner}")) throw new Error("{owner} is not a piece of this pattern");
      return { session: sessionNamePattern === CNB ? "2026_11_03_Gaoxin-Lu_000123" : "20261103_KRIOS_0123", atlas: null, data: [] };
    });
  });

  it("shows what the session name pattern makes, and saves a preset", async () => {
    facilityMocks.saveFacilitySettings.mockResolvedValue({ ...answer, settings: { sessionNamePattern: CNB } });
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);

    expect(await screen.findByText("20261103_KRIOS_0123", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "CNB-CSIC" }));
    expect(await screen.findByText("2026_11_03_Gaoxin-Lu_000123", undefined, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.saveFacilitySettings).toHaveBeenCalledWith({ sessionNamePattern: CNB }));
  });

  it("adds a piece to the end of the name with a click, and puts back the saved one with Reset", async () => {
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);
    await screen.findByText("20261103_KRIOS_0123", undefined, { timeout: 4000 });

    fireEvent.click(screen.getByRole("button", { name: "Add {user}" }));
    expect(screen.getByLabelText("Session name")).toHaveValue(`${NEUTRAL}_{user}`);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Session name")).toHaveValue(NEUTRAL);
  });

  it("says why a pattern makes no name, and does not save it", async () => {
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);
    await screen.findByText("20261103_KRIOS_0123", undefined, { timeout: 4000 });

    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "{date:%Y}_{owner}" } });

    expect(await screen.findByText("{owner} is not a piece of this pattern", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves who is mailed the alerts, and points to the mail server in Settings", async () => {
    facilityMocks.saveFacilitySettings.mockResolvedValue({ ...answer,
      settings: { ...answer.settings, alertRecipients: "ops1@cnb.csic.es, ops2@cnb.csic.es" } });
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("tab", { name: "Alerts" }));
    fireEvent.change(screen.getByLabelText("Mail the alerts to"), { target: { value: " ops1@cnb.csic.es; ops2@cnb.csic.es " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.saveFacilitySettings).toHaveBeenCalledWith({
      alertRecipients: "ops1@cnb.csic.es; ops2@cnb.csic.es" }));
    expect(await screen.findByDisplayValue("ops1@cnb.csic.es, ops2@cnb.csic.es")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings, Notifications" })).toHaveAttribute("href", "/settings?tab=notifications");
  });

  it("saves the facility's policies", async () => {
    facilityMocks.saveFacilitySettings.mockResolvedValue(answer);
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);
    await screen.findByText("20261103_KRIOS_0123", undefined, { timeout: 4000 });
    fireEvent.click(screen.getByRole("tab", { name: "Policies" }));

    fireEvent.change(screen.getByLabelText("Stalled after"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.saveFacilitySettings).toHaveBeenCalledWith({
      projectOwner: "staff", projectShareLevel: "view", calibrationTolerancePercent: 10, stallMinutes: 45, watchSeconds: 30,
      ctfMinDefocus: 5000, ctfMaxDefocus: 40000, ctfMaxResolution: 8, timezone: "Europe/Madrid",
    }));
  });

  it("saves how long the data are kept and the days before them when the users are told", async () => {
    facilityMocks.getFacilitySettings.mockResolvedValue({ ...answer,
      settings: { ...answer.settings, rawRetentionDays: 90, processedRetentionDays: 30, retentionNoticeDays: [30, 7, 1],
                  downloadInstructions: "" } });
    facilityMocks.saveFacilitySettings.mockResolvedValue({ ...answer,
      settings: { ...answer.settings, retentionNoticeDays: [14, 2] } });
    const toast = (await import("react-hot-toast")).default;
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);
    await screen.findByText("20261103_KRIOS_0123", undefined, { timeout: 4000 });
    fireEvent.click(screen.getByRole("tab", { name: "For the users" }));
    const notices = screen.getByLabelText("Notices before the data go");
    expect(notices).toHaveValue("30, 7, 1");

    fireEvent.change(notices, { target: { value: "a week" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("The notice days are whole numbers separated by commas, e.g. 30, 7, 1");
    expect(facilityMocks.saveFacilitySettings).not.toHaveBeenCalled();

    fireEvent.change(notices, { target: { value: "2, 14" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(facilityMocks.saveFacilitySettings).toHaveBeenCalledWith({
      rawRetentionDays: 90, processedRetentionDays: 30, downloadInstructions: "", retentionNoticeDays: [2, 14] }));
    // As the API keeps them: the furthest first
    await waitFor(() => expect(notices).toHaveValue("14, 2"));
  });

  it("shows a section per tab, keeps what is typed in one while another is open, and remembers the last", async () => {
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);
    await screen.findByText("20261103_KRIOS_0123", undefined, { timeout: 4000 });

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Naming", "Policies", "For the users", "Alerts", "Room screen"]);
    expect(screen.getByRole("tab", { name: "Naming", selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "For the users" }));
    fireEvent.change(screen.getByLabelText("Raw movies kept"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("tab", { name: "Naming" }));
    expect(screen.queryByLabelText("Raw movies kept")).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "For the users" }));
    expect(screen.getByLabelText("Raw movies kept")).toHaveValue("45");
    expect(localStorage.getItem("scipionweb.facility.configurationSection")).toBe("users");
  });
});

describe("The room screen's link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    facilityMocks.getFacilitySettings.mockResolvedValue(answer);
    facilityMocks.previewConventions.mockResolvedValue({ session: "20261103_KRIOS_0123", atlas: null, data: [] });
  });

  it("is made, shown with its token, and turned off", async () => {
    facilityMocks.getRoomScreenLink.mockResolvedValue({ enabled: false, token: null, createdAt: null });
    facilityMocks.makeRoomScreenLink.mockResolvedValue({ enabled: true, token: "abc123", createdAt: "2026-11-03T10:00:00Z" });
    facilityMocks.turnOffRoomScreen.mockResolvedValue({ enabled: false, token: null, createdAt: null });
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("tab", { name: /Room screen/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /Make its link/ }));
    expect(await screen.findByText(`${window.location.origin}/room?token=abc123`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the screen/ })).toHaveAttribute("href", `${window.location.origin}/room?token=abc123`);

    fireEvent.click(screen.getByRole("button", { name: /Turn off/ }));
    const confirm = await screen.findByRole("dialog", { name: "Turn the room screen off?" });
    expect(facilityMocks.turnOffRoomScreen).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText(/The room screen is off/)).toBeInTheDocument();
    expect(facilityMocks.turnOffRoomScreen).toHaveBeenCalled();
  }, 15000);

  it("asks before making a new link, which stops the one in use", async () => {
    facilityMocks.getRoomScreenLink.mockResolvedValue({ enabled: true, token: "abc123", createdAt: "2026-11-03T10:00:00Z" });
    facilityMocks.makeRoomScreenLink.mockResolvedValue({ enabled: true, token: "xyz789", createdAt: "2026-11-24T10:00:00Z" });
    render(<MemoryRouter><ConfigurationPanel {...styles} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("tab", { name: /Room screen/ }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: /New link/ }));
    let confirm = await screen.findByRole("dialog", { name: "Make a new link?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(facilityMocks.makeRoomScreenLink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /New link/ }));
    confirm = await screen.findByRole("dialog", { name: "Make a new link?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Make a new link" }));
    expect(await screen.findByText(`${window.location.origin}/room?token=xyz789`)).toBeInTheDocument();
  }, 15000);
});
