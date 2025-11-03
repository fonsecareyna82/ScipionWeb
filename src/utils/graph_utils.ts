// File: src/utils/graph_utils.ts
import { ProtocolNode } from "@/types/protocolNode";
import { Node, Edge, Position } from "reactflow";

/**
 * Estimate the width of a label using canvas.
 */
function estimateLabelWidth(label: string, fontSize = 20, fontFamily = "Arial"): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 100;
  context.font = `${fontSize}px ${fontFamily}`;
  return context.measureText(label).width + 480; // extra padding for node/card
}

/**
 * Estimate node height (optional, for LR layout)
 */
function estimateNodeHeight(label: string, fontSize = 20, fontFamily = "Arial"): number {
  const avgCharWidth = fontSize * 0.6;
  const maxWidth = 240;
  const text = String(label ?? "");
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const lines = Math.ceil(text.length / charsPerLine) || 1;

  const baseLineHeight = Math.round(fontSize * 1.2);
  const familyFactor = /arial/i.test(fontFamily) ? 1 : 1.05;

  return Math.ceil(lines * baseLineHeight * familyFactor) + 180;
}

type Direction = "TB" | "LR";

/**
 * Build nodes and edges for ReactFlow from protocols.
 */
export function buildGraphElements(
  projectName: string,
  protocols: Record<string, ProtocolNode>,
  viewMode: "hierarchical" | "grid" | "table" = "hierarchical",
  direction: Direction = "TB",
  containerWidth?: number | null,
  viewportZoom?: number | null
) {
  const spacingX = direction === "TB" ? 250 : 1150;
  const spacingY = direction === "TB" ? 580 : 380;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // TABLE view -> only table
  if (viewMode === "table") {
    const sorted = Object.entries(protocols)
      .filter(([id]) => id !== "PROJECT")
      .sort(([idA], [idB]) => parseInt(idA, 10) - parseInt(idB, 10));

    const tableData = sorted.map(([id, prot]) => ({
      id,
      label: prot.label,
      status: prot.status,
      parameters: prot.parameters,
      children: prot.children,
      cpuTime: prot.cpuTime,
      stepsDone: prot.stepsDone,
      numberOfSteps: prot.numberOfSteps,
      elapsedTime: prot.elapsedTime,
      tick: Number(prot.elapsedTime) || 0,
    }));

    return { nodes: [], edges: [], table: tableData };
  }

  // GRID view -> rows and columns from top-left, no edges
  if (viewMode === "grid") {
    const items = Object.entries(protocols)
      .filter(([id]) => id !== "PROJECT")
      .sort(([idA], [idB]) => parseInt(idA, 10) - parseInt(idB, 10));

    const total = items.length;
    if (total === 0) return { nodes: [], edges: [] };

    const fallbackW =
      typeof window !== "undefined" && typeof window.innerWidth === "number"
        ? window.innerWidth
        : 1600;

    const zoom = typeof viewportZoom === "number" && viewportZoom > 0 ? viewportZoom : 1;
    const screenWidthPx = Math.max(600, (containerWidth ?? fallbackW));
    const wrapWorldWidth = screenWidthPx / zoom;

    const estWidths = items.map(([, prot]) => estimateLabelWidth(prot?.label || ""));
    const estHeights = items.map(([, prot]) => estimateNodeHeight(prot?.label || ""));

    const gapX = 650;
    const gapY = 200;

    const softWidths = estWidths.map((w) => Math.round(w * 0.45));
    const avgSoftW =
      softWidths.length > 0
        ? Math.round(softWidths.reduce((a, b) => a + b, 0) / softWidths.length)
        : 560;

    const baseW = Math.min(680, Math.max(440, avgSoftW));
    const baseH =
      estHeights.length > 0
        ? Math.min(520, Math.max(320, Math.round((estHeights.reduce((a, b) => a + b, 0) / estHeights.length) * 0.9)))
        : 380;

    const cellW = baseW + gapX;
    const cellH = baseH + gapY;

    const cols = Math.max(
      1,
      Math.min(
        total,
        Math.floor((wrapWorldWidth - gapX) / Math.max(320, cellW))
      ) + 1
    );

    const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
    const targetPosition: Position = direction === "LR" ? Position.Left  : Position.Top;

    // Start at (0,0) top-left
    for (let i = 0; i < total; i++) {
      const [id, prot] = items[i];
      const row = Math.floor(i / cols);
      const col = i % cols;

      const x = col * cellW;
      const y = row * cellH;

      nodes.push({
        id,
        type: "status",
        data: {
          label: prot?.label || id,
          status: prot?.status,
          id,
          parameters: prot?.parameters,
          cpuTime: prot?.cpuTime,
          elapsedTime: prot?.elapsedTime,
          stepsDone: prot?.stepsDone,
          numberOfSteps: prot?.numberOfSteps,
          outputs: prot?.outputs,
          inputs: prot?.inputs,
          tick: Number(prot?.elapsedTime) || 0,
        },
        position: { x, y },
        draggable: true,
        sourcePosition,
        targetPosition,
      });
    }

    return { nodes, edges: [] };
  }

  // HIERARCHICAL (default) with edges
  const levelMap: Record<string, number> = {};
  const levelBuckets: Record<number, string[]> = {};
  const edgeSet = new Set<string>();

  function traverse(id: string, level: number) {
    const currentLevel = levelMap[id];
    if (currentLevel === undefined || level > currentLevel) {
      levelMap[id] = level;

      Object.values(levelBuckets).forEach((bucket) => {
        const index = bucket.indexOf(id);
        if (index !== -1) bucket.splice(index, 1);
      });

      if (!levelBuckets[level]) levelBuckets[level] = [];
      levelBuckets[level].push(id);
    }

    const prot = protocols[id];
    if (!prot) return;

    prot.children.forEach((childId) => {
      const edgeId = `${id}-${childId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: id,
          target: childId,
          animated: false,
          style: { stroke: "#CAD5E2", strokeWidth: 2 },
          markerEnd: "url(#circle)",
          sourceHandle: direction === "TB" ? "bottom" : "right",
          targetHandle: direction === "TB" ? "top" : "left",
        });
      }
      traverse(childId, levelMap[id] + 1);
    });
  }

  traverse("PROJECT", 0);

  Object.entries(levelBuckets).forEach(([levelStr, ids]) => {
    const level = parseInt(levelStr, 10);
    const sizes = ids.map((id) => estimateLabelWidth(protocols[id]?.label || id));
    const heights = ids.map((id) => estimateNodeHeight(protocols[id]?.label || id));

    const spacing = direction === "TB" ? spacingX : spacingY;
    const totalSize =
      direction === "TB"
        ? sizes.reduce((sum, s) => sum + s + spacing, 0)
        : heights.reduce((sum, h) => sum + h + spacing, 0);

    let secondary = -totalSize / 2;

    ids.forEach((id, index) => {
      const prot = protocols[id];
      const label = prot?.label || id;
      const status = prot?.status;
      const nodeWidth = sizes[index];
      const nodeHeight = heights[index];

      const position =
        direction === "TB"
          ? { x: secondary + nodeWidth / 2, y: level * spacingY }
          : { x: level * spacingX, y: secondary + nodeHeight / 2 };

      const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
      const targetPosition: Position = direction === "LR" ? Position.Left  : Position.Top;

      nodes.push({
        id,
        type: "status",
        data: {
          label: id === "PROJECT" ? projectName : label,
          status,
          id,
          parameters: prot?.parameters,
          cpuTime: prot?.cpuTime,
          elapsedTime: prot?.elapsedTime,
          stepsDone: prot?.stepsDone,
          numberOfSteps: prot?.numberOfSteps,
          outputs: prot?.outputs,
          inputs: prot?.inputs,
          tick: Number(prot?.elapsedTime) || 0,
        },
        position,
        draggable: true,
        sourcePosition,
        targetPosition,
      });

      secondary += direction === "TB" ? nodeWidth + spacing : nodeHeight + spacing;
    });
  });

  return { nodes, edges };
}
