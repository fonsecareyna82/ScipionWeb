import { ProtocolNode } from "../api/protocols";
import { Node, Edge } from "reactflow";

/**
 * Estimate the width of a label using canvas.
 */
function estimateLabelWidth(label: string, fontSize = 20, fontFamily = 'Arial'): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 100;
  context.font = `${fontSize}px ${fontFamily}`;
  return context.measureText(label).width + 260; // extra padding
}

/**
 * Build nodes and edges for ReactFlow from protocols.
 */
export function buildGraphElements(
  protocols: Record<string, ProtocolNode>,
  viewMode: 'hierarchical' | 'grid' | 'table' = 'hierarchical',
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // TABLE VIEW
  if (viewMode === 'table') {
    const sorted = Object.entries(protocols)
  .filter(([id]) => id !== 'PROJECT')
  .sort(([idA], [idB]) => parseInt(idA, 10) - parseInt(idB, 10));

    const tableData = sorted.map(([id, prot]) => ({
      id,
      label: prot.label,
      status: prot.status,
      parameters: prot.parameters,
      children: prot.children,
      cpuTime: prot.cpuTime,
    }));

    return { nodes: [], edges: [], table: tableData };
  }

  //  TREE VIEW
  const levelMap: Record<string, number> = {};
  const levelBuckets: Record<number, string[]> = {};
  const edgeSet = new Set<string>();

  function traverse(id: string, level: number) {
    const currentLevel = levelMap[id];

    if (currentLevel === undefined || level > currentLevel) {
      levelMap[id] = level;

      Object.values(levelBuckets).forEach(bucket => {
        const index = bucket.indexOf(id);
        if (index !== -1) bucket.splice(index, 1);
      });

      if (!levelBuckets[level]) levelBuckets[level] = [];
      levelBuckets[level].push(id);
    }

    const prot = protocols[id];
    if (!prot) return;

    prot.children.forEach(childId => {
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
        });
      }
      traverse(childId, levelMap[id] + 1);
    });
  }

  traverse("PROJECT", 0);

  Object.entries(levelBuckets).forEach(([levelStr, ids]) => {
    const level = parseInt(levelStr, 10);
    const y = level * 300;

    const widths = ids.map(id => {
      const label = protocols[id]?.label || id;
      return estimateLabelWidth(label);
    });

    const totalWidth = widths.reduce((sum, w) => sum + w + 50, 0);
    let x = -totalWidth / 2;

    ids.forEach((id, index) => {
      const prot = protocols[id];
      const label = prot?.label || id;
      const status = prot?.status;
      const parameters = prot?.parameters;
      const cpuTime = prot?.cpuTime;
      const elapsedTime = prot?.elapsedTime;
      const nodeWidth = widths[index];
      const spacing = Math.max(80, nodeWidth * 0.2);

      nodes.push({
        id,
        type: 'status',
        data: {
          label: id === "PROJECT" ? "📁 PROJECT" : label,
          status,
          id,
          parameters,
          cpuTime,
          elapsedTime,      
        },
        position: { x, y },
        draggable: true,
      });

      x += nodeWidth + spacing;
    });
  });

  return { nodes, edges };
}
