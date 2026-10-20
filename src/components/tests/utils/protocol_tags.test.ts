import type { Node } from "reactflow";
import { describe, expect, it } from "vitest";

import {
  apiErrorMessage,
  assignmentsFromProtocols,
  getReadableTextColor,
  keepKnownTagIds,
  matchesTagFilter,
  normalizeTagIds,
  resolveAssignedTagIds,
  toColorInputValue,
  validateTagDraft,
} from "@/utils/protocol_tags";
import { applyNodeVisibility, DIMMED_NODE_OPACITY } from "@/utils/graph_node_visibility";

describe("protocol tag helpers", () => {
  it("normalizes ids from any payload shape", () => {
    expect(normalizeTagIds(["a", " b ", "a", "", 3, { id: "c" }, { tagId: "d" }, null])).toEqual(["a", "b", "3", "c", "d"]);
    expect(normalizeTagIds(undefined)).toEqual([]);
    expect(normalizeTagIds("x")).toEqual(["x"]);
  });

  it("treats an explicit empty entry as no tags, and falls back only for unknown protocols", () => {
    const map = { "1": [], "2": ["b"] };
    expect(resolveAssignedTagIds(map, "1", ["stale"])).toEqual([]);
    expect(resolveAssignedTagIds(map, "2", ["stale"])).toEqual(["b"]);
    expect(resolveAssignedTagIds(map, "3", ["seed"])).toEqual(["seed"]);
  });

  it("seeds an entry for every protocol of the graph payload", () => {
    expect(assignmentsFromProtocols({ PROJECT: {}, "1": { tags: ["a"] }, "2": {} })).toEqual({ "1": ["a"], "2": [] });
  });

  it("matches any or all filter tags", () => {
    expect(matchesTagFilter(["a"], ["a", "b"], "any")).toBe(true);
    expect(matchesTagFilter(["a"], ["a", "b"], "all")).toBe(false);
    expect(matchesTagFilter(["a", "b", "c"], ["a", "b"], "all")).toBe(true);
    expect(matchesTagFilter([], [], "all")).toBe(true);
  });

  it("drops filter ids of deleted tags, also when no tag is left", () => {
    const ids = ["a", "gone"];
    expect(keepKnownTagIds(ids, new Map([["a", 1]]))).toEqual(["a"]);
    expect(keepKnownTagIds(ids, new Map())).toEqual([]);
    const unchanged = ["a"];
    expect(keepKnownTagIds(unchanged, new Map([["a", 1]]))).toBe(unchanged);
  });

  it("picks the readable text colour for a tag colour", () => {
    expect(getReadableTextColor("#ffffff")).toBe("#111827");
    expect(getReadableTextColor("#fde047")).toBe("#111827");
    expect(getReadableTextColor("#000000")).toBe("#f9fafb");
    expect(getReadableTextColor("#1e3a8a")).toBe("#f9fafb");
    expect(getReadableTextColor("#fff")).toBe("#111827");
    expect(getReadableTextColor("#000000cc")).toBe("#f9fafb");
    expect(getReadableTextColor("not a colour")).toBe("#111827");
  });

  it("turns any hex form into the #rrggbb a colour input accepts", () => {
    expect(toColorInputValue("#ABC")).toBe("#aabbcc");
    expect(toColorInputValue("#abcd")).toBe("#aabbcc");
    expect(toColorInputValue("#11223344")).toBe("#112233");
    expect(toColorInputValue("red")).toBe("#3b82f6");
  });

  it("validates a draft like the server does", () => {
    const existing = [{ id: "a", title: "Alpha", color: "#000000" }];
    expect(validateTagDraft({ title: " ", color: "#fff" }, existing)).toMatch(/required/);
    expect(validateTagDraft({ title: "x".repeat(81), color: "#fff" }, existing)).toMatch(/80/);
    expect(validateTagDraft({ title: "ALPHA", color: "#fff" }, existing)).toMatch(/already exists/);
    expect(validateTagDraft({ id: "a", title: "ALPHA", color: "#fff" }, existing)).toBeNull();
    expect(validateTagDraft({ title: "Beta", color: "rgb(0,0,0)" }, existing)).toMatch(/hex/);
  });

  it("reads the server's message from an error", () => {
    expect(apiErrorMessage({ data: { detail: "Title in use" } }, "x")).toBe("Title in use");
    expect(apiErrorMessage({ data: { detail: [{ msg: "too long" }, { msg: "bad color" }] } }, "x")).toBe("too long\nbad color");
    expect(apiErrorMessage({ message: "[object Object]" }, "fallback")).toBe("fallback");
  });
});

describe("graph node visibility", () => {
  const nodes: Node[] = [
    { id: "PROJECT", position: { x: 0, y: 0 }, data: {} },
    { id: "1", position: { x: 0, y: 0 }, data: { tags: ["a"] } },
    { id: "2", position: { x: 0, y: 0 }, data: { tags: [] } },
  ];
  const matches = (_id: string, data: any) => data.tags.includes("a");

  it("dims protocols outside the tag filter by default", () => {
    const out = applyNodeVisibility(nodes, { focusIds: null, matchesFilter: matches, hideOutsideFilter: false });
    expect(out[1]).toBe(nodes[1]);
    expect(out[2].style?.opacity).toBe(DIMMED_NODE_OPACITY);
    expect(out[2].hidden).toBe(false);
    expect(out[0]).toBe(nodes[0]);
  });

  it("hides them when asked, and shows them again without a filter", () => {
    const hidden = applyNodeVisibility(nodes, { focusIds: null, matchesFilter: matches, hideOutsideFilter: true });
    expect(hidden[1].hidden).toBeFalsy();
    expect(hidden[2].hidden).toBe(true);

    const shown = applyNodeVisibility(hidden, { focusIds: null, matchesFilter: null, hideOutsideFilter: true });
    expect(shown[2].hidden).toBe(false);
    expect(shown[2].style?.opacity).toBe(1);
  });

  it("returns the same array when nothing changes", () => {
    expect(applyNodeVisibility(nodes, { focusIds: null, matchesFilter: null, hideOutsideFilter: false })).toBe(nodes);
  });
});
