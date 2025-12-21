// File: src/utils/graph_utils.ts
import { ProtocolNode } from "@/types/protocolNode";
import { Node, Edge, Position } from "reactflow";

/**
 * Estimate the width of a label deterministically (no canvas).
 * This avoids host-dependent font metrics differences (e.g., Flask embedding).
 */
function estimateLabelWidth(label: string, fontSize = 20): number {
  const text = String(label ?? "");

  // avgCharWidthFactor tuned to be close to typical UI fonts at 20px
  const avgCharWidth = fontSize * 0.58;

  // fixedPaddingForNodeCard must reflect the non-text parts of the node/card
  const fixedPaddingForNodeCard = 480;

  // clampBounds keep spacing stable even for very short/long labels
  const minNodeWidth = 620;
  const maxNodeWidth = 980;

  const estimated = Math.ceil(text.length * avgCharWidth + fixedPaddingForNodeCard);
  return Math.max(minNodeWidth, Math.min(maxNodeWidth, estimated));
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
  const spacingX = direction === "TB" ? 430 : 1150;
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
      // DESC: numeric ids first; fallback to lexicographic desc
      .sort(([idA], [idB]) => {
        const a = parseInt(idA, 10);
        const b = parseInt(idB, 10);
        const aNum = !Number.isNaN(a);
        const bNum = !Number.isNaN(b);
        if (aNum && bNum) return b - a; // numeric descending
        return String(idB).localeCompare(String(idA)); // string descending
      });

    const total = items.length;
    if (total === 0) return { nodes: [], edges: [] };

    const fallbackW =
      typeof window !== "undefined" && typeof window.innerWidth === "number"
        ? window.innerWidth
        : 1600;

    const zoom = typeof viewportZoom === "number" && viewportZoom > 0 ? viewportZoom : 1;
    const screenWidthPx = Math.max(600, containerWidth ?? fallbackW);
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
        ? Math.min(
            520,
            Math.max(
              320,
              Math.round((estHeights.reduce((a, b) => a + b, 0) / estHeights.length) * 0.9)
            )
          )
        : 380;

    const cellW = baseW + gapX;
    const cellH = baseH + gapY;

    const cols =
      Math.max(
        1,
        Math.min(
          total,
          Math.floor((wrapWorldWidth - gapX) / Math.max(320, cellW))
        ) + 1
      ) || 1;

    const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
    const targetPosition: Position = direction === "LR" ? Position.Left : Position.Top;

    // Start at (0,0) top-left
    const offsetX = 100;
    const offsetY = 100;

    for (let i = 0; i < total; i++) {
      const [id, prot] = items[i];
      const row = Math.floor(i / cols);
      const col = i % cols;

      const x = col * cellW + offsetX;
      const y = row * cellH + offsetY;

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

  // Ensure stable ordering of levels and ids across hosts
  const sortedLevels = Object.keys(levelBuckets)
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const idsRaw = levelBuckets[level] ?? [];

    // stableOrderingAcrossHosts
    const ids = [...idsRaw].sort((a, b) => {
      if (a === "PROJECT") return -1;
      if (b === "PROJECT") return 1;

      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      const aNum = !Number.isNaN(na);
      const bNum = !Number.isNaN(nb);

      if (aNum && bNum) return na - nb;
      return String(a).localeCompare(String(b));
    });

    const sizes = ids.map((id) => estimateLabelWidth(protocols[id]?.label || id));
    const heights = ids.map((id) => estimateNodeHeight(protocols[id]?.label || id));

    const spacing = direction === "TB" ? spacingX : spacingY;

    // computeTotalSizeWithoutTrailingSpacing
    const totalSize =
      direction === "TB"
        ? sizes.reduce((sum, s) => sum + s, 0) + Math.max(0, ids.length - 1) * spacing
        : heights.reduce((sum, h) => sum + h, 0) + Math.max(0, ids.length - 1) * spacing;

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
      const targetPosition: Position = direction === "LR" ? Position.Left : Position.Top;

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
  }

  return { nodes, edges };
}
