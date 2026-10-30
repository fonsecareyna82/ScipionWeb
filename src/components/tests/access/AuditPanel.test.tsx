import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  listAuditCategories: vi.fn(),
  listAuditEvents: vi.fn(),
}));
vi.mock("@/api/access", () => accessMocks);

import AuditPanel, { describeAuditValue } from "@/pages/Settings/AuditPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {}, selectSx: {}, menuPaperSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

function event(id: number, action: string, details: Record<string, unknown> = {}) {
  return {
    id, action, details, createdAt: "2026-10-30T10:00:00Z", userId: 1, userEmail: "admin@example.com",
    targetType: "group", targetId: "7", targetName: "Lab of Ana", clientAddress: "10.0.0.7",
  };
}

describe("AuditPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.listAuditCategories.mockResolvedValue([
      { name: "groups", description: "Groups, their members and roles" },
      { name: "auth", description: "Sign-in, sign-up and passwords" },
    ]);
  });

  it("shows who did what, on what, with its details, and pages back to older events", async () => {
    accessMocks.listAuditEvents
      .mockResolvedValueOnce({
        events: [event(9, "groups.updated", { members: { added: ["eva@example.com"] }, piAccess: "work" })],
        nextBefore: 9,
      })
      .mockResolvedValueOnce({ events: [event(4, "auth.signInFailed", { reason: "wrong password" })], nextBefore: null });

    render(<AuditPanel {...styles} />);

    expect(await screen.findByText("Changed a group")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Audit log" });
    expect(within(table).getByText("Lab of Ana")).toBeInTheDocument();
    expect(within(table).getByText("members: + eva@example.com; piAccess: work")).toBeInTheDocument();
    expect(within(table).getByText("10.0.0.7")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Older events" }));

    expect(await within(table).findByText("Sign-in refused")).toBeInTheDocument();
    expect(accessMocks.listAuditEvents).toHaveBeenLastCalledWith(
      { action: undefined, text: "", before: 9 }, 100);
    expect(within(table).getByText("Changed a group")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Older events" })).not.toBeInTheDocument();
  });

  it("searches once the typing stops", async () => {
    accessMocks.listAuditEvents.mockResolvedValue({ events: [], nextBefore: null });
    render(<AuditPanel {...styles} />);
    expect(await screen.findByText("No events.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "ana@" } });

    await waitFor(() => expect(accessMocks.listAuditEvents).toHaveBeenLastCalledWith(
      { action: undefined, text: "ana@", before: null }, 100));
    expect(accessMocks.listAuditEvents).toHaveBeenCalledTimes(2);
  });

  it("filters by kind of event from the newest again", async () => {
    accessMocks.listAuditEvents.mockResolvedValue({ events: [], nextBefore: null });
    render(<AuditPanel {...styles} />);
    expect(await screen.findByText("No events.")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText("Kind"));
    fireEvent.click(await screen.findByRole("option", { name: "Sign-in, sign-up and passwords" }));

    await waitFor(() => expect(accessMocks.listAuditEvents).toHaveBeenLastCalledWith(
      { action: "auth", text: "", before: null }, 100));
  });

  it("describes the details of an event in a line", () => {
    expect(describeAuditValue({ rolesAdded: ["User", "Technician"], isActive: true })).toBe(
      "rolesAdded: User, Technician; isActive: true");
    expect(describeAuditValue({ added: ["a"], removed: ["b"] })).toBe("+ a; − b");
    expect(describeAuditValue(null)).toBe("—");
  });
});
