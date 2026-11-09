import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// The computing used in a period: hours are wall time inside it, GPU hours those hours times the GPUs given.
// How busy the GPUs really were is known only for the runs looked at while they went on (gpuMeasuredHours of the
// GPU hours); an older API leaves these out.
export type ComputeTotals = {
  runs: number;
  hours: number;
  gpuHours: number;
  gpuMeasuredHours?: number;
  gpuUsedHours?: number;
  failed: number;
  running: number;
};

export type ComputeRun = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  protocolId: string | null;
  protocolClassName: string | null;
  protocolLabel: string | null;
  userId: number | null;
  userName: string;
  userEmail: string | null;
  host: string | null;
  queueName: string | null;
  queueJobId: string | null;
  gpus: number;
  gpuIds: string[];
  threads: number | null;
  mpi: number | null;
  streaming: boolean;
  startedAt: string | null;
  endedAt: string | null;
  running: boolean;
  // finished, failed, aborted, interactive, running, or interrupted (its worker stopped answering)
  status: string | null;
  hours: number;
  gpuHours: number;
  // Mean busy % of its GPUs, the GPU hours really used and the most GPU memory held; null when not looked at
  gpuBusy?: number | null;
  gpuUsedHours?: number | null;
  gpuMemoryPeakBytes?: number | null;
};

export type UserCompute = ComputeTotals & { userId: number | null; name: string; email: string | null;
  mostUsed: string | null };
export type GroupCompute = ComputeTotals & { groupId: number; name: string; members: number; activeMembers: number;
  mostUsed: string | null };
export type ProtocolCompute = ComputeTotals & { protocolClassName: string; name: string; users: number };
export type MachineCompute = ComputeTotals & { host: string; name: string; users: number;
  gpuHoursById: Record<string, number> };

export type ComputeReport = {
  since: string;
  until: string;
  periodHours: number;
  total: ComputeTotals & { users: number };
  users: UserCompute[];
  groups: GroupCompute[];
  protocols: ProtocolCompute[];
  machines: MachineCompute[];
  running: ComputeRun[];
};

export type UserRuns = { since: string; until: string; runs: ComputeRun[]; truncated: boolean };
export type OwnCompute = ComputeTotals & { since: string; until: string };

export type Period = { since?: Date | null; until?: Date | null };

function query({ since, until }: Period = {}): string {
  const params = new URLSearchParams();
  if (since) params.set("since", since.toISOString());
  if (until) params.set("until", until.toISOString());
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function request<T>(path: string, fallback: string): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`);
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

export const getComputeUsage = (period?: Period) =>
  request<ComputeReport>(`/usage/compute${query(period)}`, "Failed to load the computing used");

export const getUserRuns = (userId: number, period?: Period) =>
  request<UserRuns>(`/usage/compute/users/${userId}/runs${query(period)}`, "Failed to load the user's runs");

// What the user used, in all (this month without a period); null when the API does not know (an older one)
export async function getOwnComputeUsage(period?: Period): Promise<OwnCompute | null> {
  const response = await fetchWithAuth(`${BASE_URL}/usage/compute/me${query(period)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw await buildApiError(response, "Failed to load your computing");
  return (await readPayload(response)) as OwnCompute;
}

// How busy the GPUs given were, in %, over the GPU hours looked at; null when none was
export function gpuUsePercent(totals: Pick<ComputeTotals, "gpuMeasuredHours" | "gpuUsedHours">): number | null {
  const measured = totals.gpuMeasuredHours ?? 0;
  return measured > 0 ? Math.round(((totals.gpuUsedHours ?? 0) / measured) * 100) : null;
}

export function formatHours(hours: number): string {
  if (!hours) return "0 h";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: hours < 10 ? 1 : 0 })} h`;
}
