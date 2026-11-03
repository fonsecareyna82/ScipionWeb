import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const roomMocks = vi.hoisted(() => ({
  getRoomView: vi.fn(),
  roomMicroscopePhotoUrl: vi.fn((id: number, token: string) => `/photo/${id}?token=${token}`),
}));
vi.mock("@/api/facility", () => roomMocks);
vi.mock("@/components/common/PageMeta", () => ({ default: () => null }));

import RoomScreen from "@/pages/Facility/RoomScreen";

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><RoomScreen /></MemoryRouter>);

const view = {
  now: "2026-11-03T10:00:00Z",
  microscopes: [
    { id: 1, name: "Krios G4", code: "KRIOS", state: "acquiring", photoVersion: "v1",
      session: { name: "20261103_KRIOS_0123", technique: "spa", status: "acquiring", scheduledOn: "2026-11-03",
                 startedAt: new Date(Date.now() - 90 * 60000).toISOString(), technician: "Ana Pérez", user: "Gaoxin Lu",
                 pi: "Carlos Óscar", group: "Biocomputing",
                 datasets: [{ number: 1, folder: "20261103_KRIOS_0123_DATA_01", watch: "receiving", movieCount: 412,
                              minutesSinceLastMovie: 1.2, processing: "launched", sample: "S-042" },
                            { number: 2, folder: "20261103_KRIOS_0123_DATA_02", watch: "stalled", movieCount: 80,
                              minutesSinceLastMovie: 35, processing: null, sample: null }],
                 alerts: [{ kind: "stalled", folder: "20261103_KRIOS_0123_DATA_02", taken: true }] } },
    { id: 2, name: "Talos Arctica", code: "TALOS", state: "maintenance", photoVersion: null, session: null },
  ],
  upcoming: [{ day: "2026-11-05", microscope: "Krios G4", name: "20261105_KRIOS_0124", technique: "tomo",
               user: "Marta Ruiz", pi: "José María" }],
};

describe("The room screen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each microscope's state, its session, its grids and alerts, and the next sessions", async () => {
    roomMocks.getRoomView.mockResolvedValue(view);
    renderAt("/room?token=abc123");

    expect(await screen.findByText("Acquiring")).toBeInTheDocument();
    expect(roomMocks.getRoomView).toHaveBeenCalledWith("abc123");
    expect(screen.getByText("In maintenance")).toBeInTheDocument();
    expect(screen.getByText("20261103_KRIOS_0123")).toBeInTheDocument();
    expect(screen.getByText(/User Gaoxin Lu · PI Carlos Óscar · technician Ana Pérez/)).toBeInTheDocument();
    expect(screen.getByText(/acquiring for 1 h 30 min/)).toBeInTheDocument();
    expect(screen.getByText(/412 movies, last 1 min ago/)).toBeInTheDocument();
    expect(screen.getByText("processing")).toBeInTheDocument();
    expect(screen.getByText(/DATA_02: no new movies \(being handled\)/)).toBeInTheDocument();
    expect(screen.getByText("No session")).toBeInTheDocument();
    expect(screen.getByText(/Marta Ruiz · PI José María · Tomography/)).toBeInTheDocument();
    expect(roomMocks.roomMicroscopePhotoUrl).toHaveBeenCalledWith(1, "abc123", "v1");
  });

  it("says when its link no longer works", async () => {
    roomMocks.getRoomView.mockRejectedValue(Object.assign(new Error("No such screen"), { status: 404 }));
    renderAt("/room?token=old");
    expect(await screen.findByText(/link is not valid any more/)).toBeInTheDocument();
  });
});
