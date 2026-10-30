import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  listPermissions: vi.fn(),
  listRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));
vi.mock("@/api/access", () => accessMocks);
vi.mock("@/api/users", () => ({
  listAdminUsers: vi.fn().mockResolvedValue([
    { id: 2, email: "ana@example.com", firstName: "Ana", lastName: "Pi", roleIds: [], groupIds: [] },
    { id: 3, email: "bo@example.com", firstName: "Bo", lastName: "Member", roleIds: [], groupIds: [] },
  ]),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import GroupsPanel from "@/pages/Settings/GroupsPanel";
import RolesPanel from "@/pages/Settings/RolesPanel";

const styles = {
  fieldSx: {}, cardSx: {}, cardHeaderSx: {}, selectSx: {}, menuPaperSx: {},
  colors: { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#fafafa" },
};

const roles = [
  { id: 1, name: "Administrator", description: "Everything", isSystem: true, isDefault: false, permissions: [],
    usersCount: 1, groupsCount: 0 },
  { id: 4, name: "User", description: "Own work", isSystem: false, isDefault: true,
    permissions: ["projects.create"], usersCount: 5, groupsCount: 1 },
];

describe("Roles and groups panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.listRoles.mockResolvedValue(roles);
    accessMocks.listPermissions.mockResolvedValue([
      { name: "projects.create", description: "Create and import projects" },
      { name: "plugins.manage", description: "Install and uninstall plugins and their binaries" },
    ]);
    accessMocks.listGroups.mockResolvedValue([]);
  });

  it("shows the roles, the Administrator one without edition, and creates a role with its permissions", async () => {
    accessMocks.createRole.mockResolvedValue({ id: 9 });
    render(<RolesPanel {...styles} />);

    expect(await screen.findByText("Every permission")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "New role" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Plugin keeper" } });
    fireEvent.click(within(dialog).getByText(/Install and uninstall plugins/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(accessMocks.createRole).toHaveBeenCalledWith({
      name: "Plugin keeper", description: "", isDefault: false, permissions: ["plugins.manage"],
    }));
  });

  it("creates a group with its roles, members and PI", async () => {
    accessMocks.createGroup.mockResolvedValue({ id: 3 });
    render(<GroupsPanel {...styles} />);

    expect(await screen.findByText("No groups yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Lab of Ana" } });

    fireEvent.mouseDown(within(dialog).getByLabelText("Roles of its members"));
    fireEvent.click(await screen.findByRole("option", { name: "User" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.mouseDown(within(dialog).getByLabelText("Members"));
    fireEvent.click(await screen.findByRole("option", { name: /Ana Pi/ }));
    fireEvent.click(screen.getByRole("option", { name: /Bo Member/ }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.mouseDown(within(dialog).getByLabelText("PI"));
    fireEvent.click(await screen.findByRole("option", { name: "Ana Pi" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(accessMocks.createGroup).toHaveBeenCalledWith({
      name: "Lab of Ana", description: "", roleIds: [4],
      members: [{ userId: 2, groupRole: "pi" }, { userId: 3, groupRole: "member" }],
    }));
  });

  it("asks before deleting a role, in the web's dialog, and deletes it once confirmed", async () => {
    accessMocks.deleteRole.mockResolvedValue(null);
    render(<RolesPanel {...styles} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete role?")).toBeInTheDocument();
    expect(accessMocks.deleteRole).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(accessMocks.deleteRole).toHaveBeenCalledWith(4));
  });

  it("chooses every permission of an area at once, and counts them", async () => {
    accessMocks.createRole.mockResolvedValue({ id: 9 });
    render(<RolesPanel {...styles} />);

    fireEvent.click(await screen.findByRole("button", { name: "New role" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Admins of the system" } });
    expect(within(dialog).getByText(/0 of 2 permissions/)).toBeInTheDocument();

    // The catalogue of this test has one System permission and one Projects permission
    const systemArea = within(dialog).getByText("System").closest("div")!.parentElement!;
    fireEvent.click(within(systemArea).getByRole("button", { name: "Select all" }));
    expect(within(dialog).getByText(/1 of 2 permissions/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(accessMocks.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["plugins.manage"] })));
  });
});
