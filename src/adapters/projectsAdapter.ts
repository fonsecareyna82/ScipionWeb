// src/adapters/projectsAdapter.ts
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";
import type { ProjectService, ProjectPayload, Id, VolumeSliceObjectUrl } from "@/services/ProjectService";

const toId = (id: string | number): string => String(id);

const defaultService: ProjectService = {
  fetchList: () => api.fetchProjects(),
  fetchProject: (id) => api.fetchProject(toId(id)),
  fetchProtocolDetails: (projectId, protocolId) => api.fetchProtocolDetails(toId(projectId), toId(protocolId)),
  fetchNewProtocolDetails: (projectId, protocolClass) => api.fetchNewProtocolDetails(toId(projectId), protocolClass),

  createProject: (payload: ProjectPayload) => api.createProject(payload.name, (payload.description ?? "").trim()),
  renameProject: (id, newName, newDescription) => api.renameProject(toId(id), newName, (newDescription ?? "").trim()),
  deleteProject: (id) => api.deleteProject(toId(id)),
  loadProtocols: (projectId) => api.loadProtocols(Number(projectId)),

  executeProtocol: (protocolId, protocolClassName, params) => api.executeProtocol(toId(protocolId), protocolClassName, params),
  saveProtocol: (protocolId, protocolClassName, params) => api.saveProtocol(toId(protocolId), protocolClassName, params),

  renameProtocol: (projectId, protocolId, newName) => api.renameProtocol(toId(projectId), toId(protocolId), newName),
  duplicateProtocol: (projectId, items) => api.duplicateProtocol(toId(projectId), items),
  deleteProtocol: (projectId, ids) => api.deleteProtocol(toId(projectId), ids),
  restartAll: (projectId, protocolId) => api.restartAll(toId(projectId), toId(protocolId)),
  continueAll: (projectId, protocolId) => api.continueAll(toId(projectId), toId(protocolId)),
  resetFrom: (projectId, protocolId) => api.resetFrom(toId(projectId), toId(protocolId)),
  stopProtocol: (projectId, ids) => api.stopProtocol(toId(projectId), ids),

  resolveProtocolStartPath: (projectId, protocolId) => api.resolveProtocolStartPath(toId(projectId), toId(protocolId)),
  listRemoteDirectory: (projectId, protocolId, path) => api.listRemoteDirectory(toId(projectId), toId(protocolId), path),
  previewProtocolText: (projectId, protocolId, path) => api.previewProtocolText(toId(projectId), toId(protocolId), path),
  buildProtocolDownloadUrl: (projectId, protocolId, path, inline) => api.buildProtocolDownloadUrl(toId(projectId), toId(protocolId), path, inline),
  fetchProtocolInlinePreviewBlob: (projectId, protocolId, path) => api.fetchProtocolInlinePreviewBlob(toId(projectId), toId(protocolId), path),
  fetchOutputPreview: (projectId, protocolId, path, opts) => api.fetchOutputPreview(toId(projectId), toId(protocolId), path, opts),

  // ── Analyze Results: Volumes ─────────────────────────────────────────
  listOutputVolumes: (projectId, protocolId, outputName) =>
    api.listOutputVolumes(toId(projectId), toId(protocolId), outputName),

  getVolumeInfo: (projectId, protocolId, outputName, volumeId) =>
    api.getVolumeInfo(toId(projectId), toId(protocolId), outputName, toId(volumeId)),

  buildVolumeSliceUrl: (projectId, protocolId, outputName, volumeId, sliceIndex, opts) =>
    api.buildVolumeSliceUrl(toId(projectId), toId(protocolId), outputName, toId(volumeId), sliceIndex, opts),

  // IMPORTANT: delegate directly to the API helper that already uses ONLY `cmap=`
  fetchVolumeSliceObjectUrl: async (
    projectId: Id, protocolId: Id, outputName: string, volumeId: Id, sliceIndex: number,
    opts?: { axis?: "z" | "y" | "x"; cmap?: string; normalize?: "minmax" | "zscore" | "none"; scale?: number; signal?: AbortSignal }
  ): Promise<VolumeSliceObjectUrl> => {
    const { url, revoke } = await api.fetchVolumeSliceObjectUrl(
      toId(projectId), toId(protocolId), outputName, toId(volumeId), sliceIndex,
      { axis: opts?.axis, cmap: opts?.cmap, normalize: opts?.normalize, scale: opts?.scale, signal: opts?.signal as any }
    );
    return { url, revoke };
  },
};

export default defaultService;
