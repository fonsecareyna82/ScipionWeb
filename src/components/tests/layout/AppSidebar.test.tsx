import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const permissionMocks = vi.hoisted(() => ({ state: { loaded: true, permissions: [] as string[] } }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ loaded: permissionMocks.state.loaded, user: null,
                           can: (permission: string) => permissionMocks.state.permissions.includes(permission) }),
}));
const facilityMocks = vi.hoisted(() => ({ item: null as null | { name: string; path: string; icon: null } }));
vi.mock("@/layout/facilityNav", () => ({ useFacilityNavItem: () => facilityMocks.item }));
vi.mock("@/context/SidebarContext", () => ({
  useSidebar: () => ({ isExpanded: true, isMobileOpen: false, isHovered: false, setIsHovered: vi.fn() }),
}));

vi.mock("@/context/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }), useIsDark: () => false }));
vi.mock("@/layout/SidebarWidget", () => ({ default: () => null }));
vi.mock("@/icons", () => Object.fromEntries(["BoxCubeIcon", "CalenderIcon", "GridIcon", "HorizontaLDots", "ListIcon",
  "PageIcon", "PieChartIcon", "PlugInIcon", "TableIcon", "TreeIcon", "UserCircleIcon"].map((name) => [name, () => null])));

import AppSidebar from "@/layout/AppSidebar";

function entries(): string[] {
  return screen.getAllByRole("link").map((link) => link.textContent?.trim() || "").filter(Boolean);
}

describe("The menu", () => {
  beforeEach(() => {
    permissionMocks.state = { loaded: true, permissions: [] };
    facilityMocks.item = null;
  });

  it("shows a user who only sees what is shared with them only what they can open", async () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>);

    await waitFor(() => expect(entries()).toEqual(expect.arrayContaining(["Home", "Projects", "User profile", "Settings"])));
    expect(entries()).not.toContain("Workflows");
    expect(entries()).not.toContain("Plugins");
  });

  it("shows Workflows and Plugins to who makes projects, with Facility after Workflows", async () => {
    permissionMocks.state = { loaded: true, permissions: ["projects.create"] };
    facilityMocks.item = { name: "Facility", path: "/facility", icon: null };
    render(<MemoryRouter><AppSidebar /></MemoryRouter>);

    await waitFor(() => expect(entries()).toContain("Workflows"));
    const shown = entries();
    expect(shown.indexOf("Facility")).toBe(shown.indexOf("Workflows") + 1);
    expect(shown).toContain("Plugins");
  });

  it("puts Facility after Projects for who does not see Workflows", async () => {
    facilityMocks.item = { name: "Facility", path: "/facility", icon: null };
    render(<MemoryRouter><AppSidebar /></MemoryRouter>);

    await waitFor(() => expect(entries()).toContain("Facility"));
    expect(entries().indexOf("Facility")).toBe(entries().indexOf("Projects") + 1);
  });
});
