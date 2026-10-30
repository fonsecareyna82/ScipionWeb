import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ loadCurrentUserOnce: vi.fn() }));
vi.mock("@/api/auth", () => authMocks);

import { usePermissions } from "@/hooks/usePermissions";

describe("usePermissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows what the user's roles give", async () => {
    authMocks.loadCurrentUserOnce.mockResolvedValue({ id: 2, permissions: ["projects.create", "files.download"] });
    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.can("projects.create")).toBe(true);
    expect(result.current.can("plugins.manage")).toBe(false);
  });

  it("allows everything to an administrator and nothing without a session", async () => {
    authMocks.loadCurrentUserOnce.mockResolvedValueOnce({ id: 1, isSystemAdmin: true, permissions: [] });
    const admin = renderHook(() => usePermissions());
    await waitFor(() => expect(admin.result.current.loaded).toBe(true));
    expect(admin.result.current.can("plugins.manage")).toBe(true);

    authMocks.loadCurrentUserOnce.mockRejectedValueOnce(new Error("No token found"));
    const anonymous = renderHook(() => usePermissions());
    await waitFor(() => expect(anonymous.result.current.loaded).toBe(true));
    expect(anonymous.result.current.can("projects.create")).toBe(false);
  });
});
