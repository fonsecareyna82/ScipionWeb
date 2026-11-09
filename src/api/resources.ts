import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// A run going on. Another user's run, for who may not see everyone's, comes without user, project or protocol.
export type ResourceRun = {
  id: number;
  mine: boolean;
  host: string | null;
  gpus: number;
  gpuIds: string[];
  queued: boolean;
  startedAt: string | null;
  streaming: boolean;
  userId?: number | null;
  userName?: string;
  projectId?: number | null;
  projectName?: string | null;
  protocolId?: string | null;
  protocolClassName?: string | null;
  protocolLabel?: string | null;
  queueName?: string | null;
  queueJobId?: string | null;
};

// What holds a GPU: a run's program on it, a program of no run (pid only for who sees everything), or a run it
// was given that does not use it now
export type GpuUse =
  | { kind: "run"; run: ResourceRun; memoryBytes: number }
  | { kind: "reserved"; run: ResourceRun; memoryBytes: number }
  | { kind: "other"; memoryBytes: number; pid?: number };

export type MachineGpu = {
  index: string;
  name: string | null;
  busy: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  temperature: number | null;
  state: "free" | "busy" | "reserved";
  uses: GpuUse[];
};

export type MachineDisk = { label: "projects" | "scratch" | string; path: string; totalBytes: number; freeBytes: number };

export type Machine = {
  hostname: string;
  error: string | null;
  cpuCount: number | null;
  load1: number | null;
  load5: number | null;
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  gpuError: string | null;
  disks: MachineDisk[];
  gpus: MachineGpu[];
  runs: number;
};

export type WaitingProtocol = {
  mine: boolean;
  userName: string;
  projectId: number | null;
  projectName: string | null;
  protocolId: string | null;
  protocolClassName: string | null;
  status: string;
  since: string | null;
  reason: string;
};

export type Resources = {
  available: boolean;
  error: string | null;
  seeAll: boolean;
  machines: Machine[];
  runs: ResourceRun[];
  waiting: WaitingProtocol[];
};

export async function getResources(): Promise<Resources> {
  const response = await fetchWithAuth(`${BASE_URL}/resources`);
  if (!response.ok) throw await buildApiError(response, "Failed to load the resources");
  return (await readPayload(response)) as Resources;
}
