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

/** Free space kept between a level's largest node and the next level. */
const MIN_LEVEL_GAP = 160;

// Grid view (world units; the grid is shown zoomed out).
const GRID_CARD_WIDTH = 950;
const GRID_GAP_X = 300;
const GRID_GAP_Y = 200;
const GRID_MARGIN = 100;
// Sub-workflows start on a new row, further apart than rows of one.
const GRID_SECTION_GAP = 560;
// Output lists scroll, so a card does not grow without bounds.
const GRID_MAX_ESTIMATED_HEIGHT = 720;
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

/** A sub-workflow of the grid: its protocols, each after all its parents. */
export type GridSection = { id: string; title: string; ids: string[] };

/**
 * Grid order: one section per sub-workflow (protocols connected among
 * themselves), in creation order; inside, protocols by level (each one after
 * all its parents, e.g. import, alignment, CTF, picking...), then creation order.
 */
export function getGridSections(protocols: Record<string, ProtocolNode>): GridSection[] {
  const ids = Object.keys(protocols).filter((id) => id !== "PROJECT").sort(stableIdCompare);
  const known = new Set(ids);
  const childrenOf = (id: string) =>
    uniqStable(Array.isArray(protocols[id]?.children) ? protocols[id].children.map(String) : [])
      .filter((childId) => known.has(childId));

  // Levels: longest path from the protocols without parents (cycles ignored).
  const level = new Map<string, number>();
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const postOrder: string[] = [];
  const visit = (id: string) => {
    visited.add(id);
    onStack.add(id);
    for (const childId of childrenOf(id)) if (!visited.has(childId)) visit(childId);
    onStack.delete(id);
    postOrder.push(id);
  };
  const hasParent = new Set(ids.flatMap(childrenOf));
  for (const id of [...ids.filter((id) => !hasParent.has(id)), ...ids]) {
    if (!visited.has(id)) visit(id);
  }
  const position = new Map(postOrder.map((id, index) => [id, index]));
  for (const id of [...postOrder].reverse()) {
    const current = level.get(id) ?? 0;
    level.set(id, current);
    for (const childId of childrenOf(id)) {
      // Only forward edges order levels (a back edge closes a cycle).
      if ((position.get(childId) ?? 0) < (position.get(id) ?? 0)) {
        level.set(childId, Math.max(level.get(childId) ?? 0, current + 1));
      }
    }
  }

  // Sub-workflows: connected protocols.
  const neighbours = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const id of ids) {
    for (const childId of childrenOf(id)) {
      neighbours.get(id)!.add(childId);
      neighbours.get(childId)!.add(id);
    }
  }
  const sections: GridSection[] = [];
  const assigned = new Set<string>();
  for (const start of ids) {
    if (assigned.has(start)) continue;
    const members: string[] = [];
    const pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      if (assigned.has(id)) continue;
      assigned.add(id);
      members.push(id);
      for (const other of neighbours.get(id) ?? []) if (!assigned.has(other)) pending.push(other);
    }
    members.sort((a, b) => ((level.get(a) ?? 0) - (level.get(b) ?? 0)) || stableIdCompare(a, b));
    const first = members[0];
    sections.push({ id: first, title: protocols[first]?.label || first, ids: members });
  }
  return sections;
}

function getGraphNodeLabel(
  id: string,
  protocols: Record<string, ProtocolNode>,
  projectName: string
): string {
  return id === "PROJECT" ? projectName : protocols[id]?.label || id;
}

function getProtocolOutputsCount(
  id: string,
  protocols: Record<string, ProtocolNode>
): number {
  if (id === "PROJECT") return 0;

  const rawOutputs = (protocols[id] as any)?.outputs;

  if (Array.isArray(rawOutputs)) {
    return rawOutputs.length;
  }

  if (rawOutputs && typeof rawOutputs === "object") {
    return Object.keys(rawOutputs).length;
  }

  return 0;
}

function getEstimatedGraphNodeHeight(params: {
  id: string;
  protocols: Record<string, ProtocolNode>;
  projectName: string;
  nodeSizeMap?: NodeSizeMap | null;
}): number {
  const { id, protocols, projectName, nodeSizeMap } = params;

  const measuredHeight = nodeSizeMap?.[id]?.height;
  if (typeof measuredHeight === "number" && measuredHeight > 0) {
    return Math.ceil(measuredHeight);
  }

  const label = getGraphNodeLabel(id, protocols, projectName);
  const baseHeight = estimateNodeHeight(label);
  const outputsCount = getProtocolOutputsCount(id, protocols);

  const extraOutputsHeight = Math.max(0, outputsCount) * 32;

  return baseHeight + extraOutputsHeight;
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
    : getEstimatedGraphNodeHeight({
      id,
      protocols,
      projectName,
      nodeSizeMap,
    });
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
    direction === "TB"
      ? estimateLabelWidth(label)
      : getEstimatedGraphNodeHeight({
        id,
        protocols,
        projectName,
        nodeSizeMap,
      });

  return direction === "TB"
    ? 950
    : Math.max(520, Math.min(680, estimatedSize));
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
    ? Math.max(950, size)
    : Math.max(520, size);
}

/** Each protocol under its primary parent: the tree the layout packs. */
function buildLayoutChildren(params: {
  levelMap: Record<string, number>;
  parentMap: Record<string, string[]>;
  protocols: Record<string, ProtocolNode>;
}): Record<string, string[]> {
  const { levelMap, parentMap, protocols } = params;
  const nodeIds = Object.keys(levelMap).sort((a, b) => {
    const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
    return levelDelta !== 0 ? levelDelta : stableIdCompare(a, b);
  });
  const nodeSet = new Set(nodeIds);
  const layoutChildren: Record<string, string[]> = {};

  for (const id of nodeIds) {
    if (id === "PROJECT") continue;

    const parentId = selectPrimaryLayoutParent({ id, parentMap, levelMap, protocols });
    if (!parentId || !nodeSet.has(parentId)) continue;

    if (!layoutChildren[parentId]) layoutChildren[parentId] = [];
    if (!layoutChildren[parentId].includes(id)) layoutChildren[parentId].push(id);
  }
  return layoutChildren;
}

type PlacementParams = Parameters<typeof buildSubtreeAlignedPlacements>[0];

/** Workflow edges (not the ones from PROJECT) that cross, drawn as straight lines. */
export function countEdgeCrossings(
  links: Array<[string, string]>,
  placements: Record<string, GraphPosition>,
): number {
  const segments = links
    .filter(([source, target]) => source !== "PROJECT" && placements[source] && placements[target])
    .map(([source, target]) => ({ source, target, a: placements[source], b: placements[target] }));
  const side = (p: GraphPosition, q: GraphPosition, r: GraphPosition) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s1 = segments[i];
      const s2 = segments[j];
      // Edges that share a protocol meet there; that is not a crossing.
      if (s1.source === s2.source || s1.source === s2.target ||
        s1.target === s2.source || s1.target === s2.target) continue;
      if (side(s1.a, s1.b, s2.a) * side(s1.a, s1.b, s2.b) < 0 &&
        side(s2.a, s2.b, s1.a) * side(s2.a, s2.b, s1.b) < 0) crossings++;
    }
  }
  return crossings;
}

const MAX_CROSSING_PASSES = 6;
// Layouts tried when swapping neighbouring siblings (a count, not a time: the
// result must not depend on the machine).
const MAX_SWAP_ATTEMPTS = 120;
// Counting crossings compares every pair of edges; beyond this it is skipped.
const MAX_EDGES_FOR_CROSSING_REDUCTION = 1500;

/**
 * The subtree-aligned layout with fewer edge crossings: siblings (and the
 * branches under PROJECT) are reordered by the barycenter of their other
 * connections (secondary parents, or children placed under another branch),
 * for a few passes, keeping the best layout. Subtrees stay packed and primary
 * chains straight, since only sibling order changes. A preferred order given
 * by the caller (e.g. the order already on screen) is kept as is.
 */
function buildPlacementsWithFewerCrossings(params: PlacementParams): Record<string, GraphPosition> {
  const { levelMap, parentMap, protocols, direction } = params;
  const userOrder = params.preferredChildOrder ?? {};
  let best = buildSubtreeAlignedPlacements(params);

  const links: Array<[string, string]> = [];
  for (const [childId, parents] of Object.entries(parentMap)) {
    for (const parentId of uniqStable(parents)) links.push([parentId, childId]);
  }
  if (links.length > MAX_EDGES_FOR_CROSSING_REDUCTION) return best;
  const layoutChildren = buildLayoutChildren({ levelMap, parentMap, protocols });
  // The caller already fixes every order (e.g. a refresh keeps the screen's).
  if (Object.entries(layoutChildren).every(([id, children]) => children.length < 2 || userOrder[id]?.length)) {
    return best;
  }
  let bestCrossings = countEdgeCrossings(links, best);
  if (bestCrossings === 0) return best;

  const subtrees = new Map<string, Set<string>>();
  const subtreeOf = (id: string): Set<string> => {
    const cached = subtrees.get(id);
    if (cached) return cached;
    const members = new Set<string>([id]);
    subtrees.set(id, members);
    for (const childId of layoutChildren[id] ?? []) {
      for (const member of subtreeOf(childId)) members.add(member);
    }
    return members;
  };
  const realChildren = (id: string) =>
    uniqStable(Array.isArray(protocols[id]?.children) ? protocols[id].children.map(String) : []);
  const axis = (placements: Record<string, GraphPosition>, id: string) =>
    direction === "TB" ? placements[id]?.x ?? 0 : placements[id]?.y ?? 0;

  for (let pass = 0; pass < MAX_CROSSING_PASSES; pass++) {
    const order: Record<string, string[]> = {};
    for (const [parentId, children] of Object.entries(layoutChildren)) {
      if (userOrder[parentId]?.length) continue;
      const current = [...children].sort((a, b) => axis(best, a) - axis(best, b));
      const keyed = current.map((childId, index) => {
        const members = subtreeOf(childId);
        const outside: number[] = [];
        for (const member of members) {
          for (const other of [...(parentMap[member] ?? []), ...realChildren(member)]) {
            if (other === "PROJECT" || members.has(other) || other === parentId || !best[other]) continue;
            outside.push(axis(best, other));
          }
        }
        const key = outside.length
          ? outside.reduce((sum, value) => sum + value, 0) / outside.length
          : axis(best, childId);
        return { childId, index, key };
      });
      keyed.sort((a, b) => (a.key - b.key) || (a.index - b.index));
      order[parentId] = keyed.map((entry) => entry.childId);
    }
    const candidate = buildSubtreeAlignedPlacements({
      ...params, preferredChildOrder: { ...order, ...userOrder },
    });
    const crossings = countEdgeCrossings(links, candidate);
    if (crossings >= bestCrossings) break;
    best = candidate;
    bestCrossings = crossings;
    if (crossings === 0) return best;
  }

  // Then swap neighbouring siblings while that removes crossings.
  const order: Record<string, string[]> = {};
  for (const [parentId, children] of Object.entries(layoutChildren)) {
    if (userOrder[parentId]?.length || children.length < 2) continue;
    order[parentId] = [...children].sort((a, b) => axis(best, a) - axis(best, b));
  }
  const parents = Object.keys(order).sort((a, b) =>
    ((levelMap[a] ?? 0) - (levelMap[b] ?? 0)) || stableIdCompare(a, b));
  let attempts = 0;
  let improved = true;
  while (improved && attempts < MAX_SWAP_ATTEMPTS && bestCrossings > 0) {
    improved = false;
    for (const parentId of parents) {
      const children = order[parentId];
      for (let i = 0; i + 1 < children.length && attempts < MAX_SWAP_ATTEMPTS; i++) {
        const swapped = [...children];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        attempts++;
        const candidate = buildSubtreeAlignedPlacements({
          ...params, preferredChildOrder: { ...order, [parentId]: swapped, ...userOrder },
        });
        const crossings = countEdgeCrossings(links, candidate);
        if (crossings < bestCrossings) {
          order[parentId] = swapped;
          best = candidate;
          bestCrossings = crossings;
          improved = true;
          break;
        }
      }
    }
  }
  return best;
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
  preferredChildOrder?: Record<string, string[]> | null;
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
    preferredChildOrder,
  } = params;

  const nodeIds = Object.keys(levelMap).sort((a, b) => {
    const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
    return levelDelta !== 0 ? levelDelta : stableIdCompare(a, b);
  });

  const layoutChildren = buildLayoutChildren({ levelMap, parentMap, protocols });
  const assigned = new Set(Object.values(layoutChildren).flat());

  for (const parentId of Object.keys(layoutChildren)) {
    const preferredOrder = preferredChildOrder?.[parentId] ?? [];
    const preferredRank = new Map(preferredOrder.map((id, index) => [String(id), index]));

    layoutChildren[parentId] = uniqStable(layoutChildren[parentId]).sort((a, b) => {
      if (preferredOrder.length > 0) {
        const rankA = preferredRank.get(a);
        const rankB = preferredRank.get(b);

        if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
        if (rankA !== undefined) return -1;
        if (rankB !== undefined) return 1;

        return stableIdCompare(a, b);
      }

      return compareChildrenByParentOrder(protocols, parentId, a, b);
    });
  }

  const roots = nodeIds.filter((id) => id === "PROJECT" || !assigned.has(id));
  roots.sort((a, b) => {
    if (a === "PROJECT" && b !== "PROJECT") return -1;
    if (b === "PROJECT" && a !== "PROJECT") return 1;

    const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
    return levelDelta !== 0 ? levelDelta : stableIdCompare(a, b);
  });

  const siblingGap = direction === "TB" ? 260 : 220;
  const rootBranchGap = direction === "TB" ? 320 : 120;
  const disconnectedRootGap = direction === "TB" ? 360 : 150;
  const subworkflowGap = direction === "TB" ? 720 : 360;

  const getChildrenGap = (parentId: string): number => {
    return parentId === "PROJECT" ? rootBranchGap : siblingGap;
  };

  const getRootGap = (leftRootId: string, rightRootId: string): number => {
    return leftRootId === "PROJECT" || rightRootId === "PROJECT"
      ? rootBranchGap
      : disconnectedRootGap;
  };

  // Contour-based packing (Reingold-Tilford): a subtree is described per level
  // by the extent its nodes occupy, relative to its root; siblings are put as
  // close as the level where they would collide allows, not their full widths.
  type Contour = Map<number, [number, number]>;
  const crossSizeOf = (id: string) => getNodePackingCrossSize({ id, direction, protocols, projectName, nodeSizeMap });
  const relativeAxis: Record<string, number> = {};
  const contours = new Map<string, Contour>();

  const widen = (contour: Contour, level: number, low: number, high: number) => {
    const current = contour.get(level);
    contour.set(level, current ? [Math.min(current[0], low), Math.max(current[1], high)] : [low, high]);
  };

  // Offset that puts `right` beside `left` with `gap` on every shared level.
  const separation = (left: Contour, right: Contour, gap: number): number => {
    let offset = Number.NEGATIVE_INFINITY;
    for (const [level, [low]] of right) {
      const other = left.get(level);
      if (other) offset = Math.max(offset, other[1] + gap - low);
    }
    return Number.isFinite(offset) ? offset : 0;
  };

  const shifted = (contour: Contour, offset: number): Contour =>
    new Map([...contour].map(([level, [low, high]]) => [level, [low + offset, high + offset] as [number, number]]));

  // Lay out a row of subtrees left to right; returns their centers and joint contour.
  const packRow = (ids: string[], gapBetween: (left: string, right: string) => number) => {
    const centers: number[] = [];
    const joint: Contour = new Map();
    ids.forEach((id, index) => {
      const contour = contourOf(id);
      const offset = index === 0 ? 0 : separation(joint, contour, gapBetween(ids[index - 1], id));
      centers.push(offset);
      for (const [level, [low, high]] of shifted(contour, offset)) widen(joint, level, low, high);
    });
    return { centers, joint };
  };

  const building = new Set<string>();
  function contourOf(id: string): Contour {
    const cached = contours.get(id);
    if (cached) return cached;
    const level = levelMap[id] ?? 0;
    const half = crossSizeOf(id) / 2;
    const contour: Contour = new Map([[level, [-half, half]]]);
    const children = building.has(id) ? [] : layoutChildren[id] ?? [];
    building.add(id);
    if (children.length) {
      const gap = getChildrenGap(id);
      const { centers, joint } = packRow(children, () => gap);
      // The parent sits over the middle of its first and last child.
      const middle = (centers[0] + centers[centers.length - 1]) / 2;
      children.forEach((childId, index) => { relativeAxis[childId] = centers[index] - middle; });
      for (const [childLevel, [low, high]] of shifted(joint, -middle)) widen(contour, childLevel, low, high);
      // An edge that skips levels needs its corridor free on the levels between.
      children.forEach((childId) => {
        const childLevel = levelMap[childId] ?? level + 1;
        const childHalf = crossSizeOf(childId) / 2;
        for (let between = level + 1; between < childLevel; between++) {
          widen(contour, between, relativeAxis[childId] - childHalf, relativeAxis[childId] + childHalf);
        }
      });
    }
    building.delete(id);
    contours.set(id, contour);
    return contour;
  }

  const placements: Record<string, GraphPosition> = {};

  // Each level starts after the tallest (TB) or widest (LR) node of the one
  // before, and never closer than the usual spacing.
  const levelSpacing = direction === "TB" ? spacingY : spacingX;
  const maxLevel = Math.max(0, ...Object.values(levelMap));
  const levelExtent: number[] = Array(maxLevel + 1).fill(0);
  for (const id of nodeIds) {
    const size = direction === "TB"
      ? getEstimatedGraphNodeHeight({ id, protocols, projectName, nodeSizeMap })
      : getNodeWidth(id, getGraphNodeLabel(id, protocols, projectName), nodeSizeMap);
    const level = levelMap[id] ?? 0;
    levelExtent[level] = Math.max(levelExtent[level], size);
  }
  const levelOffset: number[] = [0];
  for (let level = 1; level <= maxLevel; level++) {
    levelOffset[level] = levelOffset[level - 1] +
      Math.max(levelSpacing, levelExtent[level - 1] + MIN_LEVEL_GAP);
  }

  const placeSubtree = (id: string, axis: number) => {
    const level = levelMap[id] ?? 0;
    placements[id] =
      direction === "TB"
        ? { x: axis, y: levelOffset[level] ?? level * spacingY }
        : { x: levelOffset[level] ?? level * spacingX, y: axis };
    for (const childId of layoutChildren[id] ?? []) {
      if (!placements[childId]) placeSubtree(childId, axis + (relativeAxis[childId] ?? 0));
    }
  };

  // Roots (PROJECT and protocols without a placed parent) side by side, centered on 0.
  const rootRow = packRow(roots, getRootGap);
  const rootMiddle = rootRow.centers.length
    ? (rootRow.centers[0] + rootRow.centers[rootRow.centers.length - 1]) / 2 : 0;
  roots.forEach((rootId, index) => placeSubtree(rootId, rootRow.centers[index] - rootMiddle));

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
    return getResolvedPlacementCrossSize({ id, direction, protocols, projectName, nodeSizeMap });
  };

  const getNearestRealChildren = (id: string): string[] => {
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

      return Boolean(placements[childId]) &&
        typeof childLevel === "number" &&
        childLevel > parentLevel;
    });

    if (children.length === 0) {
      return [];
    }

    const nearestLevel = Math.min(...children.map((childId) => levelMap[childId] as number));

    return children.filter((childId) => levelMap[childId] === nearestLevel);
  };

  const getChildrenCenterAxis = (children: string[]): number | null => {
    let minAxis = Number.POSITIVE_INFINITY;
    let maxAxis = Number.NEGATIVE_INFINITY;

    for (const childId of children) {
      const childAxis = getPlacementAxis(childId);
      const childSize = getResolvedCrossSize(childId);

      minAxis = Math.min(minAxis, childAxis - childSize / 2);
      maxAxis = Math.max(maxAxis, childAxis + childSize / 2);
    }

    if (!Number.isFinite(minAxis) || !Number.isFinite(maxAxis)) {
      return null;
    }

    return (minAxis + maxAxis) / 2;
  };

  const levelIds: Record<number, string[]> = {};

  for (const id of nodeIds) {
    const level = levelMap[id] ?? 0;

    if (!levelIds[level]) {
      levelIds[level] = [];
    }

    levelIds[level].push(id);
  }

  const parentAlignmentGap = direction === "TB" ? 360 : 240;

  const levelsDescending = Object.keys(levelIds).map(Number).filter(Number.isFinite).sort((a, b) => b - a);

  for (const level of levelsDescending) {
    const idsInLevel = (levelIds[level] ?? []).filter(
      (id) => id !== "PROJECT" && Boolean(placements[id])
    );

    if (direction === "TB") {
      const movableItems = idsInLevel
        .filter((id) => (layoutChildren[id] ?? []).length === 0)
        .map((id) => {
          const realChildren = getNearestRealChildren(id);
          const childrenAxis = getChildrenCenterAxis(realChildren);
          const currentAxis = getPlacementAxis(id);

          return {
            id,
            size: getResolvedCrossSize(id),
            currentAxis,
            desiredAxis: childrenAxis ?? currentAxis,
            alignsToChildren: childrenAxis !== null,
          };
        })
        .filter(
          (item) =>
            item.alignsToChildren &&
            Math.abs(item.desiredAxis - item.currentAxis) > 0.5
        );

      if (movableItems.length === 0) {
        continue;
      }

      const movableIds = new Set(
        movableItems.map((item) => item.id)
      );

      const occupied = idsInLevel
        .filter((id) => !movableIds.has(id))
        .map((id) => ({
          id,
          axis: getPlacementAxis(id),
          size: getResolvedCrossSize(id),
        }));

      movableItems.sort((a, b) => {
        if (a.desiredAxis !== b.desiredAxis) {
          return a.desiredAxis - b.desiredAxis;
        }

        return stableIdCompare(a.id, b.id);
      });

      for (const item of movableItems) {
        const candidateAxes = [
          item.desiredAxis,
        ];

        for (const obstacle of occupied) {
          const separation =
            obstacle.size / 2 +
            siblingGap +
            item.size / 2;

          candidateAxes.push(
            obstacle.axis - separation,
            obstacle.axis + separation
          );
        }

        candidateAxes.sort((a, b) => {
          const desiredDistanceA =
            Math.abs(a - item.desiredAxis);

          const desiredDistanceB =
            Math.abs(b - item.desiredAxis);

          if (desiredDistanceA !== desiredDistanceB) {
            return desiredDistanceA - desiredDistanceB;
          }

          const currentDistanceA =
            Math.abs(a - item.currentAxis);

          const currentDistanceB =
            Math.abs(b - item.currentAxis);

          if (currentDistanceA !== currentDistanceB) {
            return currentDistanceA - currentDistanceB;
          }

          return a - b;
        });

        const resolvedAxis =
          candidateAxes.find((candidateAxis) => {
            return !occupied.some((obstacle) => {
              const minimumDistance =
                obstacle.size / 2 +
                siblingGap +
                item.size / 2;

              return (
                Math.abs(
                  candidateAxis -
                  obstacle.axis
                ) <
                minimumDistance
              );
            });
          }) ?? item.currentAxis;

        setPlacementAxis(
          item.id,
          resolvedAxis
        );

        occupied.push({
          id: item.id,
          axis: resolvedAxis,
          size: item.size,
        });
      }

      continue;
    }

    const items = idsInLevel.map((id) => {
      const realChildren = getNearestRealChildren(id);
      const childrenAxis = getChildrenCenterAxis(realChildren);
      const currentAxis = getPlacementAxis(id);

      return {
        id,
        size: getResolvedCrossSize(id),
        currentAxis,
        desiredAxis: childrenAxis ?? currentAxis,
        alignsToChildren: childrenAxis !== null,
      };
    });

    const needsAlignment = items.some(
      (item) =>
        item.alignsToChildren &&
        Math.abs(item.desiredAxis - item.currentAxis) > 0.5
    );

    if (!needsAlignment) {
      continue;
    }

    items.sort((a, b) => {
      if (a.desiredAxis !== b.desiredAxis) {
        return a.desiredAxis - b.desiredAxis;
      }

      return stableIdCompare(a.id, b.id);
    });

    const resolvedAxes = new Map<string, number>();
    let previousRight = Number.NEGATIVE_INFINITY;

    for (const item of items) {
      const minCenter =
        previousRight +
        parentAlignmentGap +
        item.size / 2;

      const resolvedAxis = Math.max(
        item.desiredAxis,
        minCenter
      );

      resolvedAxes.set(
        item.id,
        resolvedAxis
      );

      previousRight =
        resolvedAxis +
        item.size / 2;
    }

    const desiredLeft = Math.min(
      ...items.map(
        (item) =>
          item.desiredAxis -
          item.size / 2
      )
    );

    const desiredRight = Math.max(
      ...items.map(
        (item) =>
          item.desiredAxis +
          item.size / 2
      )
    );

    const resolvedLeft = Math.min(
      ...items.map(
        (item) =>
          (resolvedAxes.get(item.id) ?? item.desiredAxis) -
          item.size / 2
      )
    );

    const resolvedRight = Math.max(
      ...items.map(
        (item) =>
          (resolvedAxes.get(item.id) ?? item.desiredAxis) +
          item.size / 2
      )
    );

    const desiredGroupCenter =
      (desiredLeft + desiredRight) / 2;

    const resolvedGroupCenter =
      (resolvedLeft + resolvedRight) / 2;

    const recenterOffset =
      desiredGroupCenter -
      resolvedGroupCenter;

    for (const item of items) {
      const resolvedAxis =
        resolvedAxes.get(item.id) ??
        item.desiredAxis;

      setPlacementAxis(
        item.id,
        resolvedAxis + recenterOffset
      );
    }
  }

  if (direction === "TB") {
    const wouldOverlapAtAxis = (id: string, axis: number): boolean => {
      const level = levelMap[id] ?? 0;
      const size = getResolvedCrossSize(id);

      return (levelIds[level] ?? []).some((otherId) => {
        if (otherId === id || !placements[otherId]) return false;

        const otherAxis = getPlacementAxis(otherId);
        const otherSize = getResolvedCrossSize(otherId);
        const minimumDistance = size / 2 + siblingGap + otherSize / 2;

        return Math.abs(axis - otherAxis) < minimumDistance;
      });
    };

    const parentIds = Object.keys(layoutChildren)
      .filter((id) => id !== "PROJECT" && Boolean(placements[id]))
      .sort((a, b) => {
        const levelDelta = (levelMap[a] ?? 0) - (levelMap[b] ?? 0);
        if (levelDelta !== 0) return levelDelta;

        const axisDelta = getPlacementAxis(a) - getPlacementAxis(b);
        if (axisDelta !== 0) return axisDelta;

        return stableIdCompare(a, b);
      });

    for (const parentId of parentIds) {
      const childIds = (layoutChildren[parentId] ?? []).filter((childId) => Boolean(placements[childId]));
      if (childIds.length === 0) continue;

      let desiredAxis: number;

      if (childIds.length === 1) {
        desiredAxis = getPlacementAxis(childIds[0]);
      } else {
        const middleIndex = Math.floor(childIds.length / 2);

        if (childIds.length % 2 === 1) {
          desiredAxis = getPlacementAxis(childIds[middleIndex]);
        } else {
          const leftMiddleAxis = getPlacementAxis(childIds[middleIndex - 1]);
          const rightMiddleAxis = getPlacementAxis(childIds[middleIndex]);
          desiredAxis = (leftMiddleAxis + rightMiddleAxis) / 2;
        }
      }

      if (!wouldOverlapAtAxis(parentId, desiredAxis)) {
        setPlacementAxis(parentId, desiredAxis);
      }
    }
  }


  // Sub-workflows (protocols connected among themselves) in bands of their
  // own, further apart than branches of one sub-workflow, so they stand out.
  {
    const protocolIds = nodeIds.filter((id) => id !== "PROJECT" && Boolean(placements[id]));
    const adjacency = new Map<string, Set<string>>();

    for (const id of protocolIds) {
      adjacency.set(id, new Set());
    }

    for (const childId of protocolIds) {
      for (const parentId of parentMap[childId] ?? []) {
        if (parentId === "PROJECT" || !placements[parentId]) continue;

        adjacency.get(childId)?.add(parentId);
        adjacency.get(parentId)?.add(childId);
      }
    }

    const components: string[][] = [];
    const visited = new Set<string>();

    const orderedProtocolIds = [...protocolIds].sort((a, b) => {
      const axisDelta = getPlacementAxis(a) - getPlacementAxis(b);
      return axisDelta !== 0 ? axisDelta : stableIdCompare(a, b);
    });

    for (const startId of orderedProtocolIds) {
      if (visited.has(startId)) continue;

      const component: string[] = [];
      const pending = [startId];

      while (pending.length > 0) {
        const currentId = pending.pop();

        if (!currentId || visited.has(currentId)) continue;

        visited.add(currentId);
        component.push(currentId);

        for (const neighborId of adjacency.get(currentId) ?? []) {
          if (!visited.has(neighborId)) {
            pending.push(neighborId);
          }
        }
      }

      if (component.length > 0) {
        components.push(component);
      }
    }

    const componentBlocks = components
      .map((ids) => {
        let left = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;

        for (const id of ids) {
          const axis = getPlacementAxis(id);
          const size = getResolvedCrossSize(id);

          left = Math.min(left, axis - size / 2);
          right = Math.max(right, axis + size / 2);
        }

        return { ids, left, right };
      })
      .filter((block) => Number.isFinite(block.left) && Number.isFinite(block.right))
      .sort((a, b) => a.left - b.left);

    let previousRight = Number.NEGATIVE_INFINITY;

    for (const block of componentBlocks) {
      const offset = Number.isFinite(previousRight)
        ? Math.max(0, previousRight + subworkflowGap - block.left)
        : 0;

      if (offset > 0.5) {
        for (const id of block.ids) {
          setPlacementAxis(id, getPlacementAxis(id) + offset);
        }
      }

      previousRight = block.right + offset;
    }
  }

  if (placements.PROJECT) {
    let minGraphAxis =
      Number.POSITIVE_INFINITY;

    let maxGraphAxis =
      Number.NEGATIVE_INFINITY;

    for (const id of nodeIds) {
      if (
        id === "PROJECT" ||
        !placements[id]
      ) {
        continue;
      }

      const nodeAxis =
        getPlacementAxis(id);

      const nodeSize =
        getResolvedCrossSize(id);

      minGraphAxis = Math.min(
        minGraphAxis,
        nodeAxis - nodeSize / 2
      );

      maxGraphAxis = Math.max(
        maxGraphAxis,
        nodeAxis + nodeSize / 2
      );
    }

    if (
      Number.isFinite(minGraphAxis) &&
      Number.isFinite(maxGraphAxis)
    ) {
      setPlacementAxis(
        "PROJECT",
        (minGraphAxis + maxGraphAxis) / 2
      );
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
 * - TB connected workflow components occupy separate horizontal bands.
 * - Multi-root DAGs stay inside the same component instead of being split into artificial subgraphs.
 * - TB parent centering is collision-safe and never reintroduces node overlaps.
 * - Primary subtrees preserve their compact span-based placement.
 * - TB keeps primary parent-child chains on a stable vertical trunk.
 * - Secondary-only TB parents may align toward their nearest real children.
 * - LR keeps parents centered over the nearest visible layer of their real children.
 * - Parent-level collisions are resolved without moving descendant subtrees.
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
  nodeSizeMap?: NodeSizeMap | null,
  layoutOptions?: {
    preferredChildOrder?: Record<string, string[]> | null;
  }
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

      parents: Array.isArray(prot.parents)
        ? prot.parents
        : [],

      children: Array.isArray(prot.children)
        ? prot.children
        : [],

      outputs: Array.isArray(prot.outputs)
        ? prot.outputs
        : [],

      cpuTime: prot.cpuTime,
      stepsDone: prot.stepsDone,
      numberOfSteps: prot.numberOfSteps,
      elapsedTime: prot.elapsedTime,
      elapsedSessionId: prot.elapsedSessionId,
      tick: Number(prot.elapsedTime) || 0,

      tags: Array.isArray(prot.tags) ? prot.tags : [],
      extraTableColumns: prot.extraTableColumns,
    }));

    return { nodes: [], edges: [], table: tableData };
  }

  // GRID view -> cards in rows, one block per sub-workflow, no edges
  if (viewMode === "grid") {
    const sections = getGridSections(protocols);
    if (sections.length === 0) return { nodes: [], edges: [] };

    const fallbackW =
      typeof window !== "undefined" && typeof window.innerWidth === "number" ? window.innerWidth : 1600;
    const zoom = typeof viewportZoom === "number" && viewportZoom > 0 ? viewportZoom : 1;
    const screenWidthPx = Math.max(600, containerWidth ?? fallbackW);
    const worldWidth = screenWidthPx / zoom - 2 * GRID_MARGIN;

    // Every card has the same width; rows are as tall as their tallest card.
    const cardWidth = Math.max(
      GRID_CARD_WIDTH,
      ...Object.keys(protocols).map((id) => Math.ceil(nodeSizeMap?.[id]?.width ?? 0)),
    );
    const cardHeight = (id: string) => {
      const measured = nodeSizeMap?.[id]?.height;
      if (typeof measured === "number" && measured > 0) return Math.ceil(measured);
      return Math.min(GRID_MAX_ESTIMATED_HEIGHT, getEstimatedGraphNodeHeight({ id, protocols, projectName, nodeSizeMap }));
    };
    const columns = Math.max(1, Math.floor((worldWidth + GRID_GAP_X) / (cardWidth + GRID_GAP_X)));

    const sourcePosition: Position = direction === "LR" ? Position.Right : Position.Bottom;
    const targetPosition: Position = direction === "LR" ? Position.Left : Position.Top;

    let y = GRID_MARGIN;
    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) y += GRID_SECTION_GAP;
      for (let start = 0; start < section.ids.length; start += columns) {
        const row = section.ids.slice(start, start + columns);
        row.forEach((id, column) => {
          const prot = protocols[id];
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
              elapsedSessionId: prot?.elapsedSessionId,
              gpuIndicatorEligible: prot?.gpuIndicatorEligible === true,
              stepsDone: prot?.stepsDone,
              numberOfSteps: prot?.numberOfSteps,
              outputs: prot?.outputs,
              inputs: prot?.inputs,
              tick: Number(prot?.elapsedTime) || 0,
              tags: Array.isArray(prot?.tags) ? prot?.tags : [],
              gridSection: { id: section.id, title: section.title, size: section.ids.length },
            },
            position: { x: GRID_MARGIN + column * (cardWidth + GRID_GAP_X), y },
            draggable: true,
            sourcePosition,
            targetPosition,
          });
        });
        y += Math.max(...row.map(cardHeight)) + GRID_GAP_Y;
      }
      y -= GRID_GAP_Y;
    });

    return { nodes, edges: [] };
  }

  // HIERARCHICAL view -> subtree-aligned layout with all real edges preserved
  const levelMap: Record<string, number> = {};
  const parentMap: Record<string, string[]> = {};
  const childrenOf = (id: string): string[] =>
    uniqStable(Array.isArray(protocols[id]?.children) ? protocols[id].children.map(String) : []);

  // One depth-first pass (each protocol once): the edges, in the order they
  // are first reached, and a topological order of the workflow.
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const backEdges = new Set<string>();
  const postOrder: string[] = [];

  const visit = (id: string) => {
    visited.add(id);
    onStack.add(id);
    for (const childId of childrenOf(id)) {
      const edgeId = `${id}-${childId}`;
      if (onStack.has(childId)) {
        // A cycle: draw the edge, but it cannot order the levels.
        backEdges.add(edgeId);
      }
      if (!parentMap[childId]) parentMap[childId] = [];
      parentMap[childId].push(id);
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
      if (!visited.has(childId)) visit(childId);
    }
    onStack.delete(id);
    postOrder.push(id);
  };

  // Protocols are reached from PROJECT; any not linked to it still get drawn,
  // as roots of their own.
  const starts = ["PROJECT", ...Object.keys(protocols).filter((id) => id !== "PROJECT").sort(stableIdCompare)];
  for (const id of starts) {
    if (visited.has(id)) continue;
    levelMap[id] = id === "PROJECT" ? 0 : 1;
    visit(id);
  }

  // Each protocol below the deepest of its parents (longest path), in linear time.
  for (const id of [...postOrder].reverse()) {
    const level = levelMap[id] ?? 1;
    for (const childId of childrenOf(id)) {
      if (backEdges.has(`${id}-${childId}`)) continue;
      levelMap[childId] = Math.max(levelMap[childId] ?? 0, level + 1);
    }
  }

  const placements = buildPlacementsWithFewerCrossings({
    levelMap,
    parentMap,
    protocols,
    projectName,
    direction,
    spacingX,
    spacingY,
    nodeSizeMap,
    preferredChildOrder: layoutOptions?.preferredChildOrder,
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
        elapsedSessionId: prot?.elapsedSessionId,
        gpuIndicatorEligible: prot?.gpuIndicatorEligible === true,
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

/**
 * After protocols are deleted: everything keeps its place, and branches slide
 * (as rigid blocks, never to the right) toward the branches on their left to
 * close the gaps, as the layout would have packed them.
 *
 * A branch is a protocol with everything under it (each protocol hangs from
 * its nearest parent above). Inner branches slide first, next to their left
 * siblings; then whole sub-workflows, next to the one on their left. A branch
 * with nothing on its left stays, so it never drifts away from its parent.
 * Nothing comes closer than the layout's spacing to anything else.
 */
export function compactAfterDeletion(nodes: Node[], edges: Edge[], direction: Direction): Node[] {
  const protocolNodes = nodes.filter((node) => String(node.id) !== "PROJECT");
  if (protocolNodes.length < 2) return nodes;

  const siblingGap = direction === "TB" ? 260 : 220;
  const subworkflowGap = direction === "TB" ? 720 : 360;
  const ids = protocolNodes.map((node) => String(node.id));
  const byId = new Map(protocolNodes.map((node) => [String(node.id), node]));
  const axis = new Map<string, number>();
  const main = new Map<string, number>();
  const crossSize = new Map<string, number>();
  const mainSize = new Map<string, number>();

  for (const node of protocolNodes) {
    const id = String(node.id);
    const measured = (node as any).measured ?? {};
    const width = Number(measured.width ?? node.width);
    const height = Number(measured.height ?? node.height);
    const w = Number.isFinite(width) && width > 0 ? width : (direction === "TB" ? 950 : 520);
    const h = Number.isFinite(height) && height > 0 ? height : (direction === "TB" ? 520 : 950);
    axis.set(id, direction === "TB" ? node.position.x : node.position.y);
    main.set(id, direction === "TB" ? node.position.y : node.position.x);
    crossSize.set(id, direction === "TB" ? Math.max(950, w) : Math.max(520, h));
    mainSize.set(id, direction === "TB" ? h : w);
  }

  // Each protocol hangs from its nearest parent above it.
  const parentsOf = new Map<string, string[]>();
  const neighbours = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);
    if (!byId.has(source) || !byId.has(target)) continue;
    parentsOf.set(target, [...(parentsOf.get(target) ?? []), source]);
    neighbours.get(source)!.add(target);
    neighbours.get(target)!.add(source);
  }
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of ids) {
    const above = (parentsOf.get(id) ?? []).filter((parentId) => main.get(parentId)! < main.get(id)!);
    if (!above.length) {
      roots.push(id);
      continue;
    }
    above.sort((a, b) => (main.get(b)! - main.get(a)!) ||
      (Math.abs(axis.get(a)! - axis.get(id)!) - Math.abs(axis.get(b)! - axis.get(id)!)) || stableIdCompare(a, b));
    childrenOf.set(above[0], [...(childrenOf.get(above[0]) ?? []), id]);
  }

  // Sub-workflows: protocols connected among themselves.
  const component = new Map<string, number>();
  ids.forEach((start, index) => {
    if (component.has(start)) return;
    const pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      if (component.has(id)) continue;
      component.set(id, index);
      for (const other of neighbours.get(id) ?? []) if (!component.has(other)) pending.push(other);
    }
  });

  const subtree = (id: string): string[] => {
    const members: string[] = [];
    const pending = [id];
    const seen = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      members.push(current);
      pending.push(...(childrenOf.get(current) ?? []));
    }
    return members;
  };

  const overlapsMain = (a: string, b: string) =>
    main.get(a)! < main.get(b)! + mainSize.get(b)! && main.get(b)! < main.get(a)! + mainSize.get(a)!;

  // The (negative) shift that brings `block` as close as allowed to the nodes
  // on its left; null when nothing relevant is on its left.
  const slide = (block: string[], reference: Set<string>): void => {
    const inBlock = new Set(block);
    let toReference = Number.NEGATIVE_INFINITY;
    let toAnything = Number.NEGATIVE_INFINITY;
    for (const member of block) {
      const left = axis.get(member)! - crossSize.get(member)! / 2;
      for (const other of ids) {
        if (inBlock.has(other) || axis.get(other)! > axis.get(member)! || !overlapsMain(member, other)) continue;
        const gap = component.get(other) === component.get(member) ? siblingGap : subworkflowGap;
        const limit = axis.get(other)! + crossSize.get(other)! / 2 + gap - left;
        toAnything = Math.max(toAnything, limit);
        if (reference.has(other)) toReference = Math.max(toReference, limit);
      }
    }
    if (!Number.isFinite(toReference)) return;
    const shift = Math.min(0, Math.max(toReference, toAnything));
    if (shift > -0.5) return;
    for (const member of block) axis.set(member, axis.get(member)! + shift);
  };

  // Inner branches first (deepest parents), each next to its left siblings.
  const parents = [...childrenOf.keys()].sort((a, b) => (main.get(b)! - main.get(a)!) || stableIdCompare(a, b));
  for (const parentId of parents) {
    const children = [...childrenOf.get(parentId)!].sort((a, b) => axis.get(a)! - axis.get(b)!);
    const placed = new Set<string>();
    for (const childId of children) {
      const block = subtree(childId);
      slide(block, placed);
      block.forEach((member) => placed.add(member));
    }
  }

  // Then whole branches without a parent (sub-workflows and their roots), left to right.
  const placedRoots = new Set<string>();
  for (const rootId of [...roots].sort((a, b) => axis.get(a)! - axis.get(b)!)) {
    const block = subtree(rootId);
    slide(block, placedRoots);
    block.forEach((member) => placedRoots.add(member));
  }

  return nodes.map((node) => {
    const id = String(node.id);
    if (!byId.has(id)) return node;
    const value = axis.get(id)!;
    const current = direction === "TB" ? node.position.x : node.position.y;
    if (Math.abs(value - current) < 0.5) return node;
    return { ...node, position: direction === "TB" ? { ...node.position, x: value } : { ...node.position, y: value } };
  });
}

/** Grid view: how each protocol relates to the selected one (the grid has no edges). */
export function getGridRelations(
  protocols: Record<string, ProtocolNode>,
  selectedId: string | null,
): Record<string, "parent" | "child" | "dimmed"> {
  if (!selectedId || !protocols[selectedId]) return {};
  const childrenOf = (id: string) =>
    Array.isArray(protocols[id]?.children) ? protocols[id].children.map(String) : [];
  const children = new Set(childrenOf(selectedId));
  const relations: Record<string, "parent" | "child" | "dimmed"> = {};
  for (const id of Object.keys(protocols)) {
    if (id === selectedId || id === "PROJECT") continue;
    relations[id] = childrenOf(id).includes(selectedId) ? "parent" : children.has(id) ? "child" : "dimmed";
  }
  return relations;
}
