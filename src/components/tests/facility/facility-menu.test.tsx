import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({ loadFacilityStatusOnce: vi.fn() }));
vi.mock("@/api/facility", () => facilityMocks);

import { useFacilityNavItem, useFacilityTabs } from "@/layout/facilityNav";

async function settle(status: { enabled: boolean; permissions: string[] }) {
  facilityMocks.loadFacilityStatusOnce.mockResolvedValue(status);
  const item = renderHook(() => useFacilityNavItem());
  const tabs = renderHook(() => useFacilityTabs());
  await waitFor(() => expect(tabs.result.current.loaded).toBe(true));
  return { item: item.result.current, tabs: tabs.result.current.tabs.map((tab) => tab.key) };
}

describe("The Facility entry of the menu and its tabs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is not there when the installation runs no facility: the menu is the one it always was", async () => {
    expect(await settle({ enabled: false, permissions: ["facility.manage"] })).toEqual({ item: null, tabs: [] });
  });

  it("leads the facility manager to the Facility page, with the microscopes tab", async () => {
    const { item, tabs } = await settle({ enabled: true, permissions: ["facility.manage"] });
    expect(item).toMatchObject({ name: "Facility", path: "/facility" });
    expect(tabs).toEqual(["microscopes"]);
  });

  it("is not there for whom has no tab in the facility", async () => {
    expect(await settle({ enabled: true, permissions: [] })).toEqual({ item: null, tabs: [] });
  });
});
