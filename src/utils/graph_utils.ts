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
type GraphPosition = { x: number; y: number };

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

export function getGraphTopologySignature(protocols: Record<string, ProtocolNode>): string {
  return Object.keys(protocols)
    .sort(stableIdCompare)
    .map((id) => {
      const children = uniqStable(
        Array.isArray(protocols[id]?.children)
          ? protocols[id].children.map(String)
          : []
      );

      return `${id}>${children.join(",")}`;
    })
    .join("|");
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

function getGraphNodeLabel(
  id: string,
  protocols: Record<string, ProtocolNode>,
  projectName: string
): string {
  return id === "PROJECT" ? projectName : protocols[id]?.label || id;
}

function getNodeCrossSize(params: {
  id: string;
  direction: Direction;
  protocols: Record<string, ProtocolNode>;
  projectName: string;
  nodeSizeMap?: NodeSizeMap | null;
}): number {
  const { id, direction, protocols, projectName, nodeSizeMap } = params;
  const label = getGraphNodeLabel(id, protocols, projectName);

  return direction === "TB"
    ? getNodeWidth(id, label, nodeSizeMap)
    : getNodeHeight(id, label, nodeSizeMap);
}

function getNodePackingCrossSize(params: {
  id: string;
  direction: Direction;
  protocols: Record<string, ProtocolNode>;
  projectName: string;
  nodeSizeMap?: NodeSizeMap | null;
}): number {
  const { id, direction, protocols, projectName, nodeSizeMap } = params;
  const label = getGraphNodeLabel(id, protocols, projectName);
  const measuredSize =
    direction === "TB" ? nodeSizeMap?.[id]?.width : nodeSizeMap?.[id]?.height;

  if (typeof measuredSize === "number" && measuredSize > 0) {
    return Math.ceil(measuredSize);
  }

  const estimatedSize =
    direction === "TB" ? estimateLabelWidth(label) : estimateNodeHeight(label);

  return direction === "TB"
    ? Math.max(780, Math.min(1040, estimatedSize))
    : Math.max(280, Math.min(560, estimatedSize));
}

function getChildRankUnderParent(
  protocols: Record<string, ProtocolNode>,
  parentId: string,
  childId: string
): number {
  const children = protocols[parentId]?.children;
  if (!Array.isArray(children)) return Number.POSITIVE_INFINITY;

  const idx = children.map(String).indexOf(String(childId));
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

function compareChildrenByParentOrder(
  protocols: Record<string, ProtocolNode>,
  parentId: string,
  a: string,
  b: string
): number {
  const rankA = getChildRankUnderParent(protocols, parentId, a);
  const rankB = getChildRankUnderParent(protocols, parentId, b);

  if (rankA !== rankB) return rankA - rankB;
  return stableIdCompare(a, b);
}

function selectPrimaryLayoutParent(params: {
  id: string;
  parentMap: Record<string, string[]>;
  levelMap: Record<string, number>;
  protocols: Record<string, ProtocolNode>;
}): string | null {
  const { id, parentMap, levelMap, protocols } = params;
  const childLevel = levelMap[id];
  if (typeof childLevel !== "number") return null;

  const parents = uniqStable(parentMap[id] ?? []).filter((parentId) => {
    const parentLevel = levelMap[parentId];
    return typeof parentLevel === "number" && parentLevel < childLevel;
  });

  if (parents.length === 0) return null;

  parents.sort((a, b) => {
    const levelA = levelMap[a] ?? -1;
    const levelB = levelMap[b] ?? -1;

    const immediateA = levelA === childLevel - 1 ? 0 : 1;
    const immediateB = levelB === childLevel - 1 ? 0 : 1;
    if (immediateA !== immediateB) return immediateA - immediateB;

    if (levelA !== levelB) return levelB - levelA;

    const rankA = getChildRankUnderParent(protocols, a, id);
    const rankB = getChildRankUnderParent(protocols, b, id);
    if (rankA !== rankB) return rankA - rankB;

    return stableIdCompare(a, b);
  });

  return parents[0] ?? null;
}


function getResolvedPlacementCrossSize(params: {
  id: string;
  direction: Direction;
  protocols: Record<string, ProtocolNode>;
  projectName: string;
  nodeSizeMap?: NodeSizeMap | null;
}): number {
  const size = getNodeCrossSize(params);

  return params.direction === "TB"
    ? Math.max(780, Math.min(1040, size))
    : Math.max(280, Math.min(560, size));
}

function buildSubtreeAlignedPlacements(params: {
  levelMap: Record<string, number>;
  parentMap: Record<string, string[]>;
  protocols: Record<string, ProtocolNode>;
  projectName: string;
  direction: Direction;
  spacingX: number;
  spacingY: number;
  nodeSizeMap?: NodeSizeMap | null;
}): Record<string, GraphPosition> {
  const {
    levelMap,
    parentMap,
    protocols,
    projectName,
    direction,
    spacingX,
    spacingY,
    nodeSizeMap,
  } = params;

  const nodeIds = Object.keys(levelMap).sort((a, b) => {
    const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
    return levelDelta !== 0 ? levelDelta : stableIdCompare(a, b);
  });

  const nodeSet = new Set(nodeIds);
  const layoutChildren: Record<string, string[]> = {};
  const assigned = new Set<string>();

  for (const id of nodeIds) {
    if (id === "PROJECT") continue;

    const parentId = selectPrimaryLayoutParent({ id, parentMap, levelMap, protocols });
    if (!parentId || !nodeSet.has(parentId)) continue;

    if (!layoutChildren[parentId]) layoutChildren[parentId] = [];
    if (!layoutChildren[parentId].includes(id)) layoutChildren[parentId].push(id);
    assigned.add(id);
  }

  for (const parentId of Object.keys(layoutChildren)) {
    layoutChildren[parentId] = uniqStable(layoutChildren[parentId]).sort((a, b) =>
      compareChildrenByParentOrder(protocols, parentId, a, b)
    );
  }

  const roots = nodeIds.filter((id) => id === "PROJECT" || !assigned.has(id));
  roots.sort((a, b) => {
    if (a === "PROJECT" && b !== "PROJECT") return -1;
    if (b === "PROJECT" && a !== "PROJECT") return 1;

    const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
    return levelDelta !== 0 ? levelDelta : stableIdCompare(a, b);
  });

  const siblingGap = direction === "TB" ? Math.round(spacingX * 0.45) : Math.round(spacingY * 0.78);
  const rootBranchGap = direction === "TB" ? Math.round(spacingX * 1.8) : Math.round(spacingY * 1.6);
  const disconnectedRootGap = direction === "TB" ? Math.round(spacingX * 1.5) : Math.round(spacingY * 1.25);

  const getChildrenGap = (parentId: string): number => {
    return parentId === "PROJECT" ? rootBranchGap : siblingGap;
  };

  const getRootGap = (leftRootId: string, rightRootId: string): number => {
    return leftRootId === "PROJECT" || rightRootId === "PROJECT"
      ? rootBranchGap
      : disconnectedRootGap;
  };

  const getPairGapTotal = (
    ids: string[],
    getGap: (leftId: string, rightId: string) => number
  ): number => {
    let total = 0;
    for (let i = 1; i < ids.length; i++) {
      total += getGap(ids[i - 1], ids[i]);
    }
    return total;
  };

  const spanMemo = new Map<string, number>();

  const computeSpan = (id: string, stack = new Set<string>()): number => {
    const cached = spanMemo.get(id);
    if (typeof cached === "number") return cached;

    const nodeCrossSize = getNodePackingCrossSize({
      id,
      direction,
      protocols,
      projectName,
      nodeSizeMap,
    });

    if (stack.has(id)) {
      spanMemo.set(id, nodeCrossSize);
      return nodeCrossSize;
    }

    stack.add(id);

    const children = layoutChildren[id] ?? [];
    const childrenGap = getChildrenGap(id);
    const childrenTotal =
      children.length > 0
        ? children.reduce((sum, childId) => sum + computeSpan(childId, stack), 0) +
        Math.max(0, children.length - 1) * childrenGap
        : 0;

    stack.delete(id);

    const span = Math.ceil(Math.max(nodeCrossSize, childrenTotal));
    spanMemo.set(id, span);
    return span;
  };

  const placements: Record<string, GraphPosition> = {};

  const placeNode = (id: string, start: number) => {
    const span = computeSpan(id);
    const center = start + span / 2;
    const level = levelMap[id] ?? 0;

    placements[id] =
      direction === "TB"
        ? { x: center, y: level * spacingY }
        : { x: level * spacingX, y: center };

    const children = layoutChildren[id] ?? [];
    if (children.length === 0) return;

    const childrenGap = getChildrenGap(id);
    const childrenTotal =
      children.reduce((sum, childId) => sum + computeSpan(childId), 0) +
      Math.max(0, children.length - 1) * childrenGap;

    let cursor = start + (span - childrenTotal) / 2;

    for (const childId of children) {
      const childSpan = computeSpan(childId);
      placeNode(childId, cursor);
      cursor += childSpan + childrenGap;
    }
  };

  const rootTotal =
    roots.reduce((sum, rootId) => sum + computeSpan(rootId), 0) +
    getPairGapTotal(roots, getRootGap);

  let cursor = -rootTotal / 2;
  for (let i = 0; i < roots.length; i++) {
    const rootId = roots[i];
    const rootSpan = computeSpan(rootId);
    placeNode(rootId, cursor);
    cursor += rootSpan;

    if (i < roots.length - 1) {
      cursor += getRootGap(rootId, roots[i + 1]);
    }
  }

  const levelIds: Record<number, string[]> = {};

  for (const id of nodeIds) {
    const level = levelMap[id] ?? 0;

    if (!levelIds[level]) {
      levelIds[level] = [];
    }

    levelIds[level].push(id);
  }

  const overlapGap = direction === "TB" ? 220 : 70;

  const getPlacementAxis = (id: string): number => {
    const position = placements[id];
    return direction === "TB" ? position.x : position.y;
  };

  const setPlacementAxis = (id: string, axis: number): void => {
    placements[id] = direction === "TB"
      ? { ...placements[id], x: axis }
      : { ...placements[id], y: axis };
  };

  const getResolvedCrossSize = (id: string): number => {
    return getResolvedPlacementCrossSize({
      id,
      direction,
      protocols,
      projectName,
      nodeSizeMap,
    });
  };

  const getNearestVisibleChildren = (id: string): string[] => {
    const parentLevel = levelMap[id];

    if (typeof parentLevel !== "number") {
      return [];
    }

    const children = uniqStable(
      Array.isArray(protocols[id]?.children)
        ? protocols[id].children.map(String)
        : []
    ).filter((childId) => {
      const childLevel = levelMap[childId];

      return (
        Boolean(placements[childId]) &&
        typeof childLevel === "number" &&
        childLevel > parentLevel
      );
    });

    if (children.length === 0) {
      return [];
    }

    const nearestLevel = Math.min(
      ...children.map((childId) => levelMap[childId] as number)
    );

    return children.filter((childId) => levelMap[childId] === nearestLevel);
  };

  const getDesiredParentAxis = (id: string): number => {
    const currentAxis = getPlacementAxis(id);

    if (id === "PROJECT") {
      let minAxis = Number.POSITIVE_INFINITY;
      let maxAxis = Number.NEGATIVE_INFINITY;

      for (const nodeId of nodeIds) {
        if (nodeId === "PROJECT" || !placements[nodeId]) continue;

        const nodeAxis = getPlacementAxis(nodeId);
        const nodeSize = getResolvedCrossSize(nodeId);

        minAxis = Math.min(minAxis, nodeAxis - nodeSize / 2);
        maxAxis = Math.max(maxAxis, nodeAxis + nodeSize / 2);
      }

      return Number.isFinite(minAxis) && Number.isFinite(maxAxis)
        ? (minAxis + maxAxis) / 2
        : currentAxis;
    }

    const visibleChildren = getNearestVisibleChildren(id);

    if (visibleChildren.length === 0) {
      return currentAxis;
    }

    let minAxis = Number.POSITIVE_INFINITY;
    let maxAxis = Number.NEGATIVE_INFINITY;

    for (const childId of visibleChildren) {
      const childAxis = getPlacementAxis(childId);
      const childSize = getResolvedCrossSize(childId);

      minAxis = Math.min(minAxis, childAxis - childSize / 2);
      maxAxis = Math.max(maxAxis, childAxis + childSize / 2);
    }

    if (!Number.isFinite(minAxis) || !Number.isFinite(maxAxis)) {
      return currentAxis;
    }

    return (minAxis + maxAxis) / 2;
  };

  const levelsDescending = Object.keys(levelIds)
    .map((level) => Number(level))
    .filter((level) => Number.isFinite(level))
    .sort((a, b) => b - a);

  for (const level of levelsDescending) {
    const sorted = (levelIds[level] ?? [])
      .filter((id) => Boolean(placements[id]))
      .sort((a, b) => {
        const axisA = getPlacementAxis(a);
        const axisB = getPlacementAxis(b);

        return axisA !== axisB
          ? axisA - axisB
          : stableIdCompare(a, b);
      });

    if (sorted.length === 0) {
      continue;
    }

    const desiredItems = sorted.map((id) => ({
      id,
      size: getResolvedCrossSize(id),
      desiredCenter: getDesiredParentAxis(id),
    }));

    const desiredLeft = Math.min(
      ...desiredItems.map((item) => item.desiredCenter - item.size / 2)
    );

    const desiredRight = Math.max(
      ...desiredItems.map((item) => item.desiredCenter + item.size / 2)
    );

    const desiredGroupCenter = (desiredLeft + desiredRight) / 2;
    const resolvedCenters = new Map<string, number>();

    let previousRight = Number.NEGATIVE_INFINITY;

    for (const item of desiredItems) {
      const minCenter = previousRight + overlapGap + item.size / 2;
      const resolvedCenter = Math.max(item.desiredCenter, minCenter);

      resolvedCenters.set(item.id, resolvedCenter);
      previousRight = resolvedCenter + item.size / 2;
    }

    const resolvedLeft = Math.min(
      ...desiredItems.map((item) => {
        const center = resolvedCenters.get(item.id) ?? item.desiredCenter;
        return center - item.size / 2;
      })
    );

    const resolvedRight = Math.max(
      ...desiredItems.map((item) => {
        const center = resolvedCenters.get(item.id) ?? item.desiredCenter;
        return center + item.size / 2;
      })
    );

    const resolvedGroupCenter = (resolvedLeft + resolvedRight) / 2;
    const recenterOffset = desiredGroupCenter - resolvedGroupCenter;

    for (const item of desiredItems) {
      const resolvedCenter = resolvedCenters.get(item.id) ?? item.desiredCenter;
      setPlacementAxis(item.id, resolvedCenter + recenterOffset);
    }
  }

  return placements;
}

/**
 * Build nodes and edges for ReactFlow from protocols.
 *
 * Improvements:
 * - Hierarchical mode uses a subtree-aligned layout so children stay grouped around
 *   their primary visual parent while preserving all real workflow edges.
 * - Root-level branches use a larger visual gap so independent subgraphs remain readable.
 * - Secondary parents are aligned over the nearest visible layer of their real children.
 * - Same-level nodes are compacted after child-aware alignment without breaking subtree grouping.
 * - Grid mode can follow traversal order (parents before children) to reduce visual confusion.
 * - Layout uses deterministic size estimates and optional measured node dimensions.
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
  const spacingX = direction === "TB" ? 480 : 1250;
  const spacingY = direction === "TB" ? 680 : 480;

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
      runName: prot.runName,
      comment: prot.comment,
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

    const gapX = 720;
    const gapY = 300;

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
          runName: prot?.runName,
          comment: prot?.comment,
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
        draggable: id !== "PROJECT",
        sourcePosition,
        targetPosition,
      });
    }

    return { nodes, edges: [] };
  }

  // HIERARCHICAL view -> subtree-aligned layout with all real edges preserved
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

  const sortedLevels = Object.keys(levelBuckets)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const lvl of sortedLevels) {
    levelBuckets[lvl] = uniqStable(levelBuckets[lvl] ?? []);
  }

  const placements = buildSubtreeAlignedPlacements({
    levelMap,
    parentMap,
    protocols,
    projectName,
    direction,
    spacingX,
    spacingY,
    nodeSizeMap,
  });

  const nodeIds = Object.keys(levelMap).sort((a, b) => {
    const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
    return levelDelta !== 0 ? levelDelta : stableIdCompare(a, b);
  });

  for (const id of nodeIds) {
    const prot = protocols[id];
    const label = prot?.label || id;
    const status = prot?.status;
    const runName = prot?.runName || "";
    const comment = prot?.comment || "";
    const level = levelMap[id] ?? 0;

    const position =
      placements[id] ??
      (direction === "TB" ? { x: 0, y: level * spacingY } : { x: level * spacingX, y: 0 });

    const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
    const targetPosition: Position = direction === "LR" ? Position.Left : Position.Top;

    nodes.push({
      id,
      type: "status",
      data: {
        label: id === "PROJECT" ? projectName : label,
        title: prot?.title,
        status,
        runName,
        comment,
        id,
        parameters: prot?.parameters,
        cpuTime: prot?.cpuTime,
        elapsedTime: prot?.elapsedTime,
        stepsDone: prot?.stepsDone,
        numberOfSteps: prot?.numberOfSteps,
        outputs: prot?.outputs,
        inputs: prot?.inputs,
        tick: Number(prot?.elapsedTime) || 0,
        tags: Array.isArray(prot?.tags) ? prot.tags : [],
      },
      position,
      draggable: true,
      sourcePosition,
      targetPosition,
    });
  }

  return { nodes, edges };
}
