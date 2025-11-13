// src/adapters/projectsAdapter.ts
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";
import type { ProjectService, ProjectPayload, Id, VolumeSliceObjectUrl } from "@/services/ProjectService";

/**
 * Small helper to normalize IDs so callers can pass string or number interchangeably.
 */
const toId = (id: string | number): string => String(id);

/**
 * defaultService: adapts the current API layer (fetchProjects, fetchProject, ...)
 * to the ProjectService interface. If the underlying API changes, update ONLY here.
 */
const defaultService: ProjectService = {
  // --- Reads ---
  fetchList: () => api.fetchProjects(),

  fetchProject: (id: string | number) => api.fetchProject(toId(id)),

  fetchProtocolDetails: (projectId: string | number, protocolId: string | number) =>
    api.fetchProtocolDetails(toId(projectId), toId(protocolId)),

  fetchNewProtocolDetails: (projectId: string | number, protocolClass: string) =>
    api.fetchNewProtocolDetails(toId(projectId), protocolClass),

  // --- Mutations ---
  createProject: (payload: ProjectPayload) =>
    api.createProject(payload.name, (payload.description ?? "").trim()),

  renameProject: (id: string | number, newName: string, newDescription?: string) =>
    api.renameProject(toId(id), newName, (newDescription ?? "").trim()),

  deleteProject: (id: string | number) => api.deleteProject(toId(id)),

  // --- Protocol lifecycle ---
  loadProtocols: (projectId: string | number) =>
    // original signature was (projectId: number); normalize and keep backward-compat
    api.loadProtocols(Number(projectId)),

  // --- Protocol actions ---
  executeProtocol: (
    protocolId: string | number,
    protocolClassName: string,
    params: Record<string, unknown>
  ) => api.executeProtocol(toId(protocolId), protocolClassName, params),

  saveProtocol: (
    protocolId: string | number,
    protocolClassName: string,
    params: Record<string, unknown>
  ) => api.saveProtocol(toId(protocolId), protocolClassName, params),

  renameProtocol: (
    projectId: string | number,
    protocolId: string | number,
    newName: string
  ) => api.renameProtocol(toId(projectId), toId(protocolId), newName),

  duplicateProtocol: (
    projectId: string | number,
    items: { id: string; name?: string }[],
  ) => api.duplicateProtocol(toId(projectId), items),

  deleteProtocol: (
    projectId: string | number,
    ids: string[],
  ) => api.deleteProtocol(toId(projectId), ids),

  restartAll: (
    projectId: string | number,
    protocolId: string | number,
  ) => api.restartAll(toId(projectId), toId(protocolId)),

  continueAll: (
    projectId: string | number,
    protocolId: string | number,
  ) => api.continueAll(toId(projectId), toId(protocolId)),

  resetFrom: (
    projectId: string | number,
    protocolId: string | number,
  ) => api.resetFrom(toId(projectId), toId(protocolId)),

  stopProtocol: (
    projectId: string | number,
    ids: string[],
  ) => api.stopProtocol(toId(projectId), ids),

  resolveProtocolStartPath: (
    projectId: Id,
    protocolId: Id,
  ) => api.resolveProtocolStartPath(toId(projectId), toId(protocolId)),

  listRemoteDirectory: (
    projectId: Id,
    protocolId: Id,
    path: string,
  ) => api.listRemoteDirectory(toId(projectId), toId(protocolId), path),

  previewProtocolText: (
    projectId: Id,
    protocolId: Id,
    path: string
  ) => api.previewProtocolText(toId(projectId), toId(protocolId), path),

  buildProtocolDownloadUrl: (
    projectId: Id,
    protocolId: Id,
    path: string,
    inline: boolean
  ) => api.buildProtocolDownloadUrl(toId(projectId), toId(protocolId), path, inline),

  fetchProtocolInlinePreviewBlob: (
    projectId: Id,
    protocolId: Id,
    path: string,
  ) => api.fetchProtocolInlinePreviewBlob(toId(projectId), toId(protocolId), path),

  fetchOutputPreview: (
    projectId: Id,
    protocolId: Id,
    path: string,
    opts?: { table?: string }
  ) => api.fetchOutputPreview(toId(projectId), toId(protocolId), path, opts),

  // --- Analyze Results: Volumes (Volume / VolumeMask / SetOfVolumes) ---
  listOutputVolumes: (
    projectId: Id,
    protocolId: Id,
    outputName: string
  ) => api.listOutputVolumes(toId(projectId), toId(protocolId), outputName),

  getVolumeInfo: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id
  ) => api.getVolumeInfo(toId(projectId), toId(protocolId), outputName, toId(volumeId)),

  buildVolumeSliceUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    sliceIndex: number,
    opts?: { axis?: "z" | "y" | "x"; colormap?: string; normalize?: "minmax" | "zscore" | "none"; scale?: number }
  ) => api.buildVolumeSliceUrl(
    toId(projectId),
    toId(protocolId),
    outputName,
    toId(volumeId),
    sliceIndex,
    opts
  ),

  fetchVolumeSliceObjectUrl: async (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    sliceIndex: number,
    opts?: { axis?: "z" | "y" | "x"; cmap?: string; normalize?: "minmax" | "zscore" | "none"; scale?: number }
  ): Promise<VolumeSliceObjectUrl> => {
    const params = new URLSearchParams();
    params.set("sliceIndex", String(sliceIndex));
    if (opts?.axis) params.set("axis", opts.axis);
    if (opts?.cmap) params.set("cmap", opts.cmap);           
    if (opts?.normalize) params.set("normalize", opts.normalize);
    if (opts?.scale != null) params.set("scale", String(opts.scale));
    params.set("inline", "true");
    const url = await defaultService.buildVolumeSliceUrl(
      projectId, protocolId, outputName, volumeId, sliceIndex, opts
    );
    const res = await fetchWithAuth(url, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed to fetch volume slice (HTTP ${res.status})`);
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const revoke = () => URL.revokeObjectURL(objectUrl);

    return { url: objectUrl, revoke };
  },


};


export default defaultService;
