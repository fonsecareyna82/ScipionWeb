import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import NewProjectModal from "../../projects/NewProjectModal";
import { makeRawProject, resetFactories } from "../factories";
import { createProjectServiceMock, renderWithProviders } from "../test-utils";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("NewProjectModal", () => {
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetFactories();
  });

  it("does not render when closed", () => {
    const service = createProjectServiceMock();

    renderWithProviders(
      <NewProjectModal open={false} onClose={onClose} />,
      { service },
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("New project")).not.toBeInTheDocument();
  });

  it("shows a validation error when trying to create without a name", () => {
    const service = createProjectServiceMock({
      createProject: vi.fn(),
    });

    renderWithProviders(
      <NewProjectModal open={true} onClose={onClose} />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      screen.getByText("Project name is required."),
    ).toBeInTheDocument();
    expect(service.createProject).not.toHaveBeenCalled();
  });

  it("creates a project with trimmed values and calls callbacks", async () => {
    const createdProject = makeRawProject({
      id: "1",
      name: "My project",
      description: "Some description",
    });

    const service = createProjectServiceMock({
      createProject: vi.fn().mockResolvedValue(createdProject),
    });

    renderWithProviders(
      <NewProjectModal
        open={true}
        onClose={onClose}
        onCreate={onCreate}
      />,
      { service },
    );

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "  My project  " },
    });

    fireEvent.change(screen.getByPlaceholderText("A short description"), {
      target: { value: "  Some description  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(service.createProject).toHaveBeenCalledWith({
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
    const service = createProjectServiceMock();

    renderWithProviders(
      <NewProjectModal open={true} onClose={onClose} />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});