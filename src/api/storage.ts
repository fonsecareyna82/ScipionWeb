import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// The last measure of a project (made in the background by the API)
export type ProjectStorage = {
  id: number;
  name: string;
  path: string;
  ownerId: number;
  ownerName: string;
  ownerEmail: string | null;
  totalBytes: number | null;
  runsBytes: number | null;
  uploadsBytes: number | null;
  files: number | null;
  // managed: in the projects folder; linked: a link there to a project elsewhere; external: elsewhere
  location: "managed" | "linked" | "external" | null;
  measuredAt: string | null;
  durationSeconds: number | null;
  error: string | null;
  measuring: boolean;
  requested: boolean;
  lastActivity: string | null;
};

export type StorageTotals = {
  projects: number;
  measured: number;
  totalBytes: number;
  runsBytes: number;
  uploadsBytes: number;
  oldestMeasure: string | null;
  lastActivity: string | null;
};

export type UserStorage = StorageTotals & { userId: number; name: string; email: string | null };
export type GroupStorage = StorageTotals & {
  groupId: number;
  name: string;
  members: number;
  membersWithProjects: number;
};

export type StorageDisk = { path: string; totalBytes: number; usedBytes: number; freeBytes: number };

export type StorageReport = {
  disk: StorageDisk | null;
  total: StorageTotals;
  users: UserStorage[];
  groups: GroupStorage[];
  projects: ProjectStorage[];
  pending: number;
  measuring: number[];
};

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

export const getStorageUsage = () => request<StorageReport>("/storage/usage", "Failed to load the disk usage");
// Without ids, every project
export const measureStorage = (projectIds?: number[]) =>
  request<{ requested: boolean }>("/storage/measure", "Failed to ask for a new measure",
    { method: "POST", body: JSON.stringify({ projectIds: projectIds ?? null }) });
