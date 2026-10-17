import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolViewerDiscoveryDialog from "@/components/protocol/ProtocolViewerDiscoveryDialog";

const fetchProtocolViewerCandidates = vi.fn();
// Stable identity: the discovery effect must never be retriggered by a mock render.
const mockProjectService = { fetchProtocolViewerCandidates };
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => mockProjectService }));

const viewerId = "fixture.viewers.DemoViewer";
const staticFields = [
  { name: "showPlot", label: "Show plot", control: "label" },
  { name: "displayVolume", label: "Display volume", control: "select", default: 0, choices: ["slices", "chimera"], help: "Choose volume view" },
];
const staticActions = staticFields.map(field => ({
  id: field.name, fieldName: field.name, label: field.label, control: field.control,
  kind: "visualize", previewOnly: true, requiresRuntimeEvaluation: true, executionAllowed: false,
}));
const missing = {
  id: "showPlot", fieldName: "showPlot", label: "Show plot", control: "label",
  intent: "visualize", source: "static-ast", adapter: null, adapterStatus: "missing",
  availability: "blocked", blockers: ["action_adapter_missing", "runtime_instance_not_verified", "web_action_not_implemented"],
  requiresRuntimeVerification: true, renderable: false, executionAllowed: false,
};
const declared = {
  id: "displayVolume", fieldName: "displayVolume", label: "Display volume", control: "select",
  intent: "visualize", source: "static-ast", adapter: {
    id: "volume-web", kind: "volume", effect: "read-only", surface: "react", status: "declared-not-integrated",
  },
  adapterStatus: "declared-not-integrated", availability: "blocked",
  blockers: ["action_adapter_not_integrated", "runtime_instance_not_verified", "web_action_not_implemented"],
  requiresRuntimeVerification: true, renderable: false, executionAllowed: false,
};
function contract(actions: unknown[] = [missing, declared]) {
  return {
    status: "advisory-only", source: "static-ast", actions,
    actionCount: actions.length,
    declaredAdapterCount: actions.filter(entry => !!entry && typeof entry === "object" && "adapter" in entry && (entry as { adapter?: unknown }).adapter !== null).length,
    readyCount: 0, renderable: false, executionAllowed: false,
  };
}
function viewer(overrides: Record<string, unknown> = {}) {
  return {
    id: viewerId, name: "DemoViewer", webReady: false, webLaunchAllowed: false,
    formSchema: { status: "static-preview", source: "static-ast", sections: [
      { label: "Visualization", fields: staticFields, groups: [] },
    ] },
    actionSchema: { status: "static-preview", source: "static-ast", actions: staticActions },
    webActionContracts: contract(),
    ...overrides,
  };
}
async function openDetails(overrides: Record<string, unknown> = {}) {
  fetchProtocolViewerCandidates.mockResolvedValue({ viewers: [viewer(overrides)] });
  render(<ProtocolViewerDiscoveryDialog open onClose={vi.fn()} projectId={9} protocolId={21} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show details for DemoViewer" }));
  return screen.getByTestId("protocol-viewer-details");
}
function action(details: HTMLElement, id: string) {
  return within(details).getByTestId(`protocol-web-action-${id}`);
}

const malformedContracts: Array<[string, Record<string, unknown>]> = [
  ["wrong status", { ...contract(), status: "ready" }],
  ["wrong source", { ...contract(), source: "plugin-python" }],
  ["wrong count", { ...contract(), actionCount: 9 }],
  ["forged ready count", { ...contract(), readyCount: 2 }],
  ["forged execution", { ...contract(), executionAllowed: true }],
  ["forged rendering", { ...contract(), renderable: true }],
  ["bad action list", { ...contract(), actions: "not a list" }],
];

describe("RED 157: safe browser bridge for backend webActionContracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows missing and declared adapter states beside their own static actions", async () => {
    const details = await openDetails();
    expect(within(action(details, "showPlot")).getByText("Show plot — not executable")).toBeInTheDocument();
    expect(within(action(details, "showPlot")).getByText("Web adapter: missing — blocked")).toBeInTheDocument();
    expect(within(action(details, "displayVolume")).getByText("Web adapter: declared (volume, react) — not integrated")).toBeInTheDocument();
    expect(within(action(details, "displayVolume")).getByText(/action_adapter_not_integrated/)).toBeInTheDocument();
  });

  it("never enables execution even when arbitrary ready and launch flags are present", async () => {
    const details = await openDetails({ webReady: true, webLaunchAllowed: true, executionAllowed: true });
    expect(within(details).getByText("Web adapter: missing — blocked")).toBeInTheDocument();
    expect(within(details).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /launch|execute|run viewer|open adapter/i })).not.toBeInTheDocument();
    expect(fetchProtocolViewerCandidates).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy candidates with no action contract in a read-only preview", async () => {
    const details = await openDetails({ webActionContracts: undefined });
    expect(within(details).getByText("Show plot — not executable")).toBeInTheDocument();
    expect(within(details).queryByText(/Web adapter:/)).not.toBeInTheDocument();
  });

  it.each(malformedContracts)("does not trust an invalid %s", async (_case, bad) => {
    const details = await openDetails({ webActionContracts: bad });
    expect(within(details).queryByText(/Web adapter:/)).not.toBeInTheDocument();
    expect(within(details).getByText("Show plot — not executable")).toBeInTheDocument();
  });

  it("rejects executable or available per-action claims, not just top-level flags", async () => {
    const unsafe = { ...declared, executionAllowed: true, availability: "available" };
    const details = await openDetails({ webActionContracts: contract([missing, unsafe]) });
    expect(within(action(details, "showPlot")).getByText("Web adapter: missing — blocked")).toBeInTheDocument();
    expect(within(action(details, "displayVolume")).queryByText(/Web adapter:/)).not.toBeInTheDocument();
  });

  it("suppresses a metadata label mismatch rather than trusting a forged contract", async () => {
    const details = await openDetails({ webActionContracts: contract([{ ...missing, label: "Private action" }, declared]) });
    expect(within(action(details, "showPlot")).queryByText(/Web adapter:/)).not.toBeInTheDocument();
    expect(within(action(details, "displayVolume")).getByText(/Web adapter: declared/)).toBeInTheDocument();
    expect(within(details).queryByText("Private action")).not.toBeInTheDocument();
  });

  it("does not display unknown actions, secrets, arbitrary URLs or callbacks", async () => {
    const privateAction = { ...missing, id: "private", fieldName: "private", label: "SECRET_LABEL", path: "/private/file", handler: "runPlugin" };
    const details = await openDetails({ webActionContracts: contract([missing, declared, privateAction]) });
    expect(within(details).queryByText("SECRET_LABEL")).not.toBeInTheDocument();
    expect(within(details).queryByText(/private\/file|runPlugin/)).not.toBeInTheDocument();
    expect(within(action(details, "showPlot")).getByText(/Web adapter: missing/)).toBeInTheDocument();
  });

  it("fails closed for duplicate action identities", async () => {
    const details = await openDetails({ webActionContracts: contract([missing, missing]) });
    expect(within(details).queryByText(/Web adapter:/)).not.toBeInTheDocument();
  });

  it("rejects an adapter that tries to carry a URL or callback", async () => {
    const bad = { ...declared, adapter: { ...declared.adapter, url: "https://evil.invalid", callback: "doRun" } };
    const details = await openDetails({ webActionContracts: contract([missing, bad]) });
    expect(within(action(details, "displayVolume")).queryByText(/Web adapter:/)).not.toBeInTheDocument();
    expect(within(details).queryByText(/evil\.invalid|doRun/)).not.toBeInTheDocument();
  });

  it("rejects invalid effect, unsupported capability and unapproved blockers", async () => {
    const bad = { ...declared, adapter: { ...declared.adapter, effect: "mutating", kind: "root-access" }, blockers: ["execute-now"] };
    const details = await openDetails({ webActionContracts: contract([missing, bad]) });
    expect(within(action(details, "displayVolume")).queryByText(/Web adapter:/)).not.toBeInTheDocument();
    expect(within(details).queryByText(/execute-now|root-access/)).not.toBeInTheDocument();
  });

  it("never binds a status to a different static action with the same label", async () => {
    const details = await openDetails({ webActionContracts: contract([{ ...missing, id: "otherAction", fieldName: "otherAction" }, declared]) });
    expect(within(action(details, "showPlot")).queryByText(/Web adapter:/)).not.toBeInTheDocument();
    expect(within(action(details, "displayVolume")).getByText(/Web adapter: declared/)).toBeInTheDocument();
  });
});
