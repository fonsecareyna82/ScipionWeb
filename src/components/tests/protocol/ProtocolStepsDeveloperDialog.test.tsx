import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProtocolStepsDeveloperDialog from "@/components/protocol/ProtocolStepsDeveloperDialog";
import type { ProtocolStep } from "@/services/ProjectService";
import {
    createProjectServiceMock,
    renderWithProviders,
} from "@/components/tests/test-utils";

vi.mock("@/components/ui/dialog/dialog", () => ({
    Dialog: ({
        open,
        children,
    }: {
        open: boolean;
        children: React.ReactNode;
    }) => (open ? <div data-testid="dialog">{children}</div> : null),
    DialogContent: ({ children, className }: any) => (
        <div data-testid="dialog-content" className={className}>
            {children}
        </div>
    ),
    DialogHeader: ({ children, className, style }: any) => (
        <div data-testid="dialog-header" className={className} style={style}>
            {children}
        </div>
    ),
    DialogTitle: ({ children, className }: any) => (
        <h2 className={className}>{children}</h2>
    ),
}));

vi.mock("reactflow", async () => {
    const React = await import("react");

    return {
        default: ({
            nodes = [],
            edges = [],
            nodeTypes = {},
            onNodeClick,
            children,
        }: any) => (
            <div data-testid="react-flow">
                <div data-testid="react-flow-nodes">
                    {nodes.map((node: any) => {
                        const NodeComponent = nodeTypes[node.type];

                        return (
                            <button
                                key={node.id}
                                type="button"
                                data-testid={`flow-node-${node.id}`}
                                title={node.data?.tooltip}
                                onClick={(event) => onNodeClick?.(event, node)}
                            >
                                {NodeComponent ? (
                                    <NodeComponent data={node.data} />
                                ) : (
                                    node.data?.label
                                )}
                            </button>
                        );
                    })}
                </div>

                <div data-testid="react-flow-edges">
                    {edges.map((edge: any) => (
                        <div
                            key={edge.id}
                            data-testid={`flow-edge-${edge.source}-${edge.target}`}
                            data-type={edge.type}
                            data-source-handle={edge.sourceHandle}
                            data-target-handle={edge.targetHandle}
                        />
                    ))}
                </div>

                {children}
            </div>
        ),
        Background: () => <div data-testid="react-flow-background" />,
        Controls: () => <div data-testid="react-flow-controls" />,
        Handle: ({ id, type }: any) => (
            <span data-testid={`handle-${type}-${id}`} />
        ),
        Position: {
            Top: "top",
            Bottom: "bottom",
            Left: "left",
            Right: "right",
        },
        ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="react-flow-provider">{children}</div>
        ),
        applyNodeChanges: (_changes: any[], nodes: any[]) => nodes,
    };
});

function makeSteps(): ProtocolStep[] {
    return [
        {
            index: 1,
            name: "prepareInputStep",
            status: "finished",
            prerequisites: [],
            args: ["input.mrc"],
            elapsedSeconds: 0,
            needsGpu: false,
            interactive: false,
            initTime: "2026-06-18 10:00:00",
        },
        {
            index: 2,
            name: "processMoviesStep",
            status: "running",
            prerequisites: [1],
            args: ["movies"],
            elapsedSeconds: 125,
            needsGpu: true,
            interactive: false,
        },
        {
            index: 3,
            name: "closeOutputStep",
            status: "new",
            prerequisites: [2],
            args: [],
            elapsedSeconds: 0,
            needsGpu: false,
            interactive: false,
        },
    ];
}

function renderComponent(
    overrides: {
        steps?: ProtocolStep[];
        fetchProtocolSteps?: ReturnType<typeof vi.fn>;
        updateProtocolStepStatus?: ReturnType<typeof vi.fn>;
    } = {},
) {
    const fetchProtocolSteps =
        overrides.fetchProtocolSteps ??
        vi.fn().mockResolvedValue(overrides.steps ?? makeSteps());

    const updateProtocolStepStatus =
        overrides.updateProtocolStepStatus ??
        vi.fn().mockImplementation(
            async (
                _projectId: string | number,
                _protocolId: string | number,
                stepIndex: number,
                status: "new" | "finished",
            ) => ({
                ...(overrides.steps ?? makeSteps()).find(
                    (step) => Number(step.index) === Number(stepIndex),
                ),
                index: stepIndex,
                status,
            }),
        );

    const service = createProjectServiceMock({
        fetchProtocolSteps,
        updateProtocolStepStatus,
    });

    renderWithProviders(
        <ProtocolStepsDeveloperDialog
            open
            projectId={7}
            protocolId={42}
            protocolLabel="Motion correction"
            onOpenChange={vi.fn()}
        />,
        { service },
    );

    return {
        fetchProtocolSteps,
        updateProtocolStepStatus,
    };
}

describe("ProtocolStepsDeveloperDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("loads and renders protocol steps", async () => {
        const { fetchProtocolSteps } = renderComponent();

        expect(fetchProtocolSteps).toHaveBeenCalledWith(7, 42);

        expect(await screen.findByText("1 - prepareInputStep")).toBeInTheDocument();
        expect(screen.getByText("2 - processMoviesStep")).toBeInTheDocument();
        expect(screen.getByText("3 - closeOutputStep")).toBeInTheDocument();

        expect(screen.getByText("Protocol steps - Motion correction")).toBeInTheDocument();
        expect(screen.getAllByText("FunctionStep")).toHaveLength(3);
    });

    it("shows details for the selected step", async () => {
        renderComponent();

        await screen.findByText("1 - prepareInputStep");

        expect(screen.getByText("Prerequisites:")).toBeInTheDocument();
        expect(screen.getByText("Arguments:")).toBeInTheDocument();
        expect(screen.getByText("Init:")).toBeInTheDocument();
        expect(screen.getByText("2026-06-18 10:00:00")).toBeInTheDocument();
        const detailsPanel = screen.getByText("Step details").closest("aside");
        expect(detailsPanel).not.toBeNull();

        expect(within(detailsPanel!).getByText("Needs GPU:")).toBeInTheDocument();
        expect(within(detailsPanel!).getByText("Interactive:")).toBeInTheDocument();
        expect(within(detailsPanel!).getAllByText("false")).toHaveLength(2);
    });

    it("selects another step when clicking its row", async () => {
        renderComponent();

        await screen.findByText("1 - prepareInputStep");

        fireEvent.click(screen.getByText("2 - processMoviesStep"));

        const detailsPanel = screen.getByText("Step details").closest("aside");
        expect(detailsPanel).not.toBeNull();

        expect(
            within(detailsPanel!).getByText((_content, element) => {
                return (
                    element?.tagName.toLowerCase() === "pre" &&
                    element.textContent?.includes("1")
                );
            }),
        ).toBeInTheDocument();

        expect(within(detailsPanel!).getByText("true")).toBeInTheDocument();
    });

    it("resets the selected step to new", async () => {
        const { updateProtocolStepStatus } = renderComponent();

        await screen.findByText("1 - prepareInputStep");

        fireEvent.click(screen.getByRole("button", { name: /reset/i }));

        await waitFor(() => {
            expect(updateProtocolStepStatus).toHaveBeenCalledWith(7, 42, 1, "new");
        });

        const row = screen.getByText("1 - prepareInputStep").closest("tr");
        expect(row).not.toBeNull();
        expect(within(row!).getByText("new")).toBeInTheDocument();
    });

    it("marks the selected step as finished", async () => {
        const { updateProtocolStepStatus } = renderComponent();

        await screen.findByText("1 - prepareInputStep");

        fireEvent.click(screen.getByText("2 - processMoviesStep"));
        fireEvent.click(screen.getByRole("button", { name: /finish/i }));

        await waitFor(() => {
            expect(updateProtocolStepStatus).toHaveBeenCalledWith(7, 42, 2, "finished");
        });

        const row = screen.getByText("2 - processMoviesStep").closest("tr");
        expect(row).not.toBeNull();
        expect(within(row!).getByText("finished")).toBeInTheDocument();
    });

    it("shows an error if updating the step status fails", async () => {
        renderComponent({
            updateProtocolStepStatus: vi.fn().mockRejectedValue(new Error("Status update failed")),
        });

        await screen.findByText("1 - prepareInputStep");

        fireEvent.click(screen.getByRole("button", { name: /reset/i }));

        expect(await screen.findByText("Status update failed")).toBeInTheDocument();
    });

    it("opens the tree dialog with protocol and step nodes", async () => {
        renderComponent();

        await screen.findByText("1 - prepareInputStep");

        fireEvent.click(screen.getByRole("button", { name: /tree/i }));

        expect(screen.getByText("Protocol steps tree")).toBeInTheDocument();
        expect(screen.getByTestId("react-flow")).toBeInTheDocument();

        expect(screen.getByTestId("flow-node-protocol-root")).toHaveAttribute(
            "title",
            "Protocol",
        );
        expect(screen.getByTestId("flow-node-step-1")).toHaveAttribute(
            "title",
            "1 - prepareInputStep",
        );
        expect(screen.getByTestId("flow-node-step-2")).toHaveAttribute(
            "title",
            "2 - processMoviesStep",
        );

        expect(
            screen.getByTestId("flow-edge-protocol-root-step-1"),
        ).toHaveAttribute("data-type", "bezier");
        expect(screen.getByTestId("flow-edge-step-1-step-2")).toHaveAttribute(
            "data-source-handle",
            "bottom",
        );
        expect(screen.getByTestId("flow-edge-step-1-step-2")).toHaveAttribute(
            "data-target-handle",
            "top",
        );
    });

    it("selects the corresponding table row when clicking a tree step node", async () => {
        renderComponent();

        await screen.findByText("1 - prepareInputStep");

        fireEvent.click(screen.getByRole("button", { name: /tree/i }));
        fireEvent.click(screen.getByTestId("flow-node-step-2"));

        const row = screen.getByText("2 - processMoviesStep").closest("tr");

        expect(row).not.toBeNull();
        expect(row!.className).toContain("bg-[#4f7391]");
    });
});