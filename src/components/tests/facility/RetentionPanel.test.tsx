import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listRetention: vi.fn(), saveSessionRetention: vi.fn(), markRawDeleted: vi.fn(), unmarkRawDeleted: vi.fn(),
  deleteSessionProjects: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: toastMocks }));

import RetentionPanel from "@/pages/Facility/RetentionPanel";

const styles = { fieldSx: {}, cardSx: {}, cardHeaderSx: {}, colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" } };
const state = (change: object) => ({ state: "kept", until: null, daysLeft: null, own: false, deletedAt: null, deletedBy: null,
                                     noticesSent: [], ...change });
const expired = {
  id: 7, name: "20260801_KRIOS_0007", status: "finished", microscopeId: 1, microscopeName: "Titan Krios G5", technique: "spa",
  groupName: "Shannon lab", userName: "Gaoxin Lu", userEmail: "gaoxin@example.org", finishedAt: "2026-08-01T12:00:00+00:00",
  finishedOn: "2026-08-01", movieCount: 4120, movieBytes: 3.5 * 1024 ** 4,
  projects: [{ id: 31, name: "20260801_KRIOS_0007_DATA_01", ownerId: 3, bytes: 200 * 1024 ** 3 }],
  raw: state({ state: "expired", until: "2026-10-30", daysLeft: -8, noticesSent: [30, 7, 1] }),
  processed: state({ state: "due", until: "2026-11-20", daysLeft: 13, own: true }),
};
const kept = { ...expired, id: 8, name: "20261020_KRIOS_0008", projects: [],
               raw: state({ until: "2027-01-18", daysLeft: 72 }), processed: state({ state: "none" }) };
const gone = { ...expired, id: 9, name: "20260601_KRIOS_0009", status: "archived", projects: [],
               raw: state({ state: "deleted", deletedAt: "2026-10-01T10:00:00+00:00", deletedBy: "Ana Staff" }),
               processed: state({ state: "deleted", deletedAt: "2026-10-01T10:00:00+00:00" }) };
const list = { sessions: [expired, kept, gone], today: "2026-11-07", rawRetentionDays: 90, processedRetentionDays: 30,
               retentionNoticeDays: [30, 7, 1] };

function renderPanel(canEdit = true) {
  return render(<MemoryRouter><RetentionPanel {...styles} canEdit={canEdit} /></MemoryRouter>);
}

describe("The data retention of the finished sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilityMocks.listRetention.mockResolvedValue(list);
  });

  it("shows first what is past its date or due, with the facility's days and notices", async () => {
    renderPanel();

    const row = await screen.findByTestId("retention-7");
    expect(screen.queryByTestId("retention-8")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To delete or due (1)" })).toBeInTheDocument();
    expect(screen.getByText(/raw movies 90 days, projects 30 days; its user and the group's PI are mailed 30, 7, 1 days before/))
      .toBeInTheDocument();
    expect(within(row).getByText("Kept until 30 Oct 2026: 8 days past, to delete")).toBeInTheDocument();
    expect(within(row).getByText("Kept until 20 Nov 2026 · 13 days left")).toBeInTheDocument();
    expect(within(row).getByText("4120 movies, 3.50 TB")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /20260801_KRIOS_0007_DATA_01 · 200.0 GB/ }))
      .toHaveAttribute("href", "/project/load/31");

    fireEvent.click(screen.getByRole("button", { name: "Deleted (1)" }));
    expect(within(screen.getByTestId("retention-9")).getByText("Deleted 1 Oct 2026 by Ana Staff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All finished (3)" }));
    expect(screen.getByTestId("retention-8")).toBeInTheDocument();
  });

  it("records the raw movies as deleted, and can undo it", async () => {
    const recorded = { ...expired, raw: state({ state: "deleted", deletedAt: "2026-11-07T10:00:00+00:00", deletedBy: "Ana Staff" }) };
    facilityMocks.markRawDeleted.mockResolvedValue(recorded);
    facilityMocks.unmarkRawDeleted.mockResolvedValue(expired);
    renderPanel();

    fireEvent.click(within(await screen.findByTestId("retention-7")).getByRole("button", { name: "Record as deleted" }));
    fireEvent.click(await screen.findByRole("button", { name: "Record as deleted" }));

    await waitFor(() => expect(facilityMocks.markRawDeleted).toHaveBeenCalledWith(7));
    const row = screen.getByTestId("retention-7");
    expect(await within(row).findByText("Deleted 7 Nov 2026 by Ana Staff")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(facilityMocks.unmarkRawDeleted).toHaveBeenCalledWith(7));
  });

  it("deletes the session's projects after asking, warning when their date has not passed, and says which stayed", async () => {
    facilityMocks.deleteSessionProjects.mockResolvedValue({
      session: expired, deleted: [], failed: [{ id: 31, name: "20260801_KRIOS_0007_DATA_01", detail: "Project not found" }],
    });
    renderPanel();

    fireEvent.click(within(await screen.findByTestId("retention-7")).getByRole("button", { name: "Delete projects" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/kept until 20 Nov 2026: its date has not passed/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete the projects" }));
    await waitFor(() => expect(facilityMocks.deleteSessionProjects).toHaveBeenCalledWith(7));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(
      "1 project could not be deleted: 20260801_KRIOS_0007_DATA_01 (Project not found)", expect.anything()));
  });

  it("gives a session its own date, and its days back", async () => {
    facilityMocks.saveSessionRetention.mockResolvedValue(expired);
    renderPanel();
    const row = await screen.findByTestId("retention-7");

    fireEvent.click(within(row).getAllByRole("button", { name: "Keep longer" })[0]);
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Kept until"), { target: { value: "2027-02-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save the date" }));
    await waitFor(() => expect(facilityMocks.saveSessionRetention).toHaveBeenCalledWith(7, { rawKeepUntil: "2027-02-01" }));

    fireEvent.click(within(row).getByRole("button", { name: "Change date" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Use the facility's days again" }));
    await waitFor(() => expect(facilityMocks.saveSessionRetention).toHaveBeenCalledWith(7, { processedKeepUntil: null }));
  });

  it("only shows the dates to who does not keep sessions", async () => {
    renderPanel(false);

    expect(await screen.findByTestId("retention-7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record as deleted|Delete projects|Keep longer/ })).not.toBeInTheDocument();
  });
});
