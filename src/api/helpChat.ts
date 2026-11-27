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
  | { kind: "guide"; area?: string; page: string; title: string; text: string; url: string }
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
  | HelpTemplateOptions
  | HelpReportCard
  | HelpComparisonCard
  | HelpTutorialCard
  | HelpActionCard;

// The tutor's view of where the project is on the usual road of a processing
export type HelpTutorialState = "done" | "running" | "waiting" | "failed" | "prepared" | "skipped" | "pending";
export type HelpTutorialStage = { key: string; title: string; state: HelpTutorialState; items: number | null;
  protocols: { id: string; label: string; status: string }[] };
export type HelpTutorialCard = { kind: "tutorial"; projectId: number; road: "spa" | "tomo"; title: string;
  current: string | null; stages: HelpTutorialStage[] };

// Protocols side by side: the parameters that differ, the outputs' sizes, how long each ran
export type HelpComparisonCard = {
  kind: "comparison"; projectId: number;
  protocols: { protocolId: string; label: string; protocol: string; className: string; status: string;
               minutes: number | null }[];
  parameters: { name: string; label: string; section: string; values: Record<string, string> }[];
  same: number;
  inputs: Record<string, string[]>;
  outputs: { output: string; sizes: Record<string, number | null> }[];
};

// The processing report of a project (or of what led to one protocol), to download
export type HelpReportCard = { kind: "report"; projectId: number; protocolId: string; project: string; protocols: number };

// The templates that take a protocol's output, for the user to choose one
export type HelpTemplateOptions = {
  kind: "templates"; projectId: number; fromProtocolId: string; fromOutput: string;
  items: { id: string; name: string; description: string; adds: number; keySteps: string[] }[];
};

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
      status: string; changes: HelpChange[]; launch?: boolean; reason: string }
  | { kind: "action"; action: "delete"; projectId: number; protocolId: string; label: string; className: string;
      status: string; outputs: { name: string; type: string; size: number | null }[];
      children: { protocolId: string; label: string; status: string }[]; reason: string }
  | HelpTemplateCard
  | HelpSubsetCard
  | HelpSubworkflowCard
  | HelpTagCard
  | { kind: "action"; action: "continue"; projectId: number; chainId: number; protocolId: string; label: string;
      title: string; next: { protocolId: string; label: string; className: string; stop: boolean }[];
      reason: string };

// A protocol with everything depending on it: copied (optionally launched), reset or deleted
export type HelpOutputLost = { name: string; type: string; size: number | null };
export type HelpSubworkflowCard = {
  kind: "action"; action: "copyworkflow" | "reset" | "deletefrom"; projectId: number; protocolId: string;
  label: string; className: string; status: string; reason: string; launch?: boolean;
  protocols: { protocolId: string; label: string; status: string; outputs?: HelpOutputLost[] }[];
};

// A tag added by its name to protocols (newTag: the project does not have it yet), or taken off them (untag);
// already: the protocol has it now
export type HelpTagCard = {
  kind: "action"; action: "tag" | "untag"; projectId: number; protocolId: string; label: string; tag: string; newTag: boolean;
  color: string | null; reason: string; protocols: { protocolId: string; label: string; already: boolean }[];
};

// A subset of an output kept by its values, made with the viewer's own action when applied
export type HelpSubsetCondition = { column: string; op: string; value: unknown };
export type HelpSubsetCard = {
  kind: "action"; action: "subset"; projectId: number; protocolId: string; label: string; outputName: string;
  table: string; conditions: HelpSubsetCondition[]; makes: string; actions: string[]; total: number; kept: number;
  removed: number; examples: Record<string, unknown>[]; name: string; reason: string;
};

// A template to add: whole (fields to fill) or cut from an output of protocolId, linked to the project
export type HelpTemplateLink = { templateRef: string; templateClass: string; projectRef: string | null; how: string;
  projectLabel: string };
export type HelpTemplateStep = { id: string; className: string; label: string; keyStep: string | null; stop: boolean };
export type HelpTemplateCard = {
  kind: "action"; action: "template"; projectId: number; protocolId: string; label: string; templateId: string;
  templateName: string; source: { protocolId: string; label: string; output: string } | null; anchor: string | null;
  alternatives: string[]; links: HelpTemplateLink[]; missing: string[]; steps: HelpTemplateStep[];
  fields: { alias: string; title: string; value: unknown }[]; reason: string;
  // Cut so that it adds very little (one or two protocols)
  few?: boolean;
};

// assistant: answered by the AI model (then steps are what it looked at, and left the questions it has today)
export type HelpAnswer = { text: string; cards: HelpCard[]; assistant?: boolean; steps?: string[]; left?: number;
  conversationId?: number | null; mode?: HelpChatMode };

// "tutor": the assistant guides a new user step by step
export type HelpChatMode = "tutor";

// The conversation so far, sent to the assistant so it follows it
export type HelpTurn = { role: "user" | "assistant"; text: string };

export async function askHelp(question: string, where: { projectId?: number | null; protocolId?: string | null },
                              history: HelpTurn[] = [], conversationId: number | null = null,
                              mode: HelpChatMode | null = null): Promise<HelpAnswer> {
  const response = await fetchWithAuth(`${BASE_URL}/help-chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      projectId: where.projectId ?? null,
      protocolId: where.protocolId ?? null,
      history,
      ...(conversationId ? { conversationId } : {}),
      ...(mode ? { mode } : {}),
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
export type AssistantProviderKey = "openai" | "google" | "mistral" | "anthropic" | "local";
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
  // Every failed protocol's notice explained by the model
  explainFailures?: boolean;
  // Every finished acquisition session's notice summarized by the model
  summarizeSessions?: boolean;
  dailyLimit: number;
  keySet: boolean;
  ready: boolean;
  providers: AssistantProviderInfo[];
  usage?: { today: AssistantUsageTotals; last30Days: AssistantUsageTotals };
};

// key: undefined keeps the one there is, "" removes it
export type HelpActionApply = {
  action: "relaunch" | "stop" | "duplicate" | "delete" | "template" | "continue" | "subset" | "copyworkflow"
    | "reset" | "deletefrom" | "tag" | "untag";
  projectId: number;
  protocolId: string;
  mode?: HelpRelaunchMode;
  scope?: "single" | "all";
  changes?: Record<string, unknown>;
  // A delete is confirmed by writing the protocol's number
  confirm?: string;
  // A template: which, from which output, its links, the template ids it stops after and its fields
  templateId?: string;
  fromOutput?: string;
  anchor?: string;
  links?: Record<string, string>;
  stops?: string[];
  fields?: Record<string, string>;
  // false: a template only added, to start later
  launch?: boolean;
  // A subset: the output, its table, what to keep, what it makes and its name
  outputName?: string;
  table?: string;
  conditions?: HelpSubsetCondition[];
  makes?: string;
  name?: string;
  chainId?: number;
  // The protocols the card listed: the server refuses if they changed
  protocolIds?: string[];
  tag?: string;
};

// Runs what the user confirmed; checked again on the server with the user's permissions
export const applyHelpAction = (payload: HelpActionApply) =>
  request<{ ok: boolean; newProtocolId?: string; chainId?: number; created?: string[]; launched?: string[];
            errors?: string[]; kept?: number; total?: number; started?: boolean; protocols?: number;
            tag?: string; newTag?: boolean; tagged?: string[]; untagged?: string[] }>("/help-chat/actions/apply", "The action could not be applied",
    { method: "POST", body: JSON.stringify(payload) });

export type AssistantSettingsPayload = Partial<Pick<AssistantSettings, "enabled" | "provider" | "baseUrl" | "model"
  | "mode" | "allowDelete" | "explainFailures" | "summarizeSessions" | "dailyLimit">> & { key?: string };

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

// The report as a PDF, or the workflow file to import and run it again: a file to save, with its name
export async function downloadReport(payload: { projectId: number; protocolId?: string; format: "pdf" | "workflow" }):
  Promise<{ blob: Blob; filename: string }> {
  const response = await fetchWithAuth(`${BASE_URL}/help-chat/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await buildApiError(response, "The report could not be made");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1]
    ?? (payload.format === "pdf" ? "report.pdf" : "workflow.json");
  return { blob: await response.blob(), filename };
}

// The user's conversations with the help chat, kept on the server
export type HelpConversationSummary = { id: number; title: string; projectId: number | null; project: string | null;
  mode?: HelpChatMode | ""; messages: number; createdAt: string; updatedAt: string };
export type HelpConversation = { id: number; title: string; projectId: number | null; mode?: HelpChatMode | "";
  messages: { role: "user" | "assistant"; text: string; answer: HelpAnswer | null }[] };

export const listConversations = () =>
  request<{ conversations: HelpConversationSummary[] }>("/help-chat/conversations", "Could not list the conversations");
export const getConversation = (id: number) =>
  request<HelpConversation>(`/help-chat/conversations/${id}`, "Could not open the conversation");
export async function deleteConversation(id: number): Promise<void> {
  const response = await fetchWithAuth(`${BASE_URL}/help-chat/conversations/${id}`, { method: "DELETE" });
  if (!response.ok) throw await buildApiError(response, "Could not delete the conversation");
}
