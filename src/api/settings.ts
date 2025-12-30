// settingsApi
import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";

export type UserSettings = {
  theme: "system" | "light" | "dark";
  uiDensity: "comfortable" | "compact";
  fontScale: number;

  language: "en" | "es";
  timeZone: string;

  graphMiniMapEnabled: boolean;
  graphFocusModeEnabled: boolean;
  workflowsAutoRefreshSec: number;
};

export type UserSettingsPatch = Partial<UserSettings>;

export type InstanceSettings = {
  enableCelery: boolean;
  defaultQueueName: string;
  maxConcurrentRunsPerUser: number;

  requireConfirmBeforeExecute: boolean;
  requireConfirmBeforeDelete: boolean;
};

export type InstanceSettingsPatch = Partial<InstanceSettings>;

type ApiErrorShape = { message?: string; detail?: unknown; [k: string]: unknown };

class ApiError extends Error {
  status?: number;
  detail?: unknown;
  data?: unknown;

  constructor(message: string, opts?: { status?: number; detail?: unknown; data?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = opts?.status;
    this.detail = opts?.detail;
    this.data = opts?.data;
  }
}

async function safeJson<T = any>(response: Response): Promise<T> {
  // safeJson
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  // toApiError
  let payload: ApiErrorShape | string | undefined;
  try {
    payload = await safeJson<ApiErrorShape | string>(response);
  } catch {}

  const message =
    (typeof payload === "object" && (payload.message as string)) ||
    (typeof payload === "object" && (payload.detail as string)) ||
    (typeof payload === "string" && payload) ||
    fallback;

  const detail = typeof payload === "object" ? payload.detail : undefined;
  return new ApiError(message || fallback, {
    status: response.status,
    detail,
    data: payload,
  });
}

/* ======================= userSettings ======================= */

export async function fetchUserSettings(): Promise<UserSettings> {
  // fetchUserSettings
  const res = await fetchWithAuth(`${BASE_URL}/settings/user`, { method: "GET" });
  if (!res.ok) throw await toApiError(res, "Failed to load user settings");
  return safeJson<UserSettings>(res);
}

export async function putUserSettings(payload: UserSettings): Promise<UserSettings> {
  // putUserSettings
  const res = await fetchWithAuth(`${BASE_URL}/settings/user`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toApiError(res, "Failed to update user settings");
  return safeJson<UserSettings>(res);
}

export async function patchUserSettings(patch: UserSettingsPatch): Promise<UserSettings> {
  // patchUserSettings
  const res = await fetchWithAuth(`${BASE_URL}/settings/user`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await toApiError(res, "Failed to patch user settings");
  return safeJson<UserSettings>(res);
}

/* ======================= instanceSettings ======================= */

export async function fetchInstanceSettings(): Promise<InstanceSettings> {
  // fetchInstanceSettings
  const res = await fetchWithAuth(`${BASE_URL}/settings/instance`, { method: "GET" });
  if (!res.ok) throw await toApiError(res, "Failed to load instance settings");
  return safeJson<InstanceSettings>(res);
}

export async function putInstanceSettings(payload: InstanceSettings): Promise<InstanceSettings> {
  // putInstanceSettings
  const res = await fetchWithAuth(`${BASE_URL}/settings/instance`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toApiError(res, "Failed to update instance settings");
  return safeJson<InstanceSettings>(res);
}

export async function patchInstanceSettings(patch: InstanceSettingsPatch): Promise<InstanceSettings> {
  // patchInstanceSettings
  const res = await fetchWithAuth(`${BASE_URL}/settings/instance`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await toApiError(res, "Failed to patch instance settings");
  return safeJson<InstanceSettings>(res);
}
