import { describe, expect, it } from "vitest";
import { buildGraphElements, getGridRelations, getGridSections } from "@/utils/graph_utils";

const workflow = {
  PROJECT: { label: "P", children: ["1", "10"] },
  "1": { label: "Import movies", children: ["2", "3"] },
  "2": { label: "picker A", children: ["4"] },
  "4": { label: "consensus", children: [] },
  "3": { label: "picker B", children: ["4"] },
  "10": { label: "Import volumes", children: ["11"] },
  "11": { label: "mask", children: [] },
} as any;

const grid = (protocols: any, width = 1500, zoom = 0.347, sizes?: any) =>
  buildGraphElements("P", protocols, "grid", "TB", width, zoom, sizes);

describe("grid view", () => {
  it("shows each protocol after all its parents", () => {
    // A depth-first walk put the consensus (4) before its second picker (3).
    expect(getGridSections(workflow)[0].ids).toEqual(["1", "2", "3", "4"]);
  });

  it("gives each sub-workflow its own block, titled after its first protocol", () => {
    const sections = getGridSections(workflow);
    expect(sections.map((section) => [section.title, section.ids])).toEqual([
      ["Import movies", ["1", "2", "3", "4"]],
      ["Import volumes", ["10", "11"]],
    ]);
    const nodes = grid(workflow).nodes;
    const y = (id: string) => nodes.find((node) => node.id === id)!.position.y;
    const x = (id: string) => nodes.find((node) => node.id === id)!.position.x;
    // A new block starts on a new row, at the left, below the previous one.
    expect(x("10")).toBe(x("1"));
    expect(y("10")).toBeGreaterThan(Math.max(y("1"), y("4")));
    expect((nodes.find((node) => node.id === "10")!.data as any).gridSection)
      .toEqual({ id: "10", title: "Import volumes", size: 2 });
    expect(grid(workflow).edges).toEqual([]);
  });

  it("makes rows as tall as their tallest card", () => {
    const sizes = { "1": { width: 950, height: 400 }, "2": { width: 950, height: 1100 }, "3": { width: 950, height: 400 } };
    // One card per row at this width.
    const nodes = grid(workflow, 400, 0.347, sizes).nodes;
    const y = (id: string) => nodes.find((node) => node.id === id)!.position.y;
    expect(y("3") - y("2")).toBe(1100 + 200);
    expect(y("2") - y("1")).toBe(400 + 200);
  });

  it("fits more cards per row when they are shown smaller", () => {
    const many: any = { PROJECT: { label: "P", children: ["1"] }, "1": { label: "a", children: [] } };
    for (let i = 2; i <= 12; i++) {
      many[String(i)] = { label: `p${i}`, children: [] };
      many[String(i - 1)].children.push(String(i));
    }
    const perRow = (zoom: number) => {
      const nodes = grid(many, 1600, zoom).nodes;
      return nodes.filter((node) => node.position.y === nodes[0].position.y).length;
    };
    expect(perRow(0.2)).toBeGreaterThan(perRow(0.347));
    expect(perRow(0.347)).toBeGreaterThan(perRow(0.6));
  });

  it("marks the parents and children of the selected protocol and fades the rest", () => {
    expect(getGridRelations(workflow, "2")).toEqual({
      "1": "parent", "4": "child", "3": "dimmed", "10": "dimmed", "11": "dimmed",
    });
    expect(getGridRelations(workflow, null)).toEqual({});
  });
});
