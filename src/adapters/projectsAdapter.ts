// src/adapters/projectsAdapter.ts
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";
import { BASE_URL } from "@/config";
import type {
  ProjectService,
  ProjectPayload,
  Id,
  VolumeSliceObjectUrl,
  VolumeHistogram,
  VolumeHistogramOptions,
} from "@/services/ProjectService";

/** Normalize id */
const toId = (id: string | number): string => String(id);

const defaultService: ProjectService = {
  // --- Reads ---
  fetchList: () => api.fetchProjects(),

  fetchProject: (id: Id) => api.fetchProject(toId(id)),

  fetchProtocolDetails: (projectId: Id, protocolId: Id) =>
    api.fetchProtocolDetails(toId(projectId), toId(protocolId)),

  fetchNewProtocolDetails: (projectId: Id, protocolClass: string) =>
    api.fetchNewProtocolDetails(toId(projectId), protocolClass),

  // --- Mutations ---
  createProject: (payload: ProjectPayload) =>
    api.createProject(payload.name, (payload.description ?? "").trim()),

  renameProject: (id: Id, newName: string, newDescription?: string) =>
    api.renameProject(toId(id), newName, (newDescription ?? "").trim()),

  deleteProject: (id: Id) => api.deleteProject(toId(id)),

  // --- Protocol lifecycle ---
  loadProtocols: (projectId: Id) => api.loadProtocols(Number(projectId)),

  // --- Protocol actions ---
  executeProtocol: (
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>,
  ) => api.executeProtocol(toId(protocolId), protocolClassName, params),

  saveProtocol: (
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>,
  ) => api.saveProtocol(toId(protocolId), protocolClassName, params),

  renameProtocol: (projectId: Id, protocolId: Id, newName: string) =>
    api.renameProtocol(toId(projectId), toId(protocolId), newName),

  duplicateProtocol: (projectId: Id, items: { id: string; name?: string }[]) =>
    api.duplicateProtocol(toId(projectId), items),

  deleteProtocol: (projectId: Id, ids: string[]) =>
    api.deleteProtocol(toId(projectId), ids),

  restartAll: (projectId: Id, protocolId: Id) =>
    api.restartAll(toId(projectId), toId(protocolId)),

  continueAll: (projectId: Id, protocolId: Id) =>
    api.continueAll(toId(projectId), toId(protocolId)),

  resetFrom: (projectId: Id, protocolId: Id) =>
    api.resetFrom(toId(projectId), toId(protocolId)),

  stopProtocol: (projectId: Id, ids: string[]) =>
    api.stopProtocol(toId(projectId), ids),

  resolveProtocolStartPath: (projectId: Id, protocolId: Id) =>
    api.resolveProtocolStartPath(toId(projectId), toId(protocolId)),

  listRemoteDirectory: (projectId: Id, protocolId: Id, path: string) =>
    api.listRemoteDirectory(toId(projectId), toId(protocolId), path),

  previewProtocolText: (projectId: Id, protocolId: Id, path: string) =>
    api.previewProtocolText(toId(projectId), toId(protocolId), path),

  buildProtocolDownloadUrl: (
    projectId: Id,
    protocolId: Id,
    path: string,
    inline: boolean,
  ) => api.buildProtocolDownloadUrl(toId(projectId), toId(protocolId), path, inline),

  fetchProtocolInlinePreviewBlob: (projectId: Id, protocolId: Id, path: string) =>
    api.fetchProtocolInlinePreviewBlob(toId(projectId), toId(protocolId), path),

  fetchOutputPreview: (
    projectId: Id,
    protocolId: Id,
    path: string,
    opts?: { table?: string },
  ) => api.fetchOutputPreview(toId(projectId), toId(protocolId), path, opts),

  // ──────────────────────────── Analyze Results: Volumes ────────────────────────────
  listOutputVolumes: (projectId: Id, protocolId: Id, outputName: string) =>
    api.listOutputVolumes(toId(projectId), toId(protocolId), outputName),

  getVolumeInfo: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
  ) =>
    api.getVolumeInfo(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(volumeId),
    ),

  getVolumeHistogram: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    opts = {},
  ) =>
    api.getVolumeHistogram(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(volumeId),
      opts,
    ),

  buildVolumeSliceUrl: (
    projectId,
    protocolId,
    outputName,
    volumeId,
    sliceIndex,
    opts,
  ) =>
    api.buildVolumeSliceUrl(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(volumeId),
      sliceIndex,
      // API expects "cmap"; viewer is already sending the right option.
      opts as any,
    ),

  // Delegate to the API function that already adds `cmap` and supports AbortSignal.
  fetchVolumeSliceObjectUrl: (
    projectId,
    protocolId,
    outputName,
    volumeId,
    sliceIndex,
    opts,
  ): Promise<VolumeSliceObjectUrl> =>
    api.fetchVolumeSliceObjectUrl(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(volumeId),
      sliceIndex,
      // API uses { axis?, cmap?, normalize?, scale?, format?, thumb?, fast?, quality?, signal? }
      opts as any,
    ),

  // ──────────────────────────── Analyze Results: Metadata tables ────────────────────────────
  fetchOutputMetadataTables: (projectId: Id, protocolId: Id, outputName: string) =>
    api.fetchOutputMetadataTables(toId(projectId), toId(protocolId), outputName),

  fetchMetadataTableSchema: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
  ) =>
    api.fetchMetadataTableSchema(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
    ),

  fetchMetadataTablePage: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts,
  ) =>
    api.fetchMetadataTablePage(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      opts,
    ),

  exportMetadataTable: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts,
  ) =>
    api.exportMetadataTable(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      opts,
    ),

  // Ventana por offset + limit para scroll virtual
  fetchMetadataTableWindow: async (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts = {},
  ) => {
    const { offset = 0, limit = 100, selectionOnly = false } = opts as {
      offset?: number;
      limit?: number;
      selectionOnly?: boolean;
    };

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    params.set("limit", String(limit));
    params.set("selectionOnly", String(selectionOnly));

    const enc = encodeURIComponent;
    const base = `${BASE_URL}/projects/${toId(projectId)}/protocols/${toId(
      protocolId,
    )}/outputs/${enc(outputName)}/metadata/tables/${enc(tableName)}/rows`;
    const url = `${base}?${params.toString()}`;

    const res = await fetchWithAuth(url, { method: "GET" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to fetch metadata window");
    }
    return res.json();
  },

  fetchMetadataImageCellObjectUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    rowId: number | string,
    columnName: string,
    opts,
  ) =>
    api.fetchMetadataImageCellObjectUrl(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      rowId,
      columnName,
      opts,
    ),

  getMetadataImageCellUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    rowId: number | string,
    columnName: string,
    opts,
  ) =>
    api.getMetadataImageCellUrl(
      Number(projectId),
      Number(protocolId),
      outputName,
      tableName,
      rowId,
      columnName,
      opts ?? {},
    ),
};

export default defaultService;
