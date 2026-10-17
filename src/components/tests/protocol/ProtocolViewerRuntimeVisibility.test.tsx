import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolViewerRuntimePreviewPanel from "@/components/protocol/ProtocolViewerRuntimePreviewPanel";
import {describeProtocolViewerRuntimePreview} from "@/utils/protocol_viewer_runtime_preview";
import type {ProjectService} from "@/services/ProjectService";

const viewerId = "xmipp3.viewers.XmippCL2DViewer";
const identity = {projectId: "1", protocolId: "7", viewerId};

function explicit(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name, label: name, control: "text", default: "x",
    visibility: "visible", visible: true, pending: false,
    conditionState: "none", readOnly: true, executionAllowed: false,
    hidden: null, hiddenAttributeAvailable: false,
    ...overrides,
  };
}

function payload(fields: Array<Record<string, unknown>>, groups: Array<Record<string, unknown>> = []) {
  return {
    status: "runtime-preview", source: "isolated-worker", projectId: 1,
    protocolId: "7", viewerId, webReady: false, renderable: false,
    executionAllowed: false, fieldsDiscovered: 5, omittedFields: 1,
    sections: [{label: "Visualization", fields, groups}],
  };
}

function parse(fields: Array<Record<string, unknown>>, groups: Array<Record<string, unknown>> = []) {
  return describeProtocolViewerRuntimePreview(payload(fields, groups), identity);
}

const request = vi.fn();
const service = {fetchProtocolViewerRuntimePreview: request} as unknown as ProjectService;
function view(fields: Array<Record<string, unknown>>) {
  request.mockResolvedValue(payload(fields));
  render(<ProtocolViewerRuntimePreviewPanel service={service} projectId="1" protocolId="7" viewerId={viewerId}/>);
  return screen.findByTestId("protocol-viewer-runtime-preview");
}

describe("protocol viewer runtime field visibility", () => {
  beforeEach(() => {vi.clearAllMocks();});

  it("retains a verified unconditional visible field without making it editable", () => {
    const result = parse([explicit("mode")]);
    expect(result?.visibilityContract).toBe("explicit");
    expect(result?.sections[0].fields[0]).toMatchObject({
      visibility: "visible", conditionState: "none", readOnly: true,
    });
  });

  it("distinguishes evaluated met conditions from unconditional fields", () => {
    const result = parse([explicit("levels", {conditionState: "met", hasCondition: false})]);
    expect(result?.sections[0].fields[0].conditionState).toBe("met");
    expect(result?.sections[0].fields[0].visibility).toBe("visible");
  });

  it("keeps unsupported conditions visible but explicitly pending", () => {
    const result = parse([explicit("unknown", {
      visibility: "pending", visible: null, pending: true,
      conditionState: "unresolved", hasCondition: true,
    })]);
    expect(result?.sections[0].fields[0]).toMatchObject({
      visibility: "pending", conditionState: "unresolved", readOnly: true,
    });
  });

  it("marks older schema as legacy rather than claiming it was evaluated", () => {
    const result = parse([{name: "old", label: "Old", control: "text", hasCondition: true}]);
    expect(result?.visibilityContract).toBe("legacy");
    expect(result?.sections[0].fields[0].conditionState).toBe("legacy");
  });

  it("signals a mixed schema without erasing any honest provenance", () => {
    const result = parse([explicit("new"), {name: "old", label: "Old", control: "text"}]);
    expect(result?.visibilityContract).toBe("mixed");
    expect(result?.sections[0].fields.map(f => f.visibility)).toEqual(["visible", "legacy"]);
  });

  it("omits explicitly hidden fields regardless of other metadata", () => {
    const result = parse([explicit("secret", {hidden: true}), explicit("public")]);
    expect(result?.sections[0].fields.map(f => f.name)).toEqual(["public"]);
  });

  it("omits worker-marked hidden visibility", () => {
    const result = parse([explicit("secret", {visibility: "hidden"}), explicit("public")]);
    expect(result?.sections[0].fields.map(f => f.name)).toEqual(["public"]);
  });

  it("omits visible=false even if a worker contradictorily says visible", () => {
    expect(parse([explicit("secret", {visible: false})])?.sections[0].fields).toEqual([]);
  });

  it("rejects fields claiming any execution permission", () => {
    expect(parse([explicit("unsafe", {executionAllowed: true})])?.sections[0].fields).toEqual([]);
  });

  it("rejects fields claiming editability", () => {
    expect(parse([explicit("unsafe", {readOnly: false})])?.sections[0].fields).toEqual([]);
  });

  it("rejects contradictory or unsupported visibility metadata", () => {
    expect(parse([explicit("bad", {visibility: "pending", visible: true})])?.sections[0].fields).toEqual([]);
    expect(parse([explicit("bad", {visibility: "maybe"})])?.sections[0].fields).toEqual([]);
  });

  it("rejects partially provided visibility metadata rather than treating it as legacy", () => {
    expect(parse([{name: "bad", label: "Bad", control: "text", conditionState: "met"}])?.sections[0].fields).toEqual([]);
  });

  it("does not fabricate a hidden=false when Scipion discarded the flag", () => {
    expect(parse([explicit("mode")])?.hiddenAttributeUnverifiable).toBe(true);
    expect(parse([explicit("mode", {hidden: false, hiddenAttributeAvailable: true})])?.hiddenAttributeUnverifiable).toBe(false);
  });

  it("rejects mismatched hidden provenance", () => {
    expect(parse([explicit("bad", {hidden: false, hiddenAttributeAvailable: false})])?.sections[0].fields).toEqual([]);
  });

  it("propagates verified metadata for grouped fields without promoting actions", () => {
    const result = parse([], [{label: "Classes", fields: [explicit("classes", {
      visibility: "pending", visible: null, pending: true, conditionState: "unresolved",
    })]}]);
    expect(result?.sections[0].groups[0].fields[0].visibility).toBe("pending");
    expect(result?.visibilityContract).toBe("explicit");
  });

  it("keeps the strict runtime identity and non-executable response check", () => {
    expect(describeProtocolViewerRuntimePreview({...payload([explicit("x")]), executionAllowed: true}, identity)).toBeNull();
    expect(describeProtocolViewerRuntimePreview(payload([explicit("x")]), {...identity, protocolId: "8"})).toBeNull();
  });

  it("renders fields whose condition was met as editable controls", async () => {
    const result = await view([explicit("level", {conditionState: "met"})]);
    expect(within(result).getByRole("textbox", {name: "level"})).toHaveValue("x");
  });

  it("keeps fields with conditions it could not evaluate visible and editable", async () => {
    const result = await view([
      explicit("level"),
      explicit("levels", {visibility: "pending", visible: null, pending: true, conditionState: "unresolved"}),
    ]);
    expect(within(result).getByRole("textbox", {name: "level"})).toBeInTheDocument();
    expect(within(result).getByRole("textbox", {name: "levels"})).toBeInTheDocument();
  });

  it("renders legacy schema fields as editable controls", async () => {
    const result = await view([{name: "legacy", label: "Legacy", control: "text", hasCondition: true}]);
    expect(within(result).getByRole("textbox", {name: "Legacy"})).toBeInTheDocument();
  });

  it("never exposes worker-claimed actions as React controls or text", async () => {
    const item = {...explicit("safe"), callback: "dangerous()", actionSchema: {label: "RUN_THIS"}};
    const result = await view([item]);
    expect(within(result).queryByText(/RUN_THIS|dangerous/)).not.toBeInTheDocument();
    expect(within(result).queryByRole("button")).not.toBeInTheDocument();
  });
});
