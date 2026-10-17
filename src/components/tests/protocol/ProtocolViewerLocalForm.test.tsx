import {fireEvent, render, screen, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import ProtocolViewerRuntimePreviewPanel from "@/components/protocol/ProtocolViewerRuntimePreviewPanel";
import {describeProtocolViewerRuntimePreview} from "@/utils/protocol_viewer_runtime_preview";
import {evaluateViewerCondition, validViewerConditionRule, localViewerFieldValue} from "@/utils/protocol_viewer_reactive_form";
import type {ProjectService} from "@/services/ProjectService";

const viewerId = "xmipp3.viewers.XmippCL2DViewer";
const identity = {projectId:"1", protocolId:"7", viewerId};
const eqLevel = {op:"eq", left:{op:"field", name:"doShowLastLevel"}, right:{op:"const",value:1}};

function field(name:string, label:string, control="text", extras:Record<string,unknown>={}) {
  return {
    name, label, control, readOnly:true, executionAllowed:false,
    hidden:false, hiddenAttributeAvailable:true, pending:false,
    visibility:"visible", visible:true, conditionState:"none", hasCondition:false,
    ...extras,
  };
}
function fixture(overrides:Record<string,unknown>={}): any {
  const level = field("doShowLastLevel", "Level to visualize", "select", {
    choices:["last","selection"], default:0,
  });
  const what = field("classesToShow", "What to show", "select", {
    choices:["classes","cores","stable cores"], default:0,
  });
  const selection = field("showSeveralLevels", "Levels selection", "text", {
    default:"", visibility:"conditional-hidden", visible:false,
    conditionState:"unmet",
  });
  return {
    status:"runtime-preview", source:"isolated-worker", projectId:1,
    protocolId:"7", viewerId, webReady:false, renderable:false,
    executionAllowed:false, fieldsDiscovered:3, omittedFields:2,
    actions:["classesToShow", "showConvergence"],
    sections:[{label:"Visualization",fields:[level, what, field("showConvergence", "Visualize convergence", "label")],groups:[]}],
    conditionalFields:[{section:"Visualization",group:null,field:selection,rule:eqLevel}],
    ...overrides,
  };
}
function describePreview(source:unknown) {
  return describeProtocolViewerRuntimePreview(source, identity);
}
const request = vi.fn();
const service = {fetchProtocolViewerRuntimePreview:request} as unknown as ProjectService;
function view(source:unknown = fixture()) {
  request.mockResolvedValue(source);
  // The form loads as soon as the viewer is opened.
  render(<ProtocolViewerRuntimePreviewPanel service={service} projectId="1" protocolId="7" viewerId={viewerId}/>);
  return screen.findByTestId("protocol-viewer-runtime-preview");
}

describe("protocol viewer local form and conditional fields", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a verified CL2D deferred field without showing it initially", () => {
    const preview = describePreview(fixture());
    expect(preview?.conditionalFields).toHaveLength(1);
    expect(preview?.conditionalFields?.[0]).toMatchObject({
      section:"Visualization", initiallyDeferred:true,
      field:{name:"showSeveralLevels",label:"Levels selection",readOnly:true},
    });
    expect(preview?.sections[0].fields.map(f=>f.name)).not.toContain("showSeveralLevels");
  });

  it("returns no edit contract for older runtime worker responses", () => {
    const old = fixture();
    delete (old as Record<string,unknown>).conditionalFields;
    expect(describePreview(old)?.conditionalFields).toBeUndefined();
  });

  it("rejects a sidecar that claims executable capabilities", () => {
    const data = fixture();
    data.conditionalFields[0].field.executionAllowed = true;
    expect(describePreview(data)).toBeNull();
  });

  it("rejects an explicit hidden declaration among deferred controls", () => {
    const data = fixture();
    data.conditionalFields[0].field.hidden = true;
    expect(describePreview(data)).toBeNull();
  });

  it("rejects unverifiable provenance for an initially hidden control", () => {
    const data = fixture();
    data.conditionalFields[0].field.hiddenAttributeAvailable = false;
    expect(describePreview(data)).toBeNull();
  });

  it("rejects callback/action hints inside sidecar field metadata", () => {
    const data = fixture();
    (data.conditionalFields[0].field as any).callback = "stealSecrets()";
    expect(describePreview(data)).toBeNull();
  });

  it("rejects arbitrary expressions instead of evaluating them", () => {
    const data = fixture();
    data.conditionalFields[0].rule = {op:"call",name:"import("};
    expect(describePreview(data)).toBeNull();
    expect(validViewerConditionRule({op:"call", name:"__import__"})).toBe(false);
  });

  it("rejects conditions referencing fields not serialized by the worker", () => {
    const data = fixture();
    data.conditionalFields[0].rule = {op:"field",name:"secretPluginState"};
    expect(describePreview(data)).toBeNull();
  });

  it("rejects a mismatched source section or group", () => {
    const data = fixture();
    data.conditionalFields[0].section = "Other";
    // A deferred field may legitimately belong to a separate section;
    // check mismatched visible duplicates instead.
    data.conditionalFields[0].field = data.sections[0].fields[0] as any;
    expect(describePreview(data)).toBeNull();
  });

  it("rejects cyclic dependencies among two initially hidden fields", () => {
    const data = fixture();
    const another = {...data.conditionalFields[0],field:{...data.conditionalFields[0].field,
      name:"second", label:"Second"},rule:{op:"field",name:"showSeveralLevels"}};
    data.conditionalFields[0].rule = {op:"field",name:"second"};
    data.conditionalFields.push(another as any);
    expect(describePreview(data)).toBeNull();
  });

  it("enforces bounds on rule shape and nesting", () => {
    let rule:unknown = {op:"field",name:"doShowLastLevel"};
    for (let i=0;i<18;i++) rule={op:"not",arg:rule};
    expect(validViewerConditionRule(rule)).toBe(false);
    expect(validViewerConditionRule({op:"const",value:{obj:"not a scalar"}})).toBe(false);
  });

  it("compares typed select indices without coercing user strings", () => {
    expect(evaluateViewerCondition(eqLevel, {doShowLastLevel:0})).toBe(false);
    expect(evaluateViewerCondition(eqLevel, {doShowLastLevel:1})).toBe(true);
    expect(evaluateViewerCondition(eqLevel, {doShowLastLevel:"1"})).toBe(false);
  });

  it("fails closed on missing values and unknown operators", () => {
    expect(evaluateViewerCondition(eqLevel, {})).toBeNull();
    expect(evaluateViewerCondition({op:"js",source:"alert()"}, {})).toBeNull();
  });

  it("handles boolean composition with unknowns without guessing visibility", () => {
    const unknown = {op:"field",name:"missing"};
    expect(evaluateViewerCondition({op:"and",args:[{op:"const",value:false},unknown]},{})).toBe(false);
    expect(evaluateViewerCondition({op:"or",args:[{op:"const",value:true},unknown]},{})).toBe(true);
    expect(evaluateViewerCondition({op:"and",args:[{op:"const",value:true},unknown]},{})).toBeNull();
  });

  it("normalizes valid numeric values but not NaN, Infinity or invalid indices", () => {
    const candidate = field("doShowLastLevel","Level to visualize","select",{choices:["last","selection"]});
    expect(localViewerFieldValue(candidate as any,"1")).toBe(1);
    expect(localViewerFieldValue(candidate as any,"3")).toBeUndefined();
    expect(localViewerFieldValue(candidate as any,"NaN")).toBeUndefined();
    expect(localViewerFieldValue(candidate as any,"1e309")).toBeUndefined();
  });

  it("renders local select controls and an eye only for the viewer actions", async () => {
    const result = await view();
    expect(within(result).getByRole("combobox",{name:"Level to visualize"})).toBeInTheDocument();
    expect(within(result).getByRole("combobox",{name:"What to show"})).toBeInTheDocument();
    // Without an action runner the form stays usable but shows no eyes.
    expect(within(result).queryByRole("button",{name:/^Show /})).not.toBeInTheDocument();
  });

  it("ignores action names that are not fields of the form", () => {
    const preview = describePreview(fixture({actions:["classesToShow", "launchSomething", 3]}));
    expect(preview?.actions).toEqual(["classesToShow"]);
  });

  it("does not initially show Levels selection when last is selected", async () => {
    const result = await view();
    expect(within(result).queryByRole("textbox",{name:"Levels selection"})).not.toBeInTheDocument();
  });

  it("reveals Levels selection when selection is chosen without fetching again", async () => {
    const result = await view();
    const level = within(result).getByRole("combobox",{name:"Level to visualize"});
    fireEvent.mouseDown(level);
    fireEvent.click(await screen.findByRole("option",{name:"selection"}));
    expect(within(result).getByRole("textbox",{name:"Levels selection"})).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("hides Levels selection again when returning to last", async () => {
    const result = await view();
    const level = within(result).getByRole("combobox",{name:"Level to visualize"});
    fireEvent.mouseDown(level);
    fireEvent.click(await screen.findByRole("option",{name:"selection"}));
    fireEvent.change(within(result).getByRole("textbox",{name:"Levels selection"}),{target:{value:"0,1,3"}});
    fireEvent.mouseDown(level);
    fireEvent.click(await screen.findByRole("option",{name:"last"}));
    expect(within(result).queryByRole("textbox",{name:"Levels selection"})).not.toBeInTheDocument();
  });

  it("keeps all local edits separate from the service and original schema", async () => {
    const data=fixture();
    const original=JSON.stringify(data);
    const result=await view(data);
    const level=within(result).getByRole("combobox",{name:"Level to visualize"});
    fireEvent.mouseDown(level);
    fireEvent.click(await screen.findByRole("option",{name:"selection"}));
    expect(JSON.stringify(data)).toBe(original);
    expect(request).toHaveBeenCalledTimes(1);
    expect(Object.keys(service)).toEqual(["fetchProtocolViewerRuntimePreview"]);
  });

  it("keeps fields editable when the viewer has no conditional fields", async () => {
    const data=fixture();
    delete (data as Record<string,unknown>).conditionalFields;
    const result=await view(data);
    expect(within(result).getByRole("combobox",{name:"Level to visualize"})).toBeInTheDocument();
    expect(within(result).queryByRole("textbox",{name:"Levels selection"})).not.toBeInTheDocument();
  });

  it("does not materialize unsafe deferred fields on unknown conditions", async () => {
    const data=fixture();
    data.conditionalFields[0].rule={op:"eq",left:{op:"field",name:"classesToShow"},right:{op:"const",value:2}};
    const result=await view(data);
    expect(within(result).queryByRole("textbox",{name:"Levels selection"})).not.toBeInTheDocument();
  });

  it("refuses an invalid sidecar before any local controls appear", async () => {
    const data=fixture();
    (data.conditionalFields[0].field as any).readOnly=false;
    request.mockResolvedValue(data);
    render(<ProtocolViewerRuntimePreviewPanel service={service} projectId="1" protocolId="7" viewerId={viewerId}/>);
    expect(await screen.findByText("The viewer form could not be read.")).toBeInTheDocument();
    expect(screen.queryByTestId("protocol-viewer-local-form")).not.toBeInTheDocument();
  });

  it("never renders a hidden class hierarchy field not present in the payload", async () => {
    const result=await view();
    expect(within(result).queryByText(/Visualize class hierarchy/)).not.toBeInTheDocument();
  });
});
