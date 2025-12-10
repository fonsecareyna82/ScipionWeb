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
  VolumeData3d,
  VolumeData3dOptions,
  TiltExclusionsPayload,
  CTFTomoExclusionsPayload,
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
    projectId: Id,
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>,
  ) => api.executeProtocol(toId(projectId), toId(protocolId), protocolClassName, params),

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
};

export default defaultService;
