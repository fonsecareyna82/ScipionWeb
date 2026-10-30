import { describe, expect, it } from "vitest";

import { projectAccessLabel } from "./project-access";

describe("projectAccessLabel", () => {
  it("says how the user reaches the project", () => {
    expect(projectAccessLabel({ isOwner: true, isShared: false, permission: "owner", accessVia: "owner" }))
      .toBe("owner");
    expect(projectAccessLabel({ isOwner: false, isShared: true, permission: "work", accessVia: "share" }))
      .toBe("Shared · work");
    expect(projectAccessLabel({ isOwner: false, isShared: false, permission: "view", accessVia: "group" }))
      .toBe("Group · view");
    expect(projectAccessLabel({ isOwner: false, isShared: false, permission: "view", accessVia: "role" }))
      .toBe("All projects · view");
  });

  it("keeps the former labels when the API says nothing of where the access comes from", () => {
    expect(projectAccessLabel({ isOwner: false, isShared: true, permission: "" })).toBe("Shared");
    expect(projectAccessLabel({ isOwner: true, isShared: false })).toBe("Owner");
    expect(projectAccessLabel({ isOwner: false, isShared: false })).toBe("Private");
  });
});
