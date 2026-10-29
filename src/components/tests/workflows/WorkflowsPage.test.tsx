import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    fetchWorkflows: vi.fn(),
    fetchList: vi.fn(),
}));

const flowProps = vi.hoisted(() => ({ last: null as any }));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

vi.mock("reactflow", () => ({
    __esModule: true,
    default: (props: any) => {
        flowProps.last = props;
        return null;
    },
    Background: () => null,
    Controls: () => null,
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import WorkflowsPage from "@/pages/Dashboard/workflows/WorkflowsPage";

describe("WorkflowsPage", () => {
    beforeEach(() => {
        serviceMocks.fetchWorkflows.mockResolvedValue([
            {
                id: "w1", name: "SPA streaming", description: "Movies to 2D classes", protocolsCount: 1,
                previewGraph: { nodes: [{ id: "1", label: "Import movies" }], edges: [] },
            },
        ]);
        serviceMocks.fetchList.mockResolvedValue([]);
    });

    it("shows the name of the selected workflow in its details", async () => {
        render(<WorkflowsPage />);

        fireEvent.click(await screen.findByTitle("Click to select, double-click to load"));

        expect(await screen.findByTestId("workflow-details-name")).toHaveTextContent("SPA streaming");
    });

    it("zooms the graph preview with the mouse wheel", async () => {
        render(<WorkflowsPage />);

        fireEvent.click(await screen.findByTitle("Click to select, double-click to load"));
        await screen.findByTestId("workflow-details-name");

        // React Flow drops wheel events without Ctrl when preventScrolling is off
        expect(flowProps.last?.zoomOnScroll).toBe(true);
        expect(flowProps.last?.preventScrolling).not.toBe(false);
    });
});
