import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusNodeWrapper } from "@/components/protocol/ProtocolNodeCardWrapper";

const mockProtocolNodeCard = vi.fn();
const mockGetViewport = vi.fn();

vi.mock("reactflow", () => ({
    useReactFlow: () => ({
        getViewport: mockGetViewport,
    }),
}));

vi.mock("@/components/protocol/ProtocolNodeCard", () => ({
    __esModule: true,
    default: (props: any) => mockProtocolNodeCard(props),
}));

function createNodeCardMock() {
    mockProtocolNodeCard.mockImplementation((props: any) => (
        <div
            data-testid="protocol-node-card"
            onClick={() => props.onClick()}
            onDoubleClick={() => props.onDoubleClick()}
        >
            node-card-{props.id}
        </div>
    ));
}

function renderWrapper(
    overrides: {
        data?: any;
        id?: string;
        selectedNodeId?: string | undefined;
        hoveredNodeId?: string | undefined;
        resolvedProjectId?: string | number | undefined;
        viewMode?: "hierarchical" | "grid" | "table";
        graphDirection?: "TB" | "LR";
        pathSelectionNodeIds?: Set<string>;
        contextMenuVisibility?: any;
        service?: any;
    } = {},
) {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const setHoveredNodeId = vi.fn();

    const getSelectedNodeId = vi.fn(() => overrides.selectedNodeId);
    const getHoveredNodeId = vi.fn(() => overrides.hoveredNodeId);
    const getGraphDirection = vi.fn(() => overrides.graphDirection ?? "TB");
    const getViewMode = vi.fn(() => overrides.viewMode ?? "hierarchical");
    const getNodeActions = vi.fn(() => ({
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDuplicate: vi.fn(),
        onDelete: vi.fn(),
        onRestartAll: vi.fn(),
        onContinueAll: vi.fn(),
        onResetFrom: vi.fn(),
        onSelectFrom: vi.fn(),
        onSelectTo: vi.fn(),
        onStop: vi.fn(),
        onManageTags: vi.fn(),
        onOpenProtocolClass: vi.fn(),
    }));
    const getPathSelectionNodeIds = vi.fn(
        () => overrides.pathSelectionNodeIds ?? new Set<string>(),
    );
    const onBrowse = vi.fn();
    const getProjectId = vi.fn(() => overrides.resolvedProjectId);
    const getAnalyzeViewerService = vi.fn(() => overrides.service);
    const getContextMenuVisibility = vi.fn(() => overrides.contextMenuVisibility);

    const Wrapper = createStatusNodeWrapper(
        onClick,
        onDoubleClick,
        getSelectedNodeId,
        getHoveredNodeId,
        setHoveredNodeId as any,
        getGraphDirection,
        getViewMode,
        getNodeActions,
        getPathSelectionNodeIds,
        onBrowse,
        getProjectId,
        getAnalyzeViewerService,
        getContextMenuVisibility,
    );

    render(
        <Wrapper
            id={overrides.id ?? "node-1"}
            type="default"
            data={overrides.data ?? { label: "Protocol A" }}
            selected={false}
            dragging={false}
            zIndex={1}
            isConnectable={true}
            xPos={0}
            yPos={0}
        />,
    );

    return {
        onClick,
        onDoubleClick,
        setHoveredNodeId,
        getSelectedNodeId,
        getHoveredNodeId,
        getGraphDirection,
        getViewMode,
        getNodeActions,
        getPathSelectionNodeIds,
        onBrowse,
        getProjectId,
        getAnalyzeViewerService,
        getContextMenuVisibility,
    };
}

describe("ProtocolNodeCardWrapper", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetViewport.mockReturnValue({ zoom: 1.5 });
        createNodeCardMock();
    });

    it("injects projectId into data when it is missing", () => {
        renderWrapper({
            data: { label: "Protocol A" },
            resolvedProjectId: "project-7",
        });

        const props = mockProtocolNodeCard.mock.calls[0][0];

        expect(props.id).toBe("node-1");
        expect(props.data).toEqual({
            label: "Protocol A",
            projectId: "project-7",
            protocolOutputThumbnailsEnabled: false,
        });
        expect(props.zoomLevel).toBe(1.5);
    });

    it("preserves data.projectId when it already exists", () => {
        renderWrapper({
            data: { label: "Protocol A", projectId: "existing-project" },
            resolvedProjectId: "fallback-project",
        });

        const props = mockProtocolNodeCard.mock.calls[0][0];

        expect(props.data).toEqual({
            label: "Protocol A",
            projectId: "existing-project",
            protocolOutputThumbnailsEnabled: false,
        });
    });

    it("forwards click and double click with merged data", () => {
        const { onClick, onDoubleClick } = renderWrapper({
            data: { label: "Protocol A" },
            resolvedProjectId: "project-7",
        });

        fireEvent.click(screen.getByTestId("protocol-node-card"));
        fireEvent.doubleClick(screen.getByTestId("protocol-node-card"));

        expect(onClick).toHaveBeenCalledWith(
            {
                label: "Protocol A",
                projectId: "project-7",
                protocolOutputThumbnailsEnabled: false,
            },
            undefined,
        );

        expect(onDoubleClick).toHaveBeenCalledWith({
            label: "Protocol A",
            projectId: "project-7",
            protocolOutputThumbnailsEnabled: false,
        });
    });

    it("updates hovered node id on mouse enter and mouse leave", () => {
        const { setHoveredNodeId } = renderWrapper({
            id: "node-22",
        });

        const wrapperDiv = screen.getByTestId("protocol-node-card").parentElement as HTMLElement;

        fireEvent.mouseEnter(wrapperDiv);
        fireEvent.mouseLeave(wrapperDiv);

        expect(setHoveredNodeId).toHaveBeenNthCalledWith(1, "node-22");
        expect(setHoveredNodeId).toHaveBeenNthCalledWith(2, null);
    });

    it("passes path selection flags and hides handles in grid view", () => {
        renderWrapper({
            id: "node-1",
            viewMode: "grid",
            pathSelectionNodeIds: new Set(["node-1", "node-2"]),
        });

        const props = mockProtocolNodeCard.mock.calls[0][0];

        expect(props.inPathSelection).toBe(true);
        expect(props.pathSelectionActive).toBe(true);
        expect(props.showHandles).toBe(false);
    });

    it("shows handles outside grid view and forwards direction, service and context menu visibility", () => {
        const service = { resolveAnalyzeViewer: vi.fn() };
        const contextMenuVisibility = { rename: true, delete: false };

        renderWrapper({
            viewMode: "hierarchical",
            graphDirection: "LR",
            hoveredNodeId: "node-1",
            service,
            contextMenuVisibility,
        });

        const props = mockProtocolNodeCard.mock.calls[0][0];

        expect(props.graphDirection).toBe("LR");
        expect(props.showHandles).toBe(true);
        expect(props.service).toBe(service);
        expect(props.contextMenuVisibility).toBe(contextMenuVisibility);
        expect(props.isHovered).toBe(true);
    });

    it("forwards selected and hovered node context", () => {
        renderWrapper({
            selectedNodeId: "node-1",
            hoveredNodeId: "node-2",
        });

        const props = mockProtocolNodeCard.mock.calls[0][0];

        expect(props.selectedNodeId).toBe("node-1");
        expect(props.hoveredNodeId).toBe("node-2");
        expect(props.isHovered).toBe(false);
    });
});