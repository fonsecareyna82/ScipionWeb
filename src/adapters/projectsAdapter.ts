// src/adapters/projectsAdapter.ts
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";
import { BASE_URL } from "@/config";
import type {
  ProjectService,
  ProjectPayload,
  ImportProjectPayload,
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
  MetadataTableActionPayload,
  MetadataTableActionResult,
  CreateCoords3dOutputFromPointsResult,
  CreateCoords3dOutputFromPointsOptions,
  AuthenticatedRequestOptions,
  ProjectThumbnailItemsOptions,
  ProjectThumbnailObjectUrlOptions,
  UserSettings,
  UserSettingsPatch,
  InstanceSettings,
  InstanceSettingsPatch,
  HostSettings,
  HostSettingsPatch,
  ProjectEffectiveSettings,
  SystemVersionInfo,
  SystemUpdateCheck,
  ProjectServiceCapabilities,
  ExecuteProtocolWizardPayload,
  ExecuteProtocolWizardResult,
  ExportProtocolsRequestPayload,
  ExportProtocolsResult,
  WorkflowExportRequestPayload,
  WorkflowExportResult,
  WorkflowImportRequestPayload,
  WorkflowImportResult,
  WriteRemoteFilePayload,
  WriteRemoteFileResult,
  CreateCoords2dOutputPayload,
  CreateCoords2dOutputResult,
  RenameProtocolPayload,
  ExternalViewerDescriptor,
  ExternalViewerListOptions,
  ExternalViewerLaunchPayload,
  ExternalViewerLaunchResult,
  ProtocolOutputThumbnailsOptions,
  TiltSeriesBatchPreviewOptions,
  TiltSeriesBatchPreviewResult,
  IntegratedAnalyzeContext,

} from "@/services/ProjectService";

import * as settingsApi from "@/api/settings";

/** Normalize id */
const toId = (id: string | number | null | undefined): string => String(id);

const defaultService: ProjectService = {

  // ──────────────────────────── Generic authenticated resources ────────────────────────────

  resolveBackendUrl: (raw?: string | null) =>
    api.resolveBackendUrl(raw),

  fetchJsonUrl: (
    url: string,
    opts?: AuthenticatedRequestOptions,
  ) =>
    api.fetchJsonUrl(url, opts),

  fetchBlobObjectUrl: (
    url: string,
    opts?: AuthenticatedRequestOptions,
  ) =>
    api.fetchBlobObjectUrl(url, opts),


  // ──────────────────────────── System version and updates ────────────────────────────

  fetchSystemVersion: (): Promise<SystemVersionInfo> =>
    api.fetchSystemVersion(),

  fetchSystemUpdateCheck: (): Promise<SystemUpdateCheck> =>
    api.fetchSystemUpdateCheck(),

  // ──────────────────────────── Project thumbnails ────────────────────────────

  fetchProjectThumbnailItems: (
    projectId: Id,
    opts?: ProjectThumbnailItemsOptions,
  ) =>
    api.fetchProjectThumbnailItems(toId(projectId), opts),

  fetchProjectThumbnailObjectUrl: (
    projectId: Id,
    opts?: ProjectThumbnailObjectUrlOptions,
  ) =>
    api.fetchProjectThumbnailObjectUrl(toId(projectId), opts),


  fetchProtocolOutputThumbnails: (
    projectId: Id,
    opts: ProtocolOutputThumbnailsOptions,
  ) =>
    api.fetchProtocolOutputThumbnails(toId(projectId), opts),


  // --- Reads ---
  fetchList: () => api.fetchProjects(),

  fetchProject: (id: Id) => api.fetchProject(toId(id)),

  // ──────────────────────────── Optional runtime capabilities ────────────────────────────

  getCapabilities: (): ProjectServiceCapabilities => ({
    projectEffectiveSettings: true,
  }),

  fetchProjectEffectiveSettings: (
    projectId: Id,
  ): Promise<ProjectEffectiveSettings> =>
    api.fetchProjectEffectiveSettings(toId(projectId)),

  fetchProtocolDetails: (projectId: Id, protocolId: Id) =>
    api.fetchProtocolDetails(toId(projectId), toId(protocolId)),

  fetchNewProtocolDetails: (projectId: Id, protocolClass: string) =>
    api.fetchNewProtocolDetails(toId(projectId), protocolClass),

  // --- Mutations ---
  createProject: (payload: ProjectPayload) =>
    api.createProject(payload.name, (payload.description ?? "").trim()),

  importProject: (payload: ImportProjectPayload) =>
    api.importProject(payload),

  renameProject: (id: Id, newName: string, newDescription?: string) =>
    api.renameProject(toId(id), newName, (newDescription ?? "").trim()),

  deleteProject: (id: Id) => api.deleteProject(toId(id)),

  // --- Protocol lifecycle ---
  loadProtocols: (projectId: Id) => api.loadProtocols(Number(projectId)),

  // ---- Protocol steps
  fetchProtocolSteps: (projectId: Id, protocolId: Id) =>
    api.fetchProtocolSteps(toId(projectId), toId(protocolId)),

  updateProtocolStepStatus: (
    projectId: Id,
    protocolId: Id,
    stepIndex: number,
    status: "new" | "finished",
  ) =>
    api.updateProtocolStepStatus(
      toId(projectId),
      toId(protocolId),
      stepIndex,
      status,
    ),

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

  renameProtocol: (projectId: Id, protocolId: Id, payload: RenameProtocolPayload,) =>
    api.renameProtocol(toId(projectId), toId(protocolId), payload),

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

  //previewProtocolText: (projectId: Id, protocolId: Id, path: string) =>
  //  api.previewProtocolText(toId(projectId), toId(protocolId), path),

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
    opts?: { table?: string; signal?: AbortSignal },
) => api.fetchOutputPreview(toId(projectId), toId(protocolId), path, opts),

  previewRemoteEntry: (projectId: Id, protocolId: Id, path: string) =>
    api.previewRemoteEntry(toId(projectId), toId(protocolId), path),

  exportProtocols: (
    projectId: Id,
    payload: ExportProtocolsRequestPayload,
  ): Promise<ExportProtocolsResult> =>
    api.exportProtocols(toId(projectId), payload),

  writeRemoteFile: (
    projectId: Id,
    protocolId: Id,
    payload: WriteRemoteFilePayload,
  ): Promise<WriteRemoteFileResult> =>
    api.writeRemoteFile(toId(projectId), toId(protocolId), payload),

  exportWorkflowProtocols: (
    projectId: Id,
    payload: WorkflowExportRequestPayload,
  ): Promise<WorkflowExportResult> =>
    api.exportWorkflowProtocols(toId(projectId), payload),

  importWorkflowProtocols: (
    projectId: Id,
    payload: WorkflowImportRequestPayload,
  ): Promise<WorkflowImportResult> =>
    api.importWorkflowProtocols(toId(projectId), payload),

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

  fetchIntegratedAnalyzeContext: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    opts?: AuthenticatedRequestOptions,
  ): Promise<IntegratedAnalyzeContext | null> =>
    api.fetchIntegratedAnalyzeContext(
      toId(projectId),
      toId(protocolId),
      outputName,
      opts,
    ),

  listExternalViewers: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    opts?: ExternalViewerListOptions,
  ): Promise<ExternalViewerDescriptor[]> =>
    api.listExternalViewers(
      toId(projectId),
      toId(protocolId),
      outputName,
      opts,
    ),

  launchExternalViewer: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    viewerId: string,
    payload?: ExternalViewerLaunchPayload,
  ): Promise<ExternalViewerLaunchResult> =>
    api.launchExternalViewer(
      toId(projectId),
      toId(protocolId),
      outputName,
      viewerId,
      payload,
    ),


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

  getVolumeSurfaceMesh(
    projectId,
    protocolId,
    outputName,
    volumeId,
    opts,
  ) {
    return api.getVolumeSurfaceMesh(
      projectId,
      protocolId,
      outputName,
      volumeId,
      opts,
    );
  },

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

  createCoords3dOutputFromPoints: (
    projectId: Id,
    protocolId: Id,
    coordsOutputName: string,
    payload: any,
    opts?: CreateCoords3dOutputFromPointsOptions,
  ): Promise<CreateCoords3dOutputFromPointsResult> =>
    api.createCoords3dOutputFromPoints(
      toId(projectId),
      toId(protocolId),
      coordsOutputName,
      payload,
      opts,
    ),

  // ──────────────────────────── Analyze Results: FSC ────────────────────────────

  fetchFscRows: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
  ) =>
    api.fetchFscRows(
      toId(projectId),
      toId(protocolId),
      outputName,
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
    const {
      offset = 0,
      limit = 100,
      selectionOnly = false,
      sortBy,
      asc,
    } = opts as {
      offset?: number;
      limit?: number;
      selectionOnly?: boolean;
      sortBy?: string;
      asc?: boolean;
    };

    const safeLimit = Math.max(1, Number(limit) || 100);
    const safeOffset = Math.max(0, Number(offset) || 0);
    const page = Math.floor(safeOffset / safeLimit) + 1;

    const pageData = await api.fetchMetadataTablePage(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      {
        page,
        pageSize: safeLimit,
        selectionOnly,
        sortBy,
        asc,
      },
    ) as any;

    const rows = Array.isArray(pageData?.rows) ? pageData.rows : [];

    return {
      offset: safeOffset,
      limit: safeLimit,
      totalRows: Number.isFinite(Number(pageData?.totalRows))
        ? Number(pageData.totalRows)
        : rows.length,
      rows,
    };
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

  runMetadataTableAction: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    payload: MetadataTableActionPayload,
  ): Promise<MetadataTableActionResult> =>
    api.runMetadataTableAction(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      payload,
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

  fetchTiltSeriesViewImagesBatch: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tiltSeriesId: Id,
    opts: TiltSeriesBatchPreviewOptions,
  ): Promise<TiltSeriesBatchPreviewResult> =>
    api.fetchTiltSeriesViewImagesBatch(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(tiltSeriesId),
      opts,
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
    opts?: AuthenticatedRequestOptions,
  ) =>
    api.fetchCTFPsdImage(
      projectId,
      protocolId,
      outputName,
      psdPath,
      opts,
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


  // ──────────────────────────── Settings (user + instance + environment) ────────────────────────────

  fetchUserSettings: () => settingsApi.fetchUserSettings(),
  putUserSettings: (payload: UserSettings) => settingsApi.putUserSettings(payload),
  patchUserSettings: (patch: UserSettingsPatch) => settingsApi.patchUserSettings(patch),

  fetchInstanceSettings: () => settingsApi.fetchInstanceSettings(),
  putInstanceSettings: (payload: InstanceSettings) => settingsApi.putInstanceSettings(payload),
  patchInstanceSettings: (patch: InstanceSettingsPatch) => settingsApi.patchInstanceSettings(patch),

  fetchHostSettings: () => settingsApi.fetchHostSettings(),
  putHostSettings: (payload: HostSettings) => settingsApi.putHostSettings(payload),
  patchHostSettings: (patch: HostSettingsPatch) => settingsApi.patchHostSettings(patch),

  fetchEnvironmentVariables: () => settingsApi.fetchEnvironmentVariables(),
  patchEnvironmentVariables: (patch: Record<string, string>) =>
    settingsApi.patchEnvironmentVariables(patch),

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

  // ──────────────────────────── Wizards support ────────────────────────────

  executeProtocolWizard: (
    projectId: Id,
    payload: ExecuteProtocolWizardPayload,
  ): Promise<ExecuteProtocolWizardResult> =>
    api.executeProtocolWizard(toId(projectId), payload),

  // ──────────────────────────── 2D Coordinates viewer ────────────────────────────
  listCoords2dMicrographs: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
  ) =>
    api.listCoords2dMicrographs(
      toId(projectId),
      toId(protocolId),
      outputName,
    ),

  fetchCoords2dForMicrograph: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    micId: Id,
  ) =>
    api.fetchCoords2dForMicrograph(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(micId),
    ),

  fetchCoords2dMicrographImageObjectUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    micId: Id,
    opts?: { size?: number; format?: "png" | "webp" | "jpeg"; signal?: AbortSignal },
  ) =>
    api.fetchCoords2dMicrographImageObjectUrl(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(micId),
      opts,
    ),

  fetchCoords2dMicrographThumbnailObjectUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    micId: Id,
    opts?: { size?: number; format?: "png" | "webp" | "jpeg"; signal?: AbortSignal },
  ) =>
    api.fetchCoords2dMicrographThumbnailObjectUrl(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(micId),
      opts,
    ),

  createCoords2dOutputFromCurrentCoordinates: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    payload: CreateCoords2dOutputPayload,
  ): Promise<CreateCoords2dOutputResult> =>
    api.createCoords2dOutputFromCurrentCoordinates(
      toId(projectId),
      toId(protocolId),
      outputName,
      payload,
    ),

};

export default defaultService;
