import { ProtocolNode } from "../api/protocols";
import { Node, Edge } from "reactflow";

/**
 * Estimate the width of a label using canvas.
 */
function estimateLabelWidth(label: string, fontSize = 20, fontFamily = "Arial"): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 100;
  context.font = `${fontSize}px ${fontFamily}`;
  return context.measureText(label).width + 480; // extra padding for node
}

/**
 * Estimate node height (optional, for LR layout)
 */
function estimateNodeHeight(label: string, fontSize = 20, fontFamily = "Arial"): number {
  return 120; // fixed height for simplicity
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
) {

  const spacingX = direction === 'TB' ? 100 : 900;
  const spacingY = direction === 'TB' ? 470 : 350;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

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
      });

      secondary += direction === "TB" ? nodeWidth + spacing : nodeHeight + spacing;
    });
  });

  return { nodes, edges };
}
