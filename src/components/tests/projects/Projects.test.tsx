import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { useProjectService } from "@/ProjectServiceContext";
import Projects from "@/pages/Dashboard/projects/Projects";

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: vi.fn(),
}));

vi.mock("@/components/common/PageMeta", () => ({
    default: () => null,
}));

vi.mock("@/icons", () => ({
    ChevronDownIcon: (props: any) => <svg data-testid="chevron-down-icon" {...props} />,
}));

vi.mock("@/components/projects/ProjectsCard", () => ({
    default: ({
        label,
        description,
        isSelected,
        onSelect,
        onDelete,
        onRename,
        onShare,
        id,
        projectOwnerId,
    }: {
        label: string;
        description?: string;
        isSelected?: boolean;
        onSelect?: () => void;
        onDelete?: (id: string | number) => void;
        onRename?: (id: string | number, newName: string, newDescription: string) => void;
        onShare?: (id: string | number) => void;
        id: string | number;
        projectOwnerId: string | number | null;
    }) => (
        <div data-testid={`project-card-${id}`}>
            <div>{label}</div>
            <div>{description}</div>
            <div>{isSelected ? "selected" : "not-selected"}</div>
            <button type="button" onClick={onSelect}>
                Select {label}
            </button>
            <button type="button" onClick={() => onDelete?.(id)}>
                Delete {label}
            </button>
            <button
                type="button"
                onClick={() => onRename?.(id, `${label} renamed`, `${description ?? ""} updated`)}
            >
                Rename {label}
            </button>
            <button type="button" onClick={() => onShare?.(id)}>
                Share {label}
            </button>
            <div>owner:{String(projectOwnerId)}</div>
        </div>
    ),
}));

vi.mock("@/components/projects/NewProjectModal", () => ({
    default: ({
        open,
        onClose,
        onCreate,
    }: {
        open: boolean;
        onClose: () => void;
        onCreate?: (proj: any) => void;
    }) =>
        open ? (
            <div>
                <div>Mock NewProjectModal</div>
                <button
                    type="button"
                    onClick={() =>
                        onCreate?.({
                            id: 99,
                            name: "Created Project",
                            description: "Created description",
                            createdAt: "2026-04-10T10:00:00Z",
                            isOwner: true,
                            isShared: false,
                            permission: "full",
                            projectOwnerId: 1,
                        })
                    }
                >
                    Confirm create
                </button>
                <button type="button" onClick={onClose}>
                    Close create modal
                </button>
            </div>
        ) : null,
}));

vi.mock("@/components/projects/ShareProjectModal", () => ({
    default: ({
        open,
        projectId,
        projectName,
        projectOwnerId,
        onClose,
    }: {
        open: boolean;
        projectId: string | number | null;
        projectName?: string;
        projectOwnerId?: string | number;
        onClose: () => void;
    }) =>
        open ? (
            <div>
                <div>Mock ShareProjectModal</div>
                <div>share-id:{String(projectId)}</div>
                <div>share-name:{projectName}</div>
                <div>share-owner:{String(projectOwnerId)}</div>
                <button type="button" onClick={onClose}>
                    Close share modal
                </button>
            </div>
        ) : null,
}));

vi.mock("@/components/projects/ImportProjectDialog", () => ({
    default: ({
        open,
        onClose,
    }: {
        open: boolean;
        onClose: () => void;
    }) =>
        open ? (
            <div>
                <div>Mock ImportProjectDialog</div>
                <button type="button" onClick={onClose}>
                    Close import modal
                </button>
            </div>
        ) : null,
}));

vi.mock("react-hot-toast", () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe("Projects page", () => {
    const serviceStub = {
        fetchList: vi.fn(),
        resolveBrowserPaths: vi.fn(),
        listRemoteDirectory: vi.fn(),
        previewRemoteEntry: vi.fn(),
        buildProtocolDownloadUrl: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useProjectService as unknown as ReturnType<typeof vi.fn>).mockReturnValue(serviceStub);
    });

    it("loads and renders the project list", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Alpha",
                description: "Alpha description",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
            {
                id: 2,
                name: "Beta",
                description: "Beta description",
                createdAt: "2026-04-02T10:00:00Z",
                isOwner: false,
                isShared: true,
                permission: "read",
                projectOwnerId: 9,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();

        const totalStatCard = screen.getByText("Total").parentElement;
        expect(totalStatCard).not.toBeNull();
        expect(within(totalStatCard as HTMLElement).getByText("2")).toBeInTheDocument();

        expect(
            screen.getByText("Browse your projects, open workflows, and manage sharing."),
        ).toBeInTheDocument();
    });

    it("filters projects by the search box", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Alpha",
                description: "Microscopy project",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
            {
                id: 2,
                name: "Beta",
                description: "Tomography project",
                createdAt: "2026-04-02T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Alpha")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("Search projects…"), {
            target: { value: "tomo" },
        });

        expect(screen.getByText("Beta")).toBeInTheDocument();
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    });

    it("shows an error message when loading fails", async () => {
        const fetchList = vi.fn().mockRejectedValue(new Error("Boom loading projects"));

        render(<Projects fetchList={fetchList} />);

        expect(
            await screen.findByText("Error loading projects: Boom loading projects"),
        ).toBeInTheDocument();
    });

    it("opens the actions dropdown and shows create/import options", async () => {
        const fetchList = vi.fn().mockResolvedValue([]);

        render(<Projects fetchList={fetchList} />);

        await waitFor(() => {
            expect(screen.getByText("No projects found.")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /Actions/i }));

        expect(screen.getByText("New project")).toBeInTheDocument();
        expect(screen.getByText("Import project")).toBeInTheDocument();
        expect(screen.getByText("Import workflow")).toBeInTheDocument();
    });

    it("opens the new project modal and prepends the created project", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Existing Project",
                description: "Existing description",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Existing Project")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Actions/i }));
        fireEvent.click(screen.getByText("New project"));

        expect(screen.getByText("Mock NewProjectModal")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Confirm create" }));

        expect(screen.getByText("Created Project")).toBeInTheDocument();
        expect(screen.getByText("Created description")).toBeInTheDocument();
    });

    it("updates local state when a project is renamed from a card", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Alpha",
                description: "Original description",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Alpha")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Rename Alpha" }));

        expect(screen.getByText("Alpha renamed")).toBeInTheDocument();
        expect(screen.getByText("Original description updated")).toBeInTheDocument();
    });

    it("removes a project from local state when deleted from a card", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Alpha",
                description: "Alpha description",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
            {
                id: 2,
                name: "Beta",
                description: "Beta description",
                createdAt: "2026-04-02T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Delete Alpha" }));

        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    it("opens the share modal with the selected project info", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Alpha",
                description: "Alpha description",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 17,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Alpha")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Share Alpha" }));

        expect(screen.getByText("Mock ShareProjectModal")).toBeInTheDocument();
        expect(screen.getByText("share-id:1")).toBeInTheDocument();
        expect(screen.getByText("share-name:Alpha")).toBeInTheDocument();
        expect(screen.getByText("share-owner:17")).toBeInTheDocument();
    });

    it("marks a project as selected when its card is selected", async () => {
        const fetchList = vi.fn().mockResolvedValue([
            {
                id: 1,
                name: "Alpha",
                description: "Alpha description",
                createdAt: "2026-04-01T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
            {
                id: 2,
                name: "Beta",
                description: "Beta description",
                createdAt: "2026-04-02T10:00:00Z",
                isOwner: true,
                isShared: false,
                permission: "full",
                projectOwnerId: 1,
            },
        ]);

        render(<Projects fetchList={fetchList} />);

        expect(await screen.findByText("Alpha")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Select Beta" }));

        const betaCard = screen.getByTestId("project-card-2");
        const alphaCard = screen.getByTestId("project-card-1");

        expect(within(betaCard).getByText("selected")).toBeInTheDocument();
        expect(within(alphaCard).getByText("not-selected")).toBeInTheDocument();
    });
});