// src/api/protocols.ts

import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";

/* ============================================================
 * Tipos base de protocolos
 * ============================================================ */
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
  projectId: string;
}

/* ============================================================
 * Endpoints de protocolos (lo que ya tenías)
 * ============================================================ */

/** Fetch detailed info of a protocol node by its id */
export async function fetchProtocolDetails(protocolId: string): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/protocols/${protocolId}`);
  if (!response.ok) throw new Error("Failed to fetch protocol details");
  return response.json();
}

/** Update a protocol node's data */
export async function updateNode(nodeId: string, data: any): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/protocols/node/${nodeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update node");
  return response.json();
}

/** Launch a protocol for a specific project by ID */
export async function launchProtocol(projectId: string): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/protocols/launch?projectId=${projectId}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to launch protocol");
  return response.json();
}

/** Fetch the stdout log of a protocol */
export async function fetchProtocolLogsStream(
  projectId: string | number,
  protocolId: string | number,
  offset: number,
  errOffset: number,
  scheduleOffset: number,
): Promise<{ newLog: string; newOffset: number }> {
  const response = await fetchWithAuth(
    `${BASE_URL}/protocols/logs/${projectId}/${protocolId}/${offset}/${errOffset}/${scheduleOffset}`
  );
  if (!response.ok) throw new Error("Failed to fetch protocol logs stream");
  return response.json();
}