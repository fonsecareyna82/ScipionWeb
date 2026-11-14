import { useSyncExternalStore } from "react";

// Where the user is, for the help chat: the project open and the protocol selected in it. The project page
// tells it; the chat, in the header, reads it.
export type HelpFocus = { projectId: number | null; projectName: string | null; protocolId: string | null;
  protocolLabel: string | null };

const EMPTY: HelpFocus = { projectId: null, projectName: null, protocolId: null, protocolLabel: null };

let focus: HelpFocus = EMPTY;
const listeners = new Set<() => void>();

export function setHelpFocus(next: Partial<HelpFocus> | null): void {
  const value = next ? { ...EMPTY, ...next } : EMPTY;
  if (value.projectId === focus.projectId && value.protocolId === focus.protocolId
    && value.projectName === focus.projectName && value.protocolLabel === focus.protocolLabel) return;
  focus = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useHelpFocus(): HelpFocus {
  return useSyncExternalStore(subscribe, () => focus, () => focus);
}
