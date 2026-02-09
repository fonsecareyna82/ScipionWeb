// File: src/utils/graph_utils.ts
import { ProtocolNode } from "@/types/protocolNode";
import { title } from "process";
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
 * Estimate node height deterministically (no canvas).
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

export type NodeSizeMap = Record<string, { width: number; height: number }>;

function stableIdCompare(a: string, b: string): number {
  if (a === "PROJECT" && b !== "PROJECT") return -1;
  if (b === "PROJECT" && a !== "PROJECT") return 1;

  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);

  if (aNum && bNum) return na - nb;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;

  return String(a).localeCompare(String(b));
}

function getNodeWidth(
  nodeId: string,
  label: string,
  nodeSizeMap?: NodeSizeMap | null
): number {
  const w = nodeSizeMap?.[nodeId]?.width;
  return typeof w === "number" && w > 0 ? Math.ceil(w) : estimateLabelWidth(label);
}

function getNodeHeight(
  nodeId: string,
  label: string,
  nodeSizeMap?: NodeSizeMap | null
): number {
  const h = nodeSizeMap?.[nodeId]?.height;
  return typeof h === "number" && h > 0 ? Math.ceil(h) : estimateNodeHeight(label);
}

function uniqStable(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const s = String(x);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function getTraversalOrderForGrid(protocols: Record<string, ProtocolNode>): string[] {
  // getTraversalOrderForGrid
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (id: string) => {
    // visit
    if (!id || id === "PROJECT") return;
    if (visited.has(id)) return;
    visited.add(id);
    order.push(id);

    const prot = protocols[id];
    const children = uniqStable(Array.isArray(prot?.children) ? prot.children.map(String) : []);
    for (const childId of children) visit(childId);
  };

  const root = protocols.PROJECT;
  const rootChildren = uniqStable(Array.isArray(root?.children) ? root.children.map(String) : []);
  for (const childId of rootChildren) visit(childId);

  // append disconnected nodes (stable)
  const remaining = Object.keys(protocols)
    .filter((id) => id !== "PROJECT" && !visited.has(id))
    .sort(stableIdCompare);

  return [...order, ...remaining];
}

function computeLevelOrderingByBarycenter(params: {
  sortedLevels: number[];
  levelBuckets: Record<number, string[]>;
  levelMap: Record<string, number>;
  parentMap: Record<string, string[]>;
  protocols: Record<string, ProtocolNode>;
}): Record<number, string[]> {
  // computeLevelOrderingByBarycenter
  const { sortedLevels, levelBuckets, levelMap, parentMap, protocols } = params;

  const levelOrder: Record<number, string[]> = {};

  for (const level of sortedLevels) {
    const raw = uniqStable(levelBuckets[level] ?? []);

    if (level === 0) {
      const onlyProject = raw.includes("PROJECT") ? ["PROJECT"] : ["PROJECT"];
      levelOrder[level] = onlyProject;
      continue;
    }

    const prev = levelOrder[level - 1] ?? uniqStable(levelBuckets[level - 1] ?? []).sort(stableIdCompare);
    const prevIndex = new Map<string, number>();
    prev.forEach((id, idx) => prevIndex.set(id, idx));

    const getChildRankUnderParent = (parentId: string, childId: string): number => {
      // getChildRankUnderParent
      const children = protocols[parentId]?.children;
      if (!Array.isArray(children)) return Number.POSITIVE_INFINITY;
      const idx = children.map(String).indexOf(String(childId));
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    };

    const scored = raw.map((id) => {
      const parentsAll = uniqStable(parentMap[id] ?? []);
      const parentsImmediate = parentsAll.filter((p) => levelMap[p] === level - 1);

      const parents = parentsImmediate.length > 0 ? parentsImmediate : parentsAll;

      const parentIndices = parents
        .map((p) => prevIndex.get(p))
        .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

      const barycenter =
        parentIndices.length > 0
          ? parentIndices.reduce((a, b) => a + b, 0) / parentIndices.length
          : Number.POSITIVE_INFINITY;

      const minParentIndex =
        parentIndices.length > 0 ? Math.min(...parentIndices) : Number.POSITIVE_INFINITY;

      const childRank =
        parents.length > 0
          ? Math.min(...parents.map((p) => getChildRankUnderParent(p, id)))
          : Number.POSITIVE_INFINITY;

      return { id, barycenter, minParentIndex, childRank };
    });

    scored.sort((a, b) => {
      if (a.barycenter !== b.barycenter) return a.barycenter - b.barycenter;
      if (a.minParentIndex !== b.minParentIndex) return a.minParentIndex - b.minParentIndex;
      if (a.childRank !== b.childRank) return a.childRank - b.childRank;
      return stableIdCompare(a.id, b.id);
    });

    levelOrder[level] = scored.map((x) => x.id);
  }

  return levelOrder;
}

function placeLevelNoOverlap(params: {
  ids: string[];
  level: number;
  direction: Direction;
  spacingX: number;
  spacingY: number;
  protocols: Record<string, ProtocolNode>;
  projectName: string;
  nodeSizeMap?: NodeSizeMap | null;
}) {
  // placeLevelNoOverlap
  const { ids, level, direction, spacingX, spacingY, protocols, projectName, nodeSizeMap } = params;

  const gap = direction === "TB" ? spacingX : spacingY;

  const sizes = ids.map((id) => {
    const label = id === "PROJECT" ? projectName : (protocols[id]?.label || id);
    return direction === "TB"
      ? getNodeWidth(id, label, nodeSizeMap)
      : getNodeHeight(id, label, nodeSizeMap);
  });

  // totalSizeWithoutTrailingGap
  const total = sizes.reduce((sum, s) => sum + s, 0) + Math.max(0, ids.length - 1) * gap;

  // cursor is the start of each node box; we output center coordinates
  let cursor = -total / 2;

  const placements: Record<string, { x: number; y: number }> = {};

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const size = sizes[i];
    const center = cursor + size / 2;

    placements[id] =
      direction === "TB"
        ? { x: center, y: level * spacingY }
        : { x: level * spacingX, y: center };

    cursor += size + gap;
  }

  return placements;
}

/**
 * Build nodes and edges for ReactFlow from protocols.
 *
 * Improvements:
 * - Hierarchical ordering within each level uses parent/child relations (barycenter heuristic)
 *   instead of sorting by id, so children stay near their parents.
 * - No-overlap placement packs each level using node widths/heights (optionally measured via nodeSizeMap).
 * - Grid mode can follow traversal order (parents before children) to reduce visual confusion.
 */
export function buildGraphElements(
  projectName: string,
  protocols: Record<string, ProtocolNode>,
  viewMode: "hierarchical" | "grid" | "table" = "hierarchical",
  direction: Direction = "TB",
  containerWidth?: number | null,
  viewportZoom?: number | null,
  nodeSizeMap?: NodeSizeMap | null
) {
  const spacingX = direction === "TB" ? 430 : 1150;
  const spacingY = direction === "TB" ? 580 : 380;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // TABLE view -> only table
  if (viewMode === "table") {
    const sorted = Object.entries(protocols)
      .filter(([id]) => id !== "PROJECT")
      .sort(([idA], [idB]) => stableIdCompare(idA, idB));

    const tableData = sorted.map(([id, prot]) => ({
      id,
      label: prot.label,
      title: prot.title,
      status: prot.status,
      parameters: prot.parameters,
      children: prot.children,
      cpuTime: prot.cpuTime,
      stepsDone: prot.stepsDone,
      numberOfSteps: prot.numberOfSteps,
      elapsedTime: prot.elapsedTime,
      tick: Number(prot.elapsedTime) || 0,
      tags: Array.isArray(prot.tags) ? prot.tags : [],
    }));

    return { nodes: [], edges: [], table: tableData };
  }

  // GRID view -> rows and columns from top-left, no edges
  if (viewMode === "grid") {
    const orderedIds = getTraversalOrderForGrid(protocols);
    const items = orderedIds.map((id) => [id, protocols[id]] as const);

    const total = items.length;
    if (total === 0) return { nodes: [], edges: [] };

    const fallbackW =
      typeof window !== "undefined" && typeof window.innerWidth === "number" ? window.innerWidth : 1600;

    const zoom = typeof viewportZoom === "number" && viewportZoom > 0 ? viewportZoom : 1;
    const screenWidthPx = Math.max(600, containerWidth ?? fallbackW);
    const wrapWorldWidth = screenWidthPx / zoom;

    const estWidths = items.map(([id, prot]) => {
      const label = prot?.label || id;
      return getNodeWidth(id, label, nodeSizeMap);
    });

    const estHeights = items.map(([id, prot]) => {
      const label = prot?.label || id;
      return getNodeHeight(id, label, nodeSizeMap);
    });

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
      Math.max(1, Math.min(total, Math.floor((wrapWorldWidth - gapX) / Math.max(320, cellW))) + 1) || 1;

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
          title: prot?.title,
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
          tags: Array.isArray(prot?.tags) ? prot?.tags : [],
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

  const parentMap: Record<string, string[]> = {};

  const removeFromOtherBuckets = (id: string) => {
    // removeFromOtherBuckets
    Object.values(levelBuckets).forEach((bucket) => {
      const idx = bucket.indexOf(id);
      if (idx !== -1) bucket.splice(idx, 1);
    });
  };

  const addToBucket = (id: string, level: number) => {
    // addToBucket
    if (!levelBuckets[level]) levelBuckets[level] = [];
    levelBuckets[level].push(id);
  };

  const addParentLink = (childId: string, parentId: string) => {
    // addParentLink
    if (!parentMap[childId]) parentMap[childId] = [];
    parentMap[childId].push(parentId);
  };

  const visiting = new Set<string>();

  const traverse = (id: string, level: number) => {
    // traverse
    const currentLevel = levelMap[id];
    if (currentLevel === undefined || level > currentLevel) {
      levelMap[id] = level;
      removeFromOtherBuckets(id);
      addToBucket(id, level);
    }

    if (visiting.has(id)) return;
    visiting.add(id);

    const prot = protocols[id];
    const children = uniqStable(Array.isArray(prot?.children) ? prot.children.map(String) : []);

    for (const childId of children) {
      const edgeId = `${id}-${childId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);

        // parentLinksForOrdering
        addParentLink(childId, id);

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
      } else {
        addParentLink(childId, id);
      }

      const nextLevel = (levelMap[id] ?? level) + 1;
      traverse(childId, nextLevel);
    }

    visiting.delete(id);
  };

  traverse("PROJECT", 0);

  // Ensure stable ordering of levels across hosts
  const sortedLevels = Object.keys(levelBuckets)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  // Ensure buckets do not keep duplicates
  for (const lvl of sortedLevels) levelBuckets[lvl] = uniqStable(levelBuckets[lvl] ?? []);

  // Parent/child-driven ordering per level (works for both TB and LR)
  const levelOrder = computeLevelOrderingByBarycenter({
    sortedLevels,
    levelBuckets,
    levelMap,
    parentMap,
    protocols,
  });

  for (const level of sortedLevels) {
    const idsRaw = levelOrder[level] ?? uniqStable(levelBuckets[level] ?? []);
    const ids =
      idsRaw.length > 0
        ? idsRaw
        : uniqStable(levelBuckets[level] ?? []).sort(stableIdCompare);

    const placements = placeLevelNoOverlap({
      ids,
      level,
      direction,
      spacingX,
      spacingY,
      protocols,
      projectName,
      nodeSizeMap,
    });

    for (const id of ids) {
      const prot = protocols[id];
      const label = prot?.label || id;
      const status = prot?.status;

      const position = placements[id] ?? (direction === "TB" ? { x: 0, y: level * spacingY } : { x: level * spacingX, y: 0 });

      const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
      const targetPosition: Position = direction === "LR" ? Position.Left : Position.Top;

      nodes.push({
        id,
        type: "status",
        data: {
          label: id === "PROJECT" ? projectName : label,
          title: prot?.title,
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
          tags: Array.isArray(prot?.tags) ? prot?.tags : [],
        },
        position,
        draggable: true,
        sourcePosition,
        targetPosition,
      });
    }
  }

  return { nodes, edges };
}
