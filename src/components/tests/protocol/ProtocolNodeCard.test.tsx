import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolNodeCard from "@/components/protocol/ProtocolNodeCard";
import { ProjectTagsContext, type ProjectTagsContextValue } from "@/components/tags/ProjectTagsContext";

const mockSetCurrentDraggedOutput = vi.fn();
const mockUseProjectService = vi.fn();
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
const mockUpdateNodeInternals = vi.fn();

vi.mock("reactflow", () => ({
    Handle: (props: any) => (
        <div
            data-testid={`handle-${props.type}`}
            data-handle-id={props.id ?? ""}
            data-handle-position={props.position ?? ""}
        />
    ),
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
    useUpdateNodeInternals: () => mockUpdateNodeInternals,
}));

vi.mock("@/components/protocol/DragContext", () => ({
    useDrag: () => ({
        setCurrentDraggedOutput: mockSetCurrentDraggedOutput,
    }),
}));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => mockUseProjectService(),
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
        // The hidden button opens the menu as a click on its trigger would
        DropdownMenu: ({ children, onOpenChange }: any) => (
            <div>
                <button hidden data-testid="open-dropdown-menu" onClick={() => onOpenChange?.(true)} />
                {children}
            </div>
        ),
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
        Hand: makeIcon("hand"),
        ListOrdered: makeIcon("list-ordered"),
        X: makeIcon("x"),
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


const projectTagList = [
    { id: "tag-1", title: "Urgent", color: "#ff0000" },
    { id: "tag-2", title: "Reviewed", color: "#00ff00" },
];

// The tags the page provides (useProjectTags), here with a fixed list and map.
function createTagsContext(overrides: Partial<ProjectTagsContextValue> = {}): ProjectTagsContextValue {
    const tags = overrides.tags ?? projectTagList;
    return {
        tags,
        tagsById: new Map(tags.map((t) => [t.id, t])),
        loading: false,
        assignments: { "12": ["tag-1"] },
        toggleTag: vi.fn(),
        requestCreateTag: vi.fn(),
        openManager: vi.fn(),
        ...overrides,
    };
}

function renderComponent(
    overrides: Partial<React.ComponentProps<typeof ProtocolNodeCard>> = {},
    tagsContext: ProjectTagsContextValue = createTagsContext(),
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

    mockReactFlowGetNodes.mockReturnValue([]);
    mockReactFlowSetNodes.mockClear();

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectTagsContext.Provider value={tagsContext}>{children}</ProjectTagsContext.Provider>
    );

    const rendered = render(
        <ProtocolNodeCard
            data={createProtocolData()}
            selectedNodeId="999"
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onOpenProtocolClass={onOpenProtocolClass}
            {...overrides}
        />,
        { wrapper: Wrapper },
    );

    return {
        tagsContext,
        onEdit,
        onDelete,
        onDuplicate,
        onOpenProtocolClass,
        service,
        rerender: rendered.rerender,
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

    describe("GPU activity footer", () => {
        it.each(["running", "RUNNING"])(
            "shows the GPU badge beside the running step footer (status: %s)",
            (status) => {
                renderComponent({
                    data: createProtocolData({ status, gpuIndicatorEligible: true }),
                });

                const badge = screen.getByRole("status", { name: "GPU step running" });
                // Icon-only indicator: accessible name stays, visible text is gone.
                expect(badge.querySelector("svg")).toBeInTheDocument();
                expect(badge).not.toHaveTextContent("GPU");
                expect(badge.closest('[class*="footer"]')).not.toBeNull();
            },
        );

        it("does not show a GPU badge when no running GPU step is eligible", () => {
            renderComponent({
                data: createProtocolData({ status: "running", gpuIndicatorEligible: false }),
            });

            expect(screen.queryByRole("status", { name: "GPU step running" })).not.toBeInTheDocument();
        });

        it.each(["finished", "failed", "aborted", "scheduled"])(
            "does not show a stale GPU badge once the protocol is %s",
            (status) => {
                renderComponent({
                    data: createProtocolData({ status, gpuIndicatorEligible: true }),
                });

                expect(screen.queryByRole("status", { name: "GPU step running" })).not.toBeInTheDocument();
            },
        );
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

    describe("CryoloModel viewer visibility", () => {
        it.each(["flat", "wrapped"])(
            "does not display a viewer eye for %s CryoloModel outputs and keeps dragging available",
            (shape) => {
                const details = {
                    outputName: "outputCryoloModel",
                    info: "Cryolo model weights",
                    paramClass: "PointerParam",
                    pointerClass: "CryoloModel",
                    value: "Train Cryolo.outputCryoloModel",
                    parentId: "12",
                };

                const output = shape === "wrapped"
                    ? { outputCryoloModel: details }
                    : details;

                renderComponent({
                    data: createProtocolData({ outputs: [output] }),
                });

                const label = screen.getByText("Cryolo model weights");
                const pill = label.closest('[draggable="true"]');

                expect(pill).not.toBeNull();
                expect(screen.queryByRole("button", { name: "View output" })).not.toBeInTheDocument();
            },
        );

        it("does not open a nonexistent viewer when clicking the CryoloModel thumbnail tile", () => {
            renderComponent({
                data: createProtocolData({
                    protocolOutputThumbnailsEnabled: true,
                    outputs: [{
                        outputName: "outputCryoloModel",
                        info: "Cryolo model weights",
                        paramClass: "PointerParam",
                        pointerClass: "CryoloModel",
                        value: "Train Cryolo.outputCryoloModel",
                        parentId: "12",
                    }],
                }),
            });

            const tile = screen.getByText("No preview");
            fireEvent.click(tile);

            expect(screen.queryByTestId("analyze-output-dialog")).not.toBeInTheDocument();
        });

        it("keeps the eye for a supported SetOfMovies viewer", () => {
            renderComponent({
                data: createProtocolData({
                    outputs: [{
                        outputName: "outputMovies",
                        info: "Movies",
                        paramClass: "PointerParam",
                        pointerClass: "SetOfMovies",
                        value: "Import Movies.outputMovies",
                        parentId: "12",
                    }],
                }),
            });

            expect(screen.getByRole("button", { name: "View output" })).toBeEnabled();
        });
    });

    it("opens the internal analyze dialog when clicking output viewer without external resolver", async () => {
        renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "View output" }));

        expect(await screen.findByTestId("analyze-output-dialog")).toBeInTheDocument();
        expect(screen.getByText("moviesOutput")).toBeInTheDocument();
    });

    it.each([false, true])("renders scalar outputs without a viewer action and keeps them draggable (thumbnails: %s)", (thumbnailsEnabled) => {
        renderComponent({
            data: createProtocolData({
                protocolOutputThumbnailsEnabled: thumbnailsEnabled,
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

        if (thumbnailsEnabled) {
            expect(screen.getByRole("group", { name: "boxsize: 256" })).toBeInTheDocument();
            expect(screen.getByText("boxsize")).toBeInTheDocument();
            expect(screen.getByText("256")).toBeInTheDocument();
        } else {
            expect(screen.getByText("boxsize: 256")).toBeInTheDocument();
            expect(screen.queryByRole("group", { name: "boxsize: 256" })).not.toBeInTheDocument();
        }

        expect(
            screen.queryByRole(
                "button",
                { name: "View output" },
            ),
        ).not.toBeInTheDocument();

        const pill = thumbnailsEnabled
            ? screen.getByRole("group", { name: "boxsize: 256" })
            : screen.getByText("boxsize: 256").closest("div") as HTMLElement;

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

    // The graph card must pass a Scipion producer/output reference, not a
    // human-readable protocol label. The finder already uses the former.
    // A correct native output reference must not be rewritten or altered.
    it.each([
        ["Import Movies.outputParticles", "12.outputParticles"],
        ["Import Movies", "12.outputParticles"],
        ["12.outputParticles", "12.outputParticles"],
    ])(
        "keeps the output reference authoritative when dragging a graph output: %s",
        (graphValue, expectedReference) => {
            renderComponent({
                data: createProtocolData({
                    outputs: [{
                        outputName: "outputParticles",
                        info: "Particles for drag",
                        paramClass: "PointerParam",
                        pointerClass: "SetOfParticles",
                        value: graphValue,
                        parentId: "12",
                    }],
                }),
            });

            const pill = screen.getByText("Particles for drag").closest("div");
            expect(pill).not.toBeNull();
            const setData = vi.fn();
            fireEvent.dragStart(pill!, {
                dataTransfer: { setData, setDragImage: vi.fn() },
            });

            expect(mockSetCurrentDraggedOutput).toHaveBeenCalledWith(
                expect.objectContaining({
                    value: expectedReference,
                    name: "outputParticles",
                    parentId: "12",
                    pointerClass: "SetOfParticles",
                }),
            );
            expect(setData).toHaveBeenCalledTimes(1);
            expect(setData.mock.calls[0][0]).toBe("application/scipion-output");
            expect(JSON.parse(setData.mock.calls[0][1])).toMatchObject({
                value: expectedReference,
                name: "outputParticles",
                parentId: "12",
                pointerClass: "SetOfParticles",
            });
        },
    );

    it("sets dragged output data on drag start and clears it on drag end", () => {
        renderComponent({
            data: createProtocolData({
                outputs: [
                    {
                        outputName: "moviesOutput",
                        info: "Set of movies",
                        paramClass: "PointerParam",
                        pointerClass: "SetOfMovies",
                        pointerClassHierarchy: [
                            "SetOfMovies",
                            "SetOfMicrographsBase",
                            "SetOfImages",
                            "EMSet",
                            "Set",
                            "EMObject",
                            "Object",
                        ],
                        value: "movies.sqlite",
                        parentId: "12",
                    },
                ],
            }),
        });

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
            pointerClassHierarchy: [
                "SetOfMovies",
                "SetOfMicrographsBase",
                "SetOfImages",
                "EMSet",
                "Set",
                "EMObject",
                "Object",
            ],
        });

        expect(setData).toHaveBeenCalledTimes(1);

        const [
            mimeType,
            serializedOutput,
        ] = setData.mock.calls[0];

        expect(mimeType).toBe(
            "application/scipion-output",
        );

        expect(
            JSON.parse(serializedOutput),
        ).toEqual({
            paramClass: "PointerParam",
            pointerClass: "SetOfMovies",
            pointerClassHierarchy: [
                "SetOfMovies",
                "SetOfMicrographsBase",
                "SetOfImages",
                "EMSet",
                "Set",
                "EMObject",
                "Object",
            ],
            _expectedClass: "SetOfMovies",
            value: "movies.sqlite",
            info: "Set of movies",
            parentId: "12",
            name: "moviesOutput",
        });

        fireEvent.dragEnd(pill);

        expect(mockSetCurrentDraggedOutput).toHaveBeenLastCalledWith(null);
    });

    it("offers what a running protocol offers, as STOP STREAMING, and runs it once confirmed", async () => {
        const { service } = renderComponent({ data: createProtocolData({ status: "running" }) }) as any;
        service.fetchProtocolRunActions = vi.fn().mockResolvedValue(["STOP STREAMING"]);
        service.runProtocolRunAction = vi.fn().mockResolvedValue(undefined);

        fireEvent.click(screen.getByTestId("open-dropdown-menu"));
        // Both menus show it once read
        await waitFor(() => expect(screen.getAllByText("Stop streaming")).toHaveLength(2));
        expect(service.fetchProtocolRunActions).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getAllByText("Stop streaming")[0]);
        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("The import will take no more files.");
        expect(dialog).toHaveTextContent("It registers the files it already has");
        fireEvent.click(within(dialog).getByRole("button", { name: "Stop streaming" }));

        await waitFor(() => expect(service.runProtocolRunAction).toHaveBeenCalled());
        expect(service.runProtocolRunAction.mock.calls[0].slice(1)).toEqual([expect.anything(), "STOP STREAMING"]);
    });

    it.each(["running", "finished", "failed"])("opens the steps of a %s protocol from both menus", (status) => {
        const onSteps = vi.fn();
        renderComponent({ data: createProtocolData({ status }), onSteps });

        const items = screen.getAllByText("Steps");
        expect(items).toHaveLength(2);
        fireEvent.click(items[0]);

        expect(onSteps).toHaveBeenCalledWith(createProtocolData({ status }).id);
    });

    it.each(["saved", "new", "scheduled", "launched"])("offers no steps for a %s protocol, which has none yet", (status) => {
        renderComponent({ data: createProtocolData({ status }), onSteps: vi.fn() });

        expect(screen.queryByText("Steps")).not.toBeInTheDocument();
    });

    it.each([
        ["shows", undefined, 2],
        ["hides", { stop: false }, 0],
    ])("%s the run actions where Stop is shown or hidden (a project shared to view hides it)",
        async (_label, visibility, expected) => {
        const { service } = renderComponent({
            data: createProtocolData({ status: "running" }),
            contextMenuVisibility: visibility,
        } as any) as any;
        service.fetchProtocolRunActions = vi.fn().mockResolvedValue(["STOP STREAMING"]);
        service.runProtocolRunAction = vi.fn().mockResolvedValue(undefined);

        fireEvent.click(screen.getByTestId("open-dropdown-menu"));
        await waitFor(() => expect(service.fetchProtocolRunActions).toHaveBeenCalled());

        if (expected) {
            await waitFor(() => expect(screen.getAllByText("Stop streaming")).toHaveLength(expected));
        } else {
            // Given the time the shown case needs, it never appears
            await expect(waitFor(() => expect(screen.getAllByText("Stop streaming").length).toBeGreaterThan(0),
                                 { timeout: 500 })).rejects.toThrow();
        }
    });

    it("does not ask the actions of a protocol that does not run", () => {
        const { service } = renderComponent({ data: createProtocolData({ status: "finished" }) }) as any;
        service.fetchProtocolRunActions = vi.fn().mockResolvedValue(["STOP STREAMING"]);

        fireEvent.click(screen.getByTestId("open-dropdown-menu"));

        expect(service.fetchProtocolRunActions).not.toHaveBeenCalled();
        expect(screen.queryByText("Stop streaming")).not.toBeInTheDocument();
    });

    it("shows reduced selection actions when path selection is active", () => {
        renderComponent({
            inPathSelection: true,
            pathSelectionActive: true,
            data: createProtocolData({ status: "running" }),
        });

        expect(screen.getAllByText("Stop selection")[0]).toBeInTheDocument();
        expect(screen.queryByText("Browse")).not.toBeInTheDocument();
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


    it("toggles a tag through the page's shared write path for the selection", async () => {
        const { tagsContext, service } = renderComponent({ data: createProtocolData({ tags: [] }) });
        mockReactFlowGetNodes.mockReturnValue([
            { id: "12", selected: true, data: {} },
            { id: "13", selected: true, data: {} },
        ]);

        const reviewed = screen.getAllByRole("menuitemcheckbox", { name: /Reviewed/i });
        fireEvent.click(reviewed[0]);

        expect(tagsContext.toggleTag).toHaveBeenCalledWith(["12", "13"], "tag-2");
        // The card never writes on its own.
        expect(service.setProtocolTagIds).not.toHaveBeenCalled();
    });

    it("asks for a new tag for the protocols the menu was opened on", () => {
        const { tagsContext } = renderComponent();

        fireEvent.click(screen.getAllByRole("button", { name: /New tag/i })[0]);

        expect(tagsContext.requestCreateTag).toHaveBeenCalledWith(["12"]);
    });

    it("shows at most three chips, then +N with the rest in its tooltip", () => {
        const tags = ["A", "B", "C", "D", "E"].map((title, i) => ({ id: `t${i}`, title, color: "#ffffff" }));
        renderComponent({}, createTagsContext({ tags, assignments: { "12": tags.map((t) => t.id) } }));

        const row = screen.getByLabelText("Protocol tags");
        expect(row).toHaveTextContent("A");
        expect(row).toHaveTextContent("C");
        expect(row).not.toHaveTextContent("D");
        const more = screen.getByText("+2");
        expect(more).toHaveAttribute("title", "D, E");
        // Readable text on a white tag.
        expect(within(row).getByTitle("A")).toHaveStyle({ color: "#111827" });
    });

    it("hides ids the project does not know without saving anything", () => {
        const { service } = renderComponent({}, createTagsContext({ assignments: { "12": ["tag-1", "from-a-collaborator"] } }));

        expect(screen.getByLabelText("Protocol tags")).toHaveTextContent("Urgent");
        expect(screen.queryByText("from-a-collaborator")).not.toBeInTheDocument();
        expect(service.setProtocolTagIds).not.toHaveBeenCalled();
    });

    it("keeps tagged cards recognisable with a colour strip at far zoom", () => {
        renderComponent({ zoomLevel: 0.05 });

        expect(screen.queryByLabelText("Protocol tags")).not.toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Tags: Urgent" })).toBeInTheDocument();
    });

    it("calls duplicate and delete actions from menu items", () => {
        const { onDelete, onDuplicate } = renderComponent();

        fireEvent.click(screen.getAllByRole("button", { name: /Duplicate/i })[0]);
        fireEvent.click(screen.getAllByRole("button", { name: /Delete/i })[0]);

        expect(onDuplicate).toHaveBeenCalledWith("12");
        expect(onDelete).toHaveBeenCalledWith("12");
    });


    it(
        "shows runName as the workflow node name instead of label",
        () => {
            renderComponent({
                data: createProtocolData({
                    label: "pwem - import movies",
                    runName: "pwem - import movies (copy)",
                }),
            });

            expect(
                screen.getByText(
                    "pwem - import movies (copy)",
                ),
            ).toBeInTheDocument();

            expect(
                screen.queryByText(
                    "pwem - import movies",
                ),
            ).not.toBeInTheDocument();
        },
    );


    it(
        "shows label as subtitle when runName does not contain it",
        () => {
            renderComponent({
                data: createProtocolData({
                    label: "pwem - import movies",
                    runName: "Movies dataset A",
                }),
            });

            expect(
                screen.getByText(
                    "Movies dataset A",
                ),
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    "pwem - import movies",
                ),
            ).toBeInTheDocument();
        },
    );

});

// This suite intentionally shares the existing React Flow mocks and test data.
// In Tree LR the graph uses sourceHandle="right", targetHandle="left";
// in Tree TB it uses sourceHandle="bottom", targetHandle="top".
describe("Tree direction edge handles must match graph edges", () => {
    it("keeps the visible Tree LR handles on the right and left (baseline)", () => {
        renderComponent({ graphDirection: "LR" });

        expect(screen.getByTestId("handle-source"))
            .toHaveAttribute("data-handle-position", "right");
        expect(screen.getByTestId("handle-target"))
            .toHaveAttribute("data-handle-position", "left");
    });

    it("gives Tree LR handles the IDs referenced by LR edges", () => {
        renderComponent({ graphDirection: "LR" });

        expect(screen.getByTestId("handle-source"))
            .toHaveAttribute("data-handle-id", "right");
        expect(screen.getByTestId("handle-target"))
            .toHaveAttribute("data-handle-id", "left");
    });

    it("gives Tree TB handles the IDs referenced by TB edges", () => {
        renderComponent({ graphDirection: "TB" });

        expect(screen.getByTestId("handle-source"))
            .toHaveAttribute("data-handle-id", "bottom");
        expect(screen.getByTestId("handle-target"))
            .toHaveAttribute("data-handle-id", "top");
    });

    it("remeasures node internals after switching from Tree TB to Tree LR", async () => {
        const { rerender } = renderComponent({ graphDirection: "TB" });
        mockUpdateNodeInternals.mockClear();

        rerender(
            <ProtocolNodeCard data={createProtocolData()} graphDirection="LR" />,
        );

        await waitFor(() => {
            expect(mockUpdateNodeInternals).toHaveBeenCalledWith("12");
        });
    });
});
