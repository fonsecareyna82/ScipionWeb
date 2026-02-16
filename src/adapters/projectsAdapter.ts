// src/adapters/projectsAdapter.ts
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";
import { BASE_URL } from "@/config";
import type {
  ProjectService,
  ProjectPayload,
  Id,
  NextProtocolSuggestion,
  VolumeSliceObjectUrl,
  VolumeHistogram,
  VolumeHistogramOptions,
  VolumeData3d,
  VolumeData3dOptions,
  TiltExclusionsPayload,
  CTFTomoExclusionsPayload,
  AnalyzeViewerResolveContext,
  AnalyzeViewerResolveDecision,
  ProtocolLogChannelsResponse,
  ProtocolLogsChunkResponse,
  ProtocolLogOffsets,
  ProtocolTag,
  ProtocolTagCreatePayload,
  ProtocolTagUpdatePayload,
  ProtocolTagIdsResult,
  ContextMenuVisibilityPolicy,
} from "@/services/ProjectService";


import * as settingsApi from "@/api/settings";
import type {
  UserSettings,
  UserSettingsPatch,
  InstanceSettings,
  InstanceSettingsPatch,
} from "@/services/ProjectService";

/** Normalize id */
const toId = (id: string | number | null | undefined): string => String(id);

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

  /**
   * Fetch predefined workflows / pipelines for a given project.
   */
  fetchWorkflows: () => api.fetchWorkflows(),

  loadWorkflow: (projectId, payload) =>
    api.loadWorkflow(projectId, payload),

  // --- Protocol actions ---
  executeProtocol: (
    projectId: Id,
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>,
    mode?: string
  ) => api.executeProtocol(toId(projectId), toId(protocolId), protocolClassName, params, mode),

  saveProtocol: (
    projectId: Id,
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>,
  ) => api.saveProtocol(toId(projectId), toId(protocolId), protocolClassName, params),

  renameProtocol: (projectId: Id, protocolId: Id, newName: string) =>
    api.renameProtocol(toId(projectId), toId(protocolId), newName),

  duplicateProtocol: (projectId: Id, items: { id: string; name?: string }[]) =>
    api.duplicateProtocol(toId(projectId), items),

  deleteProtocol: (projectId: Id, protocolIds: string[]) =>
    api.deleteProtocol(toId(projectId), protocolIds),

  restartAll: (projectId: Id, protocolId: Id) =>
    api.restartAll(toId(projectId), toId(protocolId)),

  continueAll: (projectId: Id, protocolId: Id) =>
    api.continueAll(toId(projectId), toId(protocolId)),

  resetFrom: (projectId: Id, protocolId: Id) =>
    api.resetFrom(toId(projectId), toId(protocolId)),

  stopProtocol: (projectId: Id, ids: string[]) =>
    api.stopProtocol(toId(projectId), ids),

  resolveBrowserPaths: (projectId: Id, protocolId: Id) =>
    api.resolveBrowserPaths(toId(projectId), toId(protocolId)),

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

  previewRemoteEntry: (projectId: Id, protocolId: Id, path: string) =>
  api.previewRemoteEntry(toId(projectId), toId(protocolId), path),


  getNextProtocolSuggestions: (
    projectId: Id,
    protocolId: Id,
  ): Promise<NextProtocolSuggestion[]> => {
    // getNextProtocolSuggestions
    return api.getNextProtocolSuggestions(toId(projectId), toId(protocolId));
  },

  resolveAnalyzeViewer: async (
    ctx: AnalyzeViewerResolveContext
  ): Promise<AnalyzeViewerResolveDecision> => {
    // resolveAnalyzeViewer
    const projectId = toId(ctx.projectId);
    const protocolId = toId(ctx.protocolId);
    const enc = encodeURIComponent;

    const url = `${BASE_URL}/projects/${projectId}/protocols/${protocolId}/viewer/resolve`;

    const payload = {
      protocolLabel: ctx.protocolLabel ?? "",
      pointerClass: ctx.pointerClass ?? "",
      paramClass: ctx.paramClass ?? "",
      value: ctx.value ?? "",
      info: ctx.info ?? "",
      parentId: ctx.parentId ?? null,
    };

    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // treatMissingAsNotHandled
    if (res.status === 404 || res.status === 204) return { handled: false };

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to resolve analyze viewer");
    }

    const raw = await res.json().catch(() => null);
    if (!raw || typeof raw !== "object") return { handled: false };

    const handled = (raw as any).handled === true;
    if (!handled) return { handled: false };

    const decisionUrl = String((raw as any).url ?? "");
    if (!decisionUrl) return { handled: false };

    return {
      handled: true,
      url: decisionUrl,
      target: (raw as any).target,
      kind: (raw as any).kind,
      title: (raw as any).title,
    };
  },


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
    opts: VolumeHistogramOptions = {},
  ): Promise<VolumeHistogram> =>
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
      // API expects colormap-related options; viewer is already sending them.
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

  getVolumeData3d: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    opts: VolumeData3dOptions = {},
  ): Promise<VolumeData3d> =>
    api.getVolumeData3d(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(volumeId),
      opts,
    ),

  // ──────────────────────────── Analyze Results: Coordinates3D ────────────────────────────

  listCoords3dTomograms: (
    projectId: Id,
    protocolId: Id,
    coordsOutputName: string,
  ) =>
    api.listCoords3dTomograms(
      toId(projectId),
      toId(protocolId),
      coordsOutputName,
    ),

  fetchCoords3dForTomogram: (
    projectId,
    protocolId,
    coordsOutputName,
    tomoId,
  ) =>
    api
      .fetchCoords3dForTomogram(
        toId(projectId),
        toId(protocolId),
        coordsOutputName,
        toId(tomoId),
      )
      .then((raw) => ({
        // Normalized shape for the viewer (Coordinates3dTomogramPoints)
        tomoId: raw.tomoId ?? (raw as any).tomogramId ?? (raw as any).id ?? tomoId,
        tomogramLabel:
          raw.tomogramLabel ??
          (raw as any).label ??
          (raw as any).name ??
          String(raw.tomoId ?? (raw as any).tomogramId ?? tomoId),
        n:
          typeof raw.n === "number"
            ? raw.n
            : Array.isArray(raw.coords)
              ? raw.coords.length
              : 0,
        coords: raw.coords ?? [],
      })),

  fetchCoords3dTomogramSliceObjectUrl: (
    projectId: Id,
    protocolId: Id,
    coordsOutputName: string,
    tomoId: Id,
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
  ) =>
    api.fetchCoords3dTomogramSliceObjectUrl(
      toId(projectId),
      toId(protocolId),
      coordsOutputName,
      toId(tomoId),
      sliceIndex,
      opts,
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

  // Window by offset + limit for virtual scroll
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

  // ──────────────────────────── Analyze Results: Tilt series ────────────────────────────

  listOutputTiltSeries: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
  ) =>
    api.listOutputTiltSeries(
      projectId,
      protocolId,
      outputName,
    ),

  fetchTiltSeriesFrames: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tiltSeriesId: Id,
  ) =>
    api.fetchTiltSeriesFrames(
      projectId,
      protocolId,
      outputName,
      tiltSeriesId,
    ),

  fetchTiltSeriesViewImageObjectUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tiltSeriesId: Id,
    viewIndex: number,
    options?: any,
  ) =>
    api.fetchTiltSeriesViewImageObjectUrl(
      projectId,
      protocolId,
      outputName,
      tiltSeriesId,
      viewIndex,
      options,
    ),

  createNewSetOfTiltSeries: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    exclusions: TiltExclusionsPayload,
    restack: boolean,
  ) =>
    api.createNewSetOfTiltSeries(
      projectId,
      protocolId,
      outputName,
      exclusions,
      restack,
    ),

  // ──────────────────────────── Analyze Results: CTF tomography ────────────────────────────

  listOutputCTFTomoSeries: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
  ) =>
    api.listOutputCTFTomoSeries(
      projectId,
      protocolId,
      outputName,
    ),

  fetchCTFTomoSeriesViews: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    ctfSeriesId: Id,
  ) =>
    api.fetchCTFTomoSeriesViews(
      projectId,
      protocolId,
      outputName,
      ctfSeriesId,
    ),

  createNewSetOfCTFTomoSeries: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    exclusions: CTFTomoExclusionsPayload,
  ) =>
    api.createNewSetOfCTFTomoSeries(
      projectId,
      protocolId,
      outputName,
      exclusions,
    ),

  fetchCTFPsdImage: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    psdPath: string,
  ) =>
    api.fetchCTFPsdImage(
      projectId,
      protocolId,
      outputName,
      psdPath,
    ),

  // ──────────────────────────── Project sharing ────────────────────────────

  /**
   * List all users that can be selected for project sharing.
   * We delegate to an API function that you will define in api/projects.ts
   */
  listUsers: () => api.listUsers(),

  /**
   * Share a project with one or more users.
   * userIds must be array of string/number → convert to string.
   */
  shareProject: (projectId: Id, userIds: Id[]) =>
    api.shareProject(toId(projectId), userIds.map(toId)),

  listProjectShares: (projectId: Id,) => api.listProjectShares(projectId),

  revokeProjectShare: (projectId: Id, userId: Id) =>
    api.revokeProjectShare(toId(projectId), userId),


  // ──────────────────────────── Settings (user + instance) ────────────────────────────

  fetchUserSettings: () => settingsApi.fetchUserSettings(),
  putUserSettings: (payload: UserSettings) => settingsApi.putUserSettings(payload),
  patchUserSettings: (patch: UserSettingsPatch) => settingsApi.patchUserSettings(patch),

  fetchInstanceSettings: () => settingsApi.fetchInstanceSettings(),
  putInstanceSettings: (payload: InstanceSettings) => settingsApi.putInstanceSettings(payload),
  patchInstanceSettings: (patch: InstanceSettingsPatch) => settingsApi.patchInstanceSettings(patch),

  // ──────────────────────────── Protocol tags ────────────────────────────

  listProjectTags: (projectId: Id): Promise<ProtocolTag[]> =>
    api.listProjectTags(toId(projectId)),

  createProjectTag: (projectId: Id, payload: ProtocolTagCreatePayload): Promise<ProtocolTag> =>
    api.createProjectTag(toId(projectId), payload),

  updateProjectTag: (
    projectId: Id,
    tagId: string,
    payload: ProtocolTagUpdatePayload,
  ): Promise<ProtocolTag> =>
    api.updateProjectTag(toId(projectId), tagId, payload),

  deleteProjectTag: (projectId: Id, tagId: string): Promise<{ success: boolean }> =>
    api.deleteProjectTag(toId(projectId), tagId),

  listProtocolTagIds: (projectId: Id, protocolId: Id): Promise<string[]> =>
    api.listProtocolTagIds(toId(projectId), toId(protocolId)),

  setProtocolTagIds: (
    projectId: Id,
    protocolId: Id,
    tagIds: string[],
  ): Promise<ProtocolTagIdsResult> =>
    api.setProtocolTagIds(toId(projectId), toId(protocolId), tagIds),


    // ──────────────────────────── Protocol logs (dynamic channels) ────────────────────────────

  fetchProtocolLogChannels: (
    projectId: Id,
    protocolId: Id,
  ): Promise<ProtocolLogChannelsResponse> =>
    api.fetchProtocolLogChannels(toId(projectId), toId(protocolId)),

  fetchProtocolLogsChunk: (
    projectId: Id,
    protocolId: Id,
    offsets: ProtocolLogOffsets,
    opts?: { limit?: number; signal?: AbortSignal },
  ): Promise<ProtocolLogsChunkResponse> =>
    api.fetchProtocolLogsChunk(toId(projectId), toId(protocolId), offsets, opts),

// ──────────────────────────── Context menu visibility policy ────────────────────────────
    getContextMenuVisibilityPolicy: (
    projectId: Id,
  ): Promise<ContextMenuVisibilityPolicy> =>
    api.getContextMenuVisibilityPolicy(toId(projectId)),

};

export default defaultService;
