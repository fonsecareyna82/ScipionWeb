import { describe, expect, it } from "vitest";
import { formatRelativeDate, matchesFilter, sortProjects } from "@/utils/project-list";
import { togglePinnedId } from "@/utils/projectPins";

const now = new Date(2026, 10, 16, 15, 0, 0);

describe("project list helpers", () => {
  it("says how long ago, then the date", () => {
    expect(formatRelativeDate(new Date(now.getTime() - 20_000), now)).toBe("just now");
    expect(formatRelativeDate(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
    expect(formatRelativeDate(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 h ago");
    expect(formatRelativeDate(new Date(2026, 10, 15, 9, 0), now)).toBe("yesterday");
    expect(formatRelativeDate(new Date(2026, 10, 12, 9, 0), now)).toBe("4 days ago");
    expect(formatRelativeDate(new Date(2026, 9, 1), now)).not.toMatch(/ago|yesterday/);
    expect(formatRelativeDate(null, now)).toBe("");
  });

  it("tells mine from shared with me", () => {
    const project = { id: 1, name: "a", createdAt: now, isOwner: false, isShared: true };
    expect(matchesFilter(project, "shared")).toBe(true);
    expect(matchesFilter(project, "mine")).toBe(false);
    expect(matchesFilter({ ...project, isOwner: true }, "shared")).toBe(false);
  });

  it("keeps the pinned first in the order they were pinned", () => {
    const projects = ["a", "b", "c", "d"].map((name, index) => ({
      id: index + 1, name, createdAt: new Date(now.getTime() - index * 1000),
    }));
    expect(sortProjects(projects, "activity", ["3", "4"]).map((p) => p.name)).toEqual(["c", "d", "a", "b"]);
    expect(sortProjects(projects, "name").map((p) => p.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("pins and unpins, newest pin first", () => {
    expect(togglePinnedId(["2"], 5)).toEqual(["5", "2"]);
    expect(togglePinnedId(["5", "2"], "5")).toEqual(["2"]);
  });
});
