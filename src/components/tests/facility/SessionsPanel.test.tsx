import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  listMicroscopes: vi.fn(),
  listSamples: vi.fn(),
  addSessionImage: vi.fn(),
  deleteFacilityImage: vi.fn(),
  fetchFacilityImageUrl: vi.fn(),
  processSessionDataset: vi.fn(),
}));
vi.mock("@/api/facility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/facility")>();
  return { ...facilityMocks, sessionPayloadOf: actual.sessionPayloadOf };
});
vi.mock("@/api/access", () => ({ listGroupNames: vi.fn().mockResolvedValue([{ id: 3, name: "Shannon lab" }]) }));
vi.mock("@/api/auth", () => ({ loadCurrentUserOnce: vi.fn().mockResolvedValue(null) }));
vi.mock("@/api/projects", () => ({
  listUsers: vi.fn().mockResolvedValue([{ id: 7, email: "gaoxin@example.org", firstName: "Gaoxin", lastName: "Lu" }]),
  fetchWorkflows: vi.fn().mockResolvedValue([
    { id: "WH-Workflow 2D relion", name: "Workflow 2D relion", source: "WH", canLoad: true },
    { id: "WH-Workflow 2D cryosparc", name: "Workflow 2D cryosparc", source: "WH", canLoad: false,
      disabledReason: "Missing required plugins: cryosparc2" },
  ]),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { MemoryRouter } from "react-router";
import SessionsPanelBare from "@/pages/Facility/SessionsPanel";

// The DATA link to their projects: the panel lives in the app's router
const SessionsPanel = (props: any) => <MemoryRouter><SessionsPanelBare {...props} /></MemoryRouter>;

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {}, selectSx: {}, menuPaperSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const NAME = "2026_10_31_Gaoxin-Lu_000012";
const session = {
  id: 12, name: NAME, microscopeId: 1, microscopeName: "Talos Arctica", technique: "spa", status: "planned",
  groupId: 3, groupName: "Shannon lab", userId: 7, userName: "Gaoxin Lu", bookingRef: "B-1203",
  scheduledOn: "2026-10-31", notes: "", images: [],
  datasets: [
    { id: 40, kind: "atlas", number: 0, gridId: null, detectorId: null, notes: "", folder: `${NAME}_ATLAS`, images: [] },
    { id: 41, kind: "data", number: 1, gridId: 6, detectorId: null, notes: "", folder: `${NAME}_DATA_01`, images: [],
      grid: { gridNumber: 6, position: 2, gridType: "CuRh 1.2", specimen: "nsp9+T2C3", status: "stored",
              boxLabel: "2 green", sampleId: 1, sampleCode: "NZ251" } },
  ],
};
const talos = { id: 1, name: "Talos Arctica", sessionsEnabled: true,
                detectors: [{ id: 11, name: "Falcon 4i" }, { id: 12, name: "Ceta-D" }] };
const krios = { id: 2, name: "Titan Krios G5", sessionsEnabled: false, detectors: [] };
const nz251 = { id: 1, code: "NZ251", boxes: [{ id: 2, label: "2 green", grids: [
  { id: 6, position: 2, gridNumber: 6, gridType: "CuRh 1.2", specimen: "nsp9+T2C3" },
  { id: 9, position: 1, gridNumber: 9, gridType: "SiO 1/4", specimen: "nsp9+T2C3" },
] }] };

describe("The sessions of the facility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listSessions.mockResolvedValue([session]);
    facilityMocks.listMicroscopes.mockResolvedValue([talos, krios]);
    facilityMocks.listSamples.mockResolvedValue([nz251]);
  });

  it("lists each session with the folders for the microscope and the grid of each DATA", async () => {
    render(<SessionsPanel {...styles} canEdit />);

    expect(await screen.findByText(NAME)).toBeInTheDocument();
    expect(screen.getByText(/Talos Arctica · SPA · 31 Oct 2026 · Gaoxin Lu · group Shannon lab · booking B-1203/)).toBeInTheDocument();
    expect(screen.getByText(`${NAME}_ATLAS`)).toBeInTheDocument();
    expect(screen.getByText(`${NAME}_DATA_01`)).toBeInTheDocument();
    expect(screen.getByText("NZ251 · box 2 green · position 2 · grid #6 · nsp9+T2C3")).toBeInTheDocument();
    expect(facilityMocks.listSessions).toHaveBeenCalledWith("active", "");
  });

  it("copies the folder names to type them into EPU", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SessionsPanel {...styles} canEdit />);
    await screen.findByText(NAME);

    fireEvent.click(screen.getByRole("button", { name: `Copy ${NAME}_DATA_01` }));
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenNthCalledWith(1, `${NAME}_DATA_01`);
    expect(writeText).toHaveBeenNthCalledWith(2, `${NAME}_ATLAS\n${NAME}_DATA_01`);
  });

  it("starts a planned session, sending it back with its new status", async () => {
    facilityMocks.updateSession.mockResolvedValue({ ...session, status: "acquiring" });
    render(<SessionsPanel {...styles} canEdit />);
    await screen.findByText(NAME);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(facilityMocks.updateSession).toHaveBeenCalled());
    const [sessionId, payload] = facilityMocks.updateSession.mock.calls[0];
    expect(sessionId).toBe(12);
    expect(payload).toMatchObject({ name: NAME, status: "acquiring", microscopeId: 1 });
    expect(payload.datasets.map((dataset: any) => dataset.id)).toEqual([40, 41]);
  });

  it("creates a session on the microscope that runs sessions, with a grid per DATA", async () => {
    facilityMocks.createSession.mockResolvedValue(session);
    render(<SessionsPanel {...styles} canEdit />);
    await screen.findByText(NAME);

    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("Talos Arctica")).toBeInTheDocument());
    const data = within(dialog).getByRole("group", { name: "DATA_01" });
    fireEvent.change(within(data).getByLabelText("Grid"), { target: { value: "SiO" } });
    fireEvent.click(await screen.findByRole("option", { name: /position 1 · grid #9/ }));
    fireEvent.change(within(dialog).getByLabelText("EMhub booking"), { target: { value: "B-1300" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.createSession).toHaveBeenCalled());
    const payload = facilityMocks.createSession.mock.calls[0][0];
    expect(payload).toMatchObject({ name: "", microscopeId: 1, technique: "spa", status: "planned", bookingRef: "B-1300" });
    expect(payload.datasets).toEqual([{ id: null, kind: "data", number: 1, gridId: 9, detectorId: null, notes: "" }]);
    expect(payload).toMatchObject({ templateId: "", autoProcess: true });
  });

  it("keeps the name of a session that acquires: the microscope writes its folders", async () => {
    facilityMocks.listSessions.mockResolvedValue([{ ...session, status: "acquiring" }]);
    render(<SessionsPanel {...styles} canEdit />);
    await screen.findByText(NAME);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toBeDisabled();
  });

  it("lets those who only watch see the sessions without changing them", async () => {
    render(<SessionsPanel {...styles} canEdit={false} />);
    await screen.findByText(NAME);

    expect(screen.queryByRole("button", { name: "New session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("shows where each DATA of a session acquiring is, with what its first movie says", async () => {
    const lastMovieAt = new Date(Date.now() - 3 * 60000).toISOString();
    const acquiring = {
      ...session, status: "acquiring",
      datasets: [session.datasets[0],
        { ...session.datasets[1], watch: "receiving", movieCount: 412, movieBytes: 3.2 * 1024 ** 3, lastMovieAt,
          detectorName: "Falcon 4i",
          acquisition: { cameraName: "BM-Falcon", detectorName: "Falcon 4i", pixelSize: 0.84, pixelCalibrated: true,
                         nominalPixelSize: 0.8387, magnification: 120000, totalDose: 40.04, frames: 40, warnings: [] } },
        { id: 42, kind: "data", number: 2, gridId: 9, detectorId: null, notes: "", folder: `${NAME}_DATA_02`,
          watch: "noFolder", movieCount: 0 }],
    };
    facilityMocks.listSessions.mockResolvedValue([acquiring]);
    render(<SessionsPanel {...styles} canEdit />);

    expect(await screen.findByText("412 movies · 3.2 GB · 0.84 Å (calibrated) · 120,000× · 40 e⁻/Å² · 40 frames · last 3 min ago"))
      .toBeInTheDocument();
    expect(screen.getByText("Receiving")).toBeInTheDocument();
    expect(screen.getByText("Folder not made yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
  });

  it("says the dose at the camera when the metadata does not give the one on the sample", async () => {
    facilityMocks.listSessions.mockResolvedValue([{
      ...session, status: "acquiring",
      datasets: [{ ...session.datasets[1], watch: "stalled", movieCount: 1, movieBytes: 0,
                   acquisition: { pixelSize: 1.5678, pixelCalibrated: false, totalDose: null, cameraDose: 30.84,
                                  warnings: ["No DoseOnSample or DoseRate"] } }],
    }]);
    render(<SessionsPanel {...styles} canEdit />);

    expect(await screen.findByText("1 movie · 1.568 Å · 30.8 e⁻/Å² at the camera")).toBeInTheDocument();
    expect(screen.getByText("No new movies")).toBeInTheDocument();
  });

  it("follows the sessions acquiring without being asked", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      facilityMocks.listSessions.mockResolvedValue([{ ...session, status: "acquiring" }]);
      render(<SessionsPanel {...styles} canEdit />);
      await screen.findByText(NAME);
      expect(facilityMocks.listSessions).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30000);

      expect(facilityMocks.listSessions).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("chooses the template each DATA is processed with, among the loadable workflows", async () => {
    facilityMocks.updateSession.mockResolvedValue(session);
    render(<SessionsPanel {...styles} canEdit />);
    await screen.findByText(NAME);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(dialog).getByLabelText("Processing template"));
    expect(await screen.findByRole("option", { name: /Workflow 2D cryosparc/ })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("option", { name: /Workflow 2D relion/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(facilityMocks.updateSession).toHaveBeenCalled());
    expect(facilityMocks.updateSession.mock.calls[0][1]).toMatchObject({ templateId: "WH-Workflow 2D relion", autoProcess: true });
  });

  it("links each DATA to its project and monitor, and asks again for one that failed", async () => {
    facilityMocks.processSessionDataset.mockResolvedValue(session);
    facilityMocks.listSessions.mockResolvedValue([{
      ...session, status: "acquiring", templateId: "WH-Workflow 2D relion", autoProcess: true,
      datasets: [
        { ...session.datasets[1], watch: "receiving", movieCount: 3, projectId: 31, acquisition: { pixelSize: 1.14 },
          processing: { state: "launched", projectName: `${NAME}_DATA_01` } },
        { id: 42, kind: "data", number: 2, gridId: 9, detectorId: null, notes: "", folder: `${NAME}_DATA_02`,
          watch: "receiving", movieCount: 2, projectId: null, acquisition: { pixelSize: 1.14 },
          processing: { state: "error", message: "The template has no Import Movies to read the DATA" } },
      ],
    }]);
    render(<SessionsPanel {...styles} canEdit />);
    await screen.findByText(NAME);

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Open the project of ${NAME}_DATA_01` })).toHaveAttribute("href", "/project/load/31");
    expect(screen.getByRole("link", { name: `Monitor of ${NAME}_DATA_01` })).toHaveAttribute("href", "/project/31/monitor");
    expect(screen.getByText("Processing failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(facilityMocks.processSessionDataset).toHaveBeenCalledWith(42));
  });
});
