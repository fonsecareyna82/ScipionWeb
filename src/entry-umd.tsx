// src/entry-umd.tsx
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// reactQueryV5Provider
import {
  QueryClient as QueryClientV5,
  QueryClientProvider as QueryClientProviderV5,
} from "@tanstack/react-query";

// reactQueryV3Provider
import {
  QueryClient as QueryClientV3,
  QueryClientProvider as QueryClientProviderV3,
} from "react-query";

import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { HelmetProvider } from "react-helmet-async";

import Projects from "./pages/Dashboard/projects/Projects";
import { ProjectServiceProvider } from "./ProjectServiceContext";
import type {
  ProjectService,
  Id,
  ProjectPayload,
  VolumeListItem,
  VolumeInfo,
  VolumeHistogram,
  VolumeHistogramOptions,
  VolumeSliceOptions,
  VolumeSliceObjectUrl,
  VolumeData3d,
  VolumeData3dOptions,
  Coordinates3dTomogram,
  Coordinates3dTomogramPoints,
  MetadataTableInfo,
  MetadataTableSchema,
  MetadataPage,
  MetadataRow,
  ObjectUrlResult,
  TiltExclusionsPayload,
  CTFTomoExclusionsPayload,
  ShareableUser,
  WorkflowDescriptor,
  UserSettings,
  UserSettingsPatch,
  InstanceSettings,
  InstanceSettingsPatch,
  ProtocolLogChannelsResponse,
  ProtocolLogOffsets,
  ProtocolLogsChunkResponse,
  ProtocolLogChunk,
  ProtocolTag,
  ProtocolTagCreatePayload,
  ProtocolTagUpdatePayload,
  ProtocolTagIdsResult,
} from "./services/ProjectService";
import type { WidgetGlobal } from "./types/global-widget";
import type { loadWorkflowPayload } from "@/api/projects";

/** widgetErrorBoundaryReadableErrorsInsideHost */
class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any }
> {
  state = { err: null as any };

  static getDerivedStateFromError(err: any) {
    return { err };
  }

  componentDidCatch(err: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("[ProjectsWidget] error:", err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <pre
        style={{
          color: "#b91c1c",
          background: "#fee2e2",
          padding: 12,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          lineHeight: 1.35,
          fontSize: 13,
        }}
      >
        ProjectsWidget error:
        {"\n"}
        {String(this.state.err?.stack || this.state.err)}
      </pre>
    );
  }
}

/** ensureDomRootsSafetyNetForPortals */
function ensureDomRoots() {
  const ids = ["modal-root", "drawer-root", "toast-root", "portal-root", "app", "root"];
  ids.forEach((id) => {
    if (!document.getElementById(id)) {
      const d = document.createElement("div");
      d.id = id;
      document.body.appendChild(d);
    }
  });
}

/** forceHostContainerFullHeightFlex */
function forceFullHeight(target: HTMLElement) {
  try {
    target.style.display = "flex";
    target.style.flexDirection = "column";
    target.style.height = "100%";
    target.style.minHeight = "0";
  } catch {
    // noOp
  }
}

/** mockSliceDataUrlForAnalyzeResults */
const mockSliceDataUrl = (sliceIndex: number) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="100%" height="100%" fill="#eeeeee"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
          font-size="18" fill="#333333">Slice ${sliceIndex}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const defaultTimeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

let mockUserSettings: UserSettings = {
  theme: "system",
  uiDensity: "comfortable",
  fontScale: 1,
  language: "en",
  timeZone: defaultTimeZone,
  graphMiniMapEnabled: true,
  graphFocusModeEnabled: false,
  workflowsAutoRefreshSec: 10,
};

let mockInstanceSettings: InstanceSettings = {
  enableCelery: true,
  defaultQueueName: "default",
  maxConcurrentRunsPerUser: 1,
  requireConfirmBeforeExecute: true,
  requireConfirmBeforeDelete: true,
};

/** defaultMockServiceImplementsPartialProjectService */
const defaultMockService: Partial<ProjectService> = {
  async fetchList() {
    return [
      {
        id: "demo-1",
        name: "Demo Project 1",
        description: "Example",
        createdAt: new Date().toISOString(),
        status: "idle",
      },
    ] as any;
  },

  async fetchProject(projectId: Id) {
    return {
      id: projectId,
      name: `Demo ${String(projectId)}`,
      description: "",
      createdAt: new Date().toISOString(),
      status: "idle",
      shortName: String(projectId),
      protocols: [],
    } as any;
  },

  async fetchProtocolDetails(_projectId: Id, protocolId: Id) {
    return { id: protocolId, protocolClassName: "DemoProtocol", params: {} } as any;
  },

  async fetchNewProtocolDetails(_projectId: Id, protocolClass: string) {
    return { id: "new", protocolClassName: protocolClass, params: {} } as any;
  },

  async createProject(payload: ProjectPayload) {
    return {
      id: `mock-${Date.now()}`,
      name: payload.name,
      description: payload.description ?? "",
      createdAt: new Date().toISOString(),
      status: "idle",
    } as any;
  },

  async renameProject(id: Id, newName: string, newDescription?: string) {
    return { id, name: newName, description: newDescription ?? "" } as any;
  },

  async deleteProject(_id: Id) {
    return { success: true } as any;
  },

  async importProject(payload: any) {
    return {
      id: `mock-import-${Date.now()}`,
      name: payload?.projectName || "Imported project",
      description: "",
      createdAt: new Date().toISOString(),
      status: "idle",
    } as any;
  },

  async loadProtocols(_projectId: Id) {
    return [] as any;
  },

  async fetchWorkflows() {
    return [] as WorkflowDescriptor[];
  },

  async loadWorkflow(_projectId: string | number, _payload: loadWorkflowPayload) {
    return { success: true } as any;
  },

  async executeProtocol(
    _projectId: Id,
    _protocolId: Id,
    _protocolClassName: string,
    _params: Record<string, unknown>,
    _mode: string
  ) {
    return { success: true } as any;
  },

  async saveProtocol(
    _projectId: Id,
    _protocolId: Id,
    _protocolClassName: string,
    _params: Record<string, unknown>
  ) {
    return { success: true } as any;
  },

  async renameProtocol(_projectId: Id, protocolId: Id, newName: string) {
    return { id: protocolId, name: newName } as any;
  },

  async duplicateProtocol(_projectId: Id, items: { id: string; name?: string }[]) {
    return { duplicated: items.map((i) => ({ ...i, id: `${i.id}-copy` })) } as any;
  },

  async deleteProtocol(_projectId: Id, protocolIds: string[]) {
    return { success: true } as any;
  },

  async restartAll(projectId: Id, protocolId: Id) {
    return { id: projectId, action: "restartAll", from: protocolId } as any;
  },

  async continueAll(projectId: Id, protocolId: Id) {
    return { id: projectId, action: "continueAll", from: protocolId } as any;
  },

  async resetFrom(projectId: Id, protocolId: Id) {
    return { id: projectId, action: "resetFrom", from: protocolId } as any;
  },

  async stopProtocol(projectId: Id, ids: string[]) {
    return { id: projectId, action: "stopProtocol", stopped: ids } as any;
  },

  async resolveBrowserPaths(projectId: Id, pid: string) {
    return { id: projectId, action: "resolveBrowserPaths", browserPid: pid } as any;
  },

  async listRemoteDirectory(projectId: Id, protocolId: Id, path: string) {
    return { id: projectId, protocolId, path, entries: [] } as any;
  },

  async resolveAnalyzeViewer() {
    return { handled: false } as any;
  },

 
  buildProtocolDownloadUrl(projectId: string, protocolId: string, path: string, inline: boolean) {
    return `/download/${encodeURIComponent(String(projectId))}/${encodeURIComponent(
      String(protocolId)
    )}?path=${encodeURIComponent(path)}&inline=${inline ? 1 : 0}`;
  },

  async fetchProtocolInlinePreviewBlob(_projectId: string, _protocolId: string, relPath: string) {
    const blob = new Blob([`Mock inline preview for ${relPath}`], { type: "text/plain" });
    const meta = {
      mime: "text/plain",
      width: undefined,
      height: undefined,
      depth: undefined,
      sizeBytes: blob.size,
      voxelSize: undefined,
      note: "mock",
    };
    return { blob, meta };
  },

  async previewRemoteEntry(projectId: Id, id: string, path: string) {
    return { id: projectId, action: "previewProtocolText", protocolId: id, path, content: "Mock preview..." } as any;
  },

  async fetchOutputPreview(_projectId: Id, _protocolId: Id, outputName: string) {
    return { success: true, outputName } as any;
  },

  async listOutputVolumes(_projectId: Id, _protocolId: Id, _outputName: string): Promise<VolumeListItem[]> {
    return [{ id: "vol-1", name: "Demo volume" }];
  },

  async getVolumeInfo(_projectId: Id, _protocolId: Id, _outputName: string, _volumeId: Id): Promise<VolumeInfo> {
    return { slices: 64, shape: [64, 256, 256], voxelSize: [1, 1, 1], dtype: "float32" };
  },

  async getVolumeHistogram(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _volumeId: Id,
    _opts?: VolumeHistogramOptions
  ): Promise<VolumeHistogram> {
    return { bins: [], counts: [], range: [0, 0], totalVoxels: 0 };
  },

  async buildVolumeSliceUrl(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _volumeId: Id,
    sliceIndex: number,
    _opts?: VolumeSliceOptions
  ) {
    return mockSliceDataUrl(Number(sliceIndex));
  },

  async fetchVolumeSliceObjectUrl(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _volumeId: Id,
    sliceIndex: number,
    _opts?: VolumeSliceOptions
  ): Promise<VolumeSliceObjectUrl> {
    const url = mockSliceDataUrl(Number(sliceIndex));
    return { url, revoke: () => {} };
  },

  async getVolumeData3d(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _volumeId: Id,
    _opts?: VolumeData3dOptions
  ): Promise<VolumeData3d> {
    return { id: String(_volumeId), dims: [1, 1, 1], data: [0], order: "xyz", min: 0, max: 0, mean: 0, std: 0 };
  },

  async listCoords3dTomograms(_projectId: Id, _protocolId: Id, _coordsOutputName: string): Promise<Coordinates3dTomogram[]> {
    return [];
  },

  async fetchCoords3dForTomogram(
    _projectId: Id,
    _protocolId: Id,
    _coordsOutputName: string,
    tomoId: Id
  ): Promise<Coordinates3dTomogramPoints> {
    return { tomoId, coords: [] };
  },

  async fetchCoords3dTomogramSliceObjectUrl(
    _projectId: Id,
    _protocolId: Id,
    _coordsOutputName: string,
    _tomoId: Id,
    sliceIndex: number
  ): Promise<VolumeSliceObjectUrl> {
    const url = mockSliceDataUrl(Number(sliceIndex));
    return { url, revoke: () => {} };
  },

  async createCoords3dOutputFromPoints() {
    return { success: true, outputName: "mock-output" } as any;
  },

  async fetchOutputMetadataTables(_projectId: Id, _protocolId: Id, _outputName: string): Promise<MetadataTableInfo[]> {
    return [];
  },

  async fetchMetadataTableSchema(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    tableName: string
  ): Promise<MetadataTableSchema> {
    return { name: tableName, alias: tableName, hasColumnId: true, columns: [] };
  },

  async fetchMetadataTablePage(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _tableName: string
  ): Promise<MetadataPage> {
    return { pageNumber: 1, pageSize: 50, totalRows: 0, rows: [] };
  },

  async exportMetadataTable(): Promise<Blob> {
    return new Blob([""], { type: "text/csv" });
  },

  async fetchMetadataTableWindow(): Promise<{ offset: number; limit: number; totalRows: number; rows: MetadataRow[] }> {
    return { offset: 0, limit: 0, totalRows: 0, rows: [] };
  },

  async fetchMetadataImageCellObjectUrl(): Promise<{ url: string; revoke: () => void }> {
    return { url: mockSliceDataUrl(0), revoke: () => {} };
  },

  getMetadataImageCellUrl(): string {
    return mockSliceDataUrl(0);
  },

  async runMetadataTableAction() {
    return { success: true } as any;
  },

  async listOutputTiltSeries(): Promise<any[]> {
    return [];
  },

  async fetchTiltSeriesFrames(): Promise<any> {
    return { frames: [] };
  },

  async fetchTiltSeriesViewImageObjectUrl(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _tiltSeriesId: Id
  ): Promise<ObjectUrlResult> {
    return { url: mockSliceDataUrl(0), revoke: () => {} };
  },

  async createNewSetOfTiltSeries(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _exclusions: TiltExclusionsPayload,
    _restack: boolean
  ): Promise<void> {
    return;
  },

  async listOutputCTFTomoSeries(): Promise<any[]> {
    return [];
  },

  async fetchCTFTomoSeriesViews(): Promise<any> {
    return { views: [] };
  },

  async createNewSetOfCTFTomoSeries(
    _projectId: Id,
    _protocolId: Id,
    _outputName: string,
    _exclusions: CTFTomoExclusionsPayload
  ): Promise<void> {
    return;
  },

  async fetchCTFPsdImage(): Promise<any> {
    return { url: mockSliceDataUrl(0) };
  },

  async listUsers(): Promise<ShareableUser[]> {
    return [];
  },

  async shareProject(): Promise<void | { success: boolean }> {
    return { success: true };
  },

  async listProjectShares(): Promise<ShareableUser[]> {
    return [];
  },

  async revokeProjectShare(): Promise<void | { success: boolean }> {
    return { success: true };
  },

  async listProjectTags(_projectId: Id): Promise<ProtocolTag[]> {
    return [];
  },

  async createProjectTag(_projectId: Id, payload: ProtocolTagCreatePayload): Promise<ProtocolTag> {
    return {
      id: `tag-${Date.now()}`,
      title: payload.title,
      description: payload.description,
      color: payload.color ?? "#9ca3af",
    } as any;
  },

  async updateProjectTag(
    _projectId: Id,
    tagId: string,
    payload: ProtocolTagUpdatePayload,
  ): Promise<ProtocolTag> {
    return {
      id: tagId,
      title: payload.title ?? "Updated tag",
      description: payload.description,
      color: payload.color ?? "#9ca3af",
    } as any;
  },

  async deleteProjectTag(_projectId: Id, _tagId: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async listProtocolTagIds(_projectId: Id, _protocolId: Id): Promise<string[]> {
    return [];
  },

  async setProtocolTagIds(
    _projectId: Id,
    _protocolId: Id,
    tagIds: string[],
  ): Promise<ProtocolTagIdsResult> {
    return { tagIds } as any;
  },

  async fetchUserSettings(): Promise<UserSettings> {
    return { ...mockUserSettings };
  },

  async putUserSettings(payload: UserSettings): Promise<UserSettings> {
    mockUserSettings = { ...payload };
    return { ...mockUserSettings };
  },

  async patchUserSettings(patch: UserSettingsPatch): Promise<UserSettings> {
    mockUserSettings = { ...mockUserSettings, ...patch };
    return { ...mockUserSettings };
  },

  async fetchInstanceSettings(): Promise<InstanceSettings> {
    return { ...mockInstanceSettings };
  },

  async putInstanceSettings(payload: InstanceSettings): Promise<InstanceSettings> {
    mockInstanceSettings = { ...payload };
    return { ...mockInstanceSettings };
  },

  async patchInstanceSettings(patch: InstanceSettingsPatch): Promise<InstanceSettings> {
    mockInstanceSettings = { ...mockInstanceSettings, ...patch };
    return { ...mockInstanceSettings };
  },

  async fetchProtocolLogChannels(
    _projectId: Id,
    _protocolId: Id,
  ): Promise<ProtocolLogChannelsResponse> {
    return { channels: [{ id: "default", label: "Default", order: 0 }] };
  },

  async fetchProtocolLogsChunk(
    _projectId: Id,
    _protocolId: Id,
    offsets: ProtocolLogOffsets,
    _opts?: {
      limit?: number;
      signal?: AbortSignal;
    },
  ): Promise<ProtocolLogsChunkResponse> {
    const channelIds = Object.keys(offsets ?? {});
    const safeChannelIds = channelIds.length > 0 ? channelIds : ["default"];

    const chunks: Record<string, ProtocolLogChunk> = {};

    for (const channelId of safeChannelIds) {
      const offset = offsets?.[channelId] != null ? offsets[channelId] : 0;

      chunks[channelId] = {
        text: "",
        offset,
        done: true,
      };
    }

    return { chunks };
  },

  async getNextProtocolSuggestions(_projectId: Id, _protocolId: Id): Promise<any> {
    return [
      {
        protocolName: null,
        protocolClass: "ProtWarpTSTemplateMatch",
        help: null,
        installed: "Missing. Available in None plugin.",
      },
      {
        protocolName: "CryoCARE Prediction",
        protocolClass: "ProtCryoCAREPrediction",
        help: "Generate the final restored tomogram by applying the cryoCARE trained network to bothtomograms followed by per-pixel averaging.",
        installed: "Missing. Available in scipion-em-cryocare plugin.",
      },
      {
        protocolName: "vectorial picking",
        protocolClass: "DynamoBoxing",
        help: "Manual vectorial picker from Dynamo. After choosing the Tomogram to be picked, the tomo slicer from Dynamo will be direclty loaded with all the models previously saved in the disk (if any). This picking will only save the user points defined in a set of models.",
        installed: "Missing. Available in scipion-em-dynamo plugin.",
      },
    ];
  },

  async getContextMenuVisibilityPolicy(_projectId: Id): Promise<any> {
    return {
      open: true,
      browse: true,
      rename: true,
      duplicate: true,
      delete: true,
      restart: true,
      continue: true,
      reset: true,
      stop: true,
      selectFrom: true,
      selectTo: true,
      manageTags: true,
      export: true,
      upload: true,
      nextSteps: true,
    };
  },

  async exportProtocols(_projectId: Id, payload: any) {
    return {
      success: true,
      path: `${payload?.directoryPath || ""}/${payload?.filename || "protocols_export.json"}`,
      filename: payload?.filename || "protocols_export.json",
      size: 0,
      mimeType: "application/json",
      protocolIds: payload?.protocolIds || [],
    } as any;
  },

  async writeRemoteFile(_projectId: Id, _protocolId: Id, payload: any) {
    return {
      success: true,
      path: payload?.path || "",
      size: String(payload?.content || "").length,
      mimeType: payload?.mimeType || "application/json",
    } as any;
  },
};

/** normalizeServiceApiAliasMappingAndSignatureAdapters */
function normalizeServiceAPI(
  srv?: Partial<ProjectService> | any
): ProjectService {
  const source = srv ?? defaultMockService;

  if (!source || typeof source !== "object") {
    throw new Error("ProjectsWidget: invalid service object");
  }

  const normalized: any = { ...source };
  const meta: Record<string, { from: string; len: number }> = {};

  const mapFn = (to: string, ...cands: string[]) => {
    if (typeof normalized[to] === "function") return;

    for (const c of cands) {
      const fn = (source as any)[c] ?? normalized[c];
      if (typeof fn === "function") {
        meta[to] = { from: c, len: fn.length };
        normalized[to] = fn.bind(source);
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log(`normalizeServiceAPI: mapped ${c} -> ${to}`);
        }
        return;
      }
    }
  };

  // generic authenticated helpers
  mapFn("resolveBackendUrl", "resolveBackendUrl");
  mapFn("fetchJsonUrl", "fetchJsonUrl");
  mapFn("fetchBlobObjectUrl", "fetchBlobObjectUrl");

  // projectsApiAliases
  mapFn("fetchList", "listProjects", "list", "fetch");
  mapFn("fetchProject", "getProject", "fetchOne", "get");
  mapFn("createProject", "createProject", "create", "newProject");
  mapFn("importProject", "importProject");
  mapFn("renameProject", "renameProject", "rename", "updateProject");
  mapFn("deleteProject", "deleteProject", "delete", "remove", "removeProject");

  // project thumbnails
  mapFn(
    "fetchProjectThumbnailItems",
    "fetchProjectThumbnailItems",
    "listProjectThumbnailItems",
  );
  mapFn(
    "fetchProjectThumbnailObjectUrl",
    "fetchProjectThumbnailObjectUrl",
    "fetchProjectThumbnail",
    "getProjectThumbnailObjectUrl",
  );

  // workflowsApiAliases
  mapFn("fetchWorkflows", "listProjectWorkflows", "getProjectWorkflows", "workflows");
  mapFn("loadWorkflow", "applyWorkflow", "applyWorkflowTemplate", "applyProjectWorkflow");

  // protocolsApiAliases
  mapFn("fetchProtocolDetails", "getProtocol", "getProtocolDetails");
  mapFn("fetchNewProtocolDetails", "getNewProtocol", "newProtocol");
  mapFn("loadProtocols", "listProtocols", "fetchProtocols", "getProtocols");

  mapFn("executeProtocol", "runProtocol", "launchProtocol", "execute");
  mapFn("saveProtocol", "persistProtocol", "storeProtocol", "save");

  mapFn("renameProtocol", "renameProtocol");
  mapFn("duplicateProtocol", "duplicateProtocol");
  mapFn("deleteProtocol", "deleteProtocol");
  mapFn("restartAll", "restartAll");
  mapFn("continueAll", "continueAll");
  mapFn("resetFrom", "resetFrom");
  mapFn("stopProtocol", "stopProtocol");

  mapFn(
    "resolveAnalyzeViewer",
    "resolveAnalyzeViewer",
    "resolveAnalyzeOutputViewer",
    "resolveAnalyzeViewerDecision",
    "analyzeViewerResolve",
  );

  // fileAndPreviewApiAliases
  mapFn("resolveBrowserPaths", "resolveBrowserPaths", "resolveProtocolStartPath");
  mapFn("listRemoteDirectory", "listRemoteDirectory");
  mapFn("previewProtocolText", "previewProtocolText");
  mapFn("previewRemoteEntry", "previewRemoteEntry");
  mapFn("buildProtocolDownloadUrl", "buildProtocolDownloadUrl");
  mapFn("fetchProtocolInlinePreviewBlob", "previewInlineBlob", "getInlinePreviewBlob", "downloadInlinePreviewBlob");
  mapFn("fetchOutputPreview", "previewOutput", "getOutputPreview", "requestOutputPreview");

  // analyzeVolumesApiAliases
  mapFn("listOutputVolumes", "listOutputVolumes");
  mapFn("getVolumeInfo", "getVolumeInfo");
  mapFn("getVolumeHistogram", "getVolumeHistogram");
  mapFn("buildVolumeSliceUrl", "buildVolumeSliceUrl");
  mapFn("fetchVolumeSliceObjectUrl", "fetchVolumeSliceObjectUrl");
  mapFn("getVolumeData3d", "getVolumeData3d");

  // analyzeCoords3dApiAliases
  mapFn("listCoords3dTomograms", "listCoords3dTomograms");
  mapFn("fetchCoords3dForTomogram", "fetchCoords3dForTomogram");
  mapFn("fetchCoords3dTomogramSliceObjectUrl", "fetchCoords3dTomogramSliceObjectUrl");
  mapFn("createCoords3dOutputFromPoints", "createCoords3dOutputFromPoints");

  // analyzeMetadataApiAliases
  mapFn("fetchOutputMetadataTables", "fetchOutputMetadataTables");
  mapFn("fetchMetadataTableSchema", "fetchMetadataTableSchema");
  mapFn("fetchMetadataTablePage", "fetchMetadataTablePage");
  mapFn("exportMetadataTable", "exportMetadataTable");
  mapFn("fetchMetadataTableWindow", "fetchMetadataTableWindow");
  mapFn("fetchMetadataImageCellObjectUrl", "fetchMetadataImageCellObjectUrl");
  mapFn("getMetadataImageCellUrl", "getMetadataImageCellUrl");
  mapFn("runMetadataTableAction", "runMetadataTableAction");

  // analyzeTiltSeriesApiAliases
  mapFn("listOutputTiltSeries", "listOutputTiltSeries");
  mapFn("fetchTiltSeriesFrames", "fetchTiltSeriesFrames");
  mapFn("fetchTiltSeriesViewImageObjectUrl", "fetchTiltSeriesViewImageObjectUrl");
  mapFn("createNewSetOfTiltSeries", "createNewSetOfTiltSeries");

  // analyzeCtfTomoApiAliases
  mapFn("listOutputCTFTomoSeries", "listOutputCTFTomoSeries");
  mapFn("fetchCTFTomoSeriesViews", "fetchCTFTomoSeriesViews");
  mapFn("createNewSetOfCTFTomoSeries", "createNewSetOfCTFTomoSeries");
  mapFn("fetchCTFPsdImage", "fetchCTFPsdImage");

  // sharingApiAliases
  mapFn("listUsers", "listUsers");
  mapFn("shareProject", "shareProject");
  mapFn("listProjectShares", "listProjectShares");
  mapFn("revokeProjectShare", "revokeProjectShare");

  // tagsApiAliases
  mapFn(
    "listProjectTags",
    "listProjectTags",
    "getProjectTags",
    "fetchProjectTags",
    "listTags",
    "getTags",
  );
  mapFn(
    "createProjectTag",
    "createProjectTag",
    "addProjectTag",
    "createTag",
    "postProjectTag",
  );
  mapFn(
    "updateProjectTag",
    "updateProjectTag",
    "editProjectTag",
    "patchProjectTag",
    "updateTag",
  );
  mapFn(
    "deleteProjectTag",
    "deleteProjectTag",
    "removeProjectTag",
    "deleteTag",
    "removeTag",
  );

  mapFn(
    "listProtocolTagIds",
    "listProtocolTagIds",
    "getProtocolTagIds",
    "fetchProtocolTagIds",
  );
  mapFn(
    "setProtocolTagIds",
    "setProtocolTagIds",
    "setProtocolTags",
    "updateProtocolTagIds",
    "saveProtocolTagIds",
  );

  mapFn("getNextProtocolSuggestions", "nextProtocolSuggestions");
  mapFn("getContextMenuVisibilityPolicy", "contextMenuVisibilityPolicy");

  // protocol logs
  mapFn(
    "fetchProtocolLogChannels",
    "fetchProtocolLogChannels",
    "getProtocolLogChannels",
  );
  mapFn(
    "fetchProtocolLogsChunk",
    "fetchProtocolLogsChunk",
    "getProtocolLogsChunk",
  );

  // analyze: FSC
  mapFn("fetchFscRows", "fetchFscRows", "getFscRows");

  // settings: user
  mapFn("fetchUserSettings", "fetchUserSettings", "getUserSettings");
  mapFn("putUserSettings", "putUserSettings", "updateUserSettings");
  mapFn("patchUserSettings", "patchUserSettings");

  // settings: instance
  mapFn("fetchInstanceSettings", "fetchInstanceSettings", "getInstanceSettings");
  mapFn("putInstanceSettings", "putInstanceSettings", "updateInstanceSettings");
  mapFn("patchInstanceSettings", "patchInstanceSettings");

  // settings: environment
  mapFn(
    "fetchEnvironmentVariables",
    "fetchEnvironmentVariables",
    "getEnvironmentVariables",
  );
  mapFn(
    "patchEnvironmentVariables",
    "patchEnvironmentVariables",
    "updateEnvironmentVariables",
  );

  // settings: host
  mapFn("fetchHostSettings", "fetchHostSettings", "getHostSettings");
  mapFn("putHostSettings", "putHostSettings", "updateHostSettings");
  mapFn("patchHostSettings", "patchHostSettings");

  // project effective settings
  mapFn(
    "fetchProjectEffectiveSettings",
    "fetchProjectEffectiveSettings",
    "getProjectEffectiveSettings",
  );

  // wizards
  mapFn("executeProtocolWizard", "executeProtocolWizard");

  // protocol export
  mapFn("exportProtocols", "exportProtocols");
  mapFn("writeRemoteFile", "writeRemoteFile");

  const ensureFn = (name: string, impl: (...args: any[]) => any) => {
    if (typeof normalized[name] !== "function") {
      normalized[name] = impl;
    }
  };

  const createMissingServiceMethodError = (methodName: string) => {
    return new Error(`ProjectsWidget: service is missing required method '${methodName}'`);
  };

  if (typeof normalized.executeProtocol === "function") {
    const baseExec = normalized.executeProtocol;
    const execLen = meta.executeProtocol?.len ?? 4;

    normalized.executeProtocol = async (
      projectId: Id,
      protocolId: Id,
      protocolClassName: string,
      params: Record<string, unknown>,
      mode: string
    ) => {
      if (execLen >= 4) return baseExec(projectId, protocolId, protocolClassName, params, mode);
      return baseExec(protocolId, protocolClassName, params, mode);
    };
  }

  if (typeof normalized.saveProtocol === "function") {
    const baseSave = normalized.saveProtocol;
    const saveLen = meta.saveProtocol?.len ?? 4;

    normalized.saveProtocol = async (
      projectId: Id,
      protocolId: Id,
      protocolClassName: string,
      params: Record<string, unknown>
    ) => {
      if (saveLen >= 4) return baseSave(projectId, protocolId, protocolClassName, params);
      return baseSave(protocolId, protocolClassName, params);
    };
  }

  ensureFn("listProjectTags", async () => []);
  ensureFn("listProtocolTagIds", async () => []);

  ensureFn("createProjectTag", async () => {
    throw createMissingServiceMethodError("createProjectTag");
  });
  ensureFn("updateProjectTag", async () => {
    throw createMissingServiceMethodError("updateProjectTag");
  });
  ensureFn("deleteProjectTag", async () => {
    throw createMissingServiceMethodError("deleteProjectTag");
  });
  ensureFn("setProtocolTagIds", async () => {
    throw createMissingServiceMethodError("setProtocolTagIds");
  });

  if (typeof normalized.listProjectTags === "function") {
    const base = normalized.listProjectTags;
    const len = meta.listProjectTags?.len ?? base.length;

    normalized.listProjectTags = async (projectId: Id) => {
      if (len >= 1) return base(projectId);
      return base();
    };
  }

  if (typeof normalized.createProjectTag === "function") {
    const base = normalized.createProjectTag;
    const len = meta.createProjectTag?.len ?? base.length;

    normalized.createProjectTag = async (projectId: Id, payload: ProtocolTagCreatePayload) => {
      if (len >= 2) return base(projectId, payload);
      return base(payload);
    };
  }

  if (typeof normalized.updateProjectTag === "function") {
    const base = normalized.updateProjectTag;
    const len = meta.updateProjectTag?.len ?? base.length;

    normalized.updateProjectTag = async (
      projectId: Id,
      tagId: string,
      payload: ProtocolTagUpdatePayload,
    ) => {
      if (len >= 3) return base(projectId, tagId, payload);
      return base(tagId, payload);
    };
  }

  if (typeof normalized.deleteProjectTag === "function") {
    const base = normalized.deleteProjectTag;
    const len = meta.deleteProjectTag?.len ?? base.length;

    normalized.deleteProjectTag = async (projectId: Id, tagId: string) => {
      if (len >= 2) return base(projectId, tagId);
      return base(tagId);
    };
  }

  if (typeof normalized.listProtocolTagIds === "function") {
    const base = normalized.listProtocolTagIds;
    const len = meta.listProtocolTagIds?.len ?? base.length;

    normalized.listProtocolTagIds = async (projectId: Id, protocolId: Id) => {
      if (len >= 2) return base(projectId, protocolId);
      return base(protocolId);
    };
  }

  if (typeof normalized.setProtocolTagIds === "function") {
    const base = normalized.setProtocolTagIds;
    const len = meta.setProtocolTagIds?.len ?? base.length;

    normalized.setProtocolTagIds = async (
      projectId: Id,
      protocolId: Id,
      tagIds: string[],
    ) => {
      if (len >= 3) return base(projectId, protocolId, tagIds);
      return base(protocolId, tagIds);
    };
  }

  return normalized as ProjectService;
}

/** publicMountOptionsForProjectsListWidget */
export type MountOptions = {
  container: string | HTMLElement;
  service?: Partial<ProjectService>;
  props?: Record<string, any>;
};

/** mountProjectsWidget */
export function mount({ container, service, props }: MountOptions) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error(`ProjectsWidget: container '${container}' not found`);

  ensureDomRoots();
  forceFullHeight(target as HTMLElement);

  const resolvedService = normalizeServiceAPI(service);

  const queryClientV5 = new QueryClientV5({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const queryClientV3 = new QueryClientV3();

  const emotionCache = createCache({ key: "mpw", container: document.head, prepend: false });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[ProjectsWidget] mount props:", props);
  }

  const root = ReactDOM.createRoot(target as HTMLElement);
  root.render(
    <ProjectServiceProvider service={resolvedService}>
      <QueryClientProviderV3 client={queryClientV3}>
        <QueryClientProviderV5 client={queryClientV5}>
          <CacheProvider value={emotionCache}>
            <BrowserRouter>
              <HelmetProvider>
                <WidgetErrorBoundary>
                  <Projects />
                </WidgetErrorBoundary>
              </HelmetProvider>
            </BrowserRouter>
          </CacheProvider>
        </QueryClientProviderV5>
      </QueryClientProviderV3>
    </ProjectServiceProvider>
  );

  return {
    unmount() {
      root.unmount();
    },
  };
}

/** attachToWindowMyProjectsWidgetGlobal */
declare global {
  interface Window {
    MyProjectsWidget?: WidgetGlobal;
  }
}

if (typeof window !== "undefined") {
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;
  const next: WidgetGlobal = {
    ...(prev || {}),
    mount,
    mountProjectsWidget: mount,
  };
  (window as any).MyProjectsWidget = next;
  // eslint-disable-next-line no-console
  console.log("ProjectsWidget: entry-umd ready — window.MyProjectsWidget");
}