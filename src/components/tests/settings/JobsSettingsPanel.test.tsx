import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
        fireEvent.click(within(restart).getByRole("button", { name: "Restart" }));

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
    it("names the workers by what they do and switches between running and recent runs", async () => {
        serviceMocks.fetchJobsOverview.mockResolvedValue({
            ...overview(1),
            activeJobs: [{ taskId: "t1", projectId: 7, projectName: "/data/projects/Apoferritin", protocolId: "12",
                protocolClassName: "ProtRelionRefine3D", protocolStatus: "running", runMode: "restart",
                worker: "protocols@node", queue: "protocols", workerPid: 99, protocolPid: 100, jobIds: [],
                elapsedSeconds: 3725, celeryState: "STARTED", step: null }],
            recentJobs: [{ projectId: 7, projectName: "Apoferritin", protocolId: "11", protocolClassName: "ProtImportMovies",
                status: "finished", elapsedTimeSeconds: 65, jobIds: [], createdAt: null,
                updatedAt: "2026-10-30T09:00:00Z" }],
        });
        serviceMocks.fetchJobNodeCapabilities.mockResolvedValue({ available: true, nodes: [{
            hostname: "node", gpuCount: 1, gpus: [{ index: 0, name: "NVIDIA A100", memoryTotalBytes: 40 * 1024 ** 3 }],
            plugins: Array.from({ length: 10 }, (_, i) => ({ name: `plugin${i}`, pipName: `scipion-em-p${i}`,
                pipVersion: "1.0" })), scratch: { path: null } }] });

        render(<JobsSettingsPanel />);

        const worker = await screen.findByTestId("worker-protocols@node");
        expect(worker).toHaveTextContent("Protocol runner");
        expect(worker).toHaveTextContent("node · queue protocols");
        expect(screen.getByText("All answering")).toBeInTheDocument();

        const running = screen.getByRole("table", { name: "Running protocols" });
        expect(running).toHaveTextContent("Apoferritin");
        expect(running).toHaveTextContent("Protocol runner on node");
        expect(running).toHaveTextContent("Worker process 99");
        expect(running).toHaveTextContent("1h 2m 5s");

        const node = await screen.findByTestId("node-node");
        expect(node).toHaveTextContent("NVIDIA A100");
        expect(node).toHaveTextContent("Plugins (10)");
        expect(node).not.toHaveTextContent("plugin9 1.0");
        fireEvent.click(within(node).getByRole("button", { name: "Show all 10" }));
        expect(node).toHaveTextContent("plugin9 1.0");

        fireEvent.click(screen.getByRole("button", { name: /Recent \(1\)/ }));
        expect(screen.getByRole("table", { name: "Recent protocol runs" })).toHaveTextContent("ProtImportMovies");
    });
});
