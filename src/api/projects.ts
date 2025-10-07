// src/api/projects.ts
import { ProtocolNode } from "./protocols";
import { BASE_URL } from "@/config";
import { Project } from "@/types/project";
import { fetchWithAuth } from "./auth";

/**
 * Fetch the list of all projects
 */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/`);
  if (!response.ok) throw new Error("Failed to fetch projects");
  return response.json();
}

/**
 * Fetch detailed data of a single project by ID
 */
export async function fetchProject(projectId: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}`);
  if (!response.ok) throw new Error("Failed to fetch project");
  return response.json();
}

/**
 * Create a new project with name and description
 */
export async function createProject(name: string, description: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });

  if (!response.ok) {
    let errorDetail = "Failed to create project";
    try {
      const data = await response.json();
      if (data.detail) errorDetail = data.detail;
    } catch { }
    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Fetch detailed info of a protocol node by its id
 */
export async function fetchProtocolDetails(projectId: string, protocolId: string): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}`);
  if (!response.ok) throw new Error("Failed to fetch protocol details");
  return response.json();
}

/**
 * Fetch detailed info of a protocol by its class name
 */
export async function fetchNewProtocolDetails(projectId: string, protocolClass: string): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protclass/${protocolClass}`);
  if (!response.ok) throw new Error("Failed to fetch protocol details");
  return response.json();
}

/**
 * Launch a protocol for a specific project by ID
 */
export async function executeProtocol(
  protocolId: string,
  protocolClassName: string,
  params: Record<string, any>
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/launch`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params }),
  });

  if (!response.ok) {
    // Try to parse the response body for details
    const errData = await response.json().catch(() => ({}));

    // Build a richer error object so the frontend can handle it properly
    const error: any = new Error(
      errData.detail || errData.message || "Failed to execute protocol"
    );
    error.status = response.status;
    error.detail = errData.detail || null;
    error.data = errData;

    throw error;
  }

  return response.json();
}


/**
 * Save a protocol for a specific project by ID
 */
export async function saveProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/save`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save protocol");
  }
  return response.json();
}

/**
 * Rename a project and update its description
 */
export async function renameProject(id: string, newName: string, newDescription: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName, description: newDescription }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to rename project: ${errorText}`);
  }

  return (await response.json()) as Project;
}

/**
 * Delete a project by its ID
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete project");
}

/**
 * Load all protocols by numeric project ID
 */
export async function loadProtocols(projectId: number): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protocols`);
  if (!response.ok) throw new Error("Failed to fetch protocols");
  return response.json();
}
