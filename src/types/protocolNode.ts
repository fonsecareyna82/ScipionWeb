import type { ExtraTableColumns } from "./extraTableColumns";

export interface ProtocolNode {
  id: string;
  parents: string[];
  children: string[];
  label: string;
  title: string;
  runName: string;
  comment: string;
  status: string;
  parameters: Record<string, any>;
  cpuTime: string;
  elapsedTime: string;
  elapsedSessionId?: string | null;
  // A launched protocol waiting for one of its user's run slots
  waitingForSlot?: { inUse: number; limit: number } | null;
  gpuIndicatorEligible?: boolean;
  stepsDone: string;
  numberOfSteps: string;
  outputs: any;
  inputs: any;
  tags: string[];
  extraTableColumns?: ExtraTableColumns;
}