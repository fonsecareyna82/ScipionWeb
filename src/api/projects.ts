// src/api/projects.ts

import { ProtocolNode } from "./protocols";

const BASE_URL = 'http://localhost:8080';


export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: Date;
  status: string;
  protocolsCount: string;
  diskUsage: string;
  protocols: Record<string, ProtocolNode>;
}

/**
 * Fetch the list of all projects
 */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${BASE_URL}/projects/list`);
  if (!response.ok) throw new Error('Failed to fetch projects');
  return response.json();
}

/**
 * Fetch detailed data of a single project by ID or name
 */
export async function fetchProject(projectId: string): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects/load/${projectId}`);
  if (!response.ok) throw new Error('Failed to fetch project');
  return response.json();
}

/**
 * Create a new project with name and description
 */
export async function createProject(name: string, description: string): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) throw new Error('Failed to create project');
  return response.json();
}

/**
 * Fetch detailed info of a protocol node by its id
 */
export async function fetchProtocolDetails(protocolId: string): Promise<ProtocolNode> {
  const response = await fetch(`${BASE_URL}/projects/protocols/${protocolId}`);
  if (!response.ok) throw new Error('Failed to fetch protocol details');
  return response.json();
}


/**
 * Launch a protocol for a specific project by ID
 */
export async function executeProtocol(
  protocolId: string,
  params: Record<string, any>
): Promise<any> {
  const response = await fetch(`${BASE_URL}/projects/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // En el body enviamos protocolId + params
    body: JSON.stringify({ protocolId, params })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to execute protocol');
  }
  return response.json();
}

/**
 * Rename a project and update its description
 */
export async function renameProject(
  id: string,
  newName: string,
  newDescription: string
): Promise<Project> {
  const response = await fetch(`${BASE_URL}/projects/${id}/rename`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName, description: newDescription }),
  });
  if (!response.ok) throw new Error('Failed to rename project');
  return response.json();
}

/**
 * Delete a project by its ID
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/projects/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete project');
}
