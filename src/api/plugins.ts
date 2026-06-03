// src/api/plugins.ts
import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";

export type CompatibleReleaseInfo = {
  upload_time?: string;
  [key: string]: unknown;
};

export type CompatibleReleases = Record<string, CompatibleReleaseInfo>;
export type PluginBinaries = Record<string, Record<string, boolean>>;

export interface Plugin {
  author?: string;
  binVersions?: unknown[];
  compatibleReleases?: CompatibleReleases;
  dirName?: string;
  email?: string;
  homePage?: string;
  latestRelease: string;
  name: string;
  pipName: string;
  pipVersion?: string;
  pluginEnv?: string;
  pluginSourceUrl?: string;
  remote?: boolean;
  summary?: string;

  icon?: string;
  iconUrl?: string;
  fullLogo?: string;

  installed: boolean;
  toUpdate: boolean;
  installMode?: "standard" | "devel" | string;
  localPath?: string;
  devel?: boolean;
  develInstalledAt?: string;
  develUpdatedAt?: string;

  binaries?: PluginBinaries;
  categories?: any;
  categoryData?: any;
}

export type PluginTaskBackend = "celery" | "local";

export type TaskStartResponse = {
  taskId: string;
  status: string;
  backend?: PluginTaskBackend;
};

export type TaskStatusResponse = {
  taskId: string;
  status: string;
  result?: unknown;
  error?: string | null;
  meta?: unknown;
  backend?: PluginTaskBackend;
};

export type PluginTaskLogResponse = {
  taskId: string;
  offset: number;
  nextOffset: number;
  text: string;
  completed: boolean;
  status?: string | null;
  backend?: PluginTaskBackend;
};

export type InstallPluginOptions = {
  skipBinaries?: boolean;
};

export type InstallPluginsBatchOptions = {
  plugins: string[];
  skipBinaries?: boolean;
};

export type DevelPluginManifestItem = {
  pipName: string;
  path: string;
  mode: "devel" | string;
  installedAt?: string;
  updatedAt?: string;
  taskId?: string;
};

export type DevelPluginValidation = {
  valid: boolean;
  path: string;
  exists: boolean;
  isDirectory: boolean;
  allowed: boolean;
  pipName?: string | null;
  hasPyproject?: boolean;
  hasSetupPy?: boolean;
  hasSetupCfg?: boolean;
  hasInstallMetadata?: boolean;
  allowedRoots?: string[];
  message: string;
};

export type InstallDevelPluginOptions = {
  path: string;
  skipBinaries?: boolean;
};

export type DevelPluginBrowserPaths = {
  rootAbs?: string;
  startPath?: string;
  allowedRoots?: string[];
};

export type DevelPluginBrowserEntry = {
  name: string;
  path: string;
  absPath?: string;
  isDir: boolean;
  size?: number;
  mime?: string;
};

async function safeJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const data = await safeJson<any>(response);
  const detail = data?.detail ?? data;

  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const message = detail.message ?? detail.error;
    if (typeof message === "string" && message.trim()) return message;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export async function fetchPlugins(): Promise<Plugin[]> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/`);
  if (!response.ok) throw new Error("Failed to fetch plugins");
  return response.json();
}

export async function fetchPlugin(pipName: string): Promise<Plugin> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/${pipName}`);
  if (!response.ok) throw new Error("Error fetching plugin details");
  return response.json();
}

// Backwards-compatible alias
export async function fetchPluginById(pipName: string): Promise<Plugin> {
  return fetchPlugin(pipName);
}

export async function installPlugin(
  pipName: string,
  options: InstallPluginOptions = {},
): Promise<TaskStartResponse> {
  const params = new URLSearchParams();

  if (options.skipBinaries) {
    params.set("skipBinaries", "true");
  }

  const query = params.toString();
  const url = query
    ? `${BASE_URL}/plugins/install/${pipName}?${query}`
    : `${BASE_URL}/plugins/install/${pipName}`;

  const response = await fetchWithAuth(url, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error installing plugin"));
  return response.json();
}

export async function installPluginsBatch(options: InstallPluginsBatchOptions): Promise<TaskStartResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/install-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plugins: options.plugins,
      skipBinaries: Boolean(options.skipBinaries),
    }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response, "Error installing selected plugins"));
  return response.json();
}

export async function uninstallPlugin(pipName: string): Promise<TaskStartResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/uninstall/${pipName}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error uninstalling plugin"));
  return response.json();
}

export async function validateDevelPluginPath(path: string): Promise<DevelPluginValidation> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/devel/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Error validating devel plugin path"));
  }

  return response.json();
}

export async function fetchDevelPlugins(): Promise<DevelPluginManifestItem[]> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/devel`);
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error fetching devel plugins"));
  return response.json();
}

export async function fetchDevelPluginBrowserPaths(): Promise<DevelPluginBrowserPaths> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/devel/browser/paths`);
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error fetching devel plugin browser paths"));
  return response.json();
}

export async function listDevelPluginBrowserDirectory(path = ""): Promise<DevelPluginBrowserEntry[]> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);

  const query = params.toString();
  const url = query
    ? `${BASE_URL}/plugins/devel/browser/list?${query}`
    : `${BASE_URL}/plugins/devel/browser/list`;

  const response = await fetchWithAuth(url);
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error listing devel plugin browser directory"));
  return response.json();
}

export async function installDevelPlugin(options: InstallDevelPluginOptions): Promise<TaskStartResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/devel/install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: options.path,
      skipBinaries: Boolean(options.skipBinaries),
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Error installing devel plugin"));
  }

  return response.json();
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/tasks/${taskId}`);
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error fetching task status"));
  return response.json();
}

export async function fetchPluginTaskLog(
  taskId: string,
  offset = 0,
  limit = 65536,
): Promise<PluginTaskLogResponse> {
  const response = await fetchWithAuth(
    `${BASE_URL}/plugins/tasks/${encodeURIComponent(taskId)}/log?offset=${offset}&limit=${limit}`,
  );
  if (!response.ok) throw new Error(await readErrorMessage(response, "Error fetching task log"));
  return safeJson<PluginTaskLogResponse>(response);
}
