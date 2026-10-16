import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const pageSource = fs.readFileSync("src/pages/Dashboard/projects/ProjectPage.tsx", "utf8");
const dockPath = "src/components/projects/WorkflowLogsDock.tsx";
const dockSource = fs.existsSync(dockPath) ? fs.readFileSync(dockPath, "utf8") : "";
const parsed = ts.createSourceFile("ProjectPage.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function allNodes(predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(parsed);
  return found;
}

function componentNode(name: string): ts.Node | undefined {
  return allNodes((node) => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(parsed) === name)[0];
}

describe("Workflow logs dock", () => {
  it("provides an optional, initially closed logs toggle in the workflow toolbar", () => {
    const headerStart = pageSource.indexOf('<div className="pp-headerRight">');
    const headerEnd = pageSource.indexOf("{/* Content wrapper */}", headerStart);
    expect(headerStart).toBeGreaterThanOrEqual(0);
    expect(headerEnd).toBeGreaterThan(headerStart);
    const header = pageSource.slice(headerStart, headerEnd);
    expect(pageSource).toMatch(/\[workflowLogsOpen,\s*setWorkflowLogsOpen\]\s*=\s*useState\(false\)/);
    expect(header).toContain("setWorkflowLogsOpen");
    expect(header).toContain("workflowLogsOpen");
    expect(header).toMatch(/\bLogs\b/);
  });

  it("renders the optional dock outside the React Flow canvas rather than overlaying nodes", () => {
    const dock = componentNode("WorkflowLogsDock");
    expect(dock, "The page must mount the workflow logs dock").toBeDefined();
    expect(pageSource).toMatch(/\{\s*workflowLogsOpen\s*&&\s*\(\s*<WorkflowLogsDock\b/);
    const canvas = allNodes((node) => ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attr) => ts.isJsxAttribute(attr) && attr.name.getText(parsed) === "ref" && attr.initializer?.getText(parsed).includes("flowWrapperRef")))[0];
    expect(canvas, "Keep the existing React Flow wrapper").toBeDefined();
    for (let parent = dock?.parent; parent; parent = parent.parent) {
      expect(parent, "The log dock must not be nested inside the React Flow wrapper").not.toBe(canvas);
    }
  });

  it("follows the last individually selected protocol, but retains it on deselection or PROJECT", () => {
    const effect = allNodes((node) => ts.isCallExpression(node) && node.expression.getText(parsed) === "useEffect" && node.arguments[0]?.getText(parsed).includes("setWorkflowLogsProtocolId") && node.arguments[0]?.getText(parsed).includes("previousNodeId"))[0] as ts.CallExpression | undefined;
    expect(effect, "Need an effect following the existing single-selection state").toBeDefined();
    const callback = effect!.arguments[0].getText(parsed);
    const dependencyList = effect!.arguments[1]?.getText(parsed) ?? "";
    expect(dependencyList).toContain("previousNodeId");
    const observed = vi.fn();
    const invoke = (previousNodeId: string | null) => {
      const js = ts.transpileModule(`const follow = ${callback}; follow();`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
      vm.runInNewContext(js, { previousNodeId, setWorkflowLogsProtocolId: observed });
    };
    invoke(null);
    invoke("21");
    invoke("22");
    invoke(null);
    invoke("PROJECT");
    expect(observed.mock.calls.map(([value]) => value)).toEqual(["21", "22"]);
  });

  it("reuses native logs and exposes a drag-resizable horizontal divider", () => {
    expect(dockSource, "The workflow log dock component has not been implemented").not.toBe("");
    expect(dockSource).toContain("useProtocolLogs(");
    expect(dockSource).toContain("<ProtocolLogsPanel");
    expect(dockSource).toMatch(/role=["']separator["']/);
    expect(dockSource).toMatch(/aria-orientation=["']horizontal["']/);
    expect(dockSource).toMatch(/onPointerDown\s*=/);
    expect(dockSource).toMatch(/onClose/);
  });

  it("renders the Logs toggle between Refresh and Minimap in the floating workflow controls", () => {
    const controlsStart = pageSource.indexOf('<div className="pp-flowControls">');
    const controlsEnd = pageSource.indexOf('<ReactFlowProvider>', controlsStart);
    expect(controlsStart).toBeGreaterThanOrEqual(0);
    expect(controlsEnd).toBeGreaterThan(controlsStart);
    const controls = pageSource.slice(controlsStart, controlsEnd);
    const refresh = controls.indexOf('title="Refresh project"');
    const toggle = controls.indexOf('className="pp-flowControlBtn pp-logsToggle"');
    const minimap = controls.indexOf('title={miniMapEnabled ? "Hide minimap" : "Show minimap"}');
    expect(refresh).toBeGreaterThanOrEqual(0);
    expect(toggle).toBeGreaterThan(refresh);
    expect(minimap).toBeGreaterThan(toggle);
    const logsButton = controls.slice(toggle, minimap);
    expect(logsButton).toContain('onClick={() => setWorkflowLogsOpen((open) => !open)}');
    expect(logsButton).toContain('aria-pressed={workflowLogsOpen}');
    expect(logsButton).toContain('className="pp-flowControlBtn pp-logsToggle"');
  });

  it("keeps a Logs toggle in the header only for Table view", () => {
    const headerStart = pageSource.indexOf('<div className="pp-headerRight">');
    const headerEnd = pageSource.indexOf('{/* Content wrapper */}', headerStart);
    expect(headerStart).toBeGreaterThanOrEqual(0);
    expect(headerEnd).toBeGreaterThan(headerStart);
    const header = pageSource.slice(headerStart, headerEnd);
    const tableOnlyToggle = header.match(/\{viewMode === "table" && \(\s*<button[\s\S]*?className="pp-chipBtn pp-logsToggle"[\s\S]*?<\/button>\s*\)\}/);
    expect(tableOnlyToggle, "The header fallback must be exclusive to Table view").not.toBeNull();
    expect(tableOnlyToggle![0]).toContain('onClick={() => setWorkflowLogsOpen((open) => !open)}');
    expect(tableOnlyToggle![0]).toContain('aria-pressed={workflowLogsOpen}');
  });
});
