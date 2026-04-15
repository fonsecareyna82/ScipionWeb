import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ShareProjectModal from "../../projects/ShareProjectModal";
import { useProjectService } from "@/ProjectServiceContext";
import toast from "react-hot-toast";

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ShareProjectModal", () => {
  const listUsers = vi.fn();
  const listProjectShares = vi.fn();
  const shareProject = vi.fn();
  const revokeProjectShare = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useProjectService as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      listUsers,
      listProjectShares,
      shareProject,
      revokeProjectShare,
    });

    listUsers.mockResolvedValue([
      { id: 1, name: "Owner User", email: "owner@example.com" },
      { id: 2, name: "Shared User", email: "shared@example.com" },
      { id: 3, name: "Invite User", email: "invite@example.com" },
    ]);

    listProjectShares.mockResolvedValue([{ userId: 2 }]);
    shareProject.mockResolvedValue(undefined);
    revokeProjectShare.mockResolvedValue(undefined);
  });

  it("does not render when closed", () => {
    render(
      <ShareProjectModal
        open={false}
        projectId={123}
        projectName="Project A"
        projectOwnerId={1}
        onClose={onClose}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Share project")).not.toBeInTheDocument();
  });

  it("loads users and shows owner/shared/invite states", async () => {
    render(
      <ShareProjectModal
        open={true}
        projectId={123}
        projectName="Project A"
        projectOwnerId={1}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Loading users...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Owner User")).toBeInTheDocument();
    });

    expect(screen.getByText("Shared User")).toBeInTheDocument();
    expect(screen.getByText("Invite User")).toBeInTheDocument();

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Invite")).toBeInTheDocument();

    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listProjectShares).toHaveBeenCalledWith("123");
  });

  it("filters users by the search field", async () => {
    render(
      <ShareProjectModal
        open={true}
        projectId={123}
        projectName="Project A"
        projectOwnerId={1}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Invite User")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search users…"), {
      target: { value: "invite@" },
    });

    expect(screen.getByText("Invite User")).toBeInTheDocument();
    expect(screen.queryByText("Owner User")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared User")).not.toBeInTheDocument();
  });

  it("shares the project with a newly selected user", async () => {
    render(
      <ShareProjectModal
        open={true}
        projectId={123}
        projectName="Project A"
        projectOwnerId={1}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Invite User")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]);

    expect(screen.getByText("1 user selected.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Share (1)" }));

    await waitFor(() => {
      expect(shareProject).toHaveBeenCalledWith("123", ["3"]);
    });

    expect(toast.success).toHaveBeenCalledWith("Project shared successfully");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("revokes access for an already shared user", async () => {
    render(
      <ShareProjectModal
        open={true}
        projectId={123}
        projectName="Project A"
        projectOwnerId={1}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Shared User")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(
      screen.getByRole("heading", { name: "Remove access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The user will no longer see this project or its data."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove access" }));

    await waitFor(() => {
      expect(revokeProjectShare).toHaveBeenCalledWith("123", "2");
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Access revoked for shared@example.com",
    );
  });
});