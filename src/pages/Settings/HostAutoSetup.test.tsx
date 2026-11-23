import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HostAutoSetup from "./HostAutoSetup";
import { defaultHostSettings, type HostSettings } from "./HostSettingsPanel";
import { cancelHostTest, detectHostSettings, getHostTest, startHostTest } from "@/api/settings";

vi.mock("@/api/settings", () => ({
    detectHostSettings: vi.fn(),
    startHostTest: vi.fn(),
    getHostTest: vi.fn(),
    cancelHostTest: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const colors = { text: "#111", muted: "#666", border: "#ddd" };
const proposal = {
    ...defaultHostSettings, hostAlias: "localhost", schedulerName: "SLURM", submitCommand: "sbatch --parsable %_(JOB_SCRIPT)s",
    queues: [{ name: "gpu", params: [{ variableName: "JOB_MEMORY", value: "8192", label: "Memory (MB)", help: "" }] },
             { name: "old", params: [] }],
};
let latest: HostSettings;

function Harness({ initial }: { initial: HostSettings }) {
    const [value, setValue] = useState(initial);
    latest = value;
    return <HostAutoSetup value={value} onChange={setValue} actionButtonSx={{}} saveButtonSx={{}} colors={colors} />;
}

describe("HostAutoSetup", () => {
    beforeEach(() => {
        vi.mocked(detectHostSettings).mockResolvedValue({
            scheduler: "SLURM", supported: true, message: "SLURM found with 2 queues.", settings: proposal,
            queues: [
                { name: "gpu", default: true, hours: 48, cpus: 64, memoryMb: 515000, gpus: 4, nodes: 4, up: true },
                { name: "old", default: false, hours: null, cpus: 8, memoryMb: 0, gpus: 0, nodes: 1, up: false },
                { name: "cloud", default: false, hours: 4, cpus: 16, memoryMb: 64000, gpus: 0, nodes: 3, up: true,
                  asleep: true },
                { name: "spot", default: false, hours: 2, cpus: 0, memoryMb: 0, gpus: 0, nodes: 0, up: true,
                  asleep: true, unknown: true },
            ],
        });
    });
    afterEach(() => vi.useRealTimers());

    it("fills the form with the detected scheduler and the queues chosen", async () => {
        render(<Harness initial={{ ...defaultHostSettings, hostAlias: "cluster", queues: [] }} />);
        fireEvent.click(screen.getByRole("button", { name: "Detect" }));

        expect(await screen.findByText("SLURM on this server")).toBeInTheDocument();
        expect(screen.getByText(/64 cores · 503 GB · 4 GPUs · up to 48 h · 4 machines/)).toBeInTheDocument();
        // A queue that is down is not offered unless chosen
        expect(screen.getByLabelText("Offer the queue old")).not.toBeChecked();
        // Machines started on demand, and machines whose size cannot be known while off
        expect(screen.getByText(/3 machines · machines start when a job comes/)).toBeInTheDocument();
        expect(screen.getByText(/check memory and GPUs by hand · up to 2 h/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Use this" }));
        expect(latest.schedulerName).toBe("SLURM");
        expect(latest.submitCommand).toBe("sbatch --parsable %_(JOB_SCRIPT)s");
        expect(latest.hostAlias).toBe("cluster");
        expect(latest.queues.map((queue) => queue.name)).toEqual(["gpu"]);
    });

    it("sends a test job with the form and shows how it went", async () => {
        vi.mocked(startHostTest).mockResolvedValue({ id: "t1", queue: "gpu", state: "queued", message: "Sent as job 7.",
                                                    jobId: "7", output: "" });
        vi.mocked(getHostTest).mockResolvedValue({ id: "t1", queue: "gpu", state: "finished", message: "The test job ran.",
                                                  jobId: "7", output: "ScipionWeb test job ran on node3" });
        render(<Harness initial={proposal} />);

        fireEvent.click(screen.getByRole("button", { name: "Send a test job" }));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(startHostTest).toHaveBeenCalledWith(proposal, "gpu"));
        expect(await screen.findByText("Waiting in the queue…")).toBeInTheDocument();

        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)); });
        expect(await screen.findByText("It works.")).toBeInTheDocument();
        expect(screen.getByText("ScipionWeb test job ran on node3")).toBeInTheDocument();
    }, 10000);

    it("cancels a job still waiting when the dialog is closed", async () => {
        vi.mocked(startHostTest).mockResolvedValue({ id: "t2", queue: "gpu", state: "queued", message: "", jobId: "8",
                                                    output: "" });
        vi.mocked(cancelHostTest).mockResolvedValue({ id: "t2", queue: "gpu", state: "cancelled", message: "",
                                                     jobId: "8", output: "" });
        render(<Harness initial={proposal} />);
        fireEvent.click(screen.getByRole("button", { name: "Send a test job" }));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await screen.findByText("Waiting in the queue…");
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(cancelHostTest).toHaveBeenCalledWith("t2"));
    });
});
