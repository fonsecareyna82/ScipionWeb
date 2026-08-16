// settingsApi
import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import type {
  HostSettings,
  HostSettingsPatch,
  JobMonitoringOverview,
} from "@/services/ProjectService";

export type UserSettings = {
  theme:
  | "system"
  | "light"
  | "dark";

  uiDensity:
  | "comfortable"
  | "compact";

  fontScale: number;

  language:
  | "en"
  | "es";

  timeZone: string;

  workflowViewMode:
  | "treeTb"
  | "treeLr"
  | "grid"
  | "table";

  graphMiniMapEnabled: boolean;
  graphFocusModeEnabled: boolean;

  protocolOutputThumbnailsEnabled:
  boolean;

  workflowsAutoRefreshSec: number;
};

export type UserSettingsPatch = Partial<UserSettings>;

export type InstanceSettings = {
  defaultQueueName: string;
  maxConcurrentRunsPerUser: number;
};


export type InstanceGpuResource = {
  index: number;
  name: string;
  memoryTotalBytes?: number | null;
};

export type InstanceResources = {
  hostAlias: string;
  hostname: string;
  fqdn: string;
  schedulerName: string;

  operatingSystem: string;
  architecture: string;
  cpuModel: string;

  physicalCores: number;
  logicalCores: number;
  ramTotalBytes: number;

  gpuCount: number;
  gpus: InstanceGpuResource[];
};

export type InstanceSettingsPatch = Partial<InstanceSettings>;

export type EnvironmentVariable = {
  name: string;
  value: string;
  default?: string;
  description?: string;
  source?: string;
  isDefault?: boolean;
  type?: string;
};

export type EnvironmentVariablesPatch = Record<string, string>;

type ApiErrorShape = { message?: string; detail?: unknown;[k: string]: unknown };

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
  } catch { }

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

export async function fetchInstanceResources():
  Promise<InstanceResources> {
  const res = await fetchWithAuth(
    `${BASE_URL}/settings/instance/resources`,
    {
      method: "GET",
    },
  );

  if (!res.ok) {
    throw await toApiError(
      res,
      "Failed to load instance resources",
    );
  }

  return safeJson<InstanceResources>(
    res
  );
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

/* ======================= jobMonitoring ======================= */

export async function fetchJobsOverview(
  recentLimit: number = 25,
): Promise<JobMonitoringOverview> {
  const limit = Math.max(
    1,
    Math.min(
      100,
      Math.trunc(Number(recentLimit) || 25),
    ),
  );

  const res = await fetchWithAuth(
    `${BASE_URL}/settings/jobs?recentLimit=${limit}`,
    {
      method: "GET",
    },
  );

  if (!res.ok) {
    throw await toApiError(
      res,
      "Failed to load job monitoring data",
    );
  }

  return safeJson<JobMonitoringOverview>(res);
}

/* ======================= environmentVariables ======================= */

export async function fetchEnvironmentVariables(): Promise<EnvironmentVariable[]> {
  // fetchEnvironmentVariables
  const res = await fetchWithAuth(`${BASE_URL}/settings/environment`, { method: "GET" });
  if (!res.ok) throw await toApiError(res, "Failed to load environment variables");
  return safeJson<EnvironmentVariable[]>(res);
}

export async function patchEnvironmentVariables(
  patch: EnvironmentVariablesPatch,
): Promise<EnvironmentVariable[]> {
  // patchEnvironmentVariables
  const res = await fetchWithAuth(`${BASE_URL}/settings/environment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await toApiError(res, "Failed to patch environment variables");
  return safeJson<EnvironmentVariable[]>(res);
}

/* ======================= hostSettings ======================= */

function normalizeHostSettingsPayload(raw: any): HostSettings {
  const source =
    raw && typeof raw === "object" && raw.config && typeof raw.config === "object"
      ? raw.config
      : raw;

  return (source && typeof source === "object" ? source : {}) as HostSettings;
}


export async function fetchHostSettings(): Promise<HostSettings> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/host`, {
    method: "GET",
  });

  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch host settings");
  }

  const data = await safeJson<any>(response);
  return normalizeHostSettingsPayload(data);
}

export async function putHostSettings(
  settings: HostSettings,
): Promise<HostSettings | null> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/host`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings ?? {}),
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw await toApiError(response, "Failed to update host settings");
  }

  const data = await safeJson<any>(response);
  return normalizeHostSettingsPayload(data);
}

export async function patchHostSettings(
  patch: HostSettingsPatch,
): Promise<HostSettings | null> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/host`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch ?? {}),
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw await toApiError(response, "Failed to patch host settings");
  }

  const data = await safeJson<any>(response);
  return normalizeHostSettingsPayload(data);
}