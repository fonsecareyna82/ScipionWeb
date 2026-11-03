import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  getFacilitySettings: vi.fn(),
  saveFacilitySettings: vi.fn(),
  previewConventions: vi.fn(),
  getFacilityMailSettings: vi.fn(),
  saveFacilityMailSettings: vi.fn(),
  sendFacilityTestMail: vi.fn(),
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

const mail = { host: "smtp.cnb.csic.es", port: 587, security: "starttls", user: "facility", sender: "facility@cnb.csic.es",
               recipients: "", passwordSet: true, enabled: true };

describe("The facility's conventions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.getFacilitySettings.mockResolvedValue(answer);
    facilityMocks.getFacilityMailSettings.mockResolvedValue(mail);
    facilityMocks.previewConventions.mockImplementation(async ({ sessionNamePattern }: any) => {
      if (sessionNamePattern.includes("{owner}")) throw new Error("{owner} is not a piece of this pattern");
      return { session: sessionNamePattern === CNB ? "2026_11_03_Gaoxin-Lu_000123" : "20261103_KRIOS_0123", atlas: null, data: [] };
    });
  });

  it("shows what the session name pattern makes, and saves a preset", async () => {
    facilityMocks.saveFacilitySettings.mockResolvedValue({ ...answer, settings: { sessionNamePattern: CNB } });
    render(<ConfigurationPanel {...styles} />);

    expect(await screen.findByText("20261103_KRIOS_0123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "CNB-CSIC" }));
    expect(await screen.findByText("2026_11_03_Gaoxin-Lu_000123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.saveFacilitySettings).toHaveBeenCalledWith({ sessionNamePattern: CNB }));
  });

  it("says why a pattern makes no name, and does not save it", async () => {
    render(<ConfigurationPanel {...styles} />);
    await screen.findByText("20261103_KRIOS_0123");

    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "{date:%Y}_{owner}" } });

    expect(await screen.findByText("{owner} is not a piece of this pattern")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("keeps the mail password unless it is typed or removed, and sends a test", async () => {
    facilityMocks.saveFacilityMailSettings.mockResolvedValue(mail);
    facilityMocks.sendFacilityTestMail.mockResolvedValue({ sentTo: ["me@cnb.csic.es"] });
    render(<ConfigurationPanel {...styles} />);

    expect(await screen.findByDisplayValue("smtp.cnb.csic.es")).toBeInTheDocument();
    expect(screen.getByText("Set: leave it empty to keep it")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Recipients"), { target: { value: "ops@cnb.csic.es" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
    await waitFor(() => expect(facilityMocks.saveFacilityMailSettings).toHaveBeenCalled());
    const saved = facilityMocks.saveFacilityMailSettings.mock.calls[0][0];
    expect(saved).toMatchObject({ host: "smtp.cnb.csic.es", port: 587, recipients: "ops@cnb.csic.es" });
    expect("password" in saved).toBe(false);

    fireEvent.change(screen.getByLabelText("Send a test to"), { target: { value: "me@cnb.csic.es" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test mail" }));
    await waitFor(() => expect(facilityMocks.sendFacilityTestMail).toHaveBeenCalledWith("me@cnb.csic.es"));
  });
});
