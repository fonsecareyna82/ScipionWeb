import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolNodeCard from "@/components/protocol/ProtocolNodeCard";
import { run } from "node:test";
import { comment } from "postcss";

const mockSetCurrentDraggedOutput = vi.fn();
const mockUseProjectService = vi.fn();
const mockUseTagStore = vi.fn();
const mockWindowOpen = vi.fn();
const mockWindowAssign = vi.fn();

vi.mock("react-hot-toast", () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const mockReactFlowGetNodes = vi.fn();
const mockReactFlowSetNodes = vi.fn();

vi.mock("reactflow", () => ({
    Handle: (props: any) => <div data-testid={`handle-${props.type}`} />,
    Position: {
        Top: "top",
        Bottom: "bottom",
        Left: "left",
        Right: "right",
    },
    useReactFlow: () => ({
        getNodes: mockReactFlowGetNodes,
        setNodes: mockReactFlowSetNodes,
    }),
}));

vi.mock("@/components/protocol/DragContext", () => ({
    useDrag: () => ({
        setCurrentDraggedOutput: mockSetCurrentDraggedOutput,
    }),
}));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => mockUseProjectService(),
}));

vi.mock("@/stores/tag_store", () => ({
    useTagStore: () => mockUseTagStore(),
}));

vi.mock("@/components/analyze/analyze-output-dialog", () => ({
    default: ({
        open,
        outputName,
    }: {
        open: boolean;
        outputName: string;
    }) =>
        open ? (
            <div data-testid="analyze-output-dialog">{outputName}</div>
        ) : null,
}));

vi.mock("@/components/files/RemoteFileDialog", () => ({
    default: ({
        open,
        defaultFilename,
        onPick,
    }: {
        open: boolean;
        defaultFilename?: string;
        onPick?: (directoryPath: string, entry: any, filename?: string) => void;
    }) =>
        open ? (
            <div data-testid="remote-file-dialog">
                <div>{defaultFilename}</div>
                <button
                    onClick={() =>
                        onPick?.(
                            "/exports",
                            { path: "/exports", isDir: true },
                            defaultFilename || "protocols_export.json",
                        )
                    }
                >
                    Confirm remote pick
                </button>
            </div>
        ) : null,
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
    const React = await import("react");
    return {
        DropdownMenu: ({ children }: any) => <div>{children}</div>,
        DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
        DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
        DropdownMenuItem: ({ children, onClick, onSelect, ...props }: any) => (
            <button
                {...props}
                onClick={() => {
                    onClick?.();
                    onSelect?.({ preventDefault() { }, stopPropagation() { } });
                }}
            >
                {children}
            </button>
        ),
        DropdownMenuSeparator: () => <hr />,
        DropdownMenuSub: ({ children }: any) => <div>{children}</div>,
        DropdownMenuSubTrigger: ({ children, ...props }: any) => (
            <button {...props}>{children}</button>
        ),
        DropdownMenuSubContent: ({ children }: any) => <div>{children}</div>,
    };
});

vi.mock("@/components/ui/context-menu", async () => {
    const React = await import("react");
    return {
        ContextMenu: ({ children }: any) => <div>{children}</div>,
        ContextMenuTrigger: ({ children }: any) => <div>{children}</div>,
        ContextMenuContent: ({ children }: any) => <div>{children}</div>,
        ContextMenuItem: ({ children, onClick, onSelect, ...props }: any) => (
            <button
                {...props}
                onClick={() => {
                    onClick?.();
                    onSelect?.({ preventDefault() { }, stopPropagation() { } });
                }}
            >
                {children}
            </button>
        ),
        ContextMenuSeparator: () => <hr />,
        ContextMenuSub: ({ children }: any) => <div>{children}</div>,
        ContextMenuSubTrigger: ({ children, ...props }: any) => (
            <button {...props}>{children}</button>
        ),
        ContextMenuSubContent: ({ children }: any) => <div>{children}</div>,
    };
});

vi.mock("@/icons", () => ({
    CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

vi.mock("lucide-react", () => {
    const makeIcon =
        (name: string) =>
            (props: any) =>
                <svg data-testid={name} {...props} />;
    return {
        MoreHorizontal: makeIcon("more-horizontal"),
        Pencil: makeIcon("pencil"),
        FolderOpen: makeIcon("folder-open"),
        Copy: makeIcon("copy"),
        Trash2: makeIcon("trash-2"),
        FileUp: makeIcon("file-up"),
        RefreshCw: makeIcon("refresh"),
        Play: makeIcon("play"),
        RotateCcw: makeIcon("rotate"),
        ArrowUpRight: makeIcon("arrow-up-right"),
        Square: makeIcon("square"),
        ArrowLeft: makeIcon("arrow-left"),
        ArrowRight: makeIcon("arrow-right"),
        ArrowDown: makeIcon("arrow-down"),
        ArrowUp: makeIcon("arrow-up"),
        Scan: makeIcon("scan"),
        Eye: makeIcon("eye"),
        Tags: makeIcon("tags"),
        HelpCircle: makeIcon("help-circle"),
        Plus: makeIcon("plus"),
        Check: makeIcon("check"),
        FileIcon: makeIcon("file-icon"),
    };
});

function createProtocolData(overrides: Record<string, any> = {}) {
    return {
        id: "12",
        label: "Import Movies",
        title: "Import Movies",
        status: "running",
        runName: "Import Movies",
        comment: "This protocol imports movies",
        tick: 3661,
        projectId: 1,
        outputs: [
            {
                outputName: "moviesOutput",
                info: "Set of movies",
                paramClass: "PointerParam",
                pointerClass: "SetOfMovies",
                value: "movies.sqlite",
                parentId: "12",
            },
        ],
        tags: ["tag-1"],
        ...overrides,
    };
}


function renderComponent(
    overrides: Partial<React.ComponentProps<typeof ProtocolNodeCard>> = {},
) {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const onOpenProtocolClass = vi.fn();

    const service = {
        resolveBrowserPaths: vi.fn(),
        listRemoteDirectory: vi.fn(),
        previewRemoteEntry: vi.fn(),
        buildProtocolDownloadUrl: vi.fn(),
        listProjectTags: vi.fn().mockResolvedValue([
            { id: "tag-1", title: "Urgent", color: "#ff0000" },
            { id: "tag-2", title: "Reviewed", color: "#00ff00" },
        ]),
        getNextProtocolSuggestions: vi.fn().mockResolvedValue([
            {
                protocolName: "Import CTF",
                protocolClass: "ProtImportCtf",
                help: "Read **this** https://example.com",
                installed: "installed",
            },
        ]),
        exportProtocols: vi.fn().mockResolvedValue({
            filename: "protocols_export.json",
        }),
        setProtocolTagIds: vi.fn().mockResolvedValue(undefined),
    };

    mockUseProjectService.mockReturnValue(service);

    mockUseTagStore.mockReturnValue({
        tags: [],
        setTags: vi.fn(),
    });

    mockReactFlowGetNodes.mockReturnValue([]);
    mockReactFlowSetNodes.mockClear();

    render(
        <ProtocolNodeCard
            data={createProtocolData()}
            selectedNodeId="999"
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onOpenProtocolClass={onOpenProtocolClass}
            {...overrides}
        />,
    );

    return {
        onEdit,
        onDelete,
        onDuplicate,
        onOpenProtocolClass,
        service,
    };
}

describe("ProtocolNodeCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockWindowOpen.mockReset();
        mockWindowAssign.mockReset();

        vi.stubGlobal("open", mockWindowOpen);
        Object.defineProperty(window, "location", {
            value: {
                assign: mockWindowAssign,
            },
            writable: true,
        });
    });

    it("renders protocol label, id, status, formatted cpu time, outputs and tag chips", async () => {
        renderComponent();

        expect(screen.getByText("Import Movies")).toBeInTheDocument();
        expect(screen.getByText("12")).toBeInTheDocument();
        expect(screen.getByText("running")).toBeInTheDocument();
        expect(screen.getByText("01h:01m:01s")).toBeInTheDocument();

        expect(screen.getByText("Set of movies")).toBeInTheDocument();
        const urgentTexts = await screen.findAllByText("Urgent");
        expect(urgentTexts.length).toBeGreaterThan(0);
    });

    it("calls onEdit when clicking the edit protocol button", () => {
        const { onEdit } = renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Edit protocol" }));

        expect(onEdit).toHaveBeenCalledWith("12");
    });

    it("opens the internal analyze dialog when clicking output viewer without external resolver", async () => {
        renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "View output" }));

        expect(await screen.findByTestId("analyze-output-dialog")).toBeInTheDocument();
        expect(screen.getByText("moviesOutput")).toBeInTheDocument();
    });

    it("renders scalar outputs without a viewer action and keeps them draggable", () => {
        renderComponent({
            data: createProtocolData({
                outputs: [
                    {
                        outputName: "boxsize",
                        info: "256",
                        paramClass: "PointerParam",
                        pointerClass: "Integer",
                        value: "Import Movies.boxsize",
                        parentId: "12",
                    },
                ],
            }),
        });

        expect(
            screen.getByText("boxsize: 256"),
        ).toBeInTheDocument();

        expect(
            screen.queryByRole(
                "button",
                { name: "View output" },
            ),
        ).not.toBeInTheDocument();

        const pill =
            screen
                .getByText("boxsize: 256")
                .closest("div") as HTMLElement;

        const setData = vi.fn();
        const setDragImage = vi.fn();

        fireEvent.dragStart(pill, {
            dataTransfer: {
                setData,
                setDragImage,
            },
        });

        expect(
            mockSetCurrentDraggedOutput,
        ).toHaveBeenCalledWith({
            paramClass: "PointerParam",
            pointerClass: "Integer",
            _expectedClass: "Integer",
            value: "Import Movies.boxsize",
            info: "256",
            parentId: "12",
            name: "boxsize",
        });
    });

    it("uses the external analyze viewer resolver when it handles the output", async () => {
        const resolveAnalyzeViewer = vi.fn().mockResolvedValue({
            handled: true,
            url: "https://example.com/viewer",
            target: "_blank",
        });

        renderComponent({
            service: {
                resolveAnalyzeViewer,
            },
        });

        fireEvent.click(screen.getByRole("button", { name: "View output" }));

        await waitFor(() => {
            expect(resolveAnalyzeViewer).toHaveBeenCalledTimes(1);
        });

        expect(mockWindowOpen).toHaveBeenCalledWith(
            "https://example.com/viewer",
            "_blank",
            "noopener,noreferrer",
        );
        expect(screen.queryByTestId("analyze-output-dialog")).not.toBeInTheDocument();
    });

    it("uses window.location.assign when external resolver targets _self", async () => {
        const resolveAnalyzeViewer = vi.fn().mockResolvedValue({
            handled: true,
            url: "https://example.com/internal-viewer",
            target: "_self",
        });

        renderComponent({
            service: {
                resolveAnalyzeViewer,
            },
        });

        fireEvent.click(screen.getByRole("button", { name: "View output" }));

        await waitFor(() => {
            expect(resolveAnalyzeViewer).toHaveBeenCalledTimes(1);
        });

        expect(mockWindowAssign).toHaveBeenCalledWith("https://example.com/internal-viewer");
        expect(screen.queryByTestId("analyze-output-dialog")).not.toBeInTheDocument();
    });

    it("sets dragged output data on drag start and clears it on drag end", () => {
        renderComponent();

        const pill = screen.getByText("Set of movies").closest("div") as HTMLElement;
        const setData = vi.fn();
        const setDragImage = vi.fn();

        fireEvent.dragStart(pill, {
            dataTransfer: {
                setData,
                setDragImage,
            },
        });

        expect(mockSetCurrentDraggedOutput).toHaveBeenCalledWith({
            paramClass: "PointerParam",
            pointerClass: "SetOfMovies",
            _expectedClass: "SetOfMovies",
            value: "movies.sqlite",
            info: "Set of movies",
            parentId: "12",
            name: "moviesOutput",
        });

        expect(setData).toHaveBeenCalledWith(
            "application/scipion-output",
            JSON.stringify({
                paramClass: "PointerParam",
                pointerClass: "SetOfMovies",
                _expectedClass: "SetOfMovies",
                value: "movies.sqlite",
                info: "Set of movies",
                parentId: "12",
                name: "moviesOutput",
            }),
        );

        fireEvent.dragEnd(pill);

        expect(mockSetCurrentDraggedOutput).toHaveBeenLastCalledWith(null);
    });

    it("shows reduced selection actions when path selection is active", async () => {
        const { service } = renderComponent({
            inPathSelection: true,
            pathSelectionActive: true,
            data: createProtocolData({ status: "running" }),
        });

        expect(screen.getAllByText("Stop selection")[0]).toBeInTheDocument();
        expect(screen.queryByText("Browse")).not.toBeInTheDocument();

        await waitFor(() => {
            expect(service.listProjectTags).toHaveBeenCalled();
        });
    });

    it("loads next step suggestions and opens help dialog for a suggestion", async () => {
        const { onOpenProtocolClass, service } = renderComponent();

        fireEvent.click(screen.getAllByRole("button", { name: /Next step/i })[0]);

        await waitFor(() => {
            expect(service.getNextProtocolSuggestions).toHaveBeenCalled();
        });

        const suggestionTexts = await screen.findAllByText("Import CTF");
        expect(suggestionTexts.length).toBeGreaterThan(0);

        const helpButtons = screen.getAllByLabelText(/Help for Import CTF/i);
        expect(helpButtons.length).toBeGreaterThan(0);
        fireEvent.click(helpButtons[0]);

        expect(
            await screen.findByRole("link", { name: "https://example.com" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "https://example.com" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Open" }));

        expect(onOpenProtocolClass).toHaveBeenCalledWith(
            "ProtImportCtf",
            1,
            "12",
            "Import Movies",
        );
    });

    it("opens export dialog and exports selected protocols", async () => {
        const { service } = renderComponent();

        mockReactFlowGetNodes.mockReturnValue([
            {
                id: "12",
                selected: true,
                data: { projectId: 1, tags: [] },
            },
        ]);

        fireEvent.click(screen.getAllByRole("button", { name: /Export/i })[0]);

        expect(await screen.findByTestId("remote-file-dialog")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Confirm remote pick" }));

        await waitFor(() => {
            expect(service.exportProtocols).toHaveBeenCalled();
        });

        const [projectIdArg, payloadArg] = service.exportProtocols.mock.calls[0];

        expect(projectIdArg).toBe(1);
        expect(payloadArg.protocolIds).toEqual(["12"]);
        expect(payloadArg.directoryPath).toBe("/exports");
        expect(payloadArg.filename).toContain("protocols_export");
    });


    it("updates tags optimistically and persists them to backend", async () => {
        const { service } = renderComponent({
            data: createProtocolData({ tags: [] }),
        });

        mockReactFlowGetNodes.mockReturnValue([
            {
                id: "12",
                selected: true,
                data: { projectId: 1, tags: [] },
            },
        ]);

        const urgentButtons = await screen.findAllByRole("button", { name: /Urgent/i });
        expect(urgentButtons.length).toBeGreaterThan(0);

        fireEvent.click(urgentButtons[0]);

        await waitFor(() => {
            expect(service.setProtocolTagIds).toHaveBeenCalled();
        });

        const [projectIdArg, protocolIdArg, tagIdsArg] = service.setProtocolTagIds.mock.calls[0];

        expect(projectIdArg).toBe(1);
        expect(String(protocolIdArg)).toBe("12");
        expect(tagIdsArg).toEqual(["tag-1"]);

        expect(mockReactFlowSetNodes).toHaveBeenCalled();
    });

    it("calls duplicate and delete actions from menu items", async () => {
        const { onDelete, onDuplicate, service } = renderComponent();

        fireEvent.click(screen.getAllByRole("button", { name: /Duplicate/i })[0]);
        fireEvent.click(screen.getAllByRole("button", { name: /Delete/i })[0]);

        expect(onDuplicate).toHaveBeenCalledWith("12");
        expect(onDelete).toHaveBeenCalledWith("12");

        await waitFor(() => {
            expect(service.listProjectTags).toHaveBeenCalled();
        });
    });

});