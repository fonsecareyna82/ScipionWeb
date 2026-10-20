import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Exercise the actual camera and refresh callbacks without loading every viewer.
const source = fs.readFileSync("src/pages/Dashboard/projects/ProjectPage.tsx", "utf8");
const parsed = ts.createSourceFile("ProjectPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map<string, string>();
const namedCallbacks = new Set(["centerLikeButton", "snapViewportToTopLeft", "handleRefresh", "handleFitView"]);
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && namedCallbacks.has(node.name.getText(parsed))) {
    const initializer = node.initializer as ts.CallExpression;
    callbacks.set(node.name.getText(parsed), initializer.arguments[0].getText(parsed));
  }
  if (ts.isCallExpression(node) && ["useEffect", "useLayoutEffect"].includes(node.expression.getText(parsed))) {
    const callback = node.arguments[0]?.getText(parsed) ?? "";
    if (callback.includes("lastObservedWidthRef.current")) callbacks.set("observeWidth", callback);
    if (callback.includes("setNodes(seededWithLiveTicks)")) callbacks.set("reflowGrid", callback);
    if (callback.includes("!nodesLoadedOnce || !firstLoadRef.current")) callbacks.set("initialCenter", callback);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);

function createHarness(viewMode: "grid" | "hierarchical") {
  let viewport = { x: -450, y: -780, zoom: viewMode === "grid" ? 0.347 : 0.6 };
  const initialViewport = { ...viewport };
  const frames: Array<() => void> = [];
  let resize: (entries: any[]) => void = () => { throw new Error("Observer not installed"); };
  const observe = vi.fn();
  const disconnect = vi.fn();
  const instance = {
    getViewport: () => viewport,
    setViewport: vi.fn((next: typeof viewport) => { viewport = { ...next }; }),
    setCenter: vi.fn((x: number, y: number, options: { zoom: number }) => {
      viewport = { x: -x, y: -y, zoom: options.zoom };
    }),
    fitView: vi.fn(),
  };
  const oldNodes = [{ id: "21", position: { x: 100, y: 200 }, data: { status: "running" } }];
  const newNodes = [{ ...oldNodes[0], data: { status: "finished" } }];
  const project = { shortName: "test", protocols: { "21": { status: "finished" } } };
  const context = vm.createContext({
    viewMode, graphDirection: "TB", projectName: "test", projectId: 7, project, gridWidth: 1200,
    graphRevisionRef: { current: null },
    gridZoom: 0.347, gridZoomRef: { current: 0.347 }, gridSizesUsedRef: { current: {} }, nodesLoadedOnce: true,
    firstLoadRef: { current: false },
    viewportRef: { current: initialViewport },
    reactFlowInstanceRef: { current: instance },
    flowWrapperRef: { current: { clientWidth: 1200 } },
    lastObservedWidthRef: { current: -1 },
    viewModeRef: { current: viewMode },
    nodesRef: { current: oldNodes }, edgesRef: { current: [] },
    pendingNewNodesRef: { current: null }, pendingPlacementRef: { current: null },
    pathSelRef: { current: { nodes: new Set(), edges: new Set() } },
    selectedIdRef: { current: null },
    console: { error: vi.fn(), warn: vi.fn() }, window: {},
    setViewport: vi.fn(), setGridWidth: vi.fn(),
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; },
    ResizeObserver: class {
      constructor(callback: typeof resize) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    },
    clampZoom: (zoom: number) => zoom,
    getEffectiveZoom: () => initialViewport.zoom,
    getUnifiedSelectedIds: () => new Set(),
    buildGraphElements: vi.fn(() => ({ nodes: newNodes, edges: [], table: [{ id: "21", status: "finished" }] })),
    seedNodesWithSelectionAndThumbnails: (nodes: any) => nodes,
    mergeNodeElapsedTick: (node: any) => node,
    mergeTableElapsedTick: (row: any) => row,
    preserveExistingOutputThumbnails: (nodes: any) => nodes,
    preservePendingExistingNodePositions: (nodes: any) => nodes,
    preservePendingDeletedNodePositions: (nodes: any) => nodes,
    loadNodesWithPositions: (nodes: any) => nodes,
    buildPreferredTbChildOrderFromGraph: () => undefined,
    mergeEdges: (edges: any) => edges,
    paintEdgeHighlight: (edges: any) => edges,
    protocolOutputThumbnailsEnabled: false,
    assignmentsFromProtocols: () => ({}),
    toFiniteProjectId: () => 7,
    seedTagAssignments: vi.fn(),
    refreshTags: vi.fn(),
    svc: { fetchProject: vi.fn().mockResolvedValue(project) },
    setProject: vi.fn(), setIsRefreshing: vi.fn(),
    setNodes: vi.fn(), setEdges: vi.fn((update: any) => typeof update === "function" ? update([]) : update),
    setTableData: vi.fn((update: any) => update([])),
    refreshOpenFormsDetails: vi.fn(),
  });
  const code = Array.from(callbacks, ([name, callback]) => `var ${name} = ${callback};`).join("\n");
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const flushFrames = async () => {
    // Allow continuations between frames, as the initial center waits for two paints.
    for (let tick = 0; tick < 5; tick += 1) {
      const pending = frames.splice(0);
      pending.forEach((callback) => callback());
      await Promise.resolve();
    }
  };
  return {
    context, instance, initialViewport, getViewport: () => viewport, flushFrames, observe, disconnect,
    resizeTo: (width: number, height = 800) => resize([{ contentRect: { width, height } }]),
  };
}

describe("ProjectPage camera stability when protocol forms open and close", () => {
  it.each(["grid", "hierarchical"] as const)("keeps the camera on width changes in %s", async (mode) => {
    const harness = createHarness(mode);
    const cleanup = harness.context.observeWidth();
    for (const width of [1198, 1183, 1198, 1200]) {
      harness.resizeTo(width);
      await harness.flushFrames();
    }
    expect(harness.context.setGridWidth).toHaveBeenLastCalledWith(1200);
    expect(harness.getViewport()).toEqual(harness.initialViewport);
    expect(harness.instance.setCenter).not.toHaveBeenCalled();
    expect(harness.instance.setViewport).not.toHaveBeenCalled();
    cleanup();
    expect(harness.disconnect).toHaveBeenCalledOnce();
  });

  it("ignores height-only notifications", async () => {
    const harness = createHarness("hierarchical");
    harness.context.observeWidth();
    harness.context.setGridWidth.mockClear();
    harness.resizeTo(1200, 600);
    await harness.flushFrames();
    expect(harness.context.setGridWidth).not.toHaveBeenCalled();
    expect(harness.getViewport()).toEqual(harness.initialViewport);
  });

  it.each(["grid", "hierarchical"] as const)("keeps the camera through both close-time refreshes in %s", async (mode) => {
    const harness = createHarness(mode);
    for (let refresh = 0; refresh < 2; refresh += 1) {
      await harness.context.handleRefresh();
      await harness.flushFrames();
    }
    expect(harness.context.console.error).not.toHaveBeenCalled();
    expect(harness.context.setNodes).toHaveBeenCalledTimes(2);
    expect(harness.context.setNodes.mock.lastCall[0][0].data.status).toBe("finished");
    expect(harness.context.refreshOpenFormsDetails).toHaveBeenCalledTimes(2);
    expect(harness.getViewport()).toEqual(harness.initialViewport);
    expect(harness.instance.setViewport).not.toHaveBeenCalled();
    expect(harness.instance.setCenter).not.toHaveBeenCalled();
  });

  it("updates grid nodes on reflow without resetting the camera", async () => {
    const harness = createHarness("grid");
    harness.context.reflowGrid();
    await harness.flushFrames();
    expect(harness.context.setNodes).toHaveBeenCalledOnce();
    expect(harness.getViewport()).toEqual(harness.initialViewport);
  });

  it("moves grid cards on reflow but keeps their live data (e.g. steps done)", async () => {
    const harness = createHarness("grid");
    harness.context.reflowGrid();
    await harness.flushFrames();
    // The loaded project says "finished"; the card shown is newer ("running").
    const [[reflowed]] = harness.context.setNodes.mock.calls;
    expect(reflowed[0].data.status).toBe("running");
    expect(reflowed[0].position).toEqual({ x: 100, y: 200 });
  });

  it.each(["grid", "hierarchical"] as const)("still centers %s on initial load", async (mode) => {
    const harness = createHarness(mode);
    harness.context.firstLoadRef.current = true;
    harness.context.initialCenter();
    await harness.flushFrames();
    expect(harness.context.firstLoadRef.current).toBe(false);
    expect(mode === "grid" ? harness.instance.setViewport : harness.instance.setCenter).toHaveBeenCalledOnce();
  });

  it.each(["grid", "hierarchical"] as const)("still centers %s on explicit Fit view", (mode) => {
    const harness = createHarness(mode);
    harness.context.handleFitView();
    expect(mode === "grid" ? harness.instance.setViewport : harness.instance.setCenter).toHaveBeenCalledOnce();
  });
});
