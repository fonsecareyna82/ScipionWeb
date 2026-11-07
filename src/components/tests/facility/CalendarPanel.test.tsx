import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  listResources: vi.fn(),
  listBookings: vi.fn(),
  listOpenBookingRequests: vi.fn(),
  getMyBookings: vi.fn(),
  createBooking: vi.fn(),
  updateBooking: vi.fn(),
  decideBooking: vi.fn(),
  answerBooking: vi.fn(),
  cancelBooking: vi.fn(),
  listMicroscopes: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("@/api/access", () => ({ listGroupNames: vi.fn(async () => [{ id: 3, name: "Shannon lab" }]) }));
vi.mock("@/api/projects", () => ({ listUsers: vi.fn(async () => [{ id: 7, email: "gaoxin@example.com", firstName: "Gaoxin", lastName: "Lu" }]) }));
vi.mock("@/api/auth", () => ({ loadCurrentUserOnce: vi.fn(async () => ({ id: 1, email: "ana@example.com", firstName: "Ana" })) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import CalendarPanel from "@/pages/Facility/CalendarPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const KRIOS = { id: 1, name: "Krios G5", microscopeId: 4, microscopeName: "Krios G5", runsSessions: true, color: "",
                unit: "session", minHours: 24, maxHours: 72, dayStart: "09:00", requiresAuthorization: true, active: true,
                notes: "" };
const VITROBOT = { ...KRIOS, id: 2, name: "Vitrobot", microscopeId: null, microscopeName: null, runsSessions: false,
                   unit: "hour", minHours: 1, maxHours: null };

const inDays = (days: number, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const REQUEST = { id: 11, resourceId: 1, resourceName: "Krios G5", resourceColor: "", kind: "booking", status: "requested",
                  startsAt: inDays(5), endsAt: inDays(6), title: "", mine: false, ownerName: "Gaoxin Lu",
                  groupName: "Shannon lab", technique: "tomo", priority: 2, justification: "Apoferritin tilt series",
                  createdAt: "2026-11-01T10:00:00Z" };

describe("The facility's calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    facilityMocks.listResources.mockResolvedValue([KRIOS, VITROBOT]);
    facilityMocks.listBookings.mockResolvedValue([]);
    facilityMocks.listOpenBookingRequests.mockResolvedValue([]);
    facilityMocks.getMyBookings.mockResolvedValue({ bookings: [], groups: [{ id: 3, name: "Shannon lab", groupRole: "member" }] });
  });

  it("puts the requests waiting before the staff, who confirm them", async () => {
    facilityMocks.listOpenBookingRequests.mockResolvedValue([REQUEST]);
    facilityMocks.decideBooking.mockResolvedValue({ ...REQUEST, status: "confirmed" });
    render(<CalendarPanel {...styles} isStaff isManager={false} />);

    const request = await screen.findByRole("group", { name: "Request 11" }, { timeout: 4000 });
    expect(within(request).getByText(/Gaoxin Lu · group Shannon lab · Tomography · priority 2/)).toBeInTheDocument();
    expect(within(request).getByText("“Apoferritin tilt series”")).toBeInTheDocument();
    fireEvent.click(within(request).getByRole("button", { name: "Confirm" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (the user sees it)"), { target: { value: "Fits" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(facilityMocks.decideBooking).toHaveBeenCalledWith(11, { action: "confirm", reason: "Fits", priority: 2 }));
    expect(screen.getByRole("button", { name: "New booking" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resources" })).not.toBeInTheDocument();
  }, 15000);

  it("lets a user take the other time the facility offers", async () => {
    facilityMocks.getMyBookings.mockResolvedValue({
      groups: [], bookings: [{ ...REQUEST, mine: true, status: "alternative", proposedStartsAt: inDays(8),
                               proposedEndsAt: inDays(9), decisionReason: "Maintenance that week" }],
    });
    facilityMocks.answerBooking.mockResolvedValue({});
    render(<CalendarPanel {...styles} isStaff={false} isManager={false} />);

    expect(await screen.findByText(/The facility offers .*: Maintenance that week/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Request 11" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Take it" }));

    await waitFor(() => expect(facilityMocks.answerBooking).toHaveBeenCalledWith(11, true));
  }, 15000);

  it("asks for time on a resource for the user's group", async () => {
    facilityMocks.createBooking.mockResolvedValue({ ...REQUEST, id: 12 });
    render(<CalendarPanel {...styles} isStaff={false} isManager={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "Ask for time" }, { timeout: 4000 }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Krios G5 is booked for 1 day to 3 days; its day starts at 09:00.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2030-12-01T09:00" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2030-12-03T09:00" } });
    expect(within(dialog).getByText("2 days")).toBeInTheDocument();
    expect(within(dialog).getByTestId("booking-when")).toHaveTextContent("Read as Sun, 1 Dec 09:00 → Tue, 3 Dec 09:00");
    fireEvent.change(within(dialog).getByLabelText("What it is for"), { target: { value: "Nsp9 grids" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(facilityMocks.createBooking).toHaveBeenCalledWith({
      resourceId: 1, startsAt: new Date("2030-12-01T09:00").toISOString(), endsAt: new Date("2030-12-03T09:00").toISOString(),
      justification: "Nsp9 grids", groupId: 3, technique: "spa",
    }));
  }, 15000);

  it("shows a user where their requests go before the first, and says a start already gone", async () => {
    render(<CalendarPanel {...styles} isStaff={false} isManager={false} />);
    expect(await screen.findByTestId("my-bookings-empty", undefined, { timeout: 4000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask for time" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2020-07-11T09:00" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2020-07-12T09:00" } });
    expect(within(dialog).getByTestId("booking-when")).toHaveTextContent("It starts in the past: Sat, 11 Jul 09:00");
    expect(within(dialog).getByRole("button", { name: "Ask" })).toBeDisabled();
  }, 15000);

  it("shows the others' bookings without whose", async () => {
    facilityMocks.listBookings.mockResolvedValue([{ id: 20, resourceId: 2, resourceName: "Vitrobot", resourceColor: "",
                                                    kind: "booking", status: "confirmed", startsAt: inDays(0, 10),
                                                    endsAt: inDays(0, 12), title: "Booked", mine: false }]);
    render(<CalendarPanel {...styles} isStaff={false} isManager={false} />);

    expect(await screen.findByText("Vitrobot · Booked", undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 15000);
});
