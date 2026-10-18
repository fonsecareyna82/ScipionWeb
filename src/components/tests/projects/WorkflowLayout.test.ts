import { describe, expect, it } from "vitest";
import { buildGraphElements } from "@/utils/graph_utils";

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
