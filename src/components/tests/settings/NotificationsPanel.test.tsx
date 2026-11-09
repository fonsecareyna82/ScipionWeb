import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  getMyNotificationPreferences: vi.fn(), saveMyNotificationPreferences: vi.fn(), getMailSettings: vi.fn(),
  saveMailSettings: vi.fn(), sendTestMail: vi.fn(), getNotificationDefaults: vi.fn(), saveNotificationDefaults: vi.fn(),
  listOutbox: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/notifications", () => notificationMocks);
vi.mock("react-hot-toast", () => ({ default: toastMocks }));

import NotificationsPanel from "@/pages/Settings/NotificationsPanel";

const booking = { kind: "facility.booking", group: "Facility", label: "My bookings",
                  description: "A booking of yours confirmed, moved, offered another time, rejected or cancelled.",
                  mandatory: false, channels: ["instant", "digest", "web", "off"], default: "instant", channel: "instant",
                  chosen: false };
const retention = { ...booking, kind: "facility.retention", label: "My session's data are about to be deleted",
                    mandatory: true, channels: ["instant", "digest"] };
const mail = { host: "smtp.cnb.csic.es", port: 587, security: "starttls", user: "scipion", sender: "scipion@cnb.csic.es",
               passwordSet: true, enabled: true, mailOn: false, sending: false, publicUrl: "https://scipion.cnb.csic.es",
               digest: { hour: 8, timezone: "Europe/Madrid" } };

async function chooseIn(select: HTMLElement, option: string) {
  fireEvent.mouseDown(within(select).getByRole("combobox"));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("Settings: notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationMocks.getMyNotificationPreferences.mockResolvedValue({ kinds: [booking, retention], mailEnabled: true });
    notificationMocks.getMailSettings.mockResolvedValue(mail);
    notificationMocks.getNotificationDefaults.mockResolvedValue({ kinds: [booking, retention] });
    notificationMocks.listOutbox.mockResolvedValue([
      { id: 9, kind: "facility.booking", label: "My bookings", title: "Booking of Krios: is confirmed", address: "ana@cnb.csic.es",
        createdAt: "2026-11-08T10:00:00Z", emailState: "failed", emailAttempts: 6, emailedAt: null,
        emailError: "The mail server did not take it: Connection refused" },
    ]);
  });

  it("lets a user choose how each notice reaches them, and go back to the default; mandatory ones cannot be turned off", async () => {
    notificationMocks.saveMyNotificationPreferences.mockResolvedValue({
      kinds: [{ ...booking, channel: "digest", chosen: true }, retention], mailEnabled: true });
    render(<NotificationsPanel canManage={false} />);

    const row = await screen.findByTestId("notification-kind-facility.booking");
    await chooseIn(row, "In one mail a day");
    await waitFor(() => expect(notificationMocks.saveMyNotificationPreferences).toHaveBeenCalledWith({ "facility.booking": "digest" }));
    await chooseIn(screen.getByTestId("notification-kind-facility.booking"), "Default: by mail at once");
    await waitFor(() => expect(notificationMocks.saveMyNotificationPreferences).toHaveBeenLastCalledWith({ "facility.booking": null }));

    fireEvent.mouseDown(within(screen.getByTestId("notification-kind-facility.retention")).getByRole("combobox"));
    expect(screen.queryByRole("option", { name: "Not at all" })).not.toBeInTheDocument();
    expect(screen.getByText("My session's data are about to be deleted · always mailed")).toBeInTheDocument();
    // Only the user's own part
    expect(screen.queryByText("Mail server")).not.toBeInTheDocument();
  });

  it("says the notices only show in the web while ScipionWeb sends no mail", async () => {
    notificationMocks.getMyNotificationPreferences.mockResolvedValue({ kinds: [booking], mailEnabled: false });
    render(<NotificationsPanel canManage={false} />);

    expect(await screen.findByText(/ScipionWeb does not send mail here/)).toBeInTheDocument();
  });

  it("sets the mail server for administrators, keeping the password, with the web's address and the digest's hour", async () => {
    notificationMocks.saveMailSettings.mockResolvedValue(mail);
    notificationMocks.sendTestMail.mockResolvedValue({ sentTo: ["me@cnb.csic.es"] });
    render(<NotificationsPanel canManage />);

    expect(await screen.findByDisplayValue("smtp.cnb.csic.es")).toBeInTheDocument();
    expect(screen.getByText("Set: leave it empty to keep it")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("The web's address"), { target: { value: "https://scipion.example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
    await waitFor(() => expect(notificationMocks.saveMailSettings).toHaveBeenCalled());
    const saved = notificationMocks.saveMailSettings.mock.calls[0][0];
    expect(saved).toMatchObject({ host: "smtp.cnb.csic.es", port: 587, publicUrl: "https://scipion.example.org",
                                  digest: { hour: 8, timezone: "Europe/Madrid" }, mailOn: false });
    // Off by default; turned on by the administrator
    fireEvent.click(screen.getByLabelText("Send notices by mail"));
    fireEvent.click(screen.getByRole("button", { name: "Save mail settings" }));
    await waitFor(() => expect(notificationMocks.saveMailSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ mailOn: true })));
    expect("password" in saved).toBe(false);

    expect(screen.getByRole("button", { name: "Send test mail" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Send a test to"), { target: { value: "me@cnb.csic.es" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test mail" }));
    await waitFor(() => expect(notificationMocks.sendTestMail).toHaveBeenCalledWith("me@cnb.csic.es"));

    // The mails sent, with why one did not go
    const failed = await screen.findByTestId("outbox-9");
    expect(within(failed).getByText("Failed")).toBeInTheDocument();
    expect(within(failed).getByText("The mail server did not take it: Connection refused")).toBeInTheDocument();
  });

  it("sets the defaults for whoever did not choose", async () => {
    notificationMocks.saveNotificationDefaults.mockResolvedValue({ kinds: [{ ...booking, channel: "web" }, retention] });
    render(<NotificationsPanel canManage />);

    await screen.findByText("Defaults for everyone");
    const rows = await screen.findAllByTestId("notification-kind-facility.booking");
    await chooseIn(rows[1], "Only in the web");

    await waitFor(() => expect(notificationMocks.saveNotificationDefaults).toHaveBeenCalledWith({ "facility.booking": "web" }));
  });
});
