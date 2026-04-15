import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ProjectCard from "../../projects/ProjectsCard";
import { useNavigate } from "react-router-dom";
import { useProjectService } from "@/ProjectServiceContext";
import toast from "react-hot-toast";

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/icons", () => ({
  CalendarIcon: (props: any) => <svg data-testid="calendar-icon" {...props} />,
  FolderIcon: (props: any) => <svg data-testid="folder-icon" {...props} />,
  StorageIcon: (props: any) => <svg data-testid="storage-icon" {...props} />,
  OpenFolderIcon: (props: any) => <svg data-testid="open-folder-icon" {...props} />,
  RenameIcon: (props: any) => <svg data-testid="rename-icon" {...props} />,
  TrashBinIcon: (props: any) => <svg data-testid="trash-icon" {...props} />,
}));

vi.mock("../../projects/ProjectActions", () => ({
  default: ({
    onOpen,
    onRename,
    onRemove,
    onShare,
  }: {
    onOpen?: () => void;
    onRename?: () => void;
    onRemove?: () => void;
    onShare?: () => void;
  }) => (
    <div>
      <button type="button" onClick={onOpen} disabled={!onOpen}>
        Mock action open
      </button>
      <button type="button" onClick={onRename} disabled={!onRename}>
        Mock action rename
      </button>
      <button type="button" onClick={onShare} disabled={!onShare}>
        Mock action share
      </button>
      <button type="button" onClick={onRemove} disabled={!onRemove}>
        Mock action remove
      </button>
    </div>
  ),
}));

class MockIntersectionObserver {
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = () => {
    this.callback(
      [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  };

  unobserve = () => {};

  disconnect = () => {};

  takeRecords = () => [];
}

describe("ProjectsCard", () => {
  const navigate = vi.fn();
  const deleteProject = vi.fn();
  const renameProject = vi.fn();
  const resolveBackendUrl = vi.fn((url: string) => url);
  const fetchBlobObjectUrl = vi.fn();
  const fetchProjectThumbnailItems = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    (useNavigate as unknown as ReturnType<typeof vi.fn>).mockReturnValue(navigate);
    (useProjectService as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      deleteProject,
      renameProject,
      resolveBackendUrl,
      fetchBlobObjectUrl,
      fetchProjectThumbnailItems,
    });
  });

  it("renders the main project information", () => {
    render(
      <ProjectCard
        id={7}
        label="Alpha Project"
        value={7}
        description="Project description"
        createdAt="2026-04-01T10:00:00Z"
        diskUsage="12 GB"
        projectOwnerId={1}
        isOwner={true}
        permission="write"
        status="running"
      />,
    );

    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    expect(screen.getByText("P7")).toBeInTheDocument();
    expect(screen.getByText("write")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument();
    expect(screen.getByText("12 GB")).toBeInTheDocument();
  });

  it("shows guest/shared state for a shared non-owner project", () => {
    render(
      <ProjectCard
        id={8}
        label="Shared Project"
        value={8}
        projectOwnerId={999}
        isOwner={false}
        isShared={true}
        permission="read"
      />,
    );

    expect(screen.getByText("Shared · read")).toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("navigates to the project when clicking Open project", () => {
    render(
      <ProjectCard
        id={42}
        label="Openable Project"
        value={42}
        projectOwnerId={1}
        isOwner={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open project" }));

    expect(navigate).toHaveBeenCalledWith("/project/load/42");
  });

  it("renames the project successfully", async () => {
    const onRename = vi.fn();
    renameProject.mockResolvedValue(undefined);

    render(
      <ProjectCard
        id={5}
        label="Old Project"
        value={5}
        description="Old description"
        projectOwnerId={1}
        isOwner={true}
        onRename={onRename}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action rename" }));

    expect(screen.getByText("Rename project")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "  New Project  " },
    });

    fireEvent.change(screen.getByPlaceholderText("Project description"), {
      target: { value: "  New description  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(renameProject).toHaveBeenCalledWith("5", "New Project", "New description");
    });

    expect(onRename).toHaveBeenCalledWith(5, "New Project", "New description");
    expect(toast.success).toHaveBeenCalledWith("Project renamed successfully");
  });

  it("shows a validation error when the rename name is empty", async () => {
    render(
      <ProjectCard
        id={6}
        label="Name Test"
        value={6}
        description="Some description"
        projectOwnerId={1}
        isOwner={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action rename" }));

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "   " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Project name cannot be empty.")).toBeInTheDocument();
    expect(renameProject).not.toHaveBeenCalled();
  });

  it("shows a validation error when the description is too short", async () => {
    render(
      <ProjectCard
        id={9}
        label="Description Test"
        value={9}
        description="Initial description"
        projectOwnerId={1}
        isOwner={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action rename" }));

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Valid name" },
    });

    fireEvent.change(screen.getByPlaceholderText("Project description"), {
      target: { value: "ab" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("Description must be at least 3 characters."),
    ).toBeInTheDocument();
    expect(renameProject).not.toHaveBeenCalled();
  });

  it("deletes the project after confirmation", async () => {
    const onDelete = vi.fn();
    deleteProject.mockResolvedValue(undefined);

    render(
      <ProjectCard
        id={11}
        label="Delete Me"
        value={11}
        projectOwnerId={1}
        isOwner={true}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action remove" }));

    expect(screen.getByText("Delete project?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith("11");
    });

    expect(onDelete).toHaveBeenCalledWith(11);
    expect(toast.success).toHaveBeenCalledWith(
      'Project "Delete Me" deleted successfully',
    );
  });

  it("disables owner-only actions for non-owners", () => {
    render(
      <ProjectCard
        id={12}
        label="Read Only Project"
        value={12}
        projectOwnerId={999}
        isOwner={false}
        isShared={true}
      />,
    );

    expect(screen.getByRole("button", { name: "Mock action open" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mock action rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mock action share" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mock action remove" })).toBeDisabled();
  });

  it("calls onShare for owners", () => {
    const onShare = vi.fn();

    render(
      <ProjectCard
        id={13}
        label="Sharable Project"
        value={13}
        projectOwnerId={1}
        isOwner={true}
        onShare={onShare}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action share" }));

    expect(onShare).toHaveBeenCalledWith(13);
  });
});