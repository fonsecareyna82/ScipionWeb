// src/services/ProjectService.ts

/** Common ID type to accept either string or number seamlessly. */
export type Id = string | number;

/** Payload for creating a project. */
export type ProjectPayload = { name: string; description?: string };

/** Volume list item used by Analyze Results. */
export type VolumeListItem = {
  /** Unique id for the volume (index, db id, or filename). */
  id: string;
  /** Human-friendly label to display in the left panel list. */
  name: string;
};

/** Minimal volume metadata for the slice viewer. */
export type VolumeInfo = {
  /** Total number of slices along the chosen axis (UI uses 1-based index). */
  slices: number;
  /** Optional raw shape [Z, Y, X] or [depth, height, width]. */
  shape?: [number, number, number];
  /** Optional voxel size tuple. Units depend on backend (e.g., Å/px or nm/px). */
  voxelSize?: [number, number, number];
  /** Optional dtype string (e.g., "float32", "uint16"). */
  dtype?: string;
};

/** Extra options when building the slice image URL. */
export type VolumeSliceOptions = {
  axis?: "x" | "y" | "z";
  cmap?: string;
  normalize?: "minmax" | "zscore" | "none";
  scale?: number;
  inline?: boolean;
  signal?: AbortSignal;
  format?: string;
};

export type VolumeSliceObjectUrl = {
  url: string;
  revoke: () => void;
};

/** Histogram data for a volume, already aggregated in bins. */
export type VolumeHistogram = {
  // Normalized fields for the viewer
  bins?: number[];
  counts?: number[];

  // Raw backend variants (keep them optional)
  binEdges?: number[];
  bin_edges?: number[];
  values?: number[];

  range?: [number, number];
  totalVoxels?: number;
};

/** Optional parameters to control histogram generation in the backend. */
export type VolumeHistogramOptions = {
  /** Desired number of bins. Backend may clamp this value. */
  bins?: number;
  /** Optional minimum of the value range. */
  rangeMin?: number;
  /** Optional maximum of the value range. */
  rangeMax?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Metadata table basic types (en paralelo a los de api/projects.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type MetadataRendererType = "int" | "float" | "bool" | "matrix" | "image" | "str";

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

export interface MetadataTableInfo {
  name: string;
  alias: string;
  rowCount: number;
  hasColumnId: boolean;
}

export interface MetadataTableSchema {
  name: string;
  alias: string;
  hasColumnId: boolean;
  columns: MetadataColumn[];
}

export type MetadataCell =
  | number
  | string
  | boolean
  | { kind: "image"; path: string }
  | { kind: "matrix"; value: any };

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

/**
 * Optional generics to let consumers specify concrete return shapes.
 * - TProject: shape of a single project
 * - TProjectList: shape of the projects list (array or paginated object)
 * - TProtocol: shape of a single protocol / protocol details
 */
export interface ProjectService<
  TProject = any,
  TProjectList = any,
  TProtocol = any
> {
  /**
   * List projects. It can return an array or a paginated object.
   * Components should normalize the result.
   */
  fetchList(): Promise<TProjectList>;

  /** Get project by id or name. */
  fetchProject(projectId: Id): Promise<TProject>;

  /** Get protocol details by project/protocol ids. */
  fetchProtocolDetails(projectId: Id, protocolId: Id): Promise<TProtocol>;

  /** Get "new protocol" details by class within a project. */
  fetchNewProtocolDetails(projectId: Id, protocolClass: string): Promise<TProtocol>;

  /** Create a new project. */
  createProject(payload: ProjectPayload): Promise<TProject>;

  /** Rename a project (and optionally update description). */
  renameProject(id: Id, newName: string, newDescription?: string): Promise<TProject>;

  /** Delete a project by id. */
  deleteProject(id: Id): Promise<void | { success: boolean }>;

  /** Load all protocols for a project. */
  loadProtocols(projectId: Id): Promise<TProtocol[] | any>;

  /** Execute a protocol with given params. */
  executeProtocol(
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>
  ): Promise<TProtocol>;

  /** Save protocol parameters without executing. */
  saveProtocol(
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>
  ): Promise<TProtocol>;

  /** Protocol actions */
  renameProtocol(projectId: Id, protocolId: Id, newName: string): Promise<TProtocol>;
  duplicateProtocol(
    projectId: Id,
    items: { id: string; name?: string }[],
  ): Promise<TProtocol>;
  deleteProtocol(projectId: Id, ids: string[]): Promise<TProtocol>;
  restartAll(projectId: Id, protocolId: Id): Promise<TProject>;
  continueAll(projectId: Id, protocolId: Id): Promise<TProject>;
  resetFrom(projectId: Id, protocolId: Id): Promise<TProject>;
  stopProtocol(projectId: Id, ids: string[]): Promise<TProject>;
  resolveProtocolStartPath(projectId: Id, pid: string): Promise<TProject>;
  listRemoteDirectory(projectId: Id, protocolId: Id, path: string): Promise<TProject>;
  previewProtocolText(projectId: Id, id: string, path: string): Promise<TProject>;
  buildProtocolDownloadUrl(
    projectId: string,
    protocolId: string,
    path: string,
    inline: boolean
  ): string;
  fetchProtocolInlinePreviewBlob(
    projectId: string,
    protocolId: string,
    path: string
  ): Promise<{ blob: Blob; meta: any }>;
  fetchOutputPreview(
    projectId: string,
    protocolId: string,
    path: string,
    opts?: { table?: string }
  ): Promise<any>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Analyze Results (Volumes) — used by the "Analyze Results" viewer.
  // ─────────────────────────────────────────────────────────────────────────────

  listOutputVolumes(
    projectId: Id,
    protocolId: Id,
    outputName: string
  ): Promise<VolumeListItem[]>;

  getVolumeInfo(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id
  ): Promise<VolumeInfo>;

 getVolumeHistogram(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    opts?: {
      bins?: number;
      rangeMin?: number;
      rangeMax?: number;
    }
  ): Promise<VolumeHistogram>;

  buildVolumeSliceUrl(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    sliceIndex: number,
    opts?: VolumeSliceOptions
  ): Promise<string>;

  fetchVolumeSliceObjectUrl(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    volumeId: Id,
    sliceIndex: number,
    opts?: VolumeSliceOptions
  ): Promise<VolumeSliceObjectUrl>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Analyze Results (Metadata tables + thumbnails)
  // ─────────────────────────────────────────────────────────────────────────────

  fetchOutputMetadataTables(
    projectId: Id,
    protocolId: Id,
    outputName: string
  ): Promise<MetadataTableInfo[]>;

  fetchMetadataTableSchema(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string
  ): Promise<MetadataTableSchema>;

  fetchMetadataTablePage(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts?: {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      asc?: boolean;
      selectionOnly?: boolean;
    }
  ): Promise<MetadataPage>;

  exportMetadataTable(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts?: {
      format?: "csv" | "xlsx";
      selectionOnly?: boolean;
      ids?: number[];
    }
  ): Promise<Blob>;

  fetchMetadataTableWindow(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    opts?: {
      offset?: number;
      limit?: number;
      selectionOnly?: boolean;
    }
  ): Promise<{
    offset: number;
    limit: number;
    totalRows: number;
    rows: MetadataRow[];
  }>;

  fetchMetadataImageCellObjectUrl(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    rowIndex: number,
    columnName: string,
    opts?: {
      size?: number;
      applyTransform?: boolean;
      inline?: boolean;
      format?: string;
    }
  ): Promise<{ url: string; revoke: () => void }>;

  getMetadataImageCellUrl(
    projectId: Id,
    protocolId: Id,
    outputName: string,
    tableName: string,
    rowIndex: number,
    columnName: string,
    opts?: {
      size?: number;
      applyTransform?: boolean;
      inline?: boolean;
      format?: string;
    }
  ): string;
}
