// src/api/projects.ts
import { ProtocolNode } from "./protocols";
import { BASE_URL } from "@/config";
import { Project } from "@/types/project";
import { fetchWithAuth } from "./auth";

const ACTION_LAUNCH = "launch";
const ACTION_SAVE = "save";
const ACTION_RENAME = "rename";
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

/* ======================= PROJECTS ======================= */

/** List projects */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch projects");
  return safeJson<Project[]>(response);
}

/** Fetch detailed data of a single project by ID */
export async function fetchProject(projectId: Id): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch project");
  return safeJson<Project>(response);
}

/** Create a new project with name and description */
export async function createProject(name: string, description: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to create project");
  return safeJson<Project>(response);
}

/* ======================= PROTOCOL READS ======================= */

/** Fetch protocol details by project/protocol IDs */
export async function fetchProtocolDetails(projectId: Id, protocolId: Id): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protocols/${protocolId}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocol details");
  return safeJson<ProtocolNode>(response);
}

/** Fetch "new protocol" details by class within a project */
export async function fetchNewProtocolDetails(projectId: Id, protocolClass: string): Promise<ProtocolNode> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protclass/${protocolClass}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocol details");
  return safeJson<ProtocolNode>(response);
}

/* ======================= EXEC/SAVE ======================= */

/** Execute (launch) a protocol */
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

/** Save a protocol */
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

/* ======================= PROJECT MUTATIONS ======================= */

/** Rename a project */
export async function renameProject(id: Id, newName: string, newDescription: string): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName, description: newDescription }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to rename project");
  return safeJson<Project>(response);
}

/** Delete a project by ID */
export async function deleteProject(id: Id): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, { method: "DELETE" });
  if (!response.ok) throw await toApiError(response, "Failed to delete project");
}

/** Load all protocols by numeric project ID */
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
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_RENAME}`,
    {
      method: "PUT",
      body: JSON.stringify({ name: newName }),
    }
  );
  if (!response.ok) throw await toApiError(response, "Failed to rename protocol");
  return safeJson<ProtocolNode>(response);
}

/** Duplicate protocol(s) */
export async function duplicateProtocol(
  projectId: Id,
  items: { id: Id; name?: string }[]
): Promise<ProtocolNode[]> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protocols/duplicate`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to duplicate protocol(s)");
  return safeJson<ProtocolNode[]>(response);
}

/** Delete protocol(s) */
export async function deleteProtocol(projectId: Id, ids: Id[]): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protocols/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to delete protocol(s)");
}

/** Restart all from this protocol node */
export async function restartAll(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_RESTART_ALL}`,
    { method: "POST" }
  );
  if (!response.ok) throw await toApiError(response, "Failed to restart protocol");
  return safeJson<any>(response);
}

/** Continue all from this protocol node */
export async function continueAll(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_CONTINUE_ALL}`,
    { method: "POST" }
  );
  if (!response.ok) throw await toApiError(response, "Failed to continue protocol");
  return safeJson<any>(response);
}

/** Reset the workflow from this protocol node */
export async function resetFrom(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_RESET_FROM}`,
    { method: "POST" }
  );
  if (!response.ok) throw await toApiError(response, "Failed to reset from protocol");
  return safeJson<any>(response);
}

/** Stop protocol(s) */
export async function stopProtocol(projectId: Id, ids: Id[]): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/protocols/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to stop protocol(s)");
}

/* ============================================================
 * Remote file browsing (for RemoteFileDialog)
 * ============================================================ */

export interface RemoteEntry {
  name: string;
  path: string;       // relative to the protocol root
  isDir: boolean;
  size?: number;
  mime?: string;
}

/** "ls"-style result */
export interface RemoteListing {
  cwd: string;
  items: RemoteEntry[];
}

/** Resolve protocol start path on the server */
export async function resolveProtocolStartPath(
  projectId: Id,
  protocolId: Id
): Promise<string> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/start-path`
  );
  if (!res.ok) throw await toApiError(res, "Failed to resolve start path");
  const j = await safeJson<{ path?: string }>(res);
  return j?.path || "/";
}

/** List directory for a given protocol (returns {cwd, items}) */
export async function listProtocolDir(
  projectId: Id,
  protocolId: Id,
  path: string
): Promise<RemoteListing> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/list?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) throw await toApiError(res, "Failed to list directory");
  return await safeJson<RemoteListing>(res);
}

/** Convenience: return just items[] (handy for dialogs) */
export async function listRemoteDirectory(
  projectId: Id,
  protocolId: Id,
  path: string
): Promise<RemoteEntry[]> {
  const { items } = await listProtocolDir(projectId, protocolId, path);
  return items;
}

/** Preview text file (returns string or throws if not available) */
export async function previewProtocolText(
  projectId: Id,
  protocolId: Id,
  path: string
): Promise<string> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/preview?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) throw await toApiError(res, "Failed to preview file");
  return await res.text();
}

/** Build download/inline URL (pure helper) */
export function buildProtocolDownloadUrl(
  projectId: Id,
  protocolId: Id,
  path: string,
  inline = false
): string {
  const q = inline ? "&inline=true" : "";
  return `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/download?path=${encodeURIComponent(path)}${q}`;
}

export async function fetchProtocolInlinePreviewBlob(projectId: Id, protocolId: Id, path: string): Promise<Blob> {
  // use your existing auth-enabled svc/fetch/axios instance:
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/download?path=${encodeURIComponent(path)}&inline=1`;
  const res = await fetchWithAuth(url, { method: "GET" }); 
  if (!res.ok) throw new Error("fail");
  return await res.blob();
}
