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
  createdAt?: string;
  updatedAt?: string;
};

export type MicroscopePayload = Omit<Microscope, "id" | "createdAt" | "updatedAt">;

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
