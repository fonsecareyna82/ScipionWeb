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

/** Remove an image; answers the sample's new tree. */
export const deleteFacilityImage = (imageId: number) =>
  request<Sample>(`/facility/images/${imageId}`, "Failed to remove the image", { method: "DELETE" });

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
