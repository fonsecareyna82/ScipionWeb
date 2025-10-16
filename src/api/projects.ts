import { ProtocolNode } from "./protocols";
import { BASE_URL } from "@/config";
import { Project } from "@/types/project";
import { fetchWithAuth } from "./auth";

const ACTION_LAUNCH = "launch";
const ACTION_SAVE = "save";
const ACTION_RENAME = "rename";
const ACTION_DUPLICATE = "duplicate";
const ACTION_RESTART_ALL = "restart-all";
const ACTION_CONTINUE_ALL = "continue-all";
const ACTION_RESET_FROM = "reset-from";

type Id = string | number;

type ApiErrorShape = {
  message?: string;
  detail?: unknown;
  [k: string]: unknown;
};

class ApiError extends Error {
  status?: number;
  detail?: unknown;
  data?: unknown;
  constructor(message: string, opts?: { status?: number; detail?: unknown; data?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = opts?.status;
    this.detail = opts?.detail;
    this.data = opts?.data;
  }
}

async function safeJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  let payload: ApiErrorShape | string | undefined;
  try {
    payload = await safeJson<ApiErrorShape | string>(response);
  } catch {}
  const message =
    (typeof payload === "object" && (payload.message as string)) ||
    (typeof payload === "object" && (payload.detail as string)) ||
    (typeof payload === "string" && payload) ||
    fallback;

  const detail = typeof payload === "object" ? payload.detail : undefined;
  return new ApiError(message || fallback, {
    status: response.status,
    detail,
    data: payload,
  });
}

/**
 * Fetch the list of all projects
 */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch projects");
  return safeJson<Project[]>(response);
}

/**
 * Fetch detailed data of a single project by ID
 */
export async function fetchProject(projectId: Id): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch project");
  return safeJson<Project>(response);
}

/**
 * Create a new project with name and description
 */
export async function createProject(name: string, description: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to create project");
  return safeJson<Project>(response);
}

/**
 * Fetch detailed info of a protocol node by its id
 */
export async function fetchProtocolDetails(projectId: Id, protocolId: Id): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocol details");
  return safeJson<ProtocolNode>(response);
}

/**
 * Fetch detailed info of a protocol by its class name
 */
export async function fetchNewProtocolDetails(projectId: Id, protocolClass: string): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protclass/${protocolClass}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocol details");
  return safeJson<ProtocolNode>(response);
}

/**
 * Launch a protocol for a specific project by ID
 */
export async function executeProtocol(
  protocolId: Id,
  protocolClassName: string,
  params: Record<string, any>
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${ACTION_LAUNCH}`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params }),
  });

  if (!response.ok) throw await toApiError(response, "Failed to execute protocol");
  return safeJson<any>(response);
}

/**
 * Save a protocol for a specific project by ID
 */
export async function saveProtocol(
  protocolId: Id,
  protocolClassName: string,
  params: Record<string, any>
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${ACTION_SAVE}`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params }),
  });

  if (!response.ok) throw await toApiError(response, "Failed to save protocol");
  return safeJson<any>(response);
}

/**
 * Rename a project and update its description
 */
export async function renameProject(id: Id, newName: string, newDescription: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName, description: newDescription }),
  });

  if (!response.ok) throw await toApiError(response, "Failed to rename project");
  return safeJson<Project>(response);
}

/**
 * Delete a project by its ID
 */
export async function deleteProject(id: Id): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, { method: "DELETE" });
  if (!response.ok) throw await toApiError(response, "Failed to delete project");
}

/**
 * Load all protocols by numeric project ID
 */
export async function loadProtocols(projectId: number): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protocols`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocols");
  return safeJson<any>(response);
}

/* ======================= PROTOCOL ACTIONS (nodes) ======================= */


/** Rename protocol */
export async function renameProtocol(
  projectId: Id,
  protocolId: Id,
  newName: string
): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}/${ACTION_RENAME}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to rename protocol");
  return safeJson<ProtocolNode>(response);
}

/** Duplicate protocol */
export async function duplicateProtocol(
  projectId: Id,
  protocolId: Id,
  newName?: string
): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}/${ACTION_DUPLICATE}`, {
    method: "POST",
    body: JSON.stringify(newName ? { name: newName } : {}),
  });
  if (!response.ok) throw await toApiError(response, "Failed to duplicate protocol");
  return safeJson<ProtocolNode>(response);
}

/** Delete protocol */
export async function deleteProtocol(projectId: Id, protocolId: Id): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await toApiError(response, "Failed to delete protocol");
}

/** Restart all the workflow from this protocol node */
export async function restartAll(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}/${ACTION_RESTART_ALL}`, {
    method: "POST",
  });
  if (!response.ok) throw await toApiError(response, "Failed to restart protocol");
  return safeJson<any>(response);
}

/** Continue all the workflow from this protocol node */
export async function continueAll(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}/${ACTION_CONTINUE_ALL}`, {
    method: "POST",
  });
  if (!response.ok) throw await toApiError(response, "Failed to continue protocol");
  return safeJson<any>(response);
}

/** Reset the workflow from this protocol node */
export async function resetFrom(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${protocolId}/${ACTION_RESET_FROM}`, {
    method: "POST",
  });
  if (!response.ok) throw await toApiError(response, "Failed to reset from protocol");
  return safeJson<any>(response);
}
