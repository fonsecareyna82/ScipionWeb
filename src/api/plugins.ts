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

  binaries?: PluginBinaries;
}

export type TaskStartResponse = {
  taskId: string;
  status: string;
};

export type TaskStatusResponse = {
  taskId: string;
  status: string;
  result?: unknown;
  error?: string | null;
  meta?: unknown;
};

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

export async function installPlugin(pipName: string): Promise<TaskStartResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/install/${pipName}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Error installing plugin");
  return response.json();
}

export async function uninstallPlugin(pipName: string): Promise<TaskStartResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/uninstall/${pipName}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Error uninstalling plugin");
  return response.json();
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/tasks/${taskId}`);
  if (!response.ok) throw new Error("Error fetching task status");
  return response.json();
}