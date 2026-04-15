import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import NewProjectModal from "../../projects/NewProjectModal";
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

describe("NewProjectModal", () => {
  const createProject = vi.fn();
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useProjectService as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      createProject,
    });
  });

  it("does not render when closed", () => {
    render(<NewProjectModal open={false} onClose={onClose} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("New project")).not.toBeInTheDocument();
  });

  it("shows a validation error when trying to create without a name", async () => {
    render(<NewProjectModal open={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      screen.getByText("Project name is required."),
    ).toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });

  it("creates a project with trimmed values and calls callbacks", async () => {
    const createdProject = { id: 1, name: "My project" };
    createProject.mockResolvedValue(createdProject);

    render(
      <NewProjectModal
        open={true}
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "  My project  " },
    });

    fireEvent.change(screen.getByPlaceholderText("A short description"), {
      target: { value: "  Some description  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: "My project",
        description: "Some description",
      });
    });

    expect(onCreate).toHaveBeenCalledWith(createdProject);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("closes when Cancel is clicked", () => {
    render(<NewProjectModal open={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});