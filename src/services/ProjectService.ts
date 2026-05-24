// src/services/ProjectService.ts

import { loadWorkflowPayload } from "@/api/projects";


export type AuthenticatedRequestOptions = {
  signal?: AbortSignal;
  cache?: RequestCache;
};

export type ProjectThumbnailOutputItem = {
  outputName?: string | null;
  outputClassName?: string | null;
  exists?: boolean;
  thumbnailUrl?: string | null;
  thumbnailRebuildUrl?: string | null;
};

export type ProjectThumbnailGroup = {
  protocolId: Id;
  label?: string;
  status?: string;
  outputs: ProjectThumbnailOutputItem[];
};

export type ProjectThumbnailSourceOptions = {
  sourceUrl?: string | null;
};

export type ProjectThumbnailItemsOptions =
  ProjectThumbnailSourceOptions &
  AuthenticatedRequestOptions & {
    size?: number;
    maxProtocols?: number;
    maxOutputsPerProtocol?: number;
  };

export type ProjectThumbnailObjectUrlOptions =
  ProjectThumbnailSourceOptions &
  AuthenticatedRequestOptions & {
    size?: number;
  };

/** Common ID type to accept either string or number seamlessly. */
export type Id = string | number | null | undefined;

/** Payload for creating a project. */
export type ProjectPayload = { name: string; description?: string };

/** Payload for importing a project. */
export type ImportProjectPayload = {
  projectLocation: string;
  projectName?: string;
  copyProject: boolean;
};

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

export type VolumeData3dOptions = {
  /** Maximum size for the longest dimension after downsampling. */
  maxDim?: number; // default backend: 160
  /** Downsampling method. */
  method?: "binning" | "stride" | "none"; // default backend: "binning"
};

export type VolumeSurfaceMethod =
  | "binning"
  | "stride"
  | "linear"
  | "fourier"
  | "none";

export type VolumeSurfaceMeshOptions = {
  level?: number | null;
  maxDim?: number;
  method?: VolumeSurfaceMethod;
  maxTriangles?: number;
  signal?: AbortSignal;
};

export type VolumeSurfaceMesh = {
  kind: "surfaceMesh";
  level: number;
  rangeMin?: number;
  rangeMax?: number;
  dims: [number, number, number];
  sourceDims?: [number, number, number];
  order: "zyx" | "xyz";
  vertexCount: number;
  triangleCount: number;
  vertices: number[];
  normals: number[];
  indices: number[];
  values?: number[];
  center?: number[];
  scale?: number;
  maxDim?: number;
  method?: VolumeSurfaceMethod;
  volumeId?: string;
  outputName?: string;
};

/**
 * Normalized 3D volume payload for Plotly.
 * Backend is expected to return a downsampled cube and metadata.
 * `data` is a flat array; `order` tells how to reshape.
 */
export type VolumeData3d = {
  id: string | number;
  name?: string;

  /** Dimensions in (x, y, z). */
  dims: [number, number, number];

  /** Flattened voxel values. */
  data: number[];

  /** Ordering of the flattened array. */
  order?: "zyx" | "xyz";

  /** Optional voxel size tuple. */
  voxelSize?: [number, number, number];

  /** Optional stats. */
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
};


// ─────────────────────────────────────────────────────────────────────────────
// Coordinates3D + linked tomograms (SetOfCoordinates3D support)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single 3D coordinate in tomogram space.
 * Extra fields (label, score, etc.) can be attached by the backend.
 */
export type Coordinates3dPoint = {
  x: number;
  y: number;
  z: number;
  id?: number | string;
  label?: number | string;
  score?: number;
  [key: string]: unknown;
  matrix?: any | [];
};

/**
 * One tomogram entry associated with a SetOfCoordinates3D.
 * It can optionally reference the tomogram volume output so the UI can
 * jump into a slice/3D viewer for the same volume.
 */
export type Coordinates3dTomogram = {
  /** Tomogram identifier (index, db id, etc.). */
  id: Id;
  /** Human-friendly label for the tomogram. */
  label?: string;

  /** Optional output name where the tomogram volume lives. */
  tomogramOutputName?: string;
  /** Optional volume id within the tomogram output. */
  tomogramVolumeId?: Id;

  /** Optional tomogram dimensions [X, Y, Z]. */
  dims?: [number, number, number];
  /** Optional voxel size [sx, sy, sz]. Units depend on backend. */
  voxelSize?: [number, number, number];

  /** Optional count of coordinates for quick overview. */
  count?: number;
};

/**
 * Coordinates payload for a single tomogram.
 */
export type Coordinates3dTomogramPoints = {
  tomoId: Id;
  /** Optional tomogram dimensions [X, Y, Z]. */
  dims?: [number, number, number];
  /** Optional voxel size [sx, sy, sz]. */
  voxelSize?: [number, number, number];
  /** List of coordinates in tomogram space. */
  coords: Coordinates3dPoint[];
};

/**
 * Payload to create a new SetOfCoordinates3D output from an edited list of points.
 * The backend should interpret `coords` as a full replacement for the selected tomogram.
 */
export type CreateCoords3dOutputFromPointsPayload = {
  /** Name for the newly created output. */
  newOutputName: string;

  /** Tomogram identifier within the source SetOfCoordinates3D. */
  tomoId: Id;

  /**
   * Full coordinates list for this tomogram.
   * Each item is expected to keep x/y/z and may include score/radius/classId/id/tomoId.
   */
  coords: Array<
    Coordinates3dPoint & {
      /** Optional class id used by the UI. */
      classId?: string | number | null;
      /** Optional radius used by the UI. */
      radius?: number;
      /** Optional tomo id per point (kept for round-tripping). */
      tomoId?: Id;
    }
  >;

  /** Optional tomogram dimensions [X, Y, Z] for backend validation. */
  dims?: [number, number, number];

  /** Optional voxel size [sx, sy, sz] for backend bookkeeping. */
  voxelSize?: [number, number, number];
};

export type CreateCoords3dOutputFromPointsResult = {
  success: boolean;
  outputName: string;
  message?: string;
  data?: unknown;
};

export type CreateCoords3dOutputFromPointsOptions = {
  signal?: AbortSignal;
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

export type MetadataTableActionPayload = {
  action: string;
  tableName?: string;
  selectedRowIds?: Array<string | number>;
  params?: Record<string, unknown>;
};

export type MetadataActionResult = {
  success: boolean;
  message?: string;
  [key: string]: unknown;
};

export type MetadataTableRowsResult = {
  rows: Record<string, unknown>[];
  total?: number;
