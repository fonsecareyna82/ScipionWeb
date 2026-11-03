import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({ getMyFacility: vi.fn() }));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MySessionsPanel from "@/pages/Facility/MySessionsPanel";

const styles = { cardSx: {}, cardHeaderSx: {}, colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" } };
const NAME = "2026_11_03_Gaoxin-Lu_000012";
const inTenDays = new Date(Date.now() + 10 * 86400000 - 3600000).toISOString();
const session = {
  id: 12, name: NAME, microscopeName: "Titan Krios G5", technique: "tomo", status: "finished", groupName: "Shannon lab",
  userName: "Gaoxin Lu", userEmail: "gaoxin@example.org", bookingRef: "B-1203", scheduledOn: "2026-11-03",
  startedAt: null, finishedAt: "2026-11-03T20:00:00+00:00", images: [], asPi: false,
  userNotes: "Thin ice on grid 6; the other grids are fine.", rawKeptUntil: inTenDays, processedKeptUntil: null,
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
    expect(screen.getByText(/Raw data kept until .* \(10 days left\)\./)).toBeInTheDocument();
    expect(screen.getByText("NZ251 · box 2 green · position 2 · grid #6 · nsp9+T2C3")).toBeInTheDocument();
    expect(screen.getByText(/412 movies · 3.2 GB/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Open the project of ${NAME}_DATA_01` })).toHaveAttribute("href", "/project/load/31");
    expect(screen.getByText("Ask for your iRODS ticket at the facility.")).toBeInTheDocument();
    expect(screen.getByText("My samples")).toBeInTheDocument();
    // The user is not told their own name, nor shown anything to change
    expect(screen.queryByText(/Gaoxin Lu ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit|Start|Finish|Delete/ })).not.toBeInTheDocument();
  });

  it("tells a PI whose session of the group it is", async () => {
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, isPi: true, sessions: [{ ...session, asPi: true }] });
    renderPanel();

    expect(await screen.findByText(/Titan Krios G5 · Tomography · 3 Nov 2026 · Gaoxin Lu · group Shannon lab/)).toBeInTheDocument();
    expect(screen.getByText("Samples of you and your groups")).toBeInTheDocument();
  });

  it("says when there is nothing yet", async () => {
    facilityMocks.getMyFacility.mockResolvedValue({ ...mine, sessions: [], samples: [], downloadInstructions: "" });
    renderPanel();

    expect(await screen.findByText("You have no sessions at the facility yet.")).toBeInTheDocument();
  });
});
