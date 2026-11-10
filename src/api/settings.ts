// settingsApi
import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import type {
  HostSettings,
  HostSettingsPatch,
  JobMonitoringOverview,
  UserSettings,
  UserSettingsPatch,
} from "@/services/ProjectService";


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
  isOverride?: boolean;
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

export type NodePlugin = {
  pipName?: string | null;
  name?: string | null;
  pipVersion?: string | null;
};

export type NodeCapabilities = {
  hostname: string;
  error?: string | null;
  gpuCount: number;
  gpus: InstanceGpuResource[];
  plugins: NodePlugin[];
  // Its fast local disk for the protocols' temporary files, as that machine sees it (path null: none)
  scratch?: NodeScratch;
};

export type NodeScratch = {
  path: string | null;
  exists?: boolean | null;
  writable?: boolean | null;
  totalBytes?: number | null;
  freeBytes?: number | null;
  error?: string | null;
  // What the last cleaning did (what crashed or deleted protocols left there)
  lastCleanup?: {
    at: string;
    removed: { name: string; reason: string; bytes: number }[];
    freedBytes: number;
    kept: number;
    errors: string[];
  } | null;
};

/** Ask a machine to clean its scratch now; the result shows in its report once done. */
export async function cleanNodeScratch(hostname: string): Promise<{ requested: boolean }> {
  const res = await fetchWithAuth(`${BASE_URL}/settings/jobs/nodes/${encodeURIComponent(hostname)}/scratch/clean`,
    { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.detail || "The machine could not be asked to clean its scratch"));
  return data;
}

/** Set (or unset, with an empty path) a machine's scratch; its protocol worker must be restarted to use it. */
export async function saveNodeScratch(hostname: string, path: string): Promise<{ path: string | null; file: string; node: boolean }> {
  const res = await fetchWithAuth(`${BASE_URL}/settings/jobs/nodes/${encodeURIComponent(hostname)}/scratch`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.detail || "Failed to save the scratch"));
  return data;
}

export type NodeCapabilitiesList = {
  available: boolean;
  error?: string | null;
  nodes: NodeCapabilities[];
};

export async function fetchJobNodeCapabilities(
  timeoutSeconds: number = 5,
): Promise<NodeCapabilitiesList> {
  const timeout = Math.max(
    0.5,
    Math.min(30, Number(timeoutSeconds) || 5),
  );

  const res = await fetchWithAuth(
    `${BASE_URL}/settings/jobs/nodes?timeout=${timeout}`,
    {
      method: "GET",
    },
  );

  if (!res.ok) {
    throw await toApiError(
      res,
      "Failed to load node capabilities",
    );
  }

  return safeJson<NodeCapabilitiesList>(res);
}

export type JobWorkerKind =
  "plugins" | "protocols";

export type JobWorkerAction =
  "start" | "stop" | "restart";

export async function controlJobWorker(
  workerKind: JobWorkerKind,
  action: JobWorkerAction,
): Promise<any> {
  const res = await fetchWithAuth(
    `${BASE_URL}/settings/jobs/workers/${workerKind}/${action}`,
    {
      method: "POST",
    },
  );

  if (!res.ok) {
    throw await toApiError(
      res,
      `Failed to ${action} ${workerKind} worker`,
    );
  }

  return safeJson<any>(res);
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

export async function resetEnvironmentVariable(
  variableName: string,
): Promise<EnvironmentVariable[]> {
  // resetEnvironmentVariable
  const res = await fetchWithAuth(
    `${BASE_URL}/settings/environment/${encodeURIComponent(variableName)}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok) {
    throw await toApiError(
      res,
      "Failed to reset environment variable",
    );
  }

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
// Signing in with an institution's account (OpenID Connect: Keycloak and the like) ---------------------------------

export type SignInProviderSetup = {
  id: number;
  key: string;
  label: string;
  issuer: string;
  clientId: string;
  scopes: string;
  newAccounts: "active" | "pending";
  enabled: boolean;
  hasSecret: boolean;
  accounts?: number;
  // The address to register at the institution as this client's redirect address
  callbackUrl: string;
};

export type SignInProviderPayload = Partial<Omit<SignInProviderSetup, "id" | "hasSecret" | "accounts" | "callbackUrl">>
  & { clientSecret?: string | null };

async function signInRequest<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetchWithAuth(`${BASE_URL}/settings/sign-in-providers${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.detail || fallback));
  return data as T;
}

export const listSignInProviderSetups = () =>
  signInRequest<SignInProviderSetup[]>("", { method: "GET" }, "Failed to load the sign-in providers");

export const saveSignInProvider = (payload: SignInProviderPayload, id?: number) =>
  signInRequest<SignInProviderSetup>(id == null ? "" : `/${id}`, {
    method: id == null ? "POST" : "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, "Failed to save the sign-in provider");

export const removeSignInProvider = (id: number) =>
  signInRequest<{ removed: number }>(`/${id}`, { method: "DELETE" }, "Failed to remove the sign-in provider");

export const testSignInProvider = (id: number) =>
  signInRequest<{ ok: boolean; error?: string; issuer?: string; keys?: number }>(
    `/${id}/test`, { method: "POST" }, "Failed to test the sign-in provider");
