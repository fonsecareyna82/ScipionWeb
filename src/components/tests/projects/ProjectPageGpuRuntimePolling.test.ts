import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Execute the real polling callback in isolation, using lightweight React
// state setters. This tests behavior without mounting the whole ProjectPage.
const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/pages/Dashboard/projects/ProjectPage.tsx"),
  "utf8",
);

const startMarker = "  const applyProtocolRuntimeSummaries = useCallback(";
const endMarker = "\n\n  useEffect(() => {\n    syncProtocolDetailsToGraphRef.current";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end <= start) {
  throw new Error("Cannot locate ProjectPage runtime polling callback");
}

const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
  },
}).outputText;

function makeRuntimeState(initialGpu: boolean) {
  let nodes: any[] = [
    {
      id: "25",
      position: { x: 0, y: 0 },
      data: {
        status: "running",
        elapsedTime: "5",
        elapsedSessionId: "gpu-session",
        gpuIndicatorEligible: initialGpu,
      },
    },
    { id: "26", data: { status: "finished", gpuIndicatorEligible: false } },
  ];
  let rows: any[] = [
    {
      id: "25",
      status: "running",
      elapsedTime: "5",
      elapsedSessionId: "gpu-session",
      gpuIndicatorEligible: initialGpu,
    },
  ];
  let project: any = {
    protocols: {
      "25": {
        status: "running",
        elapsedSessionId: "gpu-session",
        gpuIndicatorEligible: initialGpu,
      },
    },
  };

  const factory = new Function(
    "useCallback",
    "setNodes",
    "setTableData",
    "setOpenForms",
    "setProject",
    "mergeNodeElapsedTick",
    "mergeTableElapsedTick",
    "mergeProtocolFormRuntimeSummary",
    "normalizeElapsedSessionId",
    "isStaleScheduledSnapshot",
    "normalizeProtocolStatus",
    "mergeProtocolRuntimeSummary",
    `${compiled}\nreturn applyProtocolRuntimeSummaries;`,
  );

  const apply = factory(
    (callback: any) => callback,
    (updater: any) => { nodes = updater(nodes); },
    (updater: any) => { rows = updater(rows); },
    (updater: any) => { updater([]); },
    (updater: any) => { project = updater(project); },
    (fresh: any) => fresh,
    (fresh: any) => fresh,
    (details: any) => details,
    (id: any) => String(id ?? "").trim() || null,
    () => false,
    (status: any) => String(status ?? "").trim().toLowerCase(),
    (current: any, summary: any) => ({ ...current, ...summary }),
  ) as (summaries: any[]) => void;

  const poll = (gpuIndicatorEligible: boolean, status = "running") => apply([{
    protocolId: "25",
    status,
    cpuTimeSeconds: 2,
    elapsedTimeSeconds: 6,
    elapsedSessionId: "gpu-session",
    stepsDone: 1,
    numberOfSteps: 3,
    gpuIndicatorEligible,
    // Intentionally omit outputs: GPU changes alone must update the project.
  }]);

  return {
    poll,
    get nodes() { return nodes; },
    get rows() { return rows; },
    get project() { return project; },
  };
}

describe("ProjectPage runtime GPU polling", () => {
  it("enables the GPU indicator without reloading the graph or requiring output changes", () => {
    const state = makeRuntimeState(false);
    state.poll(true);

    expect(state.nodes[0].data.gpuIndicatorEligible).toBe(true);
    expect(state.rows[0].gpuIndicatorEligible).toBe(true);
    expect(state.project.protocols["25"].gpuIndicatorEligible).toBe(true);
    expect(state.nodes[1].data.gpuIndicatorEligible).toBe(false);
  });

  it("clears the GPU indicator on a GPU-to-CPU step transition while still running", () => {
    const state = makeRuntimeState(true);
    state.poll(false);

    expect(state.nodes[0].data.gpuIndicatorEligible).toBe(false);
    expect(state.rows[0].gpuIndicatorEligible).toBe(false);
    expect(state.project.protocols["25"].gpuIndicatorEligible).toBe(false);
  });
});
