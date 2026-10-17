import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolViewerDiscoveryDialog from "@/components/protocol/ProtocolViewerDiscoveryDialog";

const fetchProtocolViewerCandidates = vi.fn();
const mockProjectService = { fetchProtocolViewerCandidates };
vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: () => mockProjectService,
}));

const viewer = {
  id: "relion.viewers.RelionViewer", name: "RelionViewer", webLaunchAllowed: false,
  contractValidation: {
    status: "pending",
    issues: ["dynamic_form_definition", "unresolved_form_condition"],
    blockers: ["runtime_instance_not_verified", "web_adapter_missing"],
  },
  formSchema: {
    status: "static-preview", source: "static-ast", hiddenFields: 1,
    dynamicDefinitionsSkipped: 2, renderable: false,
    sections: [{
      label: "Visualization",
      fields: [
        { name: "displayVol", label: "Display volume", control: "select",
          default: 0, choices: ["slices", "chimera"], help: "Choose volume view" },
        { name: "useMask", label: "Use mask", control: "boolean", default: false },
      ],
      groups: [{ label: "Resolution", fields: [
        { name: "threshold", label: "FSC threshold", control: "number",
          default: 0.143, hasCondition: true },
        { name: "iteration", label: "Iteration range", control: "numeric-range",
          unresolvedDefault: true },
      ] }],
    }],
  },
  actionSchema: {
    status: "static-preview", actions: [
      { id: "displayVol", fieldName: "displayVol", label: "Display volume", control: "select",
        kind: "visualize", previewOnly: true, executionAllowed: false },
      { id: "threshold", fieldName: "threshold", label: "FSC threshold", control: "number",
        kind: "visualize", previewOnly: true, executionAllowed: false },
    ],
  },
};

function renderDialog(projectId: number | string | null = 1, protocolId: number | string | null = 7) {
  return render(<ProtocolViewerDiscoveryDialog open onClose={vi.fn()} projectId={projectId} protocolId={protocolId} />);
}

async function openDetails(name = "RelionViewer") {
  const button = await screen.findByRole("button", { name: `Show details for ${name}` });
  fireEvent.click(button);
  return screen.getByTestId("protocol-viewer-details");
}

describe("RED 131: read-only ProtocolViewer form/action preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProtocolViewerCandidates.mockResolvedValue({ viewers: [viewer] });
  });

  it("keeps detailed form metadata collapsed until explicitly requested", async () => {
    renderDialog();
    const button = await screen.findByRole("button", { name: "Show details for RelionViewer" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Section: Visualization")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByText("Section: Visualization")).toBeInTheDocument();
  });

  it("shows public sections, groups and types from the real static schema", async () => {
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText("Section: Visualization")).toBeInTheDocument();
    expect(within(details).getByText("Group: Resolution")).toBeInTheDocument();
    expect(within(details).getByText("Control: select")).toBeInTheDocument();
    expect(within(details).getByText("Control: numeric-range")).toBeInTheDocument();
  });

  it("describes choice lists and literal defaults without editable inputs", async () => {
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText("Options: slices, chimera")).toBeInTheDocument();
    expect(within(details).getByText("Default: 0")).toBeInTheDocument();
    expect(within(details).getByText("Default: false")).toBeInTheDocument();
    expect(within(details).getByText("Default: 0.143")).toBeInTheDocument();
    expect(within(details).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(details).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(details).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows explanatory help and warns on conditional/unresolved defaults", async () => {
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText("Choose volume view")).toBeInTheDocument();
    expect(within(details).getByText("Conditional field (not evaluated)")).toBeInTheDocument();
    expect(within(details).getByText("Default requires runtime evaluation")).toBeInTheDocument();
  });

  it("shows discovered action labels but no executable controls", async () => {
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText("Actions (preview only)")).toBeInTheDocument();
    expect(within(details).getByText("Display volume — not executable")).toBeInTheDocument();
    expect(within(details).getByText("FSC threshold — not executable")).toBeInTheDocument();
    expect(within(details).queryByRole("button")).not.toBeInTheDocument();
  });

  it("reports static contract status, dynamic omissions and blockers", async () => {
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText("Contract: pending")).toBeInTheDocument();
    expect(within(details).getByText("2 dynamic definitions skipped; 1 hidden fields omitted.")).toBeInTheDocument();
    expect(within(details).getByText(/Contract issues: dynamic_form_definition/)).toBeInTheDocument();
    expect(within(details).getByText(/Pending checks: runtime_instance_not_verified/)).toBeInTheDocument();
  });

  it("does not promote forged webReady/webLaunchAllowed flags to buttons", async () => {
    fetchProtocolViewerCandidates.mockResolvedValue({viewers: [{...viewer, webReady: true, webLaunchAllowed: true, executionAllowed: true}]});
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText(/No controls or visualization actions are executable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /launch|execute|run viewer/i })).not.toBeInTheDocument();
  });

  it("omits unknown and hidden/unmatched actions even if returned by a plugin", async () => {
    const tampered = {
      ...viewer,
      actionSchema: {...viewer.actionSchema, actions: [
        ...viewer.actionSchema.actions,
        { id: "private", fieldName: "private", label: "Expose secret", control: "text",
          kind: "visualize", previewOnly: true, executionAllowed: false },
        { id: "badAction", fieldName: "badAction", label: "Danger", control: "label",
          kind: "visualize", previewOnly: false, executionAllowed: true },
      ]},
    };
    fetchProtocolViewerCandidates.mockResolvedValue({viewers: [tampered]});
    renderDialog();
    const details = await openDetails();
    expect(within(details).queryByText(/Expose secret/)).not.toBeInTheDocument();
    expect(within(details).queryByText(/Danger/)).not.toBeInTheDocument();
    expect(within(details).getByText("Display volume — not executable")).toBeInTheDocument();
  });

  it("describes viewers with no static form instead of inventing controls", async () => {
    fetchProtocolViewerCandidates.mockResolvedValue({viewers: [{id:"facilities.viewer.Summary", name:"Summary", formSchema:null, actionSchema:null}]});
    renderDialog();
    const details = await openDetails("Summary");
    expect(within(details).getByText("No static form description available.")).toBeInTheDocument();
    expect(within(details).getByText("No statically described actions.")).toBeInTheDocument();
  });

  it("ignores malformed and overlong form sections safely", async () => {
    fetchProtocolViewerCandidates.mockResolvedValue({ viewers: [{
      ...viewer, formSchema: {status:"static-preview", sections: [
        { label: "Safe", fields: [
          {name:"bad",label:"Invalid",control:"script"},
          {name:"secret",label:"X".repeat(5000),control:"text"},
          {name:"good",label:"Valid field",control:"text"},
        ], groups: "not an array" },
      ]},
    }] });
    renderDialog();
    const details = await openDetails();
    expect(within(details).getByText("Section: Safe")).toBeInTheDocument();
    expect(within(details).getByText("Valid field")).toBeInTheDocument();
    expect(within(details).queryByText("Invalid")).not.toBeInTheDocument();
    expect(within(details).queryByText("X".repeat(5000))).not.toBeInTheDocument();
  });

  it("allows details to be collapsed again and keeps output analysis independent", async () => {
    renderDialog();
    await openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Hide details for RelionViewer" }));
    expect(screen.queryByText("Section: Visualization")).not.toBeInTheDocument();
    expect(screen.getByText(/use Analyze output in the Outputs tab/)).toBeInTheDocument();
    expect(fetchProtocolViewerCandidates).toHaveBeenCalledWith("1", "7");
  });

  it("updates the preview when changing protocol identity without displaying stale fields", async () => {
    const { rerender } = renderDialog();
    await openDetails();
    fetchProtocolViewerCandidates.mockResolvedValueOnce({viewers: [{id:"other.viewer.New",name:"NewViewer"}]});
    rerender(<ProtocolViewerDiscoveryDialog open onClose={vi.fn()} projectId={1} protocolId={8} />);
    await waitFor(() => expect(fetchProtocolViewerCandidates).toHaveBeenCalledWith("1", "8"));
    const newButton = await screen.findByRole("button", {name:"Show details for NewViewer"});
    expect(newButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Section: Visualization")).not.toBeInTheDocument();
  });
});
