import { fireEvent, within, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({ getMyFacility: vi.fn() }));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MySessionsPanel from "@/pages/Facility/MySessionsPanel";

const styles = { cardSx: {}, cardHeaderSx: {}, colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" } };
const NAME = "2026_11_03_Gaoxin-Lu_000012";
const inTenDays = "2026-11-17";
const session = {
  id: 12, name: NAME, microscopeName: "Titan Krios G5", technique: "tomo", status: "finished", groupName: "Shannon lab",
  userName: "Gaoxin Lu", userEmail: "gaoxin@example.org", bookingRef: "B-1203", scheduledOn: "2026-11-03",
  startedAt: null, finishedAt: "2026-11-03T20:00:00+00:00", images: [], asPi: false,
  userNotes: "Thin ice on grid 6; the other grids are fine.", rawKeptUntil: inTenDays, processedKeptUntil: null,
  retention: { raw: { state: "due", until: inTenDays, daysLeft: 10, deletedAt: null },
               processed: { state: "none", until: null, daysLeft: null, deletedAt: null } },
  datasets: [{ id: 41, kind: "data", number: 1, folder: `${NAME}_DATA_01`, watch: "acquired", movieCount: 412,
               movieBytes: 3.2 * 1024 ** 3, projectId: 31, processing: { state: "launched" },
               grid: { gridNumber: 6, position: 2, gridType: "CuRh 1.2", specimen: "nsp9+T2C3", status: "used",
                       boxLabel: "2 green", sampleId: 1, sampleCode: "NZ251" } }],
};
const mine = { sessions: [session], isPi: false, downloadInstructions: "Ask for your iRODS ticket at the facility.",
               rawRetentionDays: 30, processedRetentionDays: 0,
               samples: [{ id: 1, code: "NZ251", description: "nsp9 complexes", boxes: [{ grids: [{}, {}] }], images: [] }] };

function renderPanel() {
  return render(<MemoryRouter><MySessionsPanel {...styles} /></MemoryRouter>);
}

describe("A user's own sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows their sessions with what the facility tells them, how long their data stay and how to take them", async () => {
    facilityMocks.getMyFacility.mockResolvedValue(mine);
    renderPanel();

    expect(await screen.findByText(NAME)).toBeInTheDocument();
    expect(screen.getByText("Thin ice on grid 6; the other grids are fine.")).toBeInTheDocument();
    expect(screen.getByText("Raw data kept until 17 Nov 2026 (10 days left).")).toBeInTheDocument();
    expect(screen.queryByTestId("retention-processed")).not.toBeInTheDocument();
    expect(screen.getByText("NZ251 · box 2 green · position 2 · grid #6 · nsp9+T2C3")).toBeInTheDocument();
    expect(screen.getByText(/412 movies · 3.2 GB/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Open the project of ${NAME}_DATA_01` })).toHaveAttribute("href", "/project/load/31");
    expect(screen.getByText("Ask for your iRODS ticket at the facility.")).toBeInTheDocument();
    expect(screen.getByText("My samples")).toBeInTheDocument();
    // The user is not told their own name, nor shown anything to change
    expect(screen.queryByText(/Gaoxin Lu ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit|Start|Finish|Delete/ })).not.toBeInTheDocument();
  });

  it("tells them when their data are past their date or were deleted", async () => {
    const retention = { raw: { state: "deleted", until: "2026-11-01", daysLeft: null, deletedAt: "2026-11-05T09:00:00+00:00" },
                        processed: { state: "expired", until: "2026-11-03", daysLeft: -4, deletedAt: null } };
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, sessions: [{ ...session, retention }] });
    renderPanel();

    expect(await screen.findByText("Raw data deleted on 5 Nov 2026.")).toBeInTheDocument();
    expect(screen.getByTestId("retention-processed")).toHaveTextContent(
      "Processed data were kept until 3 Nov 2026: they may be deleted any day now.");
  });

  it("tells a PI whose session of the group it is", async () => {
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, isPi: true, sessions: [{ ...session, asPi: true }] });
    renderPanel();

    const about = await screen.findByLabelText("About the session");
    for (const fact of ["Titan Krios G5", "Tomography", "3 Nov 2026", "Gaoxin Lu", "group Shannon lab"]) {
      expect(within(about).getByText(fact)).toBeInTheDocument();
    }
    expect(screen.getByText("Samples of you and your groups")).toBeInTheDocument();
  });

  it("opens a sample with each grid in its place and its state", async () => {
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, samples: [{
      id: 1, code: "NZ251", description: "nsp9 complexes", images: [], createdAt: "2026-10-01T10:00:00Z",
      boxes: [{ id: 10, label: "2 green", vitrificationCode: "NZ251.2", vitrifiedOn: "2026-09-28", images: [],
                grids: [{ id: 101, position: 2, gridNumber: 6, gridType: "CuRh 1.2", concentration: "0.3", specimen: "nsp9+T2C3",
                          status: "used", images: [] },
                        { id: 100, position: 1, gridNumber: 5, gridType: "Graphene", concentration: "", specimen: "",
                          status: "stored", images: [] }] }],
    }] });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Open NZ251" }));
    const dialog = await screen.findByRole("dialog", { name: "NZ251" });
    const box = within(dialog).getByRole("group", { name: "Box 2 green" });
    expect(within(box).getByText(/NZ251.2 · vitrified 28 Sept? 2026/)).toBeInTheDocument();
    expect(within(box).getAllByText(/^Grid #/).map((node) => node.textContent)).toEqual(["Grid #5", "Grid #6"]);
    expect(within(box).getByText("CuRh 1.2 · 0.3 mg/ml · nsp9+T2C3")).toBeInTheDocument();
    expect(within(box).getByText("Used")).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0]);
  });

  it("opens a DATA with what its movies say", async () => {
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, sessions: [{ ...session, datasets: [{ ...session.datasets[0],
      firstMovieAt: "2026-11-03T10:00:00Z", lastMovieAt: "2026-11-03T18:00:00Z",
      acquisition: { cameraName: "BM-Falcon", detectorName: "Falcon 4i", voltageKv: 300, magnification: 105000,
                     pixelSize: 0.83, nominalPixelSize: 0.84, pixelCalibrated: true, frames: 40, dosePerFrame: 1.2,
                     totalDose: 48, gainFile: "/data/gains/falcon_gain.mrc", warnings: ["Fewer frames than usual"] } }] }] });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: `Details of ${NAME}_DATA_01` }));
    const dialog = await screen.findByRole("dialog", { name: `${NAME}_DATA_01` });
    expect(within(dialog).getByText("Falcon 4i")).toBeInTheDocument();
    expect(within(dialog).getByText("0.83 Å (calibrated)")).toBeInTheDocument();
    expect(within(dialog).getByText("105,000×")).toBeInTheDocument();
    expect(within(dialog).getByText("48 e⁻/Å²")).toBeInTheDocument();
    expect(within(dialog).getByText("falcon_gain.mrc")).toBeInTheDocument();
    expect(within(dialog).getByText("Fewer frames than usual")).toBeInTheDocument();
    expect(within(dialog).getByText("box 2 green, place 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: `Open the project of ${NAME}_DATA_01` })).toBeInTheDocument();
  });

  it("says when there is nothing yet", async () => {
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, sessions: [], samples: [], downloadInstructions: "" });
    renderPanel();

    expect(await screen.findByText("You have no sessions at the facility yet.")).toBeInTheDocument();
  });
});
