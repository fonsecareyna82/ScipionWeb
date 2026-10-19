// src/adapters/projectsAdapter.ts
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";
import { BASE_URL } from "@/config";
import type {
  ProjectService,
  ProjectPayload,
  ImportProjectPayload,
  PointerSelectableSetItemsOptions,
  PointerSelectableSetItemsPage,
  Id,
  NextProtocolSuggestion,
  VolumeSliceObjectUrl,
  VolumeSliceBatchOptions,
  VolumeSliceBatchResult,
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
  ProtocolLogWindowResponse,
  ProtocolLogSearchResponse,
  ProtocolLogSearchOptions,
  ProtocolLogWindowOptions,
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
  JobMonitoringOverview,
  NodeCapabilitiesList,
  HostSettings,
  HostSettingsPatch,
  ProjectEffectiveSettings,
  SystemVersionInfo,
  SystemUpdateCheck,
  ProjectServiceCapabilities,
  RunProtocolWizardPayload,
  RunProtocolViewerWizardPayload,
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
  TiltSeriesStack,
  ProjectThumbnailListOptions,
  TiltSeriesStackOptions,
  TiltSeriesBatchPreviewResult,
  IntegratedAnalyzeContext,
  TomogramReview,
  TomogramReviewContext,
  TomogramReviewPatch,
  TomogramReviewSchema,
  TomogramReviewSchemaPut,
  TomogramReviewSubsetRequest,
  TomogramReviewSubsetResult,
  InstanceResources,
  ProjectFetchOptions,
  Coordinates3dGalleryRequest,
  Coordinates3dGalleryResult,
  WorkflowFileInspection,
  WorkflowFileImportResult,
  ProtocolRelationCandidatesPayload,
  ProtocolRelationCandidatesResult,
  ProtocolViewerActionValues,
  PickingSettings,
  BrowseOptions,
} from "@/services/ProjectService";

import * as settingsApi from "@/api/settings";
import { requestProjectRefresh } from "@/utils/project-events";

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

  fetchProjectThumbnails: (projectId: Id, opts?: ProjectThumbnailListOptions) =>
    api.fetchProjectThumbnails(toId(projectId), opts),
  fetchProjectRevision: (projectId: Id) => api.fetchProjectRevision(toId(projectId)),
  fetchProjectOverview: (projectId: Id) => api.fetchProjectOverview(toId(projectId)),
  fetchProtocolLaunches: (projectId: Id, protocolId: Id) => api.fetchProtocolLaunches(toId(projectId), toId(protocolId)),
  fetchProjectDiskUsage: (projectId: Id, opts?: { refresh?: boolean }) => api.fetchProjectDiskUsage(toId(projectId), opts),
  fetchProtocolActivity: (since?: string | null) => api.fetchProtocolActivity(since),

  fetchThumbnailImageObjectUrl: (url: string, opts?: { signal?: AbortSignal }) =>
    api.fetchThumbnailImageObjectUrl(url, opts),

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

  fetchProject: (id: Id, opts?: ProjectFetchOptions) => api.fetchProject(toId(id), opts),

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

  fetchProtocolViewerCandidates: (projectId: Id, protocolId: Id) =>
    api.fetchProtocolViewerCandidates(toId(projectId), toId(protocolId)),

  fetchProtocolViewerRuntimePreview: (
    projectId: Id, protocolId: Id, viewerId: string, opts?: {signal?: AbortSignal},
  ) => api.fetchProtocolViewerRuntimePreview(toId(projectId), toId(protocolId), viewerId, opts),

  runProtocolViewerWizard: (projectId: Id, protocolId: Id, payload: RunProtocolViewerWizardPayload) =>
    api.runProtocolViewerWizard(toId(projectId), toId(protocolId), payload),

  runProtocolViewerAction: (
    projectId: Id, protocolId: Id, viewerId: string, action: string,
    values: ProtocolViewerActionValues, opts?: {signal?: AbortSignal},
  ) => api.runProtocolViewerAction(toId(projectId), toId(protocolId), viewerId, action, values, opts),

  fetchProtocolRuntimeSummaries: (projectId: Id, protocolIds: Id[],) => api.fetchProtocolRuntimeSummaries(toId(projectId), protocolIds,),

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

  getProtocolWorkflowExecutionPreflight: (projectId, protocolId, mode) =>
    api.getProtocolWorkflowExecutionPreflight(toId(projectId), toId(protocolId), mode),

  executeProtocolWorkflow: (projectId, protocolId, protocolClassName, params, mode, scope) =>
    api.executeProtocolWorkflow(toId(projectId), toId(protocolId), protocolClassName, params, mode, scope),

  resetFrom: (projectId: Id, protocolId: Id) =>
    api.resetFrom(toId(projectId), toId(protocolId)),

  stopProtocol: (projectId: Id, ids: string[]) =>
    api.stopProtocol(toId(projectId), ids),

  resolveBrowserPaths: (projectId: Id, protocolId: Id, opts?: BrowseOptions) =>
    api.resolveBrowserPaths(toId(projectId), toId(protocolId), opts),

  listRemoteDirectory: (projectId: Id, protocolId: Id, path: string, opts?: BrowseOptions) =>
    api.listRemoteDirectory(toId(projectId), toId(protocolId), path, opts),

  //previewProtocolText: (projectId: Id, protocolId: Id, path: string) =>
  //  api.previewProtocolText(toId(projectId), toId(protocolId), path),

  buildProtocolDownloadUrl: (
    projectId: Id,
    protocolId: Id,
    path: string,
    inline: boolean,
    opts?: BrowseOptions,
  ) => api.buildProtocolDownloadUrl(toId(projectId), toId(protocolId), path, inline, opts),

  createProtocolDownloadLink: (projectId: Id, protocolId: Id, path: string, opts?: BrowseOptions) =>
    api.createProtocolDownloadLink(toId(projectId), toId(protocolId), path, opts),

  fetchProtocolInlinePreviewBlob: (projectId: Id, protocolId: Id, path: string) =>
    api.fetchProtocolInlinePreviewBlob(toId(projectId), toId(protocolId), path),

  fetchOutputPreview: (
    projectId: Id,
    protocolId: Id,
    path: string,
    opts?: { table?: string; signal?: AbortSignal },
  ) => api.fetchOutputPreview(toId(projectId), toId(protocolId), path, opts),

  previewRemoteEntry: (projectId: Id, protocolId: Id, path: string, opts?: BrowseOptions) =>
    api.previewRemoteEntry(toId(projectId), toId(protocolId), path, opts),

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

  inspectWorkflowFile: (
    path: string,
  ): Promise<WorkflowFileInspection> =>
    api.inspectWorkflowFile(path),

  importWorkflowFile: (
    projectId: Id,
    path: string,
  ): Promise<WorkflowFileImportResult> =>
    api.importWorkflowFile(toId(projectId), path),

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

  fetchTomogramReviewContext: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    opts?: AuthenticatedRequestOptions,
  ): Promise<TomogramReviewContext> =>
    api.fetchTomogramReviewContext(
      toId(projectId),
      toId(protocolId),
      outputName,
      opts,
    ),

  saveTomogramReviewSchema: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    payload: TomogramReviewSchemaPut,
  ): Promise<TomogramReviewSchema> =>
    api.saveTomogramReviewSchema(
      toId(projectId),
      toId(protocolId),
      outputName,
      payload,
    ),

  saveTomogramReview: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    scipionItemId: Id,
    payload: TomogramReviewPatch,
  ): Promise<TomogramReview> =>
    api.saveTomogramReview(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(scipionItemId),
      payload,
    ),

  createTomogramReviewSubset: async (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    payload: TomogramReviewSubsetRequest,
  ): Promise<TomogramReviewSubsetResult> => {
    const result = await api.createTomogramReviewSubset(
      toId(projectId),
      toId(protocolId),
      outputName,
      payload,
    );

    if (result.success) requestProjectRefresh(projectId);
    return result;
  },

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

  listPointerSelectableSetItemsPage: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    options?: PointerSelectableSetItemsOptions,
  ): Promise<PointerSelectableSetItemsPage> =>
    api.listPointerSelectableSetItemsPage(
      toId(projectId),
      toId(protocolId),
      outputName,
      options,
    ),

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

  fetchVolumeSlicesBatch: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    opts: VolumeSliceBatchOptions,
  ): Promise<VolumeSliceBatchResult> =>
    api.fetchVolumeSlicesBatch(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(volumeId),
      opts,
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

  fetchCoords3dTomogramVolume: (
    projectId: Id,
    protocolId: Id,
    coordsOutputName: string,
    tomoId: Id,
    opts?: { maxVoxels?: number; signal?: AbortSignal },
  ) =>
    api.fetchCoords3dTomogramVolume(toId(projectId), toId(protocolId), coordsOutputName, toId(tomoId), opts),

  fetchCoords3dTomogramGallery: (
    projectId: Id,
    protocolId: Id,
    coordsOutputName: string,
    tomoId: Id,
    payload: Coordinates3dGalleryRequest,
    opts?: AuthenticatedRequestOptions,
  ): Promise<Coordinates3dGalleryResult> =>
    api.fetchCoords3dTomogramGallery(
      toId(projectId),
      toId(protocolId),
      coordsOutputName,
      toId(tomoId),
      payload,
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

  // Preserve exact offsets and cancellation through the window endpoint.
  fetchMetadataTableWindow: async (projectId: Id, protocolId: Id, outputName: string, tableName: string, opts = {}) => {
    const offset = Math.max(0, Math.trunc(Number(opts.offset) || 0));
    const limit = Math.max(1, Math.trunc(Number(opts.limit) || 100));
    const data = await api.fetchMetadataTableWindow(toId(projectId), toId(protocolId), outputName, tableName, { ...opts, offset, limit });
    return { offset: data.offset ?? offset, limit: data.limit ?? limit, totalRows: data.totalRows ?? data.rows.length, rows: data.rows };
  },

  fetchMetadataRowPosition: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    rowId: number,
    opts = {},
  ) =>
    api.fetchMetadataRowPosition(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      rowId,
      opts,
    ),

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

  fetchMetadataImageCellsBatch: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts,
  ) =>
    api.fetchMetadataImageCellsBatch(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
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

  runMetadataTableAction: async (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    payload: MetadataTableActionPayload,
  ): Promise<MetadataTableActionResult> => {
    const result = await api.runMetadataTableAction(
      toId(projectId),
      toId(protocolId),
      outputName,
      tableName,
      payload,
    );

    if (result.success) {
      requestProjectRefresh(projectId);
    }

    return result;
  },

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

  fetchTiltSeriesStack: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tiltSeriesId: Id,
    opts?: TiltSeriesStackOptions,
  ): Promise<TiltSeriesStack> =>
    api.fetchTiltSeriesStack(
      toId(projectId),
      toId(protocolId),
      outputName,
      toId(tiltSeriesId),
      opts,
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

  // ──────────────────────────── Analyze Results: CTF ────────────────────────────

  listOutputCTFs: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
  ) =>
    api.listOutputCTFs(
      projectId,
      protocolId,
      outputName,
    ),

  fetchCTFPsdImageObjectUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    ctfId: Id,
    opts?: AuthenticatedRequestOptions & {
      size?: number;
      format?: "png" | "webp" | "jpeg";
      quality?: number;
    },
  ) =>
    api.fetchCTFPsdImageObjectUrl(
      projectId,
      protocolId,
      outputName,
      ctfId,
      opts,
    ),

  fetchCTFMicrographImageObjectUrl: (
    projectId: Id,
    protocolId: Id,
    outputName: string,
    ctfId: Id,
    opts?: AuthenticatedRequestOptions & {
      size?: number;
      format?: "png" | "webp" | "jpeg";
      quality?: number;
    },
  ) =>
    api.fetchCTFMicrographImageObjectUrl(
      projectId,
      protocolId,
      outputName,
      ctfId,
      opts,
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
  fetchInstanceResources: (): Promise<InstanceResources> => settingsApi.fetchInstanceResources(),
  putInstanceSettings: (payload: InstanceSettings) => settingsApi.putInstanceSettings(payload),
  patchInstanceSettings: (patch: InstanceSettingsPatch) => settingsApi.patchInstanceSettings(patch),
  resetEnvironmentVariable: (variableName: string) =>
    settingsApi.resetEnvironmentVariable(variableName),

  fetchJobsOverview: (
    recentLimit: number = 25,
  ): Promise<JobMonitoringOverview> =>
    settingsApi.fetchJobsOverview(recentLimit),

  fetchJobNodeCapabilities: (
    timeoutSeconds: number = 5,
  ): Promise<NodeCapabilitiesList> =>
    settingsApi.fetchJobNodeCapabilities(timeoutSeconds),

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

  fetchProtocolLogSearch: (
    projectId: Id, protocolId: Id, channel: string, query: string,
    opts?: ProtocolLogSearchOptions,
  ): Promise<ProtocolLogSearchResponse> =>
    api.fetchProtocolLogSearch(toId(projectId), toId(protocolId), channel, query, opts),

  fetchProtocolLogRaw: (
    projectId: Id,
    protocolId: Id,
    channel: string,
  ): Promise<Blob> =>
    api.fetchProtocolLogRaw(toId(projectId), toId(protocolId), channel),

  fetchProtocolLogWindow: (
    projectId: Id,
    protocolId: Id,
    channel: string,
    opts?: ProtocolLogWindowOptions,
  ): Promise<ProtocolLogWindowResponse> =>
    api.fetchProtocolLogWindow(toId(projectId), toId(protocolId), channel, opts),

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

  // ──────────────────────────── RelationParam support ────────────────────────────

  resolveProtocolRelationCandidates: (
    projectId: Id,
    payload: ProtocolRelationCandidatesPayload,
  ): Promise<ProtocolRelationCandidatesResult> =>
    api.resolveProtocolRelationCandidates(
      toId(projectId),
      payload,
    ),

  // ──────────────────────────── Wizards support ────────────────────────────

  runProtocolWizard: (projectId: Id, payload: RunProtocolWizardPayload): Promise<unknown> =>
    api.runProtocolWizard(toId(projectId), payload),

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

  fetchPickingSession: (projectId: Id, protocolId: Id) =>
    api.fetchPickingSession(toId(projectId), toId(protocolId)),
  fetchPickingParticles: (projectId: Id, protocolId: Id, micId: Id) =>
    api.fetchPickingParticles(toId(projectId), toId(protocolId), toId(micId)),
  savePickingParticles: (projectId: Id, protocolId: Id, micId: Id,
    coordinates: Array<{ id?: string; x: number; y: number }>, threshold?: number) =>
    api.savePickingParticles(toId(projectId), toId(protocolId), toId(micId), coordinates, threshold),
  savePickingSettings: (projectId: Id, protocolId: Id, settings: number | PickingSettings) =>
    api.savePickingSettings(toId(projectId), toId(protocolId), settings),
  pickPickingParticle: (projectId: Id, protocolId: Id, micId: Id, x: number, y: number, center: boolean) =>
    api.pickPickingParticle(toId(projectId), toId(protocolId), toId(micId), x, y, center),
  pickingParticleMoved: (projectId: Id, protocolId: Id, micId: Id, x: number, y: number) =>
    api.pickingParticleMoved(toId(projectId), toId(protocolId), toId(micId), x, y),
  fetchPickingTemplatesObjectUrl: (projectId: Id, protocolId: Id, opts?: { size?: number; signal?: AbortSignal }) =>
    api.fetchPickingTemplatesObjectUrl(toId(projectId), toId(protocolId), opts),
  fetchPickingMicrographImageObjectUrl: (projectId: Id, protocolId: Id, micId: Id,
    opts?: { size?: number; format?: "png" | "webp" | "jpeg"; signal?: AbortSignal }) =>
    api.fetchPickingMicrographImageObjectUrl(toId(projectId), toId(protocolId), toId(micId), opts),
  createPickingCoordinates: (projectId: Id, protocolId: Id) =>
    api.createPickingCoordinates(toId(projectId), toId(protocolId)),
  fetchOpenPickingSessions: (projectId: Id) => api.fetchOpenPickingSessions(toId(projectId)),
  trainPickingClassifier: (projectId: Id, protocolId: Id, micId: Id) =>
    api.trainPickingClassifier(toId(projectId), toId(protocolId), toId(micId)),
  correctPickingAndAutopickNext: (projectId: Id, protocolId: Id, micId: Id, nextMicId: Id | null) =>
    api.correctPickingAndAutopickNext(toId(projectId), toId(protocolId), toId(micId), nextMicId),
  closePickingSession: (projectId: Id, protocolId: Id) =>
    api.closePickingSession(toId(projectId), toId(protocolId)),

};

export default defaultService;
