import { describe, expect, it } from "vitest";
import { buildGraphElements, compactAfterDeletion, countEdgeCrossings as countEdgeLinksCrossings } from "@/utils/graph_utils";

/** PROJECT -> 1; each step splits in two protocols that join again (e.g. two pickers and a consensus). */
function chainOfMerges(merges: number) {
  const protocols: Record<string, any> = { PROJECT: { label: "P", children: ["1"] } };
  let id = 1;
  for (let i = 0; i < merges; i++) {
    const [split, left, right, join] = [id, id + 1, id + 2, id + 3].map(String);
    protocols[split] = { label: `split ${i}`, children: [left, right] };
    protocols[left] = { label: `left ${i}`, children: [join] };
    protocols[right] = { label: `right ${i}`, children: [join] };
    id += 3;
  }
  protocols[String(id)] = { label: "end", children: [] };
  return protocols;
}

const byId = (result: { nodes: { id: string; position: { x: number; y: number } }[] }) =>
  Object.fromEntries(result.nodes.map((node) => [node.id, node.position]));

describe("workflow layout", () => {
  it("lays out workflows with many merges quickly", () => {
    const started = performance.now();
    const result = buildGraphElements("P", chainOfMerges(40));
    // Every path used to be walked again: 18 merges already took a quarter of a second.
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.nodes).toHaveLength(122);
    const positions = byId(result);
    // Each protocol stays below the deepest of its parents.
    expect(positions["4"].y).toBeGreaterThan(positions["2"].y);
    expect(positions["2"].y).toBe(positions["3"].y);
  });

  it("draws protocols that are not linked to the project", () => {
    const result = buildGraphElements("P", {
      PROJECT: { label: "P", children: ["1"] },
      "1": { label: "import", children: [] },
      "2": { label: "orphan", children: ["3"] },
      "3": { label: "its child", children: [] },
    } as any);
    expect(result.nodes.map((node) => node.id).sort()).toEqual(["1", "2", "3", "PROJECT"]);
    expect(result.edges.map((edge) => edge.id)).toEqual(["PROJECT-1", "2-3"]);
    const positions = byId(result);
    expect(positions["3"].y).toBeGreaterThan(positions["2"].y);
  });

  it("starts each level after the tallest node of the one above", () => {
    const tall = (outputs: number) => buildGraphElements("P", {
      PROJECT: { label: "P", children: ["1"] },
      "1": { label: "many outputs", children: ["2"], outputs: Array(outputs).fill({}) },
      "2": { label: "next", children: [] },
    } as any);
    const usual = byId(tall(1));
    expect(usual["2"].y - usual["1"].y).toBe(680);
    const crowded = byId(tall(30));
    // 30 outputs make the node about 1160 px tall.
    expect(crowded["2"].y - crowded["1"].y).toBeGreaterThan(1160);
  });

  it("does not loop on cycles", () => {
    const result = buildGraphElements("P", {
      PROJECT: { label: "P", children: ["1"] },
      "1": { label: "a", children: ["2"] },
      "2": { label: "b", children: ["1"] },
    } as any);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges.map((edge) => edge.id)).toEqual(["PROJECT-1", "1-2", "2-1"]);
  });
});

describe("workflow layout crossings", () => {
  const links = (protocols: Record<string, any>) => Object.entries(protocols)
    .flatMap(([id, protocol]) => protocol.children.map((child: string) => [id, child] as [string, string]));

  // Two branches whose children join with the other branch: in creation order
  // the joining edges cross; swapping the branches removes the crossing.
  const crossed = {
    PROJECT: { label: "P", children: ["1"] },
    "1": { label: "import", children: ["2", "3"] },
    "2": { label: "left", children: ["4"] },
    "3": { label: "right", children: ["5"] },
    "4": { label: "a", children: [] },
    "5": { label: "b", children: ["4"] },
    "6": { label: "c", children: [] },
  } as Record<string, any>;
  crossed["2"].children.push("6");
  crossed["5"].children.push("6");

  // Workflows as in Scipion: chains with branches, some protocols joining recent ones.
  function workflow(seed: number, size: number) {
    let state = seed;
    const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    const protocols: Record<string, any> = { PROJECT: { label: "P", children: [] } };
    for (let i = 1; i <= size; i++) protocols[String(i)] = { label: `protocol ${i}`, children: [] };
    for (let i = 1; i <= size; i++) {
      const parents = i === 1 || random() < 0.1 ? ["PROJECT"] : [];
      const count = 1 + (random() < 0.25 ? 1 + Math.floor(random() * 2) : 0);
      for (let j = 0; j < count && i > 1; j++) parents.push(String(Math.max(1, i - 1 - Math.floor(random() * 6))));
      for (const parent of new Set(parents)) protocols[parent].children.push(String(i));
    }
    return protocols;
  }

  it("orders branches so that fewer edges cross", () => {
    let creationOrder = 0;
    let optimized = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const protocols = workflow(seed, 30);
      // The creation order, as the layout had it before.
      const asCreated = Object.fromEntries(Object.entries(protocols).map(([id, protocol]) => [id, protocol.children]));
      const before = countEdgeLinksCrossings(links(protocols), byId(buildGraphElements("P", protocols as any,
        "hierarchical", "TB", undefined, undefined, undefined, { preferredChildOrder: asCreated })));
      const after = countEdgeLinksCrossings(links(protocols), byId(buildGraphElements("P", protocols as any)));
      expect(after).toBeLessThanOrEqual(before);
      creationOrder += before;
      optimized += after;
    }
    expect(optimized).toBeLessThan(creationOrder * 0.7);
  });

  it("keeps the order on screen when the page gives it", () => {
    const keep = { "1": ["3", "2"] };
    const positions = byId(buildGraphElements("P", crossed as any, "hierarchical", "TB", undefined, undefined,
      undefined, { preferredChildOrder: keep }));
    expect(positions["3"].x).toBeLessThan(positions["2"].x);
  });

  it("gives the same layout every time", () => {
    expect(byId(buildGraphElements("P", crossed as any))).toEqual(byId(buildGraphElements("P", crossed as any)));
  });
});

describe("workflow layout packing", () => {
  it("tucks a short branch beside a wide one instead of beyond its full width", () => {
    const positions = byId(buildGraphElements("P", {
      PROJECT: { label: "P", children: ["1"] },
      "1": { label: "import", children: ["2", "3"] },
      "2": { label: "wide", children: ["4", "5", "6"] },
      "3": { label: "short", children: [] },
      "4": { label: "a", children: [] },
      "5": { label: "b", children: [] },
      "6": { label: "c", children: [] },
    } as any));
    // Side by side on their own level (950 px nodes, 260 px apart), not after
    // the three children of the wide branch.
    expect(Math.abs(positions["3"].x - positions["2"].x)).toBe(950 + 260);
    // A single child still hangs straight under its parent.
    expect(positions["5"].x).toBe(positions["2"].x);
  });

  it("never puts two protocols of a level on top of each other", () => {
    for (const direction of ["TB", "LR"] as const) {
      for (let seed = 1; seed <= 15; seed++) {
        let state = seed;
        const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
        const protocols: Record<string, any> = { PROJECT: { label: "P", children: [] } };
        for (let i = 1; i <= 40; i++) protocols[String(i)] = { label: `protocol ${i}`, children: [] };
        for (let i = 1; i <= 40; i++) {
          const parents = i === 1 || random() < 0.1 ? ["PROJECT"] : [];
          if (i > 1) parents.push(String(Math.max(1, i - 1 - Math.floor(random() * 6))));
          if (i > 2 && random() < 0.25) parents.push(String(Math.max(1, i - 1 - Math.floor(random() * 6))));
          for (const parent of new Set(parents)) protocols[parent].children.push(String(i));
        }
        const result = buildGraphElements("P", protocols as any, "hierarchical", direction);
        const rows: Record<number, number[]> = {};
        for (const node of result.nodes) {
          if (node.id === "PROJECT") continue;
          const [level, axis] = direction === "TB" ? [node.position.y, node.position.x] : [node.position.x, node.position.y];
          (rows[level] ??= []).push(axis);
        }
        const minimum = direction === "TB" ? 950 + 260 : 520 + 220;
        for (const axes of Object.values(rows)) {
          axes.sort((a, b) => a - b);
          for (let i = 1; i < axes.length; i++) expect(axes[i] - axes[i - 1]).toBeGreaterThanOrEqual(minimum - 0.5);
        }
      }
    }
  });
});

describe("workflow layout sub-workflows", () => {
  const twoWorkflows = {
    PROJECT: { label: "P", children: ["1", "4"] },
    "1": { label: "import movies", children: ["2", "3"] },
    "2": { label: "align", children: [] },
    "3": { label: "ctf", children: [] },
    "4": { label: "import volumes", children: ["5"] },
    "5": { label: "mask", children: [] },
  } as any;

  it("sets sub-workflows further apart than the branches of one", () => {
    for (const [direction, size, gap, branchGap] of [["TB", 950, 720, 260], ["LR", 520, 360, 220]] as const) {
      const positions = byId(buildGraphElements("P", twoWorkflows, "hierarchical", direction));
      const axis = (id: string) => (direction === "TB" ? positions[id].x : positions[id].y);
      const first = ["1", "2", "3"].map(axis);
      const second = ["4", "5"].map(axis);
      const [left, right] = Math.max(...first) < Math.min(...second) ? [first, second] : [second, first];
      expect(Math.min(...right) - Math.max(...left) - size).toBeGreaterThanOrEqual(gap - 0.5);
      // Inside a sub-workflow, branches keep their usual spacing.
      expect(Math.abs(axis("3") - axis("2")) - size).toBeLessThan(gap);
      expect(Math.abs(axis("3") - axis("2")) - size).toBeGreaterThanOrEqual(branchGap - 0.5);
    }
  });
});

describe("closing the gap of deleted protocols", () => {
  const node = (id: string, x: number, y: number) => ({ id, position: { x, y }, data: {} }) as any;
  const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target }) as any;
  const xs = (nodes: any[]) => Object.fromEntries(nodes.map((n) => [n.id, n.position.x]));

  // import (1) with three branches; the middle one (B) was just deleted.
  const nodes = [
    node("PROJECT", 0, 0), node("1", 0, 680),
    node("A", -1210, 1360), node("A1", -1210, 2040),
    node("C", 1210, 1360), node("C1", 1210, 2040), node("C2", 2420, 2040),
  ];
  const edges = [edge("PROJECT", "1"), edge("1", "A"), edge("A", "A1"), edge("1", "C"), edge("C", "C1"), edge("C", "C2")];

  it("slides the branches on the right next to the ones on the left, keeping their shape", () => {
    const after = xs(compactAfterDeletion(nodes, edges, "TB"));
    // C moves to the spacing of siblings (950 px nodes, 260 px apart) ...
    expect(after.C).toBe(-1210 + 950 + 260);
    // ... with all its branch, which keeps its shape.
    expect(after.C1 - after.C).toBe(0);
    expect(after.C2 - after.C).toBe(1210);
    // The rest stays where it was.
    expect([after.PROJECT, after["1"], after.A, after.A1]).toEqual([0, 0, -1210, -1210]);
  });

  it("never moves anything to the right, nor a branch with nothing on its left", () => {
    const alone = xs(compactAfterDeletion([node("1", 0, 0), node("C", 3000, 680)], [edge("1", "C")], "TB"));
    expect(alone.C).toBe(3000);
    const tight = [node("1", 0, 0), node("A", -605, 680), node("C", 605, 680)];
    const unchanged = xs(compactAfterDeletion(tight, [edge("1", "A"), edge("1", "C")], "TB"));
    expect(unchanged).toEqual({ "1": 0, A: -605, C: 605 });
  });

  it("brings a sub-workflow closer, but keeps sub-workflows apart", () => {
    const after = xs(compactAfterDeletion(
      [node("1", 0, 680), node("2", 0, 1360), node("9", 5000, 680), node("10", 5000, 1360)],
      [edge("1", "2"), edge("9", "10")], "TB"));
    expect(after["9"]).toBe(950 + 720);
    expect(after["10"]).toBe(950 + 720);
  });
});
