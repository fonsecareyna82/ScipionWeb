// src/api/projects.ts

import { ProtocolNode } from "./protocols";
import { BASE_URL } from "@/config";

export interface Project {
  id: string;
  name: string;
  shortName: string;
  description: string;
  createdAt: Date;
  updatedAt?: Date;
  status: string;
  protocolsCount?: string;
  diskUsage?: string;
  protocols?: Record<string, ProtocolNode>;
}

/**
 * Helper to get the auth token and return default headers
 */
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Fetch the list of all projects
 */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${BASE_URL}/projects/`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to fetch projects");
  return response.json();
}

/**
 * Fetch detailed data of a single project by ID
 */
export async function fetchProject(projectId: string): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects/${projectId}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to fetch project");
  return response.json();
}

/**
 * Create a new project with name and description
 */
export async function createProject(name: string, description: string): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, description }),
  });

  if (!response.ok) {
    let errorDetail = "Failed to create project";
    try {
      const data = await response.json();
      if (data.detail) errorDetail = data.detail;
    } catch {
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Fetch detailed info of a protocol node by its id
 */
export async function fetchProtocolDetails(projectId: string, protocolId: string): Promise<ProtocolNode> {
  const response = await fetch(`${BASE_URL}/projects/${projectId}/${protocolId}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to fetch protocol details");
  return response.json();
}

/**
 * Launch a protocol for a specific project by ID
 */
export async function executeProtocol(protocolId: string, params: Record<string, any>): Promise<any> {
  const response = await fetch(`${BASE_URL}/projects/launch`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ protocolId, params }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to execute protocol");
  }
  return response.json();
}

/**
 * Rename a project and update its description
 */
export async function renameProject(id: string, newName: string, newDescription: string): Promise<Project> {
  try {
    const response = await fetch(`${BASE_URL}/projects/${id}`, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDescription }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to rename project: ${errorText}`);
    }

    return await response.json() as Project;
  } catch (err) {
    console.error("renameProject error:", err);
    throw err;
  }
}

/**
 * Delete a project by its ID
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/projects/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to delete project");
}


/**
 * Load all protocols by numeric project ID
 */
export async function loadProtocols(projectId: number): Promise<any> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/protocols`,
    { headers: getAuthHeaders() }
  );
  if (!response.ok) throw new Error("Failed to fetch protocols");
  return response.json();
}