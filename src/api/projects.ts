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

type ApiErrorShape = { message?: string; detail?: unknown; [k: string]: unknown };

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
export async function createProject(
  name: string,
  description: string,
): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to create project");
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
  protocolId: Id,
  protocolClassName: string,
  params: Record<string, any>,
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${ACTION_LAUNCH}`, {
    method: "POST",
    body: JSON.stringify({ protocolId, protocolClassName, params }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to execute protocol");
  return safeJson<any>(response);
}
export async function saveProtocol(
  protocolId: Id,
  protocolClassName: string,
  params: Record<string, any>,
): Promise<any> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${ACTION_SAVE}`, {
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
): Promise<Project> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName, description: newDescription }),
  });
  if (!response.ok) throw await toApiError(response, "Failed to rename project");
  return safeJson<Project>(response);
}
export async function deleteProject(id: Id): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/projects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await toApiError(response, "Failed to delete project");
}

/* ======================= LOAD PROTOCOLS ======================= */
export async function loadProtocols(projectId: number): Promise<any> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols`,
  );
  if (!response.ok) throw await toApiError(response, "Failed to fetch protocols");
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
export async function deleteProtocol(projectId: Id, ids: Id[]): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to delete protocol(s)");
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
export async function stopProtocol(projectId: Id, ids: Id[]): Promise<void> {
  const response = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/stop`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    },
  );
  if (!response.ok)
    throw await toApiError(response, "Failed to stop protocol(s)");
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
  cwd: string;
  items: RemoteEntry[];
}

export async function resolveProtocolStartPath(
  projectId: Id,
  protocolId: Id,
): Promise<string> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/start-path`,
  );
  if (!res.ok) throw await toApiError(res, "Failed to resolve start path");
  const j = await safeJson<{ path?: string }>(res);
  return j?.path || "/";
}
export async function listProtocolDir(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<RemoteListing> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/list?path=${encodeURIComponent(
      path,
    )}`,
  );
  if (!res.ok) throw await toApiError(res, "Failed to list directory");
  return await safeJson<RemoteListing>(res);
}
export async function listRemoteDirectory(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<RemoteEntry[]> {
  const { items } = await listProtocolDir(projectId, protocolId, path);
  return items;
}
export async function previewProtocolText(
  projectId: Id,
  protocolId: Id,
  path: string,
): Promise<string> {
  const res = await fetchWithAuth(
    `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/fs/preview?path=${encodeURIComponent(
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
  const parseVoxel = (s: string | null) =>
    s ? s.split(",").map((x) => Number(x)) : undefined;
  return {
    mime: h.get("X-Preview-Mime") || h.get("Content-Type") || undefined,
    width: num(h.get("X-Preview-Width")),
    height: num(h.get("X-Preview-Height")),
    depth: num(h.get("X-Preview-Depth")),
    sizeBytes: num(h.get("X-Preview-SizeBytes")),
    voxelSize: parseVoxel(h.get("X-Preview-VoxelSize")),
    note: h.get("X-Preview-Note") || undefined,
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
    classId: p.classId ?? p.class ?? p.class_id,
    score:
      typeof p.score === "number" && Number.isFinite(p.score)
        ? p.score
        : typeof p.weight === "number" && Number.isFinite(p.weight)
        ? p.weight
        : typeof p.prob === "number" && Number.isFinite(p.prob)
        ? p.prob
        : undefined,
    ...p, // conservamos radius, tomoId, etc. por si quieres usarlos luego
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
  } = {},
): Promise<MetadataWindow> {
  const { offset = 0, limit = 100, selectionOnly = false } = opts;

  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  params.set("selectionOnly", String(selectionOnly));

  const enc = encodeURIComponent;
  const base = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/outputs/${enc(
    outputName,
  )}/metadata/tables/${enc(tableName)}/rows`;
  const url = `${base}?${params.toString()}`;

  const res = await fetchWithAuth(url, { method: "GET" });
  if (!res.ok)
    throw await toApiError(res, "Failed to fetch metadata rows window");

  const data = await safeJson<any>(res);

  // Backend puede devolver directamente el array de rows
  if (Array.isArray(data)) {
    return { rows: data as MetadataRow[] };
  }
  // O un objeto { offset, limit, rows }
  if (data && Array.isArray(data.rows)) {
    return {
      offset: typeof data.offset === "number" ? data.offset : offset,
      limit: typeof data.limit === "number" ? data.limit : limit,
      rows: data.rows as MetadataRow[],
    };
  }

  throw new Error("Unexpected response format for metadata rows window");
}
