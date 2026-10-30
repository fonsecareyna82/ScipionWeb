import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UserManagementPanel from "./UserManagementPanel";
import {
    listAdminUsers,
    updateAdminUser,
} from "@/api/users";

vi.mock("@/api/users", () => ({
    listAdminUsers: vi.fn(),
    updateAdminUser: vi.fn(),
}));

vi.mock("@/api/access", () => ({
    listRoles: vi.fn().mockResolvedValue([
        { id: 1, name: "Administrator", isSystem: true },
        { id: 4, name: "User", isSystem: false },
        { id: 3, name: "Technician", isSystem: false },
    ]),
    listGroupNames: vi.fn().mockResolvedValue([{ id: 7, name: "Facility staff" }]),
}));

vi.mock("react-hot-toast", () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const users = [
    {
        id: 1,
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        institution: "CNB-CSIC",
        role: "admin",
        isActive: true,
        isVerified: true,
        roleIds: [1],
        groupIds: [],
    },
    {
        id: 2,
        email: "user@example.com",
        firstName: "Normal",
        lastName: "User",
        institution: "Lab",
        role: "user",
        isActive: true,
        isVerified: true,
        roleIds: [4],
        groupIds: [7],
    },
];

function renderPanel() {
    return render(
        <UserManagementPanel
            currentUserId={1}
            fieldSx={{}}
            cardSx={{}}
            cardHeaderSx={{}}
            selectSx={{}}
            menuPaperSx={{}}
            colors={{
                border: "#ddd",
                text: "#111",
                muted: "#666",
                surface: "#fff",
                hover: "#fafafa",
            }}
        />
    );
}

describe("UserManagementPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(listAdminUsers).mockResolvedValue(users);
    });

    it("loads users", async () => {
        renderPanel();

        expect(await screen.findByText("admin@example.com")).toBeInTheDocument();
        expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    it("prevents deactivating the current admin", async () => {
        renderPanel();

        await screen.findByText("admin@example.com");

        expect(screen.getByLabelText("Active admin@example.com")).toBeDisabled();
    });

    it("shows each user's roles and groups by name", async () => {
        renderPanel();

        await screen.findByText("user@example.com");

        expect(screen.getByRole("combobox", { name: "Roles admin@example.com" })).toHaveTextContent("Administrator");
        expect(screen.getByRole("combobox", { name: "Roles user@example.com" })).toHaveTextContent("User");
        expect(screen.getByRole("combobox", { name: "Groups user@example.com" })).toHaveTextContent("Facility staff");
        expect(screen.getByRole("combobox", { name: "Groups admin@example.com" })).toHaveTextContent("None");
    });

    it("gives a user another role", async () => {
        vi.mocked(updateAdminUser).mockResolvedValue({ ...users[1], roleIds: [4, 3] });

        renderPanel();

        await screen.findByText("user@example.com");
        fireEvent.mouseDown(screen.getByRole("combobox", { name: "Roles user@example.com" }));
        fireEvent.click(await screen.findByRole("option", { name: "Technician" }));

        await waitFor(() => {
            expect(updateAdminUser).toHaveBeenCalledWith(2, { roleIds: [4, 3] });
        });
    });

    it("deactivates another user", async () => {
        vi.mocked(updateAdminUser).mockResolvedValue({
            ...users[1],
            isActive: false,
        });

        renderPanel();

        await screen.findByText("user@example.com");

        fireEvent.click(
            screen.getByLabelText("Active user@example.com")
        );

        await waitFor(() => {
            expect(updateAdminUser).toHaveBeenCalledWith(
                2,
                { isActive: false }
            );
        });
    });

    it("filters users", async () => {
        renderPanel();

        await screen.findByText("admin@example.com");

        fireEvent.change(
            screen.getByLabelText("Search users"),
            { target: { value: "Normal" } }
        );

        expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
        expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    it("tells how many accounts wait for an administrator to activate them", async () => {
        vi.mocked(listAdminUsers).mockResolvedValue([
            ...users,
            { ...users[1], id: 99, email: "pending@example.com", isActive: false },
        ]);

        renderPanel();

        expect(await screen.findByText(/1 account is not active/)).toBeInTheDocument();
    });

    it("says nothing about inactive accounts when every account is active", async () => {
        renderPanel();

        await screen.findByText("admin@example.com");
        expect(screen.queryByText(/not active/)).not.toBeInTheDocument();
    });
});
