import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// Whether this installation runs a facility, and the facility permissions of the signed-in user
export type FacilityStatus = { enabled: boolean; permissions: string[] };

export type MicroscopeStatus = "operational" | "maintenance" | "out_of_service";
export type GainFlip = "none" | "horizontal" | "vertical";

export type PixelSize = { magnification: number; pixelSize: number };

// A camera of a microscope, with its gain and its calibrated pixel size at each magnification
export type Detector = {
  id: number;
  name: string;
  // How the acquisition metadata names it (EPU: BM-Falcon, EF-CCD...): it tells which detector took a movie
  metadataName: string;
  energyFiltered: boolean;
  gainPath: string;
  gainFlip: GainFlip;
  gainRotation: 0 | 90 | 180 | 270;
  notes: string;
  pixelSizes: PixelSize[];
};

// A detector as a save sends it: without an id it is new
export type DetectorPayload = Omit<Detector, "id"> & { id?: number | null };

export type Microscope = {
  id: number;
  name: string;
  model: string;
  status: MicroscopeStatus;
  energyFilter: string;
  acquisitionSoftware: string;
  voltageKv: number | null;
  csMm: number | null;
  offloadPath: string;
  sessionsEnabled: boolean;
  notes: string;
  detectors: Detector[];
  // When its photo was last changed; null without a photo
  photoUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MicroscopePayload = Omit<Microscope, "id" | "createdAt" | "updatedAt" | "photoUpdatedAt" | "detectors"> & {
  detectors: DetectorPayload[];
};

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

export const getFacilityStatus = () => request<FacilityStatus>("/facility/status", "Failed to read the facility mode");

let statusPromise: Promise<FacilityStatus> | null = null;

/** The facility status, read once per session (it only changes with the installation's settings). */
export function loadFacilityStatusOnce(): Promise<FacilityStatus> {
  if (!statusPromise) {
    statusPromise = getFacilityStatus().catch(() => {
      statusPromise = null;
      return { enabled: false, permissions: [] };
    });
  }
  return statusPromise;
}

export function resetFacilityStatus(): void {
  statusPromise = null;
}

export const listMicroscopes = () => request<Microscope[]>("/facility/microscopes", "Failed to load the microscopes");
export const createMicroscope = (payload: MicroscopePayload) =>
  request<Microscope>("/facility/microscopes", "Failed to create the microscope",
    { method: "POST", body: JSON.stringify(payload) });
export const updateMicroscope = (microscopeId: number, payload: MicroscopePayload) =>
  request<Microscope>(`/facility/microscopes/${microscopeId}`, "Failed to save the microscope",
    { method: "PUT", body: JSON.stringify(payload) });
export const deleteMicroscope = (microscopeId: number) =>
  request<null>(`/facility/microscopes/${microscopeId}`, "Failed to delete the microscope", { method: "DELETE" });

/** The microscope's photo as an object URL (the caller revokes it); the version keeps a changed photo from the cache. */
export async function fetchMicroscopePhotoUrl(microscopeId: number, version: string): Promise<string> {
  const response = await fetchWithAuth(
    `${BASE_URL}/facility/microscopes/${microscopeId}/photo?v=${encodeURIComponent(version)}`,
    { cache: "default" },
  );
  if (!response.ok) throw await buildApiError(response, "Failed to load the photo");
  return URL.createObjectURL(await response.blob());
}

export const uploadMicroscopePhoto = (microscopeId: number, file: Blob) =>
  request<Microscope>(`/facility/microscopes/${microscopeId}/photo`, "Failed to upload the photo",
    { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
export const deleteMicroscopePhoto = (microscopeId: number) =>
  request<Microscope>(`/facility/microscopes/${microscopeId}/photo`, "Failed to remove the photo", { method: "DELETE" });

// Samples (their NZ code), the boxes their grids were vitrified into, and the grids in each box
export type GridStatus = "stored" | "loaded" | "used" | "discarded";

// An image of a sample, box or grid: what it is; its bytes are read with fetchFacilityImageUrl
export type FacilityImage = { id: number; caption: string; createdAt?: string };
export type ImageOwnerKind = "sample" | "box" | "grid";

export type Grid = {
  id?: number | null;
  position: number;
  gridNumber: number | null;
  gridType: string;
  concentration: string;
  specimen: string;
  status: GridStatus;
  notes: string;
  images?: FacilityImage[];
};

export type GridBox = {
  id?: number | null;
  label: string;
  vitrificationCode: string;
  vitrifiedOn: string | null;
  notes: string;
  grids: Grid[];
  images?: FacilityImage[];
};

export type Sample = {
  id: number;
  code: string;
  description: string;
  groupId: number | null;
  groupName?: string | null;
  ownerId: number | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  accessRoute: string;
  notes: string;
  boxes: GridBox[];
  images?: FacilityImage[];
  createdAt?: string;
  updatedAt?: string;
};

export type SamplePayload = Pick<Sample, "code" | "description" | "groupId" | "ownerId" | "accessRoute" | "notes" | "boxes">;

export const listSamples = (text = "") =>
  request<Sample[]>(`/facility/samples${text ? `?q=${encodeURIComponent(text)}` : ""}`, "Failed to load the samples");
export const createSample = (payload: SamplePayload) =>
  request<Sample>("/facility/samples", "Failed to create the sample", { method: "POST", body: JSON.stringify(payload) });
export const updateSample = (sampleId: number, payload: SamplePayload) =>
  request<Sample>(`/facility/samples/${sampleId}`, "Failed to save the sample",
    { method: "PUT", body: JSON.stringify(payload) });
export const deleteSample = (sampleId: number) =>
  request<null>(`/facility/samples/${sampleId}`, "Failed to delete the sample", { method: "DELETE" });

const IMAGE_OWNER_PATHS: Record<ImageOwnerKind, string> = { sample: "samples", box: "boxes", grid: "grids" };

/** Keep an image (PNG, JPEG or WebP) with a sample, box or grid; answers it and the sample's new tree. */
export const addFacilityImage = (kind: ImageOwnerKind, ownerId: number, file: Blob, caption = "") =>
  request<{ image: FacilityImage; sample: Sample }>(
    `/facility/${IMAGE_OWNER_PATHS[kind]}/${ownerId}/images${caption ? `?caption=${encodeURIComponent(caption)}` : ""}`,
    "Failed to upload the image",
    { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });

/** Remove an image; answers the new tree of the sample (or the session) it was in. */
export const deleteFacilityImage = <T = Sample>(imageId: number) =>
  request<T>(`/facility/images/${imageId}`, "Failed to remove the image", { method: "DELETE" });

// An image never changes: its object URL is kept for the session
const imageUrls = new Map<number, Promise<string>>();

export function fetchFacilityImageUrl(imageId: number): Promise<string> {
  let url = imageUrls.get(imageId);
  if (!url) {
    url = fetchWithAuth(`${BASE_URL}/facility/images/${imageId}`, { cache: "default" }).then(async (response) => {
      if (!response.ok) throw await buildApiError(response, "Failed to load the image");
      return URL.createObjectURL(await response.blob());
    });
    url.catch(() => imageUrls.delete(imageId));
    imageUrls.set(imageId, url);
  }
  return url;
}

// Acquisition sessions: a stay on a microscope, and its datasets (the ATLAS and DATA_NN folders the microscope writes)
export type SessionStatus = "planned" | "acquiring" | "finished" | "archived";
export type SessionTechnique = "spa" | "tomo";
// What the list shows: the sessions to come or under way, all of them, or those in one status
export type SessionFilter = "active" | "all" | SessionStatus;

export type SessionGrid = {
  gridNumber: number | null;
  position: number;
  gridType: string;
  specimen: string;
  status: GridStatus;
  boxLabel: string;
  sampleId: number;
  sampleCode: string;
};

// Where a DATA is in its acquisition, as the watcher of the microscope's folders saw it
export type DatasetWatch = "receiving" | "stalled" | "idle" | "noOffload" | "pending" | "noFolder" | "waiting";

// What the first movie's metadata says (null: not read yet); error when it could not be read
export type DatasetAcquisition = {
  metadataFile?: string;
  error?: string;
  format?: string;
  cameraName?: string | null;
  detectorId?: number | null;
  detectorName?: string | null;
  instrument?: string | null;
  acquiredAt?: string | null;
  voltageKv?: number | null;
  magnification?: number | null;
  nominalPixelSize?: number | null;
  pixelSize?: number | null;
  pixelCalibrated?: boolean;
  frames?: number | null;
  exposureSeconds?: number | null;
  // On the sample, e-/Å² (null when the metadata does not tell it)
  totalDose?: number | null;
  dosePerFrame?: number | null;
  // That reached the camera, e-/Å²
  cameraDose?: number | null;
  gain?: string | null;
  gainFile?: string | null;
  firstMovie?: string;
  warnings?: string[];
};

// How a DATA's project goes: queued (asked for), running (being made), launched, or error (message says why)
export type DatasetProcessing = {
  state: "queued" | "running" | "launched" | "error";
  at?: string;
  message?: string;
  note?: string;
  projectName?: string;
  templateId?: string;
};

export type SessionDataset = {
  id: number;
  kind: "atlas" | "data";
  // 0 for the ATLAS, 1 to 12 for DATA_NN
  number: number;
  gridId: number | null;
  detectorId: number | null;
  detectorName?: string | null;
  notes: string;
  grid?: SessionGrid | null;
  // The folder the microscope writes it to, e.g. <session>_DATA_01
  folder: string;
  watch?: DatasetWatch | null;
  movieCount?: number;
  movieBytes?: number;
  firstMovieAt?: string | null;
  lastMovieAt?: string | null;
  acquisition?: DatasetAcquisition | null;
  projectId?: number | null;
  processing?: DatasetProcessing | null;
  images?: FacilityImage[];
};

export type FacilitySession = {
  id: number;
  name: string;
  microscopeId: number;
  microscopeName: string;
  technique: SessionTechnique;
  status: SessionStatus;
  groupId: number | null;
  groupName?: string | null;
  userId: number | null;
  userEmail?: string | null;
  userName?: string | null;
  bookingRef: string;
  scheduledOn: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  notes: string;
  // The workflow template (an id of the Workflows list) each DATA's project is made from, and whether by itself
  templateId: string;
  autoProcess: boolean;
  datasets: SessionDataset[];
  images?: FacilityImage[];
  createdAt?: string;
  updatedAt?: string;
};

export type SessionDatasetPayload = {
  id?: number | null;
  kind?: "atlas" | "data";
  number?: number;
  gridId?: number | null;
  detectorId?: number | null;
  notes?: string;
};

export type SessionPayload = Pick<FacilitySession, "microscopeId" | "technique" | "status" | "groupId" | "userId"
  | "bookingRef" | "scheduledOn" | "notes" | "templateId" | "autoProcess"> & {
  // Empty: the facility's name, YYYY_MM_DD_<Name-Surname>_<id>
  name: string;
  datasets: SessionDatasetPayload[];
};

export const listSessions = (filter: SessionFilter = "active", text = "") =>
  request<FacilitySession[]>(
    `/facility/sessions?status=${filter}${text ? `&q=${encodeURIComponent(text)}` : ""}`, "Failed to load the sessions");
export const createSession = (payload: SessionPayload) =>
  request<FacilitySession>("/facility/sessions", "Failed to create the session",
    { method: "POST", body: JSON.stringify(payload) });
export const updateSession = (sessionId: number, payload: SessionPayload) =>
  request<FacilitySession>(`/facility/sessions/${sessionId}`, "Failed to save the session",
    { method: "PUT", body: JSON.stringify(payload) });
export const deleteSession = (sessionId: number) =>
  request<null>(`/facility/sessions/${sessionId}`, "Failed to delete the session", { method: "DELETE" });

/** Keep an image with a session or one of its datasets; answers it and the session's new tree. */
export const addSessionImage = (kind: "session" | "dataset", ownerId: number, file: Blob, caption = "") =>
  request<{ image: FacilityImage; session: FacilitySession }>(
    `/facility/${kind === "session" ? "sessions" : "datasets"}/${ownerId}/images${caption ? `?caption=${encodeURIComponent(caption)}` : ""}`,
    "Failed to upload the image",
    { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });

/** A session as a save sends it back, e.g. to change only its status. */
export function sessionPayloadOf(session: FacilitySession): SessionPayload {
  return {
    name: session.name,
    microscopeId: session.microscopeId,
    technique: session.technique,
    status: session.status,
    groupId: session.groupId,
    userId: session.userId,
    bookingRef: session.bookingRef,
    scheduledOn: session.scheduledOn ? session.scheduledOn.slice(0, 10) : null,
    notes: session.notes,
    templateId: session.templateId ?? "",
    autoProcess: session.autoProcess ?? true,
    datasets: session.datasets.map((dataset) => ({
      id: dataset.id, kind: dataset.kind, number: dataset.number, gridId: dataset.gridId,
      detectorId: dataset.detectorId, notes: dataset.notes,
    })),
  };
}

/** Make a DATA's project now (again, after a failure); answers the session. */
export const processSessionDataset = (datasetId: number) =>
  request<FacilitySession>(`/facility/datasets/${datasetId}/process`, "Failed to ask for the DATA's project",
    { method: "POST" });
