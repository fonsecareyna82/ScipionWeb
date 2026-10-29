// A protocol has steps once it has run: the Steps dialog is offered only then
const STATUSES_WITH_STEPS = new Set(["running", "interactive", "finished", "failed", "aborted"]);

export function protocolHasSteps(status?: string | null): boolean {
    return STATUSES_WITH_STEPS.has(String(status ?? "").trim().toLowerCase());
}
