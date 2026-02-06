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

type IdIndexMap = Map<string, number>;

const stableIdCompare = (a: string, b: string): number => {
  // stableIdCompare
  if (a === "PROJECT") return -1;
  if (b === "PROJECT") return 1;

  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);

  if (aNum && bNum) return na - nb;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;

  return String(a).localeCompare(String(b));
};

const buildIndexMap = (order: string[]): IdIndexMap => {
  // buildIndexMap
  const m: IdIndexMap = new Map();
  for (let i = 0; i < order.length; i++) m.set(order[i], i);
  return m;
};

const buildParentMap = (protocols: Record<string, ProtocolNode>): Record<string, string[]> => {
  // buildParentMap
  const parentMap: Record<string, string[]> = {};
  const ids = Object.keys(protocols).sort(stableIdCompare);

  for (const parentId of ids) {
    const prot = protocols[parentId];
    const rawChildren = Array.isArray(prot?.children) ? prot.children : [];
    const children = [...rawChildren].sort(stableIdCompare);

    for (const childId of children) {
      if (!parentMap[childId]) parentMap[childId] = [];
      parentMap[childId].push(parentId);
    }
  }

  return parentMap;
};

const getChildrenSorted = (protocols: Record<string, ProtocolNode>, id: string): string[] => {
  // getChildrenSorted
  const prot = protocols[id];
  const raw = Array.isArray(prot?.children) ? prot.children : [];
  return [...raw].sort(stableIdCompare);
};

const averageNeighborIndex = (neighbors: string[], neighborIndex: IdIndexMap): number | null => {
  // averageNeighborIndex
  let sum = 0;
  let count = 0;

  for (const n of neighbors) {
    const idx = neighborIndex.get(n);
    if (typeof idx === "number") {
      sum += idx;
      count += 1;
    }
  }

  if (count === 0) return null;
  return sum / count;
};

const reorderByBarycenter = (
  currentOrder: string[],
  getNeighbors: (id: string) => string[],
  neighborIndex: IdIndexMap
): string[] => {
  // reorderByBarycenter
  const decorated = currentOrder.map((id, originalIndex) => {
    const anchor = averageNeighborIndex(getNeighbors(id), neighborIndex);
    return {
      id,
      originalIndex,
      hasAnchor: anchor != null,
      anchor: anchor ?? Number.POSITIVE_INFINITY,
    };
  });

  decorated.sort((a, b) => {
    if (a.anchor !== b.anchor) return a.anchor - b.anchor;

    // If neither has anchors, keep original relative order (stable fallback)
    if (!a.hasAnchor && !b.hasAnchor) return a.originalIndex - b.originalIndex;

    // Deterministic tie-break when anchors exist or coincide
    return stableIdCompare(a.id, b.id);
  });

  return decorated.map((d) => d.id);
};

const buildInitialLevelOrder = (
  level: number,
  idsRaw: string[],
  prevOrder: string[],
  protocols: Record<string, ProtocolNode>
): string[] => {
  // buildInitialLevelOrder
  if (level === 0) {
    const onlyProject = idsRaw.includes("PROJECT") ? ["PROJECT"] : [];
    const rest = idsRaw.filter((id) => id !== "PROJECT").sort(stableIdCompare);
    return [...onlyProject, ...rest];
  }

  const levelSet = new Set(idsRaw);
  const used = new Set<string>();
  const order: string[] = [];

  // Expand from previous level order: append children in a deterministic order
  for (const parentId of prevOrder) {
    const children = getChildrenSorted(protocols, parentId);
    for (const childId of children) {
      if (!levelSet.has(childId)) continue;
      if (used.has(childId)) continue;
      order.push(childId);
      used.add(childId);
    }
  }

  // Append remaining nodes (orphans or nodes not reached via previous-level parents)
  const remaining = idsRaw.filter((id) => id !== "PROJECT" && !used.has(id)).sort(stableIdCompare);
  order.push(...remaining);

  return order;
};

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
      Math.max(1, Math.min(total, Math.floor((wrapWorldWidth - gapX) / Math.max(320, cellW))) + 1) ||
      1;

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

  const parentMap = buildParentMap(protocols);

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

    const children = Array.isArray(prot.children) ? prot.children : [];
    for (const childId of children) {
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
      traverse(childId, (levelMap[id] ?? level) + 1);
    }
  }

  traverse("PROJECT", 0);

  // Ensure stable ordering of levels across hosts
  const sortedLevels = Object.keys(levelBuckets)
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  const maxLevel = sortedLevels.length > 0 ? Math.max(...sortedLevels) : 0;

  // Build initial per-level order based on parent expansion (not id sorting)
  const orderByLevel: Record<number, string[]> = {};
  for (const level of sortedLevels) {
    const idsRaw = (levelBuckets[level] ?? []).filter(Boolean);

    const prevOrder = level > 0 ? orderByLevel[level - 1] ?? [] : [];
    const initialOrder = buildInitialLevelOrder(level, idsRaw, prevOrder, protocols);

    // Ensure PROJECT stays only at level 0
    orderByLevel[level] =
      level === 0
        ? initialOrder
        : initialOrder.filter((id) => id !== "PROJECT");
  }

  // Barycenter sweeps to keep children close to parents and reduce edge crossings
  const iterations = 2;

  for (let iter = 0; iter < iterations; iter++) {
    // Top-down: reorder by parents in previous layer
    const indexByLevelTop: Record<number, IdIndexMap> = {};
    for (const level of sortedLevels) indexByLevelTop[level] = buildIndexMap(orderByLevel[level] ?? []);

    for (const level of sortedLevels) {
      if (level === 0) continue;

      const prevIndex = indexByLevelTop[level - 1] ?? new Map();
      const current = orderByLevel[level] ?? [];

      orderByLevel[level] = reorderByBarycenter(
        current,
        (id) => parentMap[id] ?? [],
        prevIndex
      );
    }

    // Bottom-up: reorder by children in next layer
    const indexByLevelBottom: Record<number, IdIndexMap> = {};
    for (const level of sortedLevels) indexByLevelBottom[level] = buildIndexMap(orderByLevel[level] ?? []);

    for (let i = sortedLevels.length - 1; i >= 0; i--) {
      const level = sortedLevels[i];
      if (level === maxLevel) continue;

      const nextIndex = indexByLevelBottom[level + 1] ?? new Map();
      const current = orderByLevel[level] ?? [];

      // Keep PROJECT pinned first in level 0
      if (level === 0) {
        const projectFirst = current.includes("PROJECT") ? ["PROJECT"] : [];
        const rest = current.filter((id) => id !== "PROJECT");
        const reorderedRest = reorderByBarycenter(
          rest,
          (id) => getChildrenSorted(protocols, id),
          nextIndex
        );
        orderByLevel[level] = [...projectFirst, ...reorderedRest];
        continue;
      }

      orderByLevel[level] = reorderByBarycenter(
        current,
        (id) => getChildrenSorted(protocols, id),
        nextIndex
      );
    }
  }

  // Build positioned nodes using improved per-level ordering
  for (const level of sortedLevels) {
    const ids = orderByLevel[level] ?? [];
    if (ids.length === 0) continue;

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
