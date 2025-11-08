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

export async function fetchProtocolInlinePreviewBlob(
  projectId: number | string,
  protocolId: number | string,
  relPath: string,  
): Promise<{ blob: Blob; meta: any }> {
  const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/download?path=${encodeURIComponent(
    relPath
  )}&inline=1`;

  const res = await fetchWithAuth(url, {method: "GET"});

  if (!res.ok) {
    throw new Error(`Preview failed: ${res.status}`);
  }

  // 1) read Blob
  const blob = await res.blob();

  console.log(res)

  // 2) rebuild meta from response headers
  const mime = res.headers.get("X-Preview-Mime") || "";
  const width = res.headers.get("X-Preview-Width");
  const height = res.headers.get("X-Preview-Height");
  const depth = res.headers.get("X-Preview-Depth");
  const sizeBytes = res.headers.get("X-Preview-SizeBytes");
  const voxelHeader = res.headers.get("X-Preview-VoxelSize"); // "vx,vy,vz"
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


export type PreviewResult =
  | { kind: "image"; url: string; meta: any; downloadUrl: string }
  | { kind: "pdf"; url: string; meta: any; downloadUrl: string }
  | { kind: "table"; data: { columns: string[]; rows: any[] }; meta: any; downloadUrl: string }
  | { kind: "sqlite"; data: any; meta: any; downloadUrl: string }   // mode: "tables" | "rows"
  | { kind: "archive"; data: any; meta: any; downloadUrl: string }
  | { kind: "text"; text: string; meta: any; downloadUrl: string }
  | { kind: "binary"; url: string; meta: any; downloadUrl: string };

function parseMeta(h: Headers) {
  const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);
  const parseVoxel = (s: string | null) => (s ? s.split(",").map((x) => Number(x)) : undefined);
  return {
    mime: h.get("X-Preview-Mime") || h.get("Content-Type") || undefined,
    width: num(h.get("X-Preview-Width")),
    height: num(h.get("X-Preview-Height")),
    depth: num(h.get("X-Preview-Depth")),
    sizeBytes: num(h.get("X-Preview-SizeBytes")),
    voxelSize: parseVoxel(h.get("X-Preview-VoxelSize")),
    note: h.get("X-Preview-Note") || undefined,
    type: h.get("X-Preview-Type") || undefined,    // "table" | "sqlite" | "archive" | ...
    mode: h.get("X-Preview-Mode") || undefined,    // sqlite: "tables" | "rows"
    columnsHeader: h.get("X-Preview-Columns") || undefined,
    rowCount: num(h.get("X-Preview-RowCount")),
  };
}

async function buildPreviewResult(res: Response, baseDownloadUrl: string): Promise<PreviewResult> {
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

  // Images
  if (ct.startsWith("image/")) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { kind: "image", url, meta, downloadUrl };
  }

  // PDF
  if (ct.includes("application/pdf")) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { kind: "pdf", url, meta, downloadUrl };
  }

  // JSON payloads (tables/archives/sqlite/other)
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (meta.type === "table") {
      const columns =
        data.columns ||
        (meta.columnsHeader ? meta.columnsHeader.split(",").filter(Boolean) : []);
      return { kind: "table", data: { columns, rows: data.rows || [] }, meta, downloadUrl };
    }
    if (meta.type === "sqlite") {
      return { kind: "sqlite", data, meta, downloadUrl };
    }
    if (meta.type === "archive") {
      return { kind: "archive", data, meta, downloadUrl };
    }
    // Unknown JSON -> show as text
    return { kind: "text", text: JSON.stringify(data, null, 2), meta, downloadUrl };
  }

  // Text
  if (ct.startsWith("text/")) {
    const text = await res.text();
    return { kind: "text", text, meta, downloadUrl };
  }

  // Fallback binary
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { kind: "binary", url, meta, downloadUrl };
}

export async function fetchOutputPreview(
  projectId: Id,
  protocolId: string | number,
  outputName: string,
  opts?: { table?: string }
): Promise<PreviewResult> {
  const enc = encodeURIComponent;

  // Usa inline=true para que el backend haga el modo preview;
  // añade table=<name> para SQLite (cuando aplique)
  const qp: string[] = ["inline=true"];
  if (opts?.table) qp.push(`table=${enc(opts.table)}`);

  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputpreview/${enc(outputName)}`;
  const url = qp.length ? `${base}?${qp.join("&")}` : base;
  const downloadUrl = `${base}?inline=false`;

  const response = await fetchWithAuth(url, { method: "GET" });
  if (!response.ok) throw await toApiError(response, "Failed previewing the output");

  return buildPreviewResult(response, downloadUrl);
}


