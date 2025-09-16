// src/api/protocols.ts

import { BASE_URL } from "@/config";
import { getAccessToken, refreshAccessToken, logout } from "./auth";

/**
 * Interface for a protocol node
 */
export interface ProtocolNode {
  id: string;
  parents: string[];
  children: string[];
  label: string;
  status: string;
  parameters: Record<string, any>;
  cpuTime: string;
  elapsedTime: string;
  stepsDone: string;
  numberOfSteps: string;
  outputs: any;
  inputs: any;
}

/**
 * Wrapper for fetch that automatically refreshes tokens on 401
 */
async function fetchWithAuth(input: RequestInfo, init?: RequestInit): Promise<Response> {
  let token = getAccessToken();

  let response = await fetch(input, {
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

    response = await fetch(input, {
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
 * Fetch detailed info of a protocol node by its id
 */
export async function fetchProtocolDetails(protocolId: string): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/protocols/${protocolId}`);
  if (!response.ok) throw new Error("Failed to fetch protocol details");
  return response.json();
}

/**
 * Update a protocol node's data
 */
export async function updateNode(nodeId: string, data: any): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/protocols/node/${nodeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update node");
  return response.json();
}

/**
 * Launch a protocol for a specific project by ID
 */
export async function launchProtocol(projectId: string): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/protocols/launch?projectId=${projectId}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to launch protocol");
  return response.json();
}
