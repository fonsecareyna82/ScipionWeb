import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ResourcesPage, { runTitle } from "./ResourcesPage";
import { getResources, type Resources, type ResourceRun } from "@/api/resources";

vi.mock("@/api/resources", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/api/resources")>()),
    getResources: vi.fn(),
}));
vi.mock("@/components/common/PageMeta", () => ({ default: () => null }));
vi.mock("@/components/common/PageBreadCrumb", () => ({ default: () => null }));

const GB = 1024 ** 3;

const mine: ResourceRun = { id: 1, mine: true, host: "gpu1", gpus: 1, gpuIds: ["0"], queued: false,
    startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), streaming: true, userId: 1, userName: "Ana Test",
    projectId: 5, projectName: "Apoferritin", protocolId: "12", protocolClassName: "ProtRelionClassify3D",
    protocolLabel: "3D classes", queueName: null, queueJobId: null };
const another: ResourceRun = { id: 2, mine: false, host: "gpu1", gpus: 1, gpuIds: ["2"], queued: false,
    startedAt: null, streaming: false };

const resources: Resources = {
    available: true, error: null, seeAll: false,
    machines: [{
        hostname: "gpu1", error: null, cpuCount: 64, load1: 32, load5: 30, memoryTotalBytes: 512 * GB,
        memoryAvailableBytes: 256 * GB, gpuError: null, runs: 2,
        disks: [{ label: "scratch", path: "/scratch", totalBytes: 4000 * GB, freeBytes: 1000 * GB }],
        gpus: [
            { index: "0", name: "A100", busy: 91, memoryUsedBytes: 30 * GB, memoryTotalBytes: 40 * GB, temperature: 64,
                state: "busy", uses: [{ kind: "run", run: mine, memoryBytes: 29 * GB }] },
            { index: "1", name: "A100", busy: 40, memoryUsedBytes: 2 * GB, memoryTotalBytes: 40 * GB, temperature: 50,
                state: "busy", uses: [{ kind: "other", memoryBytes: 2 * GB }] },
            { index: "2", name: "A100", busy: 0, memoryUsedBytes: 0, memoryTotalBytes: 40 * GB, temperature: 33,
                state: "reserved", uses: [{ kind: "reserved", run: another, memoryBytes: 0 }] },
            { index: "3", name: "A100", busy: 0, memoryUsedBytes: 0, memoryTotalBytes: 40 * GB, temperature: 31,
                state: "free", uses: [] },
        ],
    }],
    runs: [mine, another],
    waiting: [{ mine: true, userName: "Ana Test", projectId: 5, projectName: "Apoferritin", protocolId: "13",
        protocolClassName: "ProtRelionRefine3D", status: "launched", since: null,
        reason: "Waits for a free run slot: 2 of 2 in use" }],
};

function renderPage() {
    return render(<MemoryRouter><ResourcesPage /></MemoryRouter>);
}

describe("ResourcesPage", () => {
    beforeEach(() => vi.mocked(getResources).mockResolvedValue(resources));

    it("shows each GPU with whose run holds it, and the user's own runs and waits", async () => {
        renderPage();
        const machine = await screen.findByTestId("machine-gpu1");
        expect(machine).toHaveTextContent("Processors (64)");
        expect(machine).toHaveTextContent("50 % busy");
        expect(machine).toHaveTextContent("1000 GB free");

        expect(within(screen.getByTestId("gpu-0")).getByText(/Your 3D classes in Apoferritin/)).toBeInTheDocument();
        expect(screen.getByTestId("gpu-0")).toHaveTextContent("In use");
        expect(screen.getByTestId("gpu-1")).toHaveTextContent("A program outside the projects");
        expect(screen.getByTestId("gpu-2")).toHaveTextContent("Another user · given, not used now");
        expect(screen.getByTestId("gpu-3")).toHaveTextContent("Free");

        expect(screen.getByTestId("run-1")).toHaveTextContent("in streaming");
        expect(screen.getByTestId("run-1")).toHaveTextContent("for 2 h");
        expect(screen.queryByTestId("run-2")).not.toBeInTheDocument();
        expect(screen.getByText("And 1 run of other users.")).toBeInTheDocument();
        expect(screen.getByTestId("waiting-5-13")).toHaveTextContent("Waits for a free run slot: 2 of 2 in use");
    });

    it("says when no machine answers", async () => {
        vi.mocked(getResources).mockResolvedValue({ ...resources, machines: [], runs: [], waiting: [] });
        renderPage();
        expect(await screen.findByText(/No machine answered/)).toBeInTheDocument();
        expect(screen.getByText("None of yours runs now.")).toBeInTheDocument();
    });

    it("names whose run it is for who sees everything", () => {
        expect(runTitle({ ...mine, mine: false })).toBe("Ana Test: 3D classes in Apoferritin");
        expect(runTitle(another)).toBe("Another user");
    });
});
