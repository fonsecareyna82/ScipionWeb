import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const serviceMocks = vi.hoisted(() => ({
    fetchJobsOverview: vi.fn(),
    fetchJobNodeCapabilities: vi.fn(),
}));
const controlJobWorker = vi.hoisted(() => vi.fn());

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));
vi.mock("@/api/settings", () => ({ controlJobWorker }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import JobsSettingsPanel from "@/pages/Settings/JobsSettingsPanel";

function overview(active: number) {
    return {
        celeryAvailable: true,
        workers: [{
            name: "protocols@node", kind: "protocols", queues: ["protocols"], online: true, state: "online",
            pid: 42, concurrency: 4, active, reserved: 0,
        }],
        activeJobs: [],
        recentJobs: [],
        refreshedAt: "2026-10-30T10:00:00Z",
    };
}

describe("JobsSettingsPanel worker actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        serviceMocks.fetchJobNodeCapabilities.mockResolvedValue({ available: true, nodes: [] });
        controlJobWorker.mockResolvedValue({});
    });

    it("asks in the web's dialog before stopping a worker with active tasks", async () => {
        const confirmSpy = vi.spyOn(window, "confirm");
        serviceMocks.fetchJobsOverview.mockResolvedValue(overview(2));
        render(<JobsSettingsPanel />);

        fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("Stop the protocols worker?");
        expect(dialog).toHaveTextContent("It has 2 active task(s).");
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(controlJobWorker).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(controlJobWorker).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Restart" }));
        const restart = await screen.findByRole("dialog");
        expect(restart).toHaveTextContent("Restart the protocols worker?");
        fireEvent.click(screen.getAllByRole("button", { name: "Restart" }).at(-1)!);

        await waitFor(() => expect(controlJobWorker).toHaveBeenCalledWith("protocols", "restart"));
        confirmSpy.mockRestore();
    });

    it("stops an idle worker without asking", async () => {
        serviceMocks.fetchJobsOverview.mockResolvedValue(overview(0));
        render(<JobsSettingsPanel />);

        fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

        await waitFor(() => expect(controlJobWorker).toHaveBeenCalledWith("protocols", "stop"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
