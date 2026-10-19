import { describe, expect, it } from "vitest";
import {
  PARENT_ENTRY,
  absoluteToRelPath,
  buildAbsPathForEntry,
  buildRelPathForEntry,
  formatModified,
  normalizeRelPath,
  pathForProtocolParam,
  sortEntries,
} from "../../files/remote-file-paths";

describe("remote file paths", () => {
  it("never goes above the root", () => {
    expect(normalizeRelPath("../../a/./b/../c")).toBe("a/c");
    expect(normalizeRelPath("/a//b/")).toBe("a/b");
  });

  it("works with the filesystem root", () => {
    expect(absoluteToRelPath("/mnt/disk/movies", "/")).toBe("mnt/disk/movies");
    expect(absoluteToRelPath("/home/u/p/Runs", "/home/u/p")).toBe("Runs");
    expect(absoluteToRelPath("/elsewhere", "/home/u/p")).toBe("");
    expect(buildAbsPathForEntry({ name: "m.mrc", path: "mnt/m.mrc", isDir: false }, "mnt", "/")).toBe("/mnt/m.mrc");
  });

  it("resolves the parent entry to the folder above", () => {
    expect(buildRelPathForEntry(PARENT_ENTRY, "a/b/c", "/root")).toBe("a/b");
    expect(buildRelPathForEntry(PARENT_ENTRY, "a", "/root")).toBe("");
  });

  it("keeps protocol paths relative inside the project and absolute outside", () => {
    expect(pathForProtocolParam("/home/u/proj/Runs/000002_X/extra/a.mrc", "/home/u/proj")).toBe("Runs/000002_X/extra/a.mrc");
    expect(pathForProtocolParam("/mnt/disk/data/*.tif", "/home/u/proj")).toBe("/mnt/disk/data/*.tif");
    expect(pathForProtocolParam("/mnt/disk/data", null)).toBe("/mnt/disk/data");
  });

  it("sorts folders first, names naturally, sizes and dates newest first", () => {
    const entries = [
      { name: "img10.mrc", path: "", isDir: false, size: 1, mtime: 3 },
      { name: "img2.mrc", path: "", isDir: false, size: 30, mtime: 1 },
      { name: "z", path: "", isDir: true },
    ];
    expect(sortEntries(entries, "name", "asc").map((e) => e.name)).toEqual(["z", "img2.mrc", "img10.mrc"]);
    expect(sortEntries(entries, "size", "desc").map((e) => e.name)).toEqual(["z", "img2.mrc", "img10.mrc"]);
    expect(sortEntries(entries, "mtime", "desc").map((e) => e.name)).toEqual(["z", "img10.mrc", "img2.mrc"]);
  });

  it("formats dates by how recent they are", () => {
    const now = new Date(2026, 9, 19, 18, 0);
    expect(formatModified(new Date(2026, 9, 19, 9, 5).getTime() / 1000, now)).toBe("09:05");
    expect(formatModified(new Date(2026, 2, 4, 9, 5).getTime() / 1000, now)).toBe("03-04 09:05");
    expect(formatModified(new Date(2024, 2, 4).getTime() / 1000, now)).toBe("2024-03-04");
    expect(formatModified(null, now)).toBe("");
  });
});
