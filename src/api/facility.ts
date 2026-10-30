import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// Whether this installation runs a facility, and the facility permissions of the signed-in user
export type FacilityStatus = { enabled: boolean; permissions: string[] };

export type MicroscopeStatus = "operational" | "maintenance" | "out_of_service";
export type GainFlip = "none" | "horizontal" | "vertical";

export type PixelSize = { magnification: number; pixelSize: number };

export type Microscope = {
  id: number;
  name: string;
  model: string;
  status: MicroscopeStatus;
  detectors: string;
  energyFilter: string;
  acquisitionSoftware: string;
  voltageKv: number | null;
  csMm: number | null;
  gainPath: string;
  gainFlip: GainFlip;
  gainRotation: 0 | 90 | 180 | 270;
  offloadPath: string;
  sessionsEnabled: boolean;
  notes: string;
  pixelSizes: PixelSize[];
  // When its photo was last changed; null without a photo
  photoUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MicroscopePayload = Omit<Microscope, "id" | "createdAt" | "updatedAt" | "photoUpdatedAt">;

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

export type Grid = {
  id?: number | null;
  position: number;
  gridNumber: number | null;
  gridType: string;
  concentration: string;
  specimen: string;
  status: GridStatus;
  notes: string;
};

export type GridBox = {
  id?: number | null;
  label: string;
  vitrificationCode: string;
  vitrifiedOn: string | null;
  notes: string;
  grids: Grid[];
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
