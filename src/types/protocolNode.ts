export interface ProtocolNode {
  id: string;
  parents: string[];
  children: string[];
  label: string;
  status: string;
  parameters: Record<string, any>;
  cpuTime: string;
  elapsedTime: string;
  stepsDone: string;
  numberOfSteps: string;
  outputs: any;
  inputs: any;
}