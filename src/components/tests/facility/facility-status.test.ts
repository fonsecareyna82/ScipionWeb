import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }));
vi.mock("@/api/auth", () => authMocks);

import { loadFacilityStatusOnce, resetFacilityStatus } from "@/api/facility";

function answer(permissions: string[]) {
  return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
           json: async () => ({ enabled: true, permissions }), text: async () => JSON.stringify({ enabled: true, permissions }),
           clone() { return this; } };
}

describe("The facility status of the signed-in user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetFacilityStatus();
  });

  it("is asked once per user: another sign-in in the same tab asks again", async () => {
    authMocks.fetchWithAuth.mockResolvedValueOnce(answer(["facility.manage"])).mockResolvedValueOnce(answer([]));
    localStorage.setItem("accessToken", "admin-token");

    expect((await loadFacilityStatusOnce()).permissions).toEqual(["facility.manage"]);
    expect((await loadFacilityStatusOnce()).permissions).toEqual(["facility.manage"]);
    expect(authMocks.fetchWithAuth).toHaveBeenCalledTimes(1);

    localStorage.setItem("accessToken", "user-token");
    expect((await loadFacilityStatusOnce()).permissions).toEqual([]);
    expect(authMocks.fetchWithAuth).toHaveBeenCalledTimes(2);
  });
});
