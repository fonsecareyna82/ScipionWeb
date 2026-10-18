import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import ProjectCard from "../../projects/ProjectsCard";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { makeProject, resetFactories } from "../factories";
import { createProjectServiceMock, renderWithProviders } from "../test-utils";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("framer-motion", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      // Forwards the ref: the card watches its element to load its thumbnails.
      div: React.forwardRef<HTMLDivElement, Record<string, any>>(
        ({ children, initial: _initial, animate: _animate, transition: _transition, ...props }, ref) => (
          <div ref={ref} {...props}>{children}</div>
        ),
      ),
    },
  };
});

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

  beforeEach(() => {
    vi.clearAllMocks();
    resetFactories();

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    (useNavigate as unknown as ReturnType<typeof vi.fn>).mockReturnValue(navigate);
  });

  it("renders the main project information", () => {
    const service = createProjectServiceMock();

    renderWithProviders(
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
      { service },
    );

    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    expect(screen.getByText("P7")).toBeInTheDocument();
    expect(screen.getByText("write")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument();
    expect(screen.getByText("12 GB")).toBeInTheDocument();
  });

  it("shows the signed thumbnails of the best protocols, each image downloaded by its URL", async () => {
    const fetchThumbnailImageObjectUrl = vi.fn(async (url: string) => (url.includes("outputCTF") ? null : `blob:${url}`));
    const service = createProjectServiceMock({
      fetchProjectThumbnails: vi.fn().mockResolvedValue({
        projectId: 9,
        size: 256,
        scope: "card",
        groups: [
          {
            protocolId: "10",
            label: "import micrographs",
            status: "finished",
            outputs: [
              { outputName: "outputMicrographs", signature: "a", state: "ready", url: "/projects/9/protocols/10/outputs/outputMicrographs/thumbnail-image?size=256&sig=a" },
              { outputName: "outputBroken", signature: "b", state: "unavailable", url: "/x" },
            ],
          },
          {
            protocolId: "20",
            label: "ctffind",
            status: "running",
            outputs: [{ outputName: "outputCTF", signature: "c", state: "pending", url: "/projects/9/protocols/20/outputs/outputCTF/thumbnail-image?size=256&sig=c" }],
          },
        ],
      }),
      fetchThumbnailImageObjectUrl,
    });

    renderWithProviders(
      <ProjectCard id={9} label="Thumbs" value={9} projectOwnerId={1} isOwner={true} />,
      { service },
    );

    const image = await screen.findByAltText("outputMicrographs");
    expect(image).toHaveAttribute("src", "blob:/projects/9/protocols/10/outputs/outputMicrographs/thumbnail-image?size=256&sig=a");
    expect(service.fetchProjectThumbnails).toHaveBeenCalledWith(9, expect.objectContaining({ scope: "card", maxProtocols: 4 }));
    expect(screen.getByText("import micrographs")).toBeInTheDocument();
    expect(screen.getByText("ctffind")).toBeInTheDocument();
    // The output that cannot be drawn is not asked for.
    expect(fetchThumbnailImageObjectUrl).toHaveBeenCalledTimes(2);
    expect(screen.queryByAltText("outputBroken")).not.toBeInTheDocument();
  });

  it("shows guest/shared state for a shared non-owner project", () => {
    const service = createProjectServiceMock();

    renderWithProviders(
      <ProjectCard
        id={8}
        label="Shared Project"
        value={8}
        projectOwnerId={999}
        isOwner={false}
        isShared={true}
        permission="read"
      />,
      { service },
    );

    expect(screen.getByText("Shared · read")).toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it("navigates to the project when clicking Open project", () => {
    const service = createProjectServiceMock();

    renderWithProviders(
      <ProjectCard
        id={42}
        label="Openable Project"
        value={42}
        projectOwnerId={1}
        isOwner={true}
      />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Open project" }));

    expect(navigate).toHaveBeenCalledWith("/project/load/42");
  });

  it("renames the project successfully", async () => {
    const onRename = vi.fn();
    const service = createProjectServiceMock({
      renameProject: vi.fn().mockResolvedValue(undefined),
    });

    renderWithProviders(
      <ProjectCard
        id={5}
        label="Old Project"
        value={5}
        description="Old description"
        projectOwnerId={1}
        isOwner={true}
        onRename={onRename}
      />,
      { service },
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
      expect(service.renameProject).toHaveBeenCalledWith("5", "New Project", "New description");
    });

    expect(onRename).toHaveBeenCalledWith(5, "New Project", "New description");
    expect(toast.success).toHaveBeenCalledWith("Project renamed successfully");
  });

  it("shows a validation error when the rename name is empty", () => {
    const service = createProjectServiceMock({
      renameProject: vi.fn(),
    });

    renderWithProviders(
      <ProjectCard
        id={6}
        label="Name Test"
        value={6}
        description="Some description"
        projectOwnerId={1}
        isOwner={true}
      />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action rename" }));

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "   " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Project name cannot be empty.")).toBeInTheDocument();
    expect(service.renameProject).not.toHaveBeenCalled();
  });

  it("shows a validation error when the description is too short", () => {
    const service = createProjectServiceMock({
      renameProject: vi.fn(),
    });

    renderWithProviders(
      <ProjectCard
        id={9}
        label="Description Test"
        value={9}
        description="Initial description"
        projectOwnerId={1}
        isOwner={true}
      />,
      { service },
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
    expect(service.renameProject).not.toHaveBeenCalled();
  });

  it("deletes the project after confirmation", async () => {
    const onDelete = vi.fn();
    const service = createProjectServiceMock({
      deleteProject: vi.fn().mockResolvedValue(undefined),
    });

    renderWithProviders(
      <ProjectCard
        id={11}
        label="Delete Me"
        value={11}
        projectOwnerId={1}
        isOwner={true}
        onDelete={onDelete}
      />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action remove" }));

    expect(screen.getByText("Delete project?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(service.deleteProject).toHaveBeenCalledWith("11");
    });

    expect(onDelete).toHaveBeenCalledWith(11);
    expect(toast.success).toHaveBeenCalledWith(
      'Project "Delete Me" deleted successfully',
    );
  });

  it("shows that the project is being deleted and cannot be closed meanwhile", async () => {
    let finish: () => void = () => undefined;
    const service = createProjectServiceMock({
      deleteProject: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })),
    });

    renderWithProviders(
      <ProjectCard id={13} label="Big Project" value={13} projectOwnerId={1} isOwner={true} />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const busy = await screen.findByRole("button", { name: "Deleting…" });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByText("Delete project?")).toBeInTheDocument();
    fireEvent.click(busy);
    expect(service.deleteProject).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(screen.queryByText("Delete project?")).not.toBeInTheDocument());
  });

  it("disables owner-only actions for non-owners", () => {
    const service = createProjectServiceMock();

    renderWithProviders(
      <ProjectCard
        id={12}
        label="Read Only Project"
        value={12}
        projectOwnerId={999}
        isOwner={false}
        isShared={true}
      />,
      { service },
    );

    expect(screen.getByRole("button", { name: "Mock action open" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mock action rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mock action share" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mock action remove" })).toBeDisabled();
  });

  it("calls onShare for owners", () => {
    const onShare = vi.fn();
    const service = createProjectServiceMock();

    renderWithProviders(
      <ProjectCard
        id={13}
        label="Sharable Project"
        value={13}
        projectOwnerId={1}
        isOwner={true}
        onShare={onShare}
      />,
      { service },
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock action share" }));

    expect(onShare).toHaveBeenCalledWith(13);
  });

  it("can render from a factory-built project shape", () => {
    const project = makeProject({
      id: "21",
      name: "Factory Project",
      description: "Factory description",
      isOwner: true,
      isShared: false,
      permission: "full",
      projectOwnerId: "1",
      diskUsage: "3 GB",
    });

    const service = createProjectServiceMock();

    renderWithProviders(
      <ProjectCard
        id={project.id}
        label={project.name}
        value={project.protocolsCount ?? "0"}
        description={project.description}
        createdAt={project.createdAt.toISOString()}
        updatedAt={project.updatedAt?.toISOString()}
        diskUsage={project.diskUsage}
        projectOwnerId={project.projectOwnerId}
        isOwner={project.isOwner}
        isShared={project.isShared}
        permission={project.permission}
      />,
      { service },
    );

    expect(screen.getByText("Factory Project")).toBeInTheDocument();
    expect(screen.getByText("3 GB")).toBeInTheDocument();
  });
});