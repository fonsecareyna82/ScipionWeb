import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

// How a kind of notice reaches a user: in the web and mailed at once, in the web and in one mail a day, only in
// the web, or nowhere (mandatory kinds are always mailed: instant or digest)
export type NotificationChannel = "instant" | "digest" | "web" | "off";

export type NotificationKindPreference = {
  kind: string;
  group: string;
  label: string;
  description: string;
  mandatory: boolean;
  channels: NotificationChannel[];
  // The administrator's default, else the kind's own
  default: NotificationChannel;
  channel: NotificationChannel;
  // The user chose it (not the default)
  chosen?: boolean;
};

export type NotificationPreferences = { kinds: NotificationKindPreference[]; mailEnabled: boolean };

export type UserNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  readAt: string | null;
};

export const listMyNotifications = (limit = 50) =>
  request<{ notifications: UserNotification[]; unread: number }>(`/notifications?limit=${limit}`,
    "Failed to load your notifications");
/** Mark notices read: the given ones, else all of them. */
export const markNotificationsRead = (ids?: number[]) =>
  request<{ unread: number }>("/notifications/read", "Failed to mark the notifications read",
    { method: "POST", body: JSON.stringify(ids ? { ids } : {}) });
export const getMyNotificationPreferences = () =>
  request<NotificationPreferences>("/notifications/preferences", "Failed to load your notification choices");
/** {kind: channel}; null goes back to the default. */
export const saveMyNotificationPreferences = (channels: Record<string, NotificationChannel | null>) =>
  request<NotificationPreferences>("/notifications/preferences", "Failed to save your notification choices",
    { method: "PUT", body: JSON.stringify(channels) });

// The administrators': the mail server, the web's public address, the digest's hour, the defaults and the mails sent
export type MailSecurity = "starttls" | "ssl" | "none";
export type MailSettings = {
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  sender: string;
  passwordSet: boolean;
  // A server is set (the test mail works)
  enabled: boolean;
  // An administrator turned the mail on (off by default): notices are mailed only when both
  mailOn: boolean;
  sending: boolean;
  publicUrl: string;
  digest: { hour: number; timezone: string };
};
export type MailSettingsPayload = Omit<MailSettings, "passwordSet" | "enabled" | "sending"> & {
  // Left out: the password there is stays; "": no password
  password?: string;
};
export type OutboxMail = {
  id: number;
  kind: string;
  label: string;
  title: string;
  address: string | null;
  createdAt: string;
  emailState: "pending" | "digest" | "sent" | "failed" | "skipped";
  emailAttempts: number;
  emailedAt: string | null;
  emailError: string | null;
};

export const getMailSettings = () => request<MailSettings>("/notifications/settings/mail", "Failed to load the mail settings");
export const saveMailSettings = (payload: MailSettingsPayload) =>
  request<MailSettings>("/notifications/settings/mail", "Failed to save the mail settings",
    { method: "PUT", body: JSON.stringify(payload) });
export const sendTestMail = (to: string) =>
  request<{ sentTo: string[] }>("/notifications/settings/mail/test", "The test mail did not go",
    { method: "POST", body: JSON.stringify({ to }) });
export const getNotificationDefaults = () =>
  request<{ kinds: NotificationKindPreference[] }>("/notifications/settings/defaults", "Failed to load the defaults");
export const saveNotificationDefaults = (channels: Record<string, NotificationChannel>) =>
  request<{ kinds: NotificationKindPreference[] }>("/notifications/settings/defaults", "Failed to save the defaults",
    { method: "PUT", body: JSON.stringify(channels) });
export const listOutbox = (limit = 100) =>
  request<OutboxMail[]>(`/notifications/outbox?limit=${limit}`, "Failed to load the mails sent");
