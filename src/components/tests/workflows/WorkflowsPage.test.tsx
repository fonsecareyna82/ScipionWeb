import { fireEvent, render, screen, within } from "@testing-library/react";
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
        window.localStorage.clear();
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

    it("selects a workflow by clicking anywhere in its row, as on its description", async () => {
        render(<WorkflowsPage />);

        // The description of the card, not its name
        const [description] = await screen.findAllByText("Movies to 2D classes");
        fireEvent.click(description);

        expect(await screen.findByTestId("workflow-details-name")).toHaveTextContent("SPA streaming");
    });

    describe("order and filters", () => {
        beforeEach(() => {
            serviceMocks.fetchWorkflows.mockResolvedValue([
                { id: "a", name: "Tomo", description: "", protocolsCount: 9, canLoad: false,
                  missingPluginNames: ["x"], previewGraph: { nodes: [], edges: [] } },
                { id: "b", name: "Basic SPA", description: "", protocolsCount: 3, canLoad: true,
                  previewGraph: { nodes: [], edges: [] } },
            ]);
        });
        const names = () => screen.getAllByTitle("Click to select, double-click to load")
            .map((card) => card.querySelector("span")?.textContent);

        it("orders by name or by protocols, and remembers it", async () => {
            render(<WorkflowsPage />);
            await screen.findByText("Tomo");
            expect(names()).toEqual(["Basic SPA", "Tomo"]);

            fireEvent.change(screen.getByLabelText("Sort workflows by"), { target: { value: "protocols" } });
            expect(names()).toEqual(["Tomo", "Basic SPA"]);
            expect(window.localStorage.getItem("scipion.workflows.sort.v1")).toBe("protocols");
        });

        it("shows those ready to load or those that need plugins, with their counts", async () => {
            render(<WorkflowsPage />);
            await screen.findByText("Tomo");
            const filters = screen.getByRole("group", { name: "Show workflows" });

            fireEvent.click(within(filters).getByRole("button", { name: /Ready to load\s*1/ }));
            expect(names()).toEqual(["Basic SPA"]);
            fireEvent.click(within(filters).getByRole("button", { name: /Need plugins\s*1/ }));
            expect(names()).toEqual(["Tomo"]);
        });

        it("offers to clear the search when nothing matches", async () => {
            render(<WorkflowsPage />);
            await screen.findByText("Tomo");
            fireEvent.change(screen.getByLabelText("Search workflows"), { target: { value: "zzz" } });
            expect(screen.getByText("No workflows match your search.")).toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: /Clear search and filters/ }));
            expect(names()).toHaveLength(2);
        });
    });
});
