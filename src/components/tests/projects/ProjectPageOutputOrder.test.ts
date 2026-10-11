import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { mergeProtocolOutputsPreservingOrder, mergeProtocolRuntimeSummary } from "@/utils/protocol_outputs";

// Execute the real refresh helpers without mounting the entire project and its viewers.
const source = fs.readFileSync(path.resolve(process.cwd(), "src/pages/Dashboard/projects/ProjectPage.tsx"), "utf8");
const parsed = ts.createSourceFile("ProjectPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helperNames = new Set([
  "normalizeProtocolStatus", "isElapsedTimerStatus", "normalizeElapsedSessionId",
  "isStaleScheduledSnapshot", "continuesElapsedTimerSession", "toElapsedSeconds",
  "mergeNodeElapsedTick", "mergeTableElapsedTick", "mergeLiveProtocolFormDetails",
  "mergeProtocolFormRuntimeSummary",
]);
const functions = parsed.statements.filter((statement) =>
  ts.isFunctionDeclaration(statement) && helperNames.has(statement.name?.text ?? ""),
).map((statement) => statement.getText(parsed));
let runtimeCallback = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "applyProtocolRuntimeSummaries") {
    const initializer = node.initializer as ts.CallExpression;
    runtimeCallback = initializer.arguments[0].getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);

function loadHelpers(overrides: Record<string, unknown> = {}) {
  const context = vm.createContext({
    ELAPSED_TIMER_STATUSES: new Set(["running"]),
    mergeProtocolOutputsPreservingOrder, mergeProtocolRuntimeSummary,
    ...overrides,
  });
  const code = `${functions.join("\n")}\nvar applyProtocolRuntimeSummaries = ${runtimeCallback};`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context;
}

const currentOutputs = [
  { outputName: "outputParticles", info: "Particles (10 items)" },
  { outputName: "outputMicrographs", info: "Micrographs (2 items)" },
];
const freshOutputs = [
  { outputName: "outputMicrographs", info: "Micrographs (3 items)" },
  { outputName: "outputParticles", info: "Particles (20 items)" },
];
const names = (outputs: any[]) => Array.from(outputs, (output) => output.outputName);

describe("ProjectPage output order across refresh paths", () => {
  it("preserves node and table order on full refresh, including terminal protocols", () => {
    const context = loadHelpers();
    for (const status of ["running", "finished"]) {
      const current = { id: "21", data: { status, outputs: currentOutputs } };
      const fresh = { id: "21", data: { status, outputs: freshOutputs } };
      const node = context.mergeNodeElapsedTick(fresh, current);
      const row = context.mergeTableElapsedTick(fresh.data, current.data);
      expect(names(node.data.outputs)).toEqual(names(currentOutputs));
      expect(names(row.outputs)).toEqual(names(currentOutputs));
      expect(node.data.outputs[0].info).toBe("Particles (20 items)");
      expect(row.outputs[1].info).toBe("Micrographs (3 items)");
    }
  });

  it("uses the existing node order when switching to the table without a previous row", () => {
    const context = loadHelpers();
    const row = context.mergeTableElapsedTick(
      { status: "running", outputs: freshOutputs }, undefined,
      { id: "21", data: { status: "running", outputs: currentOutputs } },
    );
    expect(names(row.outputs)).toEqual(names(currentOutputs));
  });

  it("preserves open form output order and editable values on detail refresh", () => {
    const context = loadHelpers();
    const current = { info: { outputs: currentOutputs }, form: { values: { threshold: 5 } } };
    const result = context.mergeLiveProtocolFormDetails(current, {
      info: { outputs: freshOutputs }, form: { values: { threshold: 1 } },
    });
    expect(names(result.info.outputs)).toEqual(names(currentOutputs));
    expect(result.info.outputs[0].info).toBe("Particles (20 items)");
    expect(result.form.values.threshold).toBe(5);
  });

  it("keeps runtime polling consistent across graph, table and project state", () => {
    let nodes = [{ id: "21", data: { status: "running", outputs: currentOutputs } }];
    let rows = [{ id: "21", status: "running", outputs: currentOutputs }];
    let project = { protocols: { "21": { status: "running", outputs: currentOutputs } } };
    const context = loadHelpers({
      setNodes: (update: any) => { nodes = update(nodes); },
      setTableData: (update: any) => { rows = update(rows); },
      setProject: (update: any) => { project = update(project); },
      setOpenForms: (update: any) => update([]),
    });
    context.applyProtocolRuntimeSummaries([{ protocolId: "21", status: "running", outputs: freshOutputs }]);
    for (const outputs of [nodes[0].data.outputs, rows[0].outputs, project.protocols["21"].outputs]) {
      expect(names(outputs)).toEqual(names(currentOutputs));
      expect(outputs[0].info).toBe("Particles (20 items)");
    }
  });
});
