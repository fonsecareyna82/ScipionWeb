import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// A place in a protocol's log, as the failure explainer gives it
export type HelpLogPlace = { text: string; line?: number | null; channel?: string | null };

export type HelpProtocolRef = { protocolId: string; label: string; status: string };

export type HelpSuggestion = {
  className: string;
  label: string;
  count: number;
  installed: boolean;
  summary: string;
  help: string;
};

// An output of a protocol: its name, its type and, for a set, how many items it has
export type HelpOutput = { name: string; type: string; what: string; size: number | null };

// The pieces of help an answer is made of: always real help texts, never written for the answer
export type HelpCard =
  | { kind: "protocol"; className: string; label: string; summary: string; help: string }
  | { kind: "param"; className: string; protocolLabel: string; name: string; label: string; help: string; section: string }
  | { kind: "guide"; page: string; title: string; text: string; url: string }
  | {
      kind: "failure";
      protocolId: string;
      label: string;
      explained: {
        cause?: { title?: string; hint?: string } | null;
        error?: HelpLogPlace | null;
        command?: HelpLogPlace | null;
      };
    }
  | { kind: "suggestions"; protocolId: string; label: string; items: HelpSuggestion[] }
  | { kind: "protocols"; items: HelpProtocolRef[] }
  | { kind: "outputs"; protocolId: string; label: string; items: HelpOutput[] }
  | HelpActionCard;

// What the assistant proposes: nothing happens until the user applies it
export type HelpChange = { name: string; label: string; from: unknown; to: unknown };
export type HelpChild = { protocolId: string; label: string; status: string; active: boolean };
export type HelpRelaunchMode = "restart" | "continue";
export type HelpActionCard =
  | { kind: "action"; action: "relaunch"; projectId: number; protocolId: string; label: string; className: string;
      status: string; mode: HelpRelaunchMode; modes: HelpRelaunchMode[]; changes: HelpChange[]; children: HelpChild[];
      reason: string }
  | { kind: "action"; action: "stop"; projectId: number; protocolId: string; label: string; className: string;
      status: string; reason: string }
  | { kind: "action"; action: "next"; projectId: number; protocolId: string; label: string; nextClassName: string;
      nextLabel: string; reason: string }
  | { kind: "action"; action: "duplicate"; projectId: number; protocolId: string; label: string; className: string;
      status: string; changes: HelpChange[]; reason: string }
  | { kind: "action"; action: "delete"; projectId: number; protocolId: string; label: string; className: string;
      status: string; outputs: { name: string; type: string; size: number | null }[];
      children: { protocolId: string; label: string; status: string }[]; reason: string };

// assistant: answered by the AI model (then steps are what it looked at, and left the questions it has today)
export type HelpAnswer = { text: string; cards: HelpCard[]; assistant?: boolean; steps?: string[]; left?: number };

// The conversation so far, sent to the assistant so it follows it
export type HelpTurn = { role: "user" | "assistant"; text: string };

export async function askHelp(question: string, where: { projectId?: number | null; protocolId?: string | null },
                              history: HelpTurn[] = []): Promise<HelpAnswer> {
  const response = await fetchWithAuth(`${BASE_URL}/help-chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      projectId: where.projectId ?? null,
      protocolId: where.protocolId ?? null,
      history,
    }),
  });
  if (!response.ok) throw await buildApiError(response, "The help could not answer");
  return (await readPayload(response)) as HelpAnswer;
}

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

// Whether this user's questions go to the AI assistant, and how many are left today
export type HelpChatStatus = { assistant: boolean; dailyLimit?: number; left?: number };

export const getHelpChatStatus = () => request<HelpChatStatus>("/help-chat/status", "Failed to load the chat");

// The AI assistant's settings (administrators). The key is never sent back: only whether there is one.
export type AssistantProviderKey = "openai" | "google" | "mistral" | "local";
export type AssistantProviderInfo = { key: AssistantProviderKey; label: string; baseUrl: string; needsKey: boolean };
export type AssistantUsageTotals = { users: number; questions: number; inputTokens: number; outputTokens: number };

export type AssistantSettings = {
  enabled: boolean;
  provider: AssistantProviderKey;
  baseUrl: string;
  model: string;
  mode: string;
  modes?: string[];
  allowDelete?: boolean;
  dailyLimit: number;
  keySet: boolean;
  ready: boolean;
  providers: AssistantProviderInfo[];
  usage?: { today: AssistantUsageTotals; last30Days: AssistantUsageTotals };
};

// key: undefined keeps the one there is, "" removes it
export type HelpActionApply = {
  action: "relaunch" | "stop" | "duplicate" | "delete";
  projectId: number;
  protocolId: string;
  mode?: HelpRelaunchMode;
  scope?: "single" | "all";
  changes?: Record<string, unknown>;
  // A delete is confirmed by writing the protocol's number
  confirm?: string;
};

// Runs what the user confirmed; checked again on the server with the user's permissions
export const applyHelpAction = (payload: HelpActionApply) =>
  request<{ ok: boolean; newProtocolId?: string }>("/help-chat/actions/apply", "The action could not be applied",
    { method: "POST", body: JSON.stringify(payload) });

export type AssistantSettingsPayload = Partial<Pick<AssistantSettings, "enabled" | "provider" | "baseUrl" | "model"
  | "mode" | "allowDelete" | "dailyLimit">> & { key?: string };

export const getAssistantSettings = () =>
  request<AssistantSettings>("/help-chat/settings", "Failed to load the assistant settings");
export const saveAssistantSettings = (payload: AssistantSettingsPayload) =>
  request<AssistantSettings>("/help-chat/settings", "Failed to save the assistant settings",
    { method: "PUT", body: JSON.stringify(payload) });
export const listAssistantModels = (payload: AssistantSettingsPayload) =>
  request<{ models: string[] }>("/help-chat/settings/models", "Could not list the models",
    { method: "POST", body: JSON.stringify(payload) });
export const testAssistant = (payload: AssistantSettingsPayload) =>
  request<{ ok: boolean; reply: string }>("/help-chat/settings/test", "The test did not work",
    { method: "POST", body: JSON.stringify(payload) });
