import { Dictionary } from "@fullcalendar/core/internal";
import axios from "axios";

const BASE_URL = 'http://localhost:8080';

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

export async function fetchPlugin(id: string): Promise<Plugin> {
    const res = await fetch(`${BASE_URL}/plugins/${id}`);
    if (!res.ok) throw new Error('Error fetching plugin details');
    return res.json();
}

export async function installPlugin(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/plugins/${id}/install`, { method: 'POST' });
    if (!res.ok) throw new Error('Error installing plugin');
}

export async function uninstallPlugin(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/plugins/${id}/uninstall`, { method: 'POST' });
    if (!res.ok) throw new Error('Error uninstalling plugin');
}

export async function fetchPluginById(id: string): Promise<Plugin> {
    const { data } = await axios.get<Plugin>(`${BASE_URL}/plugins/${id}`);
    return data;
}