// src/api/projects.ts
import { ProtocolNode } from "./protocols";
import { BASE_URL } from "@/config";
import { Project } from "@/types/project";
import { fetchWithAuth } from "./auth";
import {
  CTFTomoExclusionsPayload,
  FetchImageSliceOptions,
  ObjectUrlResult,
  WorkflowDescriptor,
  TiltExclusionsPayload,
  SettingsObject,
  ProtocolLogChannelsResponse,
  ProtocolLogsChunkResponse,
  ProtocolLogOffsets,
  ProtocolTag,
  ProtocolTagCreatePayload,
  ProtocolTagUpdatePayload,
  ProtocolTagIdsResult,
  NextProtocolSuggestion,
  CreateCoords3dOutputFromPointsResult,
  CreateCoords3dOutputFromPointsOptions,
  ProjectThumbnailGroup,
  ProjectThumbnailItemsOptions,
  ProjectThumbnailObjectUrlOptions,
  FscPoint,
  ImportProjectPayload,
  ProjectEffectiveSettings,
} from "@/services/ProjectService";

const ACTION_LAUNCH = "launch";
const ACTION_SAVE = "save";
const ACTION_RENAME = "rename";
const ACTION_RESTART_ALL = "restart-all";
const ACTION_CONTINUE_ALL = "continue-all";
const ACTION_RESET_FROM = "reset-from";
const ACTION_STOP = "stop";

type Id = string | number | null | undefined;


class ApiError extends Error {
  status?: number;
  detail?: unknown;
  data?: unknown;
  constructor(
    message: string,
    opts?: { status?: number; detail?: unknown; data?: unknown },
  ) {
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
  // toApiError
  let payload: any;
  try {
    payload = await safeJson<any>(response);
  } catch {
    payload = undefined;
  }

  const normalizeStringList = (value: any): string[] => {
    // normalizeStringList
    if (value == null) return [];
    if (Array.isArray(value)) {
      return value
        .map((v) => String(v))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (typeof value === "string") {
      const s = value.trim();
      return s ? [s] : [];
    }
    const s = String(value).trim();
    return s ? [s] : [];
  };

  const extractBackendErrors = (data: any): string[] => {
    // extractBackendErrors
    if (!data) return [];

    // New backend contract: { status: number, errors: string[], workflow: [] }
    if (typeof data === "object" && data !== null) {
      const errors = normalizeStringList((data as any).errors);
      if (errors.length > 0) return errors;

      // Backward compatibility: FastAPI HTTPException detail/message/error
      const legacyDetail = (data as any).detail ?? (data as any).message ?? (data as any).error ?? null;
      const legacyErrors = normalizeStringList(legacyDetail);
      if (legacyErrors.length > 0) return legacyErrors;
    }

    // If server returns plain text or something unexpected
    if (typeof data === "string") return normalizeStringList(data);

    return [];
  };

  const errors = extractBackendErrors(payload);

  const message =
    (errors.length > 0 && errors.join("\n")) ||
    (typeof payload === "object" && payload !== null && typeof (payload as any).message === "string" && (payload as any).message) ||
    (typeof payload === "object" && payload !== null && typeof (payload as any).detail === "string" && (payload as any).detail) ||
    (typeof payload === "string" && payload.trim() ? payload.trim() : "") ||
    fallback;

  // Prefer returning string[] in detail for consistent UI consumption
  const detail =
    errors.length > 0
      ? errors
      : typeof payload === "object" && payload !== null
        ? (payload as any).detail
        : undefined;

  return new ApiError(message || fallback, {
    status: response.status,
    detail,
    data: payload,
  });
}


function normalizeProjectThumbnailItems(raw: any): ProjectThumbnailGroup[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

  return list
    .map((group: any) => {
      const protocolId = group?.protocolId ?? group?.protocol_id ?? group?.id ?? null;
      if (protocolId === null || protocolId === undefined) return null;

      const outputs = Array.isArray(group?.outputs)
        ? group.outputs
          .map((output: any) => ({
            outputName: output?.outputName ?? output?.output_name ?? null,
            outputClassName: output?.outputClassName ?? output?.output_class_name ?? null,
            exists: output?.exists !== undefined ? Boolean(output.exists) : true,
            thumbnailUrl: output?.thumbnailUrl ?? output?.thumbnail_url ?? null,
            thumbnailRebuildUrl:
              output?.thumbnailRebuildUrl ?? output?.thumbnail_rebuild_url ?? null,
          }))
          .filter(Boolean)
        : [];

      return {
        protocolId,
        label:
          group?.protocolLabel ??
          group?.protocol_label ??
          group?.label ??
          group?.name ??
          `Protocol ${String(protocolId)}`,
        status: group?.status ?? undefined,
        outputs,
      } satisfies ProjectThumbnailGroup;
    })
    .filter(Boolean) as ProjectThumbnailGroup[];
}

async function resolveProjectThumbnailBaseUrl(
  projectId: Id,
  sourceUrl: string | null | undefined,
  field: "thumbnailUrl" | "thumbnailItemsUrl",
): Promise<string | null> {
  const direct = resolveBackendUrl(sourceUrl);
  if (direct) return direct;

  const project = await fetchProject(projectId);
  return resolveBackendUrl((project as any)?.[field] ?? null);
}



/* ======================= PROJECTS ======================= */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch projects");
  return safeJson<Project[]>(response);
}

export async function fetchProject(projectId: Id): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}`);
  if (!response.ok) throw await toApiError(response, "Failed to fetch project");
  return safeJson<Project>(response);
}

export async function fetchProjectEffectiveSettings(
  projectId: Id,
): Promise<ProjectEffectiveSettings> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/effective-settings`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch project effective settings");
  }

  const data = await safeJson<ProjectEffectiveSettings>(response);

  const raw = (data && typeof data === "object") ? data : ({} as ProjectEffectiveSettings);
  const settings =
    raw && typeof raw.settings === "object" && raw.settings !== null
      ? raw.settings
      : {};

  return {
    projectId: raw?.projectId ?? projectId,
    settings: {
      user:
        settings.user && typeof settings.user === "object"
          ? settings.user
          : null,
      instance:
        settings.instance && typeof settings.instance === "object"
          ? settings.instance
          : null,
      host:
        settings.host && typeof settings.host === "object"
          ? settings.host
          : null,
    },
  };
}

export async function fetchProjectThumbnailItems(
  projectId: Id,
  opts: ProjectThumbnailItemsOptions = {},
): Promise<ProjectThumbnailGroup[]> {
  const {
    sourceUrl,
    size = 320,
    maxProtocols = 12,
    maxOutputsPerProtocol = 4,
    signal,
    cache,
  } = opts;

  const baseUrl = await resolveProjectThumbnailBaseUrl(
    projectId,
    sourceUrl,
    "thumbnailItemsUrl",
  );

  if (!baseUrl) {
    return [];
  }

  const parsed = new URL(baseUrl, window.location.origin);
  parsed.searchParams.set("size", String(size));
  parsed.searchParams.set("maxProtocols", String(maxProtocols));
  parsed.searchParams.set("maxOutputsPerProtocol", String(maxOutputsPerProtocol));

  const payload = await fetchJsonUrl(parsed.toString(), {
    signal,
    cache: cache ?? "default",
  });

  return normalizeProjectThumbnailItems(payload);
}

export async function fetchProjectThumbnailObjectUrl(
  projectId: Id,
  opts: ProjectThumbnailObjectUrlOptions = {},
): Promise<string> {
  const {
    sourceUrl,
    size = 960,
    signal,
    cache,
  } = opts;

  const baseUrl = await resolveProjectThumbnailBaseUrl(
    projectId,
    sourceUrl,
    "thumbnailUrl",
  );

  if (!baseUrl) {
    throw new Error("Project thumbnail is not available");
  }

  const parsed = new URL(baseUrl, window.location.origin);
  parsed.searchParams.set("size", String(size));

  return fetchBlobObjectUrl(parsed.toString(), {
    signal,
    cache: cache ?? "default",
  });
}

export async function createProject(
  name: string,
  description: string,
): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to create project");
  return safeJson<Project>(response);
}

export async function importProject(
  payload: ImportProjectPayload,
): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectLocation: payload.projectLocation,
      projectName: payload.projectName,
      copyProject: payload.copyProject,
    }),
  });

  if (!response.ok) {
    throw await toApiError(response, "Failed to import project");
  }

  return safeJson<Project>(response);
}

/* ======================= PROTOCOL READS ======================= */
export async function fetchProtocolDetails(
  projectId: Id,
  protocolId: Id,
): Promise<ProtocolNode> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}`,
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to fetch protocol details");
  return safeJson<ProtocolNode>(response);
}

export async function fetchNewProtocolDetails(
  projectId: Id,
  protocolClass: string,
): Promise<ProtocolNode> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protclass/${protocolClass}`,
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to fetch protocol details");
  return safeJson<ProtocolNode>(response);
}

/* ======================= EXEC/SAVE ======================= */
export async function executeProtocol(
  projectId: Id,
  protocolId: Id,
  protocolClassName: string,
  params: Record<string, any>,
  mode?: string,
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${ACTION_LAUNCH}`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params, mode }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to execute protocol");
  return safeJson<any>(response);
}

export async function saveProtocol(
  projectId: Id,
  protocolId: Id,
  protocolClassName: string,
  params: Record<string, any>,
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/${ACTION_SAVE}`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to save protocol");
  return safeJson<any>(response);
}

/* ======================= PROJECT MUTATIONS ======================= */
export async function renameProject(
  id: Id,
  newName: string,
  newDescription: string,
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName, description: newDescription }),
  });
  console.log(response);
  if (!response.ok) throw await toApiError(response, "Failed to rename project");
  return safeJson<any>(response);
}

export async function deleteProject(id: Id): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await toApiError(response, "Failed to delete project");
}

/* ======================= TAGS ======================= */

function normalizeProtocolTag(raw: any): ProtocolTag | null {
  // normalizeProtocolTag
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id ?? "").trim();
  const title = String(raw.title ?? "").trim();

  if (!id || !title) return null;

  return {
    id,
    projectId: raw.projectId ?? raw["projectId"],
    title,
    description: raw.description ?? null,
    color: raw.color ?? null,
    createdAt: raw.createdAt ?? raw["createdAt"],
    updatedAt: raw.updatedAt ?? raw["updatedAt"],
  };
}

function normalizeProjectTagsResponse(raw: any): ProtocolTag[] {
  // normalizeProjectTagsResponse
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.tags) ? raw.tags : [];
  return arr.map(normalizeProtocolTag).filter(Boolean) as ProtocolTag[];
}

function normalizeProtocolTagIdsResult(raw: any): ProtocolTagIdsResult {
  // normalizeProtocolTagIdsResult
  const toStr = (v: any) => String(v).trim();

  const uniq = new Set<string>();
  const tagIds: string[] = [];

  const pushId = (v: any) => {
    // pushId
    const s = toStr(v);
    if (!s) return;
    if (uniq.has(s)) return;
    uniq.add(s);
    tagIds.push(s);
  };

  const collectFromArray = (arr: any[]) => {
    // collectFromArray
    for (const item of arr) {
      if (item == null) continue;

      if (typeof item === "string" || typeof item === "number") {
        pushId(item);
        continue;
      }

      if (typeof item === "object") {
        if ((item as any).id != null) pushId((item as any).id);
        else if ((item as any).tagId != null) pushId((item as any).tagId);
      }
    }
  };

  let missingTagIds: string[] = [];

  if (Array.isArray(raw)) {
    collectFromArray(raw);
  } else if (raw && typeof raw === "object") {
    if (Array.isArray((raw as any).tagIds)) collectFromArray((raw as any).tagIds);
    if (Array.isArray((raw as any).tags)) collectFromArray((raw as any).tags);

    if (Array.isArray((raw as any).missingTagIds)) {
      missingTagIds = (raw as any).missingTagIds.map(toStr).filter((s: string) => s.length > 0);
    }
  }

  missingTagIds = Array.from(new Set(missingTagIds));

  return { tagIds, missingTagIds };
}

export async function listProjectTags(projectId: Id): Promise<ProtocolTag[]> {
  const res = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/tags`, { method: "GET" });
  if (!res.ok) throw await toApiError(res, "Failed to fetch project tags");

  const raw = await safeJson<any>(res);
  return normalizeProjectTagsResponse(raw);
}

export async function createProjectTag(
  projectId: Id,
  payload: ProtocolTagCreatePayload,
): Promise<ProtocolTag> {
  const res = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw await toApiError(res, "Failed to create tag");

  const raw = await safeJson<any>(res);
  const tag = normalizeProtocolTag(raw);
  if (!tag) throw new Error("Invalid tag response");
  return tag;
}

export async function updateProjectTag(
  projectId: Id,
  tagId: string,
  payload: ProtocolTagUpdatePayload,
): Promise<ProtocolTag> {
  const res = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/tags/${encodeURIComponent(tagId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw await toApiError(res, "Failed to update tag");

  const raw = await safeJson<any>(res);
  const tag = normalizeProtocolTag(raw);
  if (!tag) throw new Error("Invalid tag response");
  return tag;
}

export async function deleteProjectTag(
  projectId: Id,
  tagId: string,
): Promise<{ success: boolean }> {
  const res = await fetchWithAuth(`${BASE_URL}/projects/${projectId}/tags/${encodeURIComponent(tagId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw await toApiError(res, "Failed to delete tag");

  const raw = await safeJson<any>(res);
  if (raw && typeof raw === "object" && typeof (raw as any).success === "boolean") {
    return { success: (raw as any).success };
  }
  return { success: true };
}

export async function listProtocolTagIds(
  projectId: Id,
  protocolId: Id,
): Promise<string[]> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/tags`,
    { method: "GET" },
  );
  if (!res.ok) throw await toApiError(res, "Failed to fetch protocol tags");

  const raw = await safeJson<any>(res);
  return normalizeProtocolTagIdsResult(raw).tagIds;
}

export async function setProtocolTagIds(
  projectId: Id,
  protocolId: Id,
  tagIds: string[],
): Promise<ProtocolTagIdsResult> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/tags`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: (tagIds ?? []).map((x) => String(x)) }),
    },
  );
  if (!res.ok) throw await toApiError(res, "Failed to set protocol tags");

  const raw = await safeJson<any>(res);
  return normalizeProtocolTagIdsResult(raw);
}


/* ======================= PROJECT SHARING ======================= */

/**
 * List users available for project sharing.
 * Backend endpoint: GET /users
 */
export async function listUsers(): Promise<any[]> {
  const response = await fetchWithAuth(`${BASE_URL}/users`, {
    method: "GET",
  });
  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch users");
  }
  const data = await safeJson<any>(response);
  // If backend returns a non-array shape, normalize to empty array
  return Array.isArray(data) ? data : [];
}

/**
 * Share a project with one or more users.
 * Backend endpoint: POST /projects/{projectId}/share
 * Body: { userIds: [...] }
 */
export async function shareProject(
  projectId: Id,
  userIds: (string | number)[],
): Promise<void | { success: boolean }> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/share`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    },
  );

  if (!response.ok) {
    throw await toApiError(response, "Failed to share project");
  }

  // Backend puede responder 204 vacío o un JSON con { success: true }
  const text = await response.text();
  if (!text) {
    return;
  }
  try {
    return JSON.parse(text) as { success: boolean };
  } catch {
    return;
  }
}

/**
 * Revoke project share for a specific user.
 * Backend endpoint: DELETE /projects/{projectId}/share/{userId}
 */
export async function revokeProjectShare(
  projectId: Id,
  userId: Id,
): Promise<void | { success: boolean }> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/share/${userId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw await toApiError(response, "Failed to revoke project share");
  }

  const text = await response.text();
  if (!text) {
    return;
  }
  try {
    return JSON.parse(text) as { success: boolean };
  } catch {
    return;
  }
}

export async function listProjectShares(projectId: Id): Promise<any[]> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/shares`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch project shares");
  }

  const data = await safeJson<any>(response);

  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray((data as any).shares)) {
    return (data as any).shares;
  }
  if (data && Array.isArray((data as any).results)) {
    return (data as any).results;
  }

  // Fallback if backend returns an unexpected structure
  return [];
}

/* ======================= SETTINGS ======================= */

/**
 * User settings (JSON object).
 * Backend endpoints:
 * - GET  /settings/user
 * - PUT  /settings/user
 */
export async function fetchUserSettings(): Promise<SettingsObject> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/user`, {
    method: "GET",
  });
  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch user settings");
  }
  const data = await safeJson<SettingsObject>(response);
  return (data && typeof data === "object") ? data : {};
}

export async function updateUserSettings(
  settings: SettingsObject,
): Promise<SettingsObject> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/user`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings ?? {}),
  });
  if (!response.ok) {
    throw await toApiError(response, "Failed to update user settings");
  }
  const data = await safeJson<SettingsObject>(response);
  return (data && typeof data === "object") ? data : {};
}

/**
 * Instance settings (admin-only JSON object).
 * Backend endpoints:
 * - GET  /settings/instance
 * - PUT  /settings/instance
 */
export async function fetchInstanceSettings(): Promise<SettingsObject> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/instance`, {
    method: "GET",
  });
  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch instance settings");
  }
  const data = await safeJson<SettingsObject>(response);
  return (data && typeof data === "object") ? data : {};
}

export async function updateInstanceSettings(
  settings: SettingsObject,
): Promise<SettingsObject> {
  const response = await fetchWithAuth(`${BASE_URL}/settings/instance`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings ?? {}),
  });
  if (!response.ok) {
    throw await toApiError(response, "Failed to update instance settings");
  }
  const data = await safeJson<SettingsObject>(response);
  return (data && typeof data === "object") ? data : {};
}


/* ======================= LOAD PROTOCOLS ======================= */
export async function loadProtocols(projectId: number): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols`, { method: "GET" }
  );
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocols");
  return safeJson<any>(response);
}

/* ======================= PROJECT WORKFLOWS ======================= */

/**
 * Fetch predefined workflows / pipelines for a given project.
 * Backend endpoint: GET /projects/workflows
 */
export async function fetchWorkflows(): Promise<WorkflowDescriptor[]> {
  const url = `${BASE_URL}/projects/workflows`;
  const response = await fetchWithAuth(url, { method: "GET" });

  if (!response.ok) {
    console.error("[fetchWorkflows] error response", response);
    throw await toApiError(response, "Failed to fetch project workflows");
  }
  const data = await safeJson<any>(response);
  if (Array.isArray(data)) return data as WorkflowDescriptor[];
  if (data && Array.isArray((data as any).workflows)) return (data as any).workflows as WorkflowDescriptor[];
  if (data && Array.isArray((data as any).results)) return (data as any).results as WorkflowDescriptor[];

  return [];
}


export interface loadWorkflowPayload {
  workflowId: string;
}

/**
 * Load a predefined workflow to an existing project.
 * Backend endpoint: POST /projects/{projectId}/workflows/load
 */
export async function loadWorkflow(
  projectId: string | number,
  payload: loadWorkflowPayload,
): Promise<any> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(
    String(projectId),
  )}/workflows/load`;

  const response = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toApiError(response, "Failed to apply workflow to project");
  }

  return safeJson<any>(response);
}

/* ======================= PROTOCOL ACTIONS ======================= */
export async function renameProtocol(
  projectId: Id,
  protocolId: Id,
  newName: string,
): Promise<ProtocolNode> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_RENAME}`,
    { method: "PUT", body: JSON.stringify({ name: newName }) },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to rename protocol");
  return safeJson<ProtocolNode>(response);
}

export async function duplicateProtocol(
  projectId: Id,
  items: { id: Id; name?: string }[],
): Promise<ProtocolNode[]> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/duplicate`,
    { method: "POST", body: JSON.stringify({ items }) },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to duplicate protocol(s)");
  return safeJson<ProtocolNode[]>(response);
}

export async function deleteProtocol(projectId: Id, protocolIds: Id[]): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocolIds }),
    },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to delete protocol(s)");
  return safeJson<any>(response);
}

export async function restartAll(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_RESTART_ALL}`,
    { method: "POST" },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to restart protocol");
  return safeJson<any>(response);
}

export async function continueAll(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_CONTINUE_ALL}`,
    { method: "POST" },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to continue protocol");
  return safeJson<any>(response);
}

export async function resetFrom(projectId: Id, protocolId: Id): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/${ACTION_RESET_FROM}`,
    { method: "POST" },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to reset from protocol");
  return safeJson<any>(response);
}

export async function stopProtocol(projectId: Id, protocolIds: Id[]): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${ACTION_STOP}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocolIds }),
    },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to stop protocol(s)");
  return safeJson<any>(response);
}

function normalizeNextProtocolSuggestions(raw: unknown): NextProtocolSuggestion[] {
  // normalizeNextProtocolSuggestions
  const arr = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" && Array.isArray((raw as any).suggestions))
      ? (raw as any).suggestions
      : [];

  const normalizeOne = (item: any): NextProtocolSuggestion | null => {
    // normalizeOne
    if (!item || typeof item !== "object") return null;

    const protocolName = String(
      item.protocolName ?? item.name ?? item.label ?? item.title ?? "",
    ).trim();

    const protocolClass = String(
      item.protocolClass ?? item.className ?? item.class ?? item.protocolClassName ?? "",
    ).trim();

    const helpValue = item.help ?? item.description ?? item.tooltip ?? null;
    const help = helpValue == null ? undefined : String(helpValue).trim() || undefined;

    const installed = String(
      item.installed ?? item.installState ?? item.state ?? "installed",
    ).trim() || "installed";

    if (!protocolName || !protocolClass) return null;

    return { protocolName, protocolClass, help, installed };
  };

  return arr.map(normalizeOne).filter(Boolean) as NextProtocolSuggestion[];
}


export async function getContextMenuVisibilityPolicy(
  projectId: Id,
): Promise<any> {
  // getContextMenuVisibilityPolicy
  const url = `${BASE_URL}/projects/${projectId}/context-menu-visibility`;
  const res = await fetchWithAuth(url, { method: "GET" });

  // Treat missing endpoint as default "show everything"
  if (res.status === 404 || res.status === 204) {
    return { delete: true, nextSteps: true };
  }

  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch context menu visibility policy");
  }

  const raw = await safeJson<any>(res);
  return raw;
}


function isMissingId(value: Id): boolean {
  // isMissingId
  return value == null || value === "undefined" || value === "null";
}

/**
 * Fetch "next protocol" suggestions for a given protocol node.
 * Backend endpoint (recommended):
 *   GET /projects/{projectId}/protocols/{protocolId}/suggestions/next
 *
 * Response can be:
 *   - an array of suggestions
 *   - or { suggestions: [...] }
 */
export async function getNextProtocolSuggestions(
  projectId: Id,
  protocolId: Id,
): Promise<NextProtocolSuggestion[]> {
  // getNextProtocolSuggestions
  if (isMissingId(projectId) || isMissingId(protocolId)) return [];

  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/suggestions/next`;
  const res = await fetchWithAuth(url, { method: "GET" });

  // Treat missing endpoint as "no suggestions"
  if (res.status === 404 || res.status === 204) return [];

  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch next protocol suggestions");
  }

  const raw = await safeJson<any>(res);
  return normalizeNextProtocolSuggestions(raw);
}


/* ======================= PROTOCOL LOGS ======================= */

type ProtocolLogChannel = {
  id: string;
  label: string;
  order?: number;
};

type ProtocolLogChunk = {
  text: string;
  offset: number;
  done?: boolean;
};

function normalizeProtocolLogChannelsResponse(
  raw: unknown,
): { channels: ProtocolLogChannel[] } {
  // normalizeProtocolLogChannelsResponse
  const toLabel = (meta: any, fallbackId: string): string => {
    // toLabel
    if (typeof meta === "string" && meta.trim()) return meta.trim();
    if (meta == null) return fallbackId;

    const v = meta?.label ?? meta?.name ?? meta?.title ?? fallbackId;
    const s = String(v).trim();
    return s || fallbackId;
  };

  const toOrder = (meta: any): number | undefined => {
    // toOrder
    const v = meta?.order;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  // Case 1: { channels: [...] }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).channels)) {
    const channels = (raw as any).channels
      .map((c: any) => ({
        id: String(c?.id ?? "").trim(),
        label: String(c?.label ?? c?.name ?? c?.title ?? c?.id ?? "").trim(),
        order: toOrder(c),
      }))
      .filter((c: ProtocolLogChannel) => c.id.length > 0 && c.label.length > 0);

    return { channels: sortChannels(channels) };
  }

  // Case 2: [...]
  if (Array.isArray(raw)) {
    const channels = raw
      .map((c: any) => ({
        id: String(c?.id ?? "").trim(),
        label: String(c?.label ?? c?.name ?? c?.title ?? c?.id ?? "").trim(),
        order: toOrder(c),
      }))
      .filter((c: ProtocolLogChannel) => c.id.length > 0 && c.label.length > 0);

    return { channels: sortChannels(channels) };
  }

  // Case 3: { stdout: { label }, stderr: "Errors" }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, any>;

    const channels = Object.keys(obj)
      .map((id) => ({
        id: String(id).trim(),
        label: toLabel(obj[id], id),
        order: toOrder(obj[id]),
      }))
      .filter((c) => c.id.length > 0 && c.label.length > 0);

    return { channels: sortChannels(channels) };
  }

  return { channels: [] };
}


function sortChannels(channels: ProtocolLogChannel[]): ProtocolLogChannel[] {
  // sortChannels
  return [...channels].sort((a, b) => {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

function normalizeProtocolLogsChunkResponse(
  raw: unknown,
): { chunks: Record<string, ProtocolLogChunk> } {
  // normalizeProtocolLogsChunkResponse
  if (!raw || typeof raw !== "object") return { chunks: {} };

  // Case 1: { chunks: { stdout: { text, offset }, ... } }
  const maybeChunks = (raw as any).chunks;
  if (maybeChunks && typeof maybeChunks === "object") {
    return { chunks: maybeChunks as Record<string, ProtocolLogChunk> };
  }

  // Case 2: { stdout: { text, offset }, stderr: { text, offset } }
  const obj = raw as Record<string, any>;
  const keys = Object.keys(obj);
  const looksLikeChunks = keys.some((k) => {
    const v = obj[k];
    return v && typeof v === "object" && typeof v.text === "string" && typeof v.offset === "number";
  });

  if (looksLikeChunks) {
    return { chunks: obj as Record<string, ProtocolLogChunk> };
  }

  return { chunks: {} };
}

/**
 * Fetch dynamic log channels for a protocol.
 * Recommended backend endpoint:
 *   GET /projects/{projectId}/protocols/{protocolId}/logs/channels
 */
export async function fetchProtocolLogChannels(
  projectId: Id,
  protocolId: Id,
): Promise<ProtocolLogChannelsResponse> {
  // fetchProtocolLogChannels
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/logs/channels`;

  const res = await fetchWithAuth(url, { method: "GET" });

  // Treat missing logs as empty
  if (res.status === 404 || res.status === 204) {
    return { channels: [] };
  }

  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch protocol log channels");
  }

  const raw = await safeJson<any>(res);
  return normalizeProtocolLogChannelsResponse(raw);
}

/**
 * Fetch incremental log chunks using per-channel offsets.
 * Recommended backend endpoint:
 *   POST /projects/{projectId}/protocols/{protocolId}/logs/chunk
 * Body:
 *   { offsets: { stdout: 123, stderr: 0 }, limit?: 20000 }
 */
export async function fetchProtocolLogsChunk(
  projectId: Id,
  protocolId: Id,
  offsets: ProtocolLogOffsets,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<ProtocolLogsChunkResponse> {
  // fetchProtocolLogsChunk
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/logs/chunk`;

  const payload = {
    offsets: offsets ?? {},
    limit: typeof opts.limit === "number" ? opts.limit : undefined,
  };

  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });



  // Treat missing logs as empty
  if (res.status === 404 || res.status === 204) {
    return { chunks: {} };
  }

  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch protocol logs chunk");
  }

  const raw = await safeJson<any>(res);
  return normalizeProtocolLogsChunkResponse(raw);
}


/* ======================= Remote FS / Previews ======================= */
export interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  mime?: string;
}
export interface RemoteListing {
  items: RemoteEntry[];
}

export type ResolveBrowserPathsResult = {
  rootAbs?: string; // absolute root boundary; default "/home"
  startPath?: string; // relative-to-root preferred ("" means root); absolute allowed
  protocolRoot?: string; // relative preferred; absolute allowed
};

export async function resolveBrowserPaths(
  projectId: Id,
  protocolId: Id,
): Promise<ResolveBrowserPathsResult> {
  if (!protocolId || protocolId === "undefined" || protocolId === "null") {
    protocolId = "fake-protocol-id-for-browser-paths-resolution";
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/start-path`,
  );
  if (!res.ok) throw await toApiError(res, "Failed to resolve browser paths");

  const j = await safeJson<{
    // new contract
    rootAbs?: string;
    startPath?: string;
    protocolRoot?: string;
  }>(res);

  // preferNewContract
  if (j && (j.rootAbs || j.startPath || j.protocolRoot)) {
    return {
      rootAbs: j.rootAbs || "/home",
      startPath: j.startPath ?? "",
      protocolRoot: j.protocolRoot,
    };
  }

  // legacyFallback
  const legacyPath = "/";
  return {
    rootAbs: "/home",
    startPath: legacyPath,
    protocolRoot: legacyPath,
  };
}

// supportNewAndLegacyFsListResponses
export type ListProtocolDirResponse = RemoteEntry[] | RemoteListing;

export async function listProtocolDir(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<ListProtocolDirResponse> {
  if (!protocolId || protocolId === "undefined" || protocolId === "null") {
    protocolId = "fake-protocol-id-for-browser-paths-resolution";
  }
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/list?path=${encodeURIComponent(
      path,
    )}`,
  );
  if (!res.ok) throw await toApiError(res, "Failed to list directory");
  return await safeJson<ListProtocolDirResponse>(res);
}

export async function listRemoteDirectory(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<RemoteEntry[]> {
  const payload = await listProtocolDir(projectId, protocolId, path);

  // normalizeFsListResponse
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function previewProtocolText(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<string> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/preview2?path=${encodeURIComponent(
      path,
    )}`,
  );
  if (!res.ok) throw await toApiError(res, "Failed to preview file");
  return await res.text();
}

export function buildProtocolDownloadUrl(
  projectId: Id,
  protocolId: Id,
  path: string,
  inline = false,
): string {
  const q = inline ? "&inline=true" : "";
  return `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/download?path=${encodeURIComponent(
    path,
  )}${q}`;
}

export async function fetchProtocolInlinePreviewBlob(
  projectId: Id,
  protocolId: Id,
  relPath: string,
): Promise<{ blob: Blob; meta: any }> {
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/download?path=${encodeURIComponent(
    relPath,
  )}&inline=1`;
  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);

  const blob = await res.blob();
  const mime = res.headers.get("X-Preview-Mime") || "";
  const width = res.headers.get("X-Preview-Width");
  const height = res.headers.get("X-Preview-Height");
  const depth = res.headers.get("X-Preview-Depth");
  const sizeBytes = res.headers.get("X-Preview-SizeBytes");
  const voxelHeader = res.headers.get("X-Preview-VoxelSize");
  const note = res.headers.get("X-Preview-Note") || "";

  let voxelSize: [number, number, number] | undefined;
  if (voxelHeader) {
    const parts = voxelHeader.split(",").map((p) => Number(p.trim()));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      voxelSize = [parts[0], parts[1], parts[2]];
    }
  }
  const meta = {
    mime,
    width: width ? Number(width) : undefined,
    height: height ? Number(height) : undefined,
    depth: depth ? Number(depth) : undefined,
    sizeBytes: sizeBytes ? Number(sizeBytes) : undefined,
    voxelSize,
    note,
  };
  return { blob, meta };
}

export interface PreviewMeta {
  mime?: string;
  width?: number;
  height?: number;
  depth?: number;
  sizeBytes?: number;
  voxelSize?: number[];
  note?: string;
  type?: string;
  mode?: string;
  columnsHeader?: string;
  rowCount?: number;
}

export interface PreviewSourceBlob {
  sourceType: "blob";
  blob: Blob;
  objectUrl: string;
}

function inferKindFromContentType(contentType: string): PreviewKind {
  const ct = normalizeMime(contentType);
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("text/")) return "text";
  if (ct === "application/json") return "table"; // bestEffortFallback
  return "binary";
}

export interface RemoteEntryPreview {
  kind: PreviewKind;

  // semanticMime: what the file "is" (X-Preview-Mime preferred)
  semanticMime: string;

  // payloadMime: what the HTTP body actually is (Content-Type)
  payloadMime: string;

  meta: PreviewMeta;
  truncated: boolean;

  note?: string;

  // Text payload
  text?: string;
  language?: string;

  // Table payload
  columns?: string[];
  rows?: (string | number | null)[][];

  // Blob payload (image/volume/binary)
  source?: PreviewSourceBlob;
}

function normalizeMime(value: string): string {
  return (value || "").split(";")[0].trim().toLowerCase();
}

function getTruncated(headers: Headers): boolean {
  const v = (headers.get("X-Preview-Truncated") || "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}


export function disposeRemoteEntryPreview(preview: RemoteEntryPreview | null): void {
  // revokeObjectUrlToAvoidLeaks
  const objectUrl = preview?.source?.objectUrl;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
}

// types.ts (or wherever previewRemoteEntry lives)
type PreviewKind = "none" | "text" | "table" | "image" | "volume" | "binary";

export async function previewRemoteEntry(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<any> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/preview?path=${enc(path)}`;

  const res = await fetchWithAuth(url, { method: "GET", cache: "no-store" });

  if (res.status === 404 || res.status === 204 || res.status === 415) return null;

  if (!res.ok) {
    throw await toApiError(res, "Failed to preview remote entry");
  }

  const contentTypeRaw = res.headers.get("Content-Type") || "application/octet-stream";
  const payloadMime = normalizeMime(contentTypeRaw);

  const previewSchemaRaw = (res.headers.get("X-Preview-Schema") || "").trim();
  const previewSchema = previewSchemaRaw.toLowerCase();

  const hasPreviewHeaders = Boolean(
    res.headers.get("X-Preview-Kind") ||
    res.headers.get("X-Preview-Mime") ||
    res.headers.get("X-Preview-ResponseMime") ||
    res.headers.get("X-Preview-Name"),
  );

  // scipionIsTheGoodOne
  const isScipionPreview = previewSchema === "scipion" || (previewSchema === "" && hasPreviewHeaders);

  if (!isScipionPreview) {
    const coerced = await coerceNonScipionResponse(res, payloadMime);
    return finalizePreviewForGui(coerced);
  }

  const meta = parseMeta(res.headers) as any;
  const truncated = getTruncated(res.headers);

  const kind: PreviewKind = (meta.kind as PreviewKind) || inferKindFromContentType(payloadMime);

  const semanticMime = normalizeMime(meta.mime || "") || payloadMime;
  const responseMime = normalizeMime(meta.responseMime || "") || payloadMime;

  // kindDrivenHandling
  if (kind === "none") {
    return finalizePreviewForGui({
      kind,
      mime: semanticMime,
      meta,
      truncated,
      note: meta.note || "No preview available.",
    });
  }

  if (responseMime === "application/pdf") {
    return finalizePreviewForGui({
      kind: "none",
      mime: semanticMime,
      meta,
      truncated,
      note: meta.note || "PDF preview is not available in this dialog.",
    });
  }

  if (kind === "text") {
    const text = await res.text();
    return finalizePreviewForGui({ kind, mime: semanticMime, meta, truncated, text });
  }

  if (kind === "table") {
    const data = await safeJson<any>(res);

    const columns =
      Array.isArray(data?.columns)
        ? data.columns.map((c: any) => String(c))
        : typeof meta.columnsHeader === "string"
          ? meta.columnsHeader.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];

    const rawRows: any[] = Array.isArray(data?.rows) ? data.rows : [];
    const rows = rawRows.map((r: any) =>
      Array.isArray(r)
        ? r.map((cell: any) => {
          if (cell == null) return null;
          if (typeof cell === "number") return Number.isFinite(cell) ? cell : String(cell);
          if (typeof cell === "string") return cell;
          if (typeof cell === "boolean") return cell ? 1 : 0;
          return String(cell);
        })
        : [],
    );

    return finalizePreviewForGui({ kind, mime: semanticMime, meta, truncated, columns, rows });
  }

  // image | volume | binary -> blob
  const blob = await res.blob();

  return finalizePreviewForGui({
    kind,
    mime: semanticMime,
    meta,
    truncated,
    source: { sourceType: "blob", blob },
  });
}

async function coerceNonScipionResponse(res: Response, payloadMime: string): Promise<any> {
  const normalized = normalizeMime(payloadMime) || "application/octet-stream";
  const isJson = normalized === "application/json" || normalized.endsWith("+json");

  // nonJsonFallback
  if (!isJson) {
    const isTextLike =
      normalized.startsWith("text/") ||
      normalized === "application/xml" ||
      normalized === "application/x-yaml" ||
      normalized === "text/x-log";

    if (isTextLike) {
      const text = await res.text();
      return { kind: "text", mime: normalized || "text/plain", meta: {}, truncated: false, text };
    }

    const blob = await res.blob();
    return {
      kind: inferKindFromContentType(normalized),
      mime: normalized,
      meta: {},
      truncated: false,
      source: { sourceType: "blob", blob },
    };
  }
  // jsonPureContract
  const data = await safeJson<any>(res);

  const kind: PreviewKind =
    (typeof data?.kind === "string" ? (data.kind as PreviewKind) : null) ||
    inferKindFromContentType(normalized);

  const mime =
    normalizeMime(data?.mime || "") ||
    normalizeMime(data?.source?.mime || "") ||
    normalized;

  const meta = data?.meta && typeof data.meta === "object" ? data.meta : {};
  const truncated = Boolean(data?.truncated);

  if (kind === "none") {
    return {
      kind,
      mime,
      meta,
      truncated,
      note: typeof data?.note === "string" ? data.note : "No preview available.",
    };
  }

  if (kind === "text") {
    const text =
      typeof data?.text === "string"
        ? data.text
        : data?.json != null
          ? JSON.stringify(data.json, null, 2)
          : JSON.stringify(data, null, 2);

    return { kind, mime, meta, truncated, text };
  }

  if (kind === "table") {
    const columns = Array.isArray(data?.columns) ? data.columns.map((c: any) => String(c)) : [];
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return { kind, mime, meta, truncated, columns, rows };
  }

  // image|volume|binary: keepSourceAsIsHere; finalizePreviewForGui will normalize base64->blob
  return {
    kind,
    mime,
    meta,
    truncated,
    source: data?.source,
  };
}

function finalizePreviewForGui(preview: any): any {
  if (!preview || typeof preview !== "object") return preview;

  const source = preview.source;
  // base64ToBlobNormalization
  if (!source || typeof source !== "object") return preview;

  const sourceType = String(source.sourceType || "").toLowerCase();

  // alreadyBlob
  if (sourceType === "blob" && source.blob instanceof Blob) return preview;

  if (sourceType === "base64" && typeof source.dataBase64 === "string") {
    const effectiveMime =
      normalizeMime(source.mime || "") ||
      normalizeMime(preview.mime || "") ||
      "application/octet-stream";

    try {
      const blob = base64ToBlob(source.dataBase64, effectiveMime);
      return {
        ...preview,
        source: { sourceType: "blob", blob },
      };
    } catch (e: any) {
      return {
        ...preview,
        kind: "none",
        note: `Invalid base64 payload: ${String(e?.message || e)}`,
        meta: { ...(preview.meta || {}), base64Error: true },
      };
    }
  }

  return preview;
}

function base64ToBlob(dataBase64OrDataUrl: string, mime: string): Blob {
  // extractBase64Payload
  let base64 = (dataBase64OrDataUrl || "").trim();

  // handleDataUrlPrefix
  if (base64.startsWith("data:")) {
    const commaIndex = base64.indexOf(",");
    if (commaIndex >= 0) base64 = base64.slice(commaIndex + 1);
  }

  // normalizeUrlSafeBase64
  base64 = base64.replace(/-/g, "+").replace(/_/g, "/");

  // addPaddingIfNeeded
  const mod = base64.length % 4;
  if (mod === 2) base64 += "==";
  else if (mod === 3) base64 += "=";

  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime || "application/octet-stream" });
}


// projects.ts

/**
 * Fetch PSD image for a CTF tomo view given its stack spec (for example "3@/path/TS_1.mrc").
 * The spec string is sent as-is so the backend can interpret slice@index semantics.
 */
export async function fetchCTFPsdImage(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  spec: string,
  opts: FetchImageSliceOptions = {},
): Promise<Blob> {
  const {
    size = 512,
    format = "png",
    applyTransform = false,
    signal,
  } = opts;

  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/ctftomo/psd`;

  const params = new URLSearchParams();
  // IMPORTANT: we send the spec string as-is so the backend receives "3@/path/to/file.mrc"
  params.set("spec", spec);
  params.set("size", String(size));
  params.set("fmt", format);
  params.set("applyTransform", String(applyTransform));

  const url = `${base}?${params.toString()}`;

  const res = await fetchWithAuth(url, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!res.ok) {
    throw await toApiError(res, "Failed to render CTF PSD image");
  }

  // Return the raw Blob so the viewer can manage its own ObjectURL
  const blob = await res.blob();
  return blob;
}


/* ======================= Output preview (tables/pdfs/etc.) ======================= */
export type PreviewResult =
  | { kind: "image"; url: string; meta: any; downloadUrl: string }
  | { kind: "pdf"; url: string; meta: any; downloadUrl: string }
  | { kind: "table"; data: { columns: string[]; rows: any[] }; meta: any; downloadUrl: string }
  | { kind: "sqlite"; data: any; meta: any; downloadUrl: string }
  | { kind: "archive"; data: any; meta: any; downloadUrl: string }
  | { kind: "text"; text: string; meta: any; downloadUrl: string }
  | { kind: "binary"; url: string; meta: any; downloadUrl: string };

function parseMeta(h: Headers) {
  const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);
  const parseVoxel = (s: string | null) => (s ? s.split(",").map((x) => Number(x)) : undefined);

  return {
    kind: h.get("X-Preview-Kind") || undefined,
    name: h.get("X-Preview-Name") || undefined,

    // semanticMime: what the file "is"
    mime: h.get("X-Preview-Mime") || undefined,

    // responseMime: what the HTTP body actually is (optional but very useful)
    responseMime: h.get("X-Preview-ResponseMime") || undefined,

    width: num(h.get("X-Preview-Width")),
    height: num(h.get("X-Preview-Height")),
    depth: num(h.get("X-Preview-Depth")),

    thumbWidth: num(h.get("X-Preview-ThumbWidth")),
    thumbHeight: num(h.get("X-Preview-ThumbHeight")),

    sizeBytes: num(h.get("X-Preview-SizeBytes")),
    voxelSize: parseVoxel(h.get("X-Preview-VoxelSize")),

    note: h.get("X-Preview-Note") || undefined,

    // keepTheseIfYouStillUseThemElseRemove
    type: h.get("X-Preview-Type") || undefined,
    mode: h.get("X-Preview-Mode") || undefined,
    columnsHeader: h.get("X-Preview-Columns") || undefined,
    rowCount: num(h.get("X-Preview-RowCount")),
  };
}


async function buildPreviewResult(
  res: Response,
  baseDownloadUrl: string,
): Promise<PreviewResult> {
  const ct = (res.headers.get("Content-Type") || "").toLowerCase();
  const meta = parseMeta(res.headers);
  const downloadUrl = baseDownloadUrl;
  if (!res.ok) {
    try {
      const asJson = await res.json();
      throw new Error(asJson?.detail || JSON.stringify(asJson));
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }
  if (ct.startsWith("image/")) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { kind: "image", url, meta, downloadUrl };
  }
  if (ct.includes("application/pdf")) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { kind: "pdf", url, meta, downloadUrl };
  }
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (meta.type === "table") {
      const columns =
        data.columns ||
        (meta.columnsHeader
          ? meta.columnsHeader.split(",").filter(Boolean)
          : []);
      return {
        kind: "table",
        data: { columns, rows: data.rows || [] },
        meta,
        downloadUrl,
      };
    }
    if (meta.type === "sqlite")
      return { kind: "sqlite", data, meta, downloadUrl };
    if (meta.type === "archive")
      return { kind: "archive", data, meta, downloadUrl };
    return {
      kind: "text",
      text: JSON.stringify(data, null, 2),
      meta,
      downloadUrl,
    };
  }
  if (ct.startsWith("text/")) {
    const text = await res.text();
    return { kind: "text", text, meta, downloadUrl };
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { kind: "binary", url, meta, downloadUrl };
}

export async function fetchOutputPreview(
  projectId: Id,
  protocolId: string | number,
  outputName: string,
  opts?: { table?: string },
): Promise<PreviewResult> {
  const enc = encodeURIComponent;
  const qp: string[] = ["inline=true"];
  if (opts?.table) qp.push(`table=${enc(opts.table)}`);
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputpreview/${enc(
    outputName,
  )}`;
  const url = qp.length ? `${base}?${qp.join("&")}` : base;
  const downloadUrl = `${base}?inline=false`;
  const response = await fetchWithAuth(url, { method: "GET" });
  if (!response.ok)
    throw await toApiError(response, "Failed previewing the output");
  return buildPreviewResult(response, downloadUrl);
}

/* ======================= Analyze Results: FSC ======================= */

export async function fetchFscRows(
  projectId: Id,
  protocolId: Id,
  outputName: string,
): Promise<FscPoint[]> {
  const enc = encodeURIComponent;

  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/fsc/rows`;

  const res = await fetchWithAuth(url, { method: "GET" });

  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch FSC rows");
  }

  const raw = await safeJson<any>(res);
  return raw;
}

/* ======================= Analyze Results: Volumes ======================= */
export async function listOutputVolumes(
  projectId: Id,
  protocolId: Id,
  outputName: string,
): Promise<any[]> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/volumes`;
  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) throw await toApiError(res, "Failed to list output volumes");
  return safeJson<any[]>(res);
}

export async function getVolumeInfo(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  volumeId: Id,
): Promise<any> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/volumes/${enc(String(volumeId))}/info`;
  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch volume histogram");
  return safeJson<any>(res);
}

export async function getVolumeHistogram(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  volumeId: Id,
  opts: {
    bins?: number;
    rangeMin?: number;
    rangeMax?: number;
  } = {},
): Promise<any> {
  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/volumes/${enc(String(volumeId))}/histogram`;

  const params = new URLSearchParams();
  if (opts.bins != null) params.set("bins", String(opts.bins));
  if (opts.rangeMin != null) params.set("min", String(opts.rangeMin));
  if (opts.rangeMax != null) params.set("max", String(opts.rangeMax));

  const url = params.toString() ? `${base}?${params.toString()}` : base;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch volume histogram");
  return safeJson<any>(res);
}

/** IMPORTANT: only 'cmap=' is sent. */
export async function buildVolumeSliceUrl(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  volumeId: Id,
  sliceIndex: number,
  opts?: {
    axis?: "z" | "y" | "x";
    cmap?: string;
    normalize?: "minmax" | "zscore" | "none";
    scale?: number;
  },
): Promise<string> {
  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/volumes/${enc(String(volumeId))}/slice`;
  const qp: string[] = [`index=${sliceIndex}`];
  if (opts?.axis) qp.push(`axis=${opts.axis}`);
  if (opts?.cmap) qp.push(`cmap=${enc(opts.cmap)}`); // ONLY cmap
  if (opts?.normalize) qp.push(`normalize=${opts.normalize}`);
  if (typeof opts?.scale === "number") qp.push(`scale=${opts.scale}`);
  const url = `${base}?${qp.join("&")}`;
  const res = await fetchWithAuth(url, { method: "GET", cache: "no-store" });
  if (!res.ok) throw await toApiError(res, "Failed to render volume slice");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchVolumeSliceObjectUrl(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  volumeId: Id,
  sliceIndex: number,
  opts?: {
    axis?: "z" | "y" | "x";
    cmap?: string;
    normalize?: "minmax" | "zscore" | "none";
    scale?: number;
    format?: "png" | "webp" | "jpeg";
    thumb?: number;
    fast?: boolean;
    quality?: number;
    signal?: AbortSignal;
  },
): Promise<{ url: string; meta: any; revoke: () => void }> {
  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/volumes/${enc(String(volumeId))}/slice`;
  const qp: string[] = [`index=${sliceIndex}`];
  if (opts?.axis) qp.push(`axis=${opts.axis}`);
  if (opts?.cmap) qp.push(`cmap=${enc(opts.cmap)}`); // ONLY cmap
  if (opts?.normalize) qp.push(`normalize=${opts.normalize}`);
  if (typeof opts?.scale === "number") qp.push(`scale=${opts.scale}`);
  if (opts?.format) qp.push(`format=${opts.format}`);
  if (typeof opts?.thumb === "number") qp.push(`thumb=${opts.thumb}`);
  if (typeof opts?.fast === "boolean")
    qp.push(`fast=${opts.fast ? "1" : "0"}`);
  if (typeof opts?.quality === "number")
    qp.push(`quality=${opts.quality}`);
  const url = `${base}?${qp.join("&")}`;

  const res = await fetchWithAuth(url, {
    method: "GET",
    cache: "no-store",
    signal: opts?.signal,
  });
  if (!res.ok) throw await toApiError(res, "Failed to render volume slice");

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const meta = {
    mime:
      res.headers.get("X-Preview-Mime") ||
      res.headers.get("Content-Type"),
    width:
      Number(res.headers.get("X-Preview-Width") || "") || undefined,
    height:
      Number(res.headers.get("X-Preview-Height") || "") || undefined,
    depth:
      Number(res.headers.get("X-Preview-Depth") || "") || undefined,
    cmap: res.headers.get("X-Preview-Colormap") || undefined,
    format: res.headers.get("X-Preview-Format") || undefined,
    voxelSize: res.headers
      .get("X-Preview-VoxelSize")
      ?.split(",")
      .map(Number),
    note: res.headers.get("X-Preview-Note") || undefined,
  };
  const revoke = () => URL.revokeObjectURL(objUrl);
  return { url: objUrl, meta, revoke };
}

export async function getVolumeData3d(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  volumeId: Id,
  opts: {
    maxDim?: number;
    method?: "binning" | "stride" | "none";
  } = {},
): Promise<any> {
  const enc = encodeURIComponent;

  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/volumes/${enc(String(volumeId))}/data3d`;

  const params = new URLSearchParams();
  if (opts.maxDim != null) params.set("maxDim", String(opts.maxDim));
  if (opts.method) params.set("method", opts.method);

  const url = params.toString() ? `${base}?${params.toString()}` : base;

  const res = await fetchWithAuth(url, { method: "GET", cache: "no-store" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch 3D volume data");

  return safeJson<any>(res);
}

/* ======================= Analyze Results: Coordinates3D ======================= */

export interface Coords3dTomogram {
  id: Id;
  name?: string;
  label?: string;
  tomoId?: Id;
  dims?: [number, number, number];
  voxelSize?: [number, number, number];
  nCoords?: number;
  n?: number;
  count?: number;
}

export interface Coords3dPoint {
  id?: number | string;
  x: number;
  y: number;
  z: number;
  classId?: number | string;
  score?: number;
  [k: string]: any;
}

export interface Coords3dForTomogram {
  tomoId: Id;
  tomogramLabel?: string;
  n?: number;
  coords: Coords3dPoint[];
}

export async function listCoords3dTomograms(
  projectId: Id,
  protocolId: Id,
  outputName: string,
): Promise<Coords3dTomogram[]> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/coords3d/tomograms`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to list coords3d tomograms");
  }

  const data = await safeJson<any>(res);

  if (!Array.isArray(data)) {
    return [];
  }

  return data as Coords3dTomogram[];
}

export async function fetchCoords3dForTomogram(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tomoId: Id,
): Promise<Coords3dForTomogram> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/coords3d/tomograms/${enc(String(tomoId))}`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch coords3d for tomogram");
  }

  const payload = await safeJson<any>(res);

  const isArray = Array.isArray(payload);
  const rawPoints: any[] =
    (isArray ? payload : payload?.coords) ||
    payload?.points ||
    [];

  const coords: Coords3dPoint[] = rawPoints.map((p: any, idx: number) => ({
    id: p.id ?? idx,
    x: p.x ?? p.X,
    y: p.y ?? p.Y,
    z: p.z ?? p.Z,
    matrix: p.matrix ?? [],
    classId: p.classId ?? p.class ?? p.class_id,
    score:
      typeof p.score === "number" && Number.isFinite(p.score)
        ? p.score
        : typeof p.weight === "number" && Number.isFinite(p.weight)
          ? p.weight
          : typeof p.prob === "number" && Number.isFinite(p.prob)
            ? p.prob
            : undefined,
    ...p,
  }));

  const baseTomoId =
    (!isArray && (payload.tomoId ?? payload.tomogramId ?? payload.id)) ??
    tomoId;

  return {
    tomoId: baseTomoId,
    tomogramLabel:
      !isArray &&
      (payload.tomogramLabel ??
        payload.label ??
        payload.name ??
        String(baseTomoId)),
    n: !isArray && typeof payload.n === "number" ? payload.n : coords.length,
    coords,
  };
}

export async function fetchCoords3dTomogramSliceObjectUrl(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tomoId: Id,
  sliceIndex: number,
  opts: {
    axis?: "z" | "y" | "x";
    cmap?: string;
    normalize?: "minmax" | "zscore" | "none";
    scale?: number;
    format?: "png" | "webp" | "jpeg";
    thumb?: number;
    fast?: boolean;
    quality?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{ url: string; meta: any; revoke: () => void }> {
  const enc = encodeURIComponent;

  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/coords3d/tomograms/${enc(String(tomoId))}/slice`;

  const qp: string[] = [`index=${sliceIndex}`];
  if (opts.axis) qp.push(`axis=${opts.axis}`);
  if (opts.cmap) qp.push(`cmap=${enc(opts.cmap)}`);
  if (opts.normalize) qp.push(`normalize=${opts.normalize}`);
  if (typeof opts.scale === "number") qp.push(`scale=${opts.scale}`);
  if (opts.format) qp.push(`format=${opts.format}`);
  if (typeof opts.thumb === "number") qp.push(`thumb=${opts.thumb}`);
  if (typeof opts.fast === "boolean") qp.push(`fast=${opts.fast ? "1" : "0"}`);
  if (typeof opts.quality === "number") qp.push(`quality=${opts.quality}`);

  const url = `${base}?${qp.join("&")}`;

  const res = await fetchWithAuth(url, {
    method: "GET",
    cache: "no-store",
    signal: opts.signal,
  });
  if (!res.ok) {
    throw await toApiError(res, "Failed to render coords3D tomogram slice");
  }

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);

  const meta = {
    mime: res.headers.get("X-Preview-Mime") || res.headers.get("Content-Type"),
    width: Number(res.headers.get("X-Preview-Width") || "") || undefined,
    height: Number(res.headers.get("X-Preview-Height") || "") || undefined,
    depth: Number(res.headers.get("X-Preview-Depth") || "") || undefined,
    cmap: res.headers.get("X-Preview-Colormap") || undefined,
    format: res.headers.get("X-Preview-Format") || undefined,
    voxelSize: res
      .headers
      .get("X-Preview-VoxelSize")
      ?.split(",")
      .map((v) => Number(v.trim())),
    note: res.headers.get("X-Preview-Note") || undefined,
  };

  const revoke = () => URL.revokeObjectURL(objUrl);

  return { url: objUrl, meta, revoke };
}

export async function createCoords3dOutputFromPoints(
  projectId: Id,
  protocolId: Id,
  coordsOutputName: string,
  payload: any,
  opts: CreateCoords3dOutputFromPointsOptions = {},
): Promise<CreateCoords3dOutputFromPointsResult> {
  // createCoords3dOutputFromPoints
  const enc = encodeURIComponent;

  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(coordsOutputName,)}/coords3d/new-output`;

  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
    signal: opts.signal,
  });

  // Allow 204 to mean "ok"
  if (res.status === 204) {
    return {
      success: true,
      outputName: String(payload?.newOutputName ?? "").trim() || "new-output",
    };
  }

  if (!res.ok) {
    throw await toApiError(res, "Failed to create coords3d output from points");
  }

  const raw = await safeJson<any>(res);

  const success =
    raw && typeof raw === "object" && typeof raw.success === "boolean" ? raw.success : true;

  const outputName =
    raw && typeof raw === "object" && raw.outputName != null
      ? String(raw.outputName)
      : String(payload?.newOutputName ?? "").trim();

  const message =
    raw && typeof raw === "object" && typeof raw.message === "string" ? raw.message : undefined;

  return { success, outputName, message, data: raw };
}


/* ======================= Analyze Results: Metadata tables ======================= */

// Metadata tables list
export interface MetadataTableInfo {
  name: string;
  alias: string;
  rowCount: number;
  hasColumnId: boolean;
}

// Columns schema
export type MetadataRendererType =
  | "int"
  | "float"
  | "bool"
  | "matrix"
  | "image"
  | "str";

export interface MetadataColumn {
  name: string;
  alias: string;
  index: number;
  sortable: boolean;
  visible: boolean;
  rendererType: MetadataRendererType;
  decimals: number | null;
  hasTransformation: boolean;
}

export interface MetadataTableSchema {
  name: string;
  alias: string;
  hasColumnId: boolean;
  columns: MetadataColumn[];
}

export interface MetadataTableSchema {
  name: string;
  alias: string;
  hasColumnId: boolean;
  columns: MetadataColumn[];

  /** Optional action buttons to display in the metadata viewer */
  actions?: string[];
}

export type MetadataTableActionPayload = {
  action: string;
  subsetName?: string;
  ids: Array<number | string>;
};

export type MetadataTableActionResult = {
  success: boolean;
  message?: string;
  data?: unknown;
};

function normalizeMetadataTableActionResult(raw: unknown): MetadataTableActionResult {
  // normalizeMetadataTableActionResult
  if (raw && typeof raw === "object") {
    const success =
      typeof (raw as any).success === "boolean" ? (raw as any).success : true;

    const message =
      typeof (raw as any).message === "string" ? (raw as any).message : undefined;

    return { success, message, data: raw };
  }

  // Empty response or non-object payload
  return { success: true, data: raw };
}

// Cells and rows
export type MetadataCell =
  | number
  | string
  | boolean
  | {
    kind: "image";
    path: string;
  }
  | {
    kind: "matrix";
    value: any;
  };

export interface MetadataRow {
  id: number;
  values: MetadataCell[];
}

export interface MetadataPage {
  pageNumber: number;
  pageSize: number;
  totalRows: number;
  rows: MetadataRow[];
}

export async function fetchOutputMetadataTables(
  projectId: Id,
  protocolId: Id,
  outputName: string,
): Promise<MetadataTableInfo[]> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables`;
  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch metadata tables");
  return safeJson<MetadataTableInfo[]>(res);
}

export async function fetchMetadataTableSchema(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tableName: string,
): Promise<MetadataTableSchema> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables/${enc(tableName)}/schema`;
  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch metadata schema");
  return safeJson<MetadataTableSchema>(res);
}


export async function runMetadataTableAction(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tableName: string,
  payload: MetadataTableActionPayload,
): Promise<MetadataTableActionResult> {
  // runMetadataTableAction
  const enc = encodeURIComponent;

  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables/${enc(tableName)}/actions`;

  const body = {
    action: String(payload?.action ?? "").trim(),
    subsetName: (payload?.subsetName ?? "").trim() || undefined,
    ids: Array.isArray(payload?.ids) ? payload.ids : [],
  };

  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Allow 204 to mean "ok"
  if (res.status === 204) {
    return { success: true };
  }

  if (!res.ok) {
    throw await toApiError(res, "Failed to run metadata table action");
  }

  const raw = await safeJson<any>(res);
  return normalizeMetadataTableActionResult(raw);
}

export async function fetchMetadataTablePage(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tableName: string,
  opts: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    asc?: boolean;
    selectionOnly?: boolean;
  } = {},
): Promise<MetadataPage> {
  const {
    page = 1,
    pageSize = 100,
    sortBy = "id",
    asc = true,
    selectionOnly = false,
  } = opts;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("asc", String(asc));
  params.set("selectionOnly", String(selectionOnly));

  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables/${enc(tableName)}/page`;
  const url = `${base}?${params.toString()}`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch metadata page");
  return safeJson<MetadataPage>(res);
}

// Export CSV/XLSX: returns a Blob so the caller can trigger download
export async function exportMetadataTable(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tableName: string,
  opts: {
    format?: "csv" | "xlsx";
    selectionOnly?: boolean;
    ids?: number[];
  } = {},
): Promise<Blob> {
  const { format = "csv", selectionOnly = false, ids } = opts;

  const params = new URLSearchParams();
  params.set("format", format);
  params.set("selectionOnly", String(selectionOnly));
  if (ids && ids.length > 0) {
    params.set("ids", ids.join(","));
  }

  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables/${enc(tableName)}/export`;
  const url = `${base}?${params.toString()}`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to export metadata table");
  return res.blob();
}

export async function fetchMetadataImageCellObjectUrl(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tableName: string,
  rowIndex: number | string,
  columnName: string,
  opts: {
    size?: number;
    applyTransform?: boolean;
    inline?: boolean;
    format?: string;
  } = {},
): Promise<{ url: string; revoke: () => void }> {
  const { size = 256, applyTransform = false, inline = true, format = "png" } =
    opts;

  const baseUrl = getMetadataImageCellUrl(
    Number(projectId),
    Number(protocolId),
    outputName,
    tableName,
    rowIndex,
    columnName,
    { size, applyTransform, inline, format },
  );

  const res = await fetchWithAuth(baseUrl, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch metadata image cell");
  }

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const revoke = () => URL.revokeObjectURL(objUrl);
  return { url: objUrl, revoke };
}

// Builds the URL for an image cell (used directly as <img src="...">)
export function getMetadataImageCellUrl(
  projectId: number,
  protocolId: number,
  outputName: string,
  tableName: string,
  rowIndex: number | string,
  columnName: string,
  opts: {
    size?: number;
    applyTransform?: boolean;
    inline?: boolean;
    format?: string;
  } = {},
): string {
  const { size = 256, applyTransform = false, inline = true, format = "png" } =
    opts;

  const params = new URLSearchParams();
  // 0-based index in the current table order
  params.set("rowIndex", String(rowIndex));
  params.set("column", columnName);
  params.set("size", String(size));
  params.set("applyTransform", String(applyTransform));
  params.set("inline", String(inline));
  params.set("fmt", format);

  return `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${outputName}/metadata/tables/${encodeURIComponent(
    tableName,
  )}/image?${params.toString()}`;
}

export interface MetadataWindow {
  offset?: number;
  limit?: number;
  totalRows?: number;
  rows: MetadataRow[];
}

export async function fetchMetadataTableWindow(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tableName: string,
  opts: {
    offset?: number;
    limit?: number;
    selectionOnly?: boolean;

    // addSortParams
    sortBy?: string;
    asc?: boolean;
  } = {},
): Promise<MetadataWindow> {
  const {
    offset = 0,
    limit = 100,
    selectionOnly = false,
    sortBy,
    asc,
  } = opts;

  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  params.set("selectionOnly", String(selectionOnly));

  if (typeof sortBy === "string" && sortBy.trim()) {
    params.set("sortBy", sortBy.trim());
  }
  if (typeof asc === "boolean") {
    params.set("asc", String(asc));
  }

  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables/${enc(tableName)}/rows`;
  const url = `${base}?${params.toString()}`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch metadata rows window");

  const data = await safeJson<any>(res);

  if (Array.isArray(data)) {
    return { offset, limit, rows: data as MetadataRow[] };
  }

  if (data && Array.isArray(data.rows)) {
    return {
      offset: typeof data.offset === "number" ? data.offset : offset,
      limit: typeof data.limit === "number" ? data.limit : limit,
      totalRows: typeof data.totalRows === "number" ? data.totalRows : undefined,
      rows: data.rows as MetadataRow[],
    };
  }

  throw new Error("Unexpected response format for metadata rows window");
}


/* ======================= Analyze Results: Tilt series ======================= */

export interface TiltSeriesListItem {
  id: Id;
  name?: string;
  label?: string;
  /** Optional number of tilt images in this series. */
  nTilts?: number;
  /** Legacy aliases from backend: n or count. */
  n?: number;
  count?: number;
  /** Optional image dimensions [width, height] in pixels. */
  dims?: [number, number];
  /** Optional pixel size (for example Å/px). */
  pixelSize?: number;
}


export async function listOutputTiltSeries(
  projectId: Id,
  protocolId: Id,
  outputName: string,
): Promise<TiltSeriesListItem[]> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/tiltseries`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to list output tilt series");
  }

  const data = await safeJson<any>(res);
  if (!Array.isArray(data)) {
    return [];
  }

  return data as TiltSeriesListItem[];
}


export async function fetchTiltSeriesViewImageObjectUrl(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tiltSeriesId: Id,
  viewIndex: number,
  opts: FetchImageSliceOptions = {},
): Promise<ObjectUrlResult> {
  const {
    size = 512,
    format = "png",
    applyTransform = false,
    signal,
  } = opts;

  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/tiltseries/${enc(String(tiltSeriesId))}/tilt`;

  const params = new URLSearchParams();
  params.set("index", String(viewIndex));
  params.set("size", String(size));
  params.set("fmt", format);
  params.set("applyTransform", String(applyTransform));

  const url = `${base}?${params.toString()}`;

  const res = await fetchWithAuth(url, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw await toApiError(res, "Failed to render tilt-series image");
  }

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const revoke = () => URL.revokeObjectURL(objUrl);

  return { url: objUrl, revoke };
}

export async function fetchTiltSeriesFrames(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  tiltSeriesId: Id,
): Promise<any> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/tiltseries/${enc(String(tiltSeriesId))}/frames`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch tilt-series frames");
  }

  return safeJson<any>(res);
}


/**
 * Create a new tilt-series set based on the current exclusions.
 * Backend will interpret `exclusions` and `restack` to build the new output.
 */
export async function createNewSetOfTiltSeries(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  exclusions: TiltExclusionsPayload,
  restack: boolean,
): Promise<any> {
  const enc = encodeURIComponent;

  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/tiltseries/new-set`;

  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclusions, restack }),
  });

  if (!res.ok) {
    throw await toApiError(res, "Failed to create new set of tilt series");
  }

  return safeJson<any>(res);
}


/* ======================= Analyze Results: CTF tomography (SetOfCTFTomoSeries) ======================= */

/**
 * List CTF tomo series for a SetOfCTFTomoSeries output.
 * If backend returns a dataset { series, rows }, this helper extracts only `series`.
 */
export async function listOutputCTFTomoSeries(
  projectId: Id,
  protocolId: Id,
  outputName: string,
): Promise<any[]> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/ctftomo`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to list output CTF tomo series");
  }

  const data = await safeJson<any>(res);

  // Backend already returns a plain list
  if (Array.isArray(data)) {
    return data;
  }

  // Backend returns a dataset { series, rows }
  if (data && Array.isArray((data as any).series)) {
    return (data as any).series;
  }

  return [];
}

/**
 * Fetch all CTF estimation views for a given CTF tomo series.
 * Shape is defined by the backend; the viewer will normalize it.
 */
export async function fetchCTFTomoSeriesViews(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  ctfSeriesId: Id,
): Promise<any> {
  const enc = encodeURIComponent;
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/ctftomo/${enc(String(ctfSeriesId))}/views`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok) {
    throw await toApiError(res, "Failed to fetch CTF tomo views");
  }

  return safeJson<any>(res);
}

/**
 * Create a new SetOfCTFTomoSeries based on current exclusions.
 * Uses the same exclusions payload shape as SetOfTiltSeries.
 */
export async function createNewSetOfCTFTomoSeries(
  projectId: Id,
  protocolId: Id,
  outputName: string,
  exclusions: CTFTomoExclusionsPayload,
): Promise<any> {
  const enc = encodeURIComponent;

  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/ctftomo/new-set`;

  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclusions }),
  });

  if (!res.ok) {
    throw await toApiError(res, "Failed to create new set of CTF tomo series");
  }

  return safeJson<any>(res);
}


export function resolveBackendUrl(raw?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${BASE_URL}${value}`;

  return `${BASE_URL}/${value}`;
}

export async function fetchJsonUrl(
  url: string,
  opts: {
    signal?: AbortSignal;
    cache?: RequestCache;
  } = {},
): Promise<any> {
  const response = await fetchWithAuth(url, {
    method: "GET",
    signal: opts.signal,
    cache: opts.cache ?? "default",
  });

  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch JSON resource");
  }

  return safeJson<any>(response);
}

export async function fetchBlobObjectUrl(
  url: string,
  opts: {
    signal?: AbortSignal;
    cache?: RequestCache;
  } = {},
): Promise<string> {
  const response = await fetchWithAuth(url, {
    method: "GET",
    signal: opts.signal,
    cache: opts.cache ?? "default",
  });

  if (!response.ok) {
    throw await toApiError(response, "Failed to fetch binary resource");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}