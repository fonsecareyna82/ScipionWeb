import { Dictionary } from "@fullcalendar/core/internal";
import axios from "axios";
import { BASE_URL } from "@/config";


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
 * Fetch the list of all projects
 */
export async function fetchPlugins(): Promise<Plugin[]> {
    const response = await fetch(`${BASE_URL}/plugins/`);
    if (!response.ok) throw new Error('Failed to fetch plugins');
    return response.json();
}

export async function fetchPlugin(pipName: string): Promise<Plugin> {
    const res = await fetch(`${BASE_URL}/plugins/${pipName}`);
    if (!res.ok) throw new Error('Error fetching plugin details');
    return res.json();
}

export async function installPlugin(pipName: string): Promise<{ task_id: string }> {
    const res = await fetch(`${BASE_URL}/plugins/install/${pipName}`, { method: 'POST' });
    if (!res.ok) throw new Error('Error installing plugin');
    return res.json(); // espera { task_id: '...' } desde el backend
}

export async function uninstallPlugin(pipName: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/plugins/${pipName}/uninstall`, { method: 'POST' });
    if (!res.ok) throw new Error('Error uninstalling plugin');
}

export async function fetchPluginById(pipName: string): Promise<Plugin> {
    const { data } = await axios.get<Plugin>(`${BASE_URL}/plugins/${pipName}`);
    return data;
}

export async function checkTaskStatus(taskId: string) {
  const res = await fetch(`${BASE_URL}/plugins/status/${taskId}`);
  if (!res.ok) throw new Error("Error fetching task status");
  return res.json();
}