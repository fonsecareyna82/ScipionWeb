// src/api/plugins.ts
import { Dictionary } from "@fullcalendar/core/internal";
import { BASE_URL } from "@/config";
import { getAccessToken, refreshAccessToken, logout } from "./auth";

export interface Plugin {
  author: string;
  binVersions: [];
  compatibleReleases: Dictionary;
  dirName: string;
  email: string;
  homePage: string;
  latestRelease: string;
  name: string;
  pipName: string;
  pipVersion: string;
  pluginEnv: string;
  pluginSourceUrl: string;
  remote: boolean;
  summary: string;
  icon?: string;
  iconUrl?: string;
  fullLogo?: string;
  installed?: boolean;
}

/**
 * Wrapper for fetch that automatically refreshes tokens on 401
 */
async function fetchWithAuth(input: RequestInfo, init?: RequestInit): Promise<Response> {
  let token = getAccessToken();

  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      logout();
      throw new Error("Session expired. Please login again.");
    }

    return fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        Authorization: `Bearer ${newToken}`,
      },
    });
  }

  return response;
}

/**
 * Fetch the list of all plugins
 */
export async function fetchPlugins(): Promise<Plugin[]> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/`);
  if (!response.ok) throw new Error("Failed to fetch plugins");
  return response.json();
}

/**
 * Fetch details of a specific plugin by pipName
 */
export async function fetchPlugin(pipName: string): Promise<Plugin> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/${pipName}`);
  if (!response.ok) throw new Error("Error fetching plugin details");
  return response.json();
}

/**
 * Install a plugin
 */
export async function installPlugin(pipName: string): Promise<{ task_id: string }> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/install/${pipName}`, { method: "POST" });
  if (!response.ok) throw new Error("Error installing plugin");
  return response.json();
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin(pipName: string): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/uninstall/${pipName}`, { method: "POST" });
  if (!response.ok) throw new Error("Error uninstalling plugin");
}

/**
 * Fetch plugin by ID
 */
export async function fetchPluginById(pipName: string): Promise<Plugin> {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/${pipName}`);
  if (!response.ok) throw new Error("Error fetching plugin details");
  return response.json();
}

/**
 * Check async task status (plugin installation/uninstallation)
 */
export async function checkTaskStatus(taskId: string) {
  const response = await fetchWithAuth(`${BASE_URL}/plugins/status/${taskId}`);
  if (!response.ok) throw new Error("Error fetching task status");
  return response.json();
}
