import { ProtocolNode } from "../api/protocols";
import { Node, Edge } from "reactflow";

/**
 * Builds graph elements (nodes and edges) from protocols data.
 * @param protocols - Record of protocol nodes indexed by their IDs.
 * @returns An object containing arrays of nodes and edges for ReactFlow.
 */
export function buildGraphElements(protocols: Record<string, ProtocolNode>) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const visited = new Set<string>();
  const levelMap: Record<string, number> = {};
  const levelBuckets: Record<number, string[]> = {};

  /**
   * Recursive traversal to build edges and group nodes by level.
   * @param id - Current protocol node ID.
   * @param level - Depth level in the graph.
   */
  function traverse(id: string, level: number) {
    if (visited.has(id)) return; // Avoid revisiting nodes
    visited.add(id);
    levelMap[id] = level;

    if (!levelBuckets[level]) levelBuckets[level] = [];
    levelBuckets[level].push(id);

    const prot = protocols[id];
    if (!prot) return;

    prot.children.forEach(childId => {
      edges.push({
        id: `${id}-${childId}`,
        source: id,
        target: childId,
        animated: false,
        style: { stroke: "#CAD5E2", strokeWidth: 2 },
        markerEnd: "url(#circle)",
      });
      traverse(childId, level + 1);
    });
  }

  // Start traversal from the root "PROJECT" node at level 0
  traverse("PROJECT", 0);

  // Assign horizontal positions to nodes within each level
  Object.entries(levelBuckets).forEach(([levelStr, ids]) => {
    const level = parseInt(levelStr, 10);
    const spacing = 550;
    const offsetX = -(ids.length - 1) * spacing / 2;

    ids.forEach((id, index) => {
      const prot = protocols[id];
      const label = prot?.label || id;
      const status = prot?.status;
      const parameters = prot?.parameters;
      nodes.push({
        id,
        type: 'status',
        data: { label: id === "PROJECT" ? "📁 PROJECT" : label, status, id, parameters },
        position: {
          x: offsetX + index * spacing,
          y: level * 240,
        },
        draggable: true,
      });
    });
  });

  return { nodes, edges };
}
