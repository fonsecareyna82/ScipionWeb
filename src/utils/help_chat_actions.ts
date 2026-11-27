// What the help chat asks of the project page: after the user confirms an assistant's card, open a protocol's form,
// open a new protocol's form, or refresh after a relaunch or a stop; or centre the graph on a protocol it found.
// The chat lives in the header; the page, when it shows that project, listens.
export type HelpChatRequest =
  | { kind: "openProtocol"; projectId: number; protocolId: string }
  | { kind: "focusProtocol"; projectId: number; protocolId: string }
  | { kind: "openProtocolClass"; projectId: number; className: string }
  | { kind: "refresh"; projectId: number };

type Listener = (request: HelpChatRequest) => void;

const listeners = new Set<Listener>();

/** True when a page that shows that project took the request. */
export function requestFromHelpChat(request: HelpChatRequest): boolean {
  let taken = false;
  listeners.forEach((listener) => {
    try {
      listener(request);
      taken = true;
    } catch {
      // A listener that fails does not stop the others
    }
  });
  return taken;
}

export function onHelpChatRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
