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
  | { kind: "outputs"; protocolId: string; label: string; items: HelpOutput[] };

export type HelpAnswer = { text: string; cards: HelpCard[] };

export async function askHelp(question: string, where: { projectId?: number | null; protocolId?: string | null }):
  Promise<HelpAnswer> {
  const response = await fetchWithAuth(`${BASE_URL}/help-chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      projectId: where.projectId ?? null,
      protocolId: where.protocolId ?? null,
    }),
  });
  if (!response.ok) throw await buildApiError(response, "The help could not answer");
  return (await readPayload(response)) as HelpAnswer;
}
