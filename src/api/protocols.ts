// src/api/protocols.ts

import { BASE_URL } from "@/config";

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
 * Update a protocol node's data
 */
export async function updateNode(nodeId: string, data: any): Promise<ProtocolNode> {
  const response = await fetch(`${BASE_URL}/protocols/node/${nodeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update node');
  return response.json();
}

/**
 * Launch a protocol for a specific project by ID
 */
export async function launchProtocol(projectId: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/protocols/launch?projectId=${projectId}`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to launch protocol');
  return response.json();
}
