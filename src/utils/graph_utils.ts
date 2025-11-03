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
  const avgCharWidth = fontSize * 0.6; // rough average
  const maxWidth = 240;                // px, assumed node width
  const text = String(label ?? "");
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const lines = Math.ceil(text.length / charsPerLine) || 1;

  // Line height with a small family factor (keeps arguments “used” meaningfully)
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
  direction: Direction = "TB"
) {
  const spacingX = direction === "TB" ? 250 : 1150;
  const spacingY = direction === "TB" ? 580 : 380;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // -------------------------
  // TABLE view -> only table
  // -------------------------
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

  // -------------------------
  // GRID view -> boxes only
  // -------------------------
  if (viewMode === "grid") {
    // Exclude the virtual PROJECT node from the grid
    const items = Object.entries(protocols)
      .filter(([id]) => id !== "PROJECT")
      .sort(([idA], [idB]) => parseInt(idA, 10) - parseInt(idB, 10));

    // Choose a near-square layout
    const total = items.length;
    const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / cols));

    // Generous spacing so your Status card doesn't overlap (tune if needed)
    const gridCellWidth = 1200;   // horizontal step
    const gridCellHeight = 460;   // vertical step

    // Handles orientation (kept consistent with current direction, even if we don't draw edges)
    const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
    const targetPosition: Position = direction === "LR" ? Position.Left  : Position.Top;

    // Start near origin; ProjectPage centers viewport afterwards
    for (let i = 0; i < total; i++) {
      const [id, prot] = items[i];
      const row = Math.floor(i / cols);
      const col = i % cols;

      const x = col * gridCellWidth;
      const y = row * gridCellHeight;

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

    // No edges in grid view
    return { nodes, edges: [] };
  }

  // ---------------------------------
  // HIERARCHICAL (default) with edges
  // ---------------------------------
  const levelMap: Record<string, number> = {};
  const levelBuckets: Record<number, string[]> = {};
  const edgeSet = new Set<string>();

  // Recursive traversal to compute levels and edges
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
          // edge handles depend on direction
          sourceHandle: direction === "TB" ? "bottom" : "right",
          targetHandle: direction === "TB" ? "top" : "left",
        });
      }
      traverse(childId, levelMap[id] + 1);
    });
  }

  traverse("PROJECT", 0);

  // Position nodes by level
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

      // Correct handle positions per direction
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
        // crucial for proper edge orientation
        sourcePosition,
        targetPosition,
      });

      secondary += direction === "TB" ? nodeWidth + spacing : nodeHeight + spacing;
    });
  });

  return { nodes, edges };
}
