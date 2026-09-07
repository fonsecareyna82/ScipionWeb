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
    role: "admin" as const,
    isActive: true,
    isVerified: true,
  },
  {
    id: 2,
    email: "user@example.com",
    firstName: "Normal",
    lastName: "User",
    institution: "Lab",
    role: "user" as const,
    isActive: true,
    isVerified: true,
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

  it("prevents editing the current admin", async () => {
    renderPanel();

    await screen.findByText("admin@example.com");

    expect(screen.getByLabelText("Active admin@example.com")).toBeDisabled();
    expect(screen.getByLabelText("Role admin@example.com")).toBeDisabled();
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
});