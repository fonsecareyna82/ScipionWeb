import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ComputeUsagePanel, { periodOf } from "./ComputeUsagePanel";
import { formatHours, getComputeUsage, getUserRuns, type ComputeReport, type ComputeRun } from "@/api/usage";

vi.mock("@/api/usage", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/api/usage")>()),
    getComputeUsage: vi.fn(),
    getUserRuns: vi.fn(),
}));

function totals(runs: number, hours: number, gpuHours: number, failed = 0, running = 0) {
    return { runs, hours, gpuHours, failed, running };
}

function run(id: number, extra: Partial<ComputeRun> = {}): ComputeRun {
    return { id, projectId: 1, projectName: "Apoferritin", protocolId: String(id),
        protocolClassName: "ProtRelionClassify3D", protocolLabel: "3D classes", userId: 2, userName: "Marta",
        userEmail: "marta@cnb.csic.es", host: "gpu1", queueName: null, queueJobId: null, gpus: 2, gpuIds: ["0", "1"],
        threads: 4, mpi: 1, streaming: false, startedAt: "2026-11-03T10:00:00+00:00", endedAt: null, running: true,
        status: "running", hours: 5, gpuHours: 10, ...extra };
}

const report: ComputeReport = {
    since: "2026-11-01T00:00:00+00:00",
    until: "2026-11-06T12:00:00+00:00",
    periodHours: 132,
    total: { ...totals(12, 40, 100, 3, 1), users: 2 },
    users: [
        { ...totals(8, 30, 80, 2, 1), userId: 2, name: "Marta", email: "marta@cnb.csic.es",
            mostUsed: "ProtRelionClassify3D" },
        { ...totals(4, 10, 20, 1), userId: 1, name: "Ana", email: "ana@cnb.csic.es", mostUsed: "ProtMotionCorr" },
    ],
    groups: [{ ...totals(12, 40, 100, 3, 1), groupId: 7, name: "Lab Carazo", members: 3, activeMembers: 2,
        mostUsed: "ProtRelionClassify3D" }],
    protocols: [{ ...totals(5, 20, 90, 1, 1), protocolClassName: "ProtRelionClassify3D",
        name: "ProtRelionClassify3D", users: 2 }],
    machines: [{ ...totals(12, 40, 100, 3, 1), host: "gpu1", name: "gpu1", users: 2,
        gpuHoursById: { "0": 60, "1": 40 } }],
    running: [run(9)],
};

const colors = { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#eee" };

describe("ComputeUsagePanel", () => {
    beforeEach(() => {
        vi.mocked(getComputeUsage).mockResolvedValue(report);
        vi.mocked(getUserRuns).mockResolvedValue({ since: report.since, until: report.until, truncated: false,
            runs: [run(9), run(8, { status: "failed", running: false, protocolLabel: "ctffind", gpus: 0,
                gpuIds: [], gpuHours: 0, host: "node7", queueJobId: "5512", queueName: "gpu-long" })] });
    });

    it("shows who used the most GPU time and, clicking them, their runs", async () => {
        render(<ComputeUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);

        const byUser = await screen.findByRole("table", { name: "Computing by user" });
        const rows = within(byUser).getAllByRole("row");
        expect(rows[1]).toHaveTextContent("Marta");
        expect(rows[1]).toHaveTextContent("80 h");
        expect(rows[1]).toHaveTextContent("80 %");
        expect(rows[1]).toHaveTextContent("1 running");
        expect(screen.getByText("100 h")).toBeInTheDocument();
        expect(screen.getByRole("table", { name: "Running now" })).toHaveTextContent("gpu1");

        fireEvent.click(rows[1]);
        const runs = await screen.findByRole("table", { name: "Runs of Marta" });
        expect(within(runs).getAllByRole("row")).toHaveLength(3);
        expect(runs).toHaveTextContent("Job 5512 in gpu-long");
        expect(runs).toHaveTextContent("failed");
        expect(vi.mocked(getUserRuns).mock.calls[0][0]).toBe(2);
    });

    it("shows how busy the GPUs really were, only where they were measured", async () => {
        vi.mocked(getComputeUsage).mockResolvedValue({ ...report,
            total: { ...report.total, gpuMeasuredHours: 40, gpuUsedHours: 10 },
            users: [{ ...report.users[0], gpuMeasuredHours: 40, gpuUsedHours: 10 }, report.users[1]] });
        vi.mocked(getUserRuns).mockResolvedValue({ since: report.since, until: report.until, truncated: false,
            runs: [run(9, { gpuBusy: 24.6, gpuUsedHours: 2.46, gpuMemoryPeakBytes: 6 * 1024 ** 3 }), run(8)] });
        render(<ComputeUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);

        const byUser = await screen.findByRole("table", { name: "Computing by user" });
        const rows = within(byUser).getAllByRole("row");
        expect(rows[1]).toHaveTextContent("25 %");
        expect(within(rows[2]).getAllByRole("cell")[2]).toHaveTextContent("—");
        expect(screen.getByText("busy over 40 h of GPU hours measured")).toBeInTheDocument();

        fireEvent.click(rows[1]);
        await screen.findByRole("table", { name: "Runs of Marta" });
        expect(screen.getByTestId("run-gpu-busy-9")).toHaveTextContent("25 % busy · 6");
        expect(screen.queryByTestId("run-gpu-busy-8")).not.toBeInTheDocument();
    });

    it("says the GPU use was not measured when no run was looked at", async () => {
        render(<ComputeUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);
        expect(await screen.findByText("Not measured in this period")).toBeInTheDocument();
    });

    it("shows the GPU hours of each GPU of a machine", async () => {
        render(<ComputeUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);
        await screen.findByRole("table", { name: "Computing by user" });

        fireEvent.click(screen.getByRole("button", { name: "By machine" }));
        expect(screen.getByRole("table", { name: "Computing by machine" }))
            .toHaveTextContent("GPU 0: 60 h · GPU 1: 40 h");
    });
});

describe("periodOf", () => {
    const now = new Date(2026, 10, 6, 15, 30);

    it("knows the presets", () => {
        expect(periodOf("month", now).since).toEqual(new Date(2026, 10, 1));
        // 6 November 2026 is a Friday: the week started on Monday the 2nd
        expect(periodOf("week", now).since).toEqual(new Date(2026, 10, 2));
        expect(periodOf("lastMonth", now)).toEqual({ since: new Date(2026, 9, 1), until: new Date(2026, 10, 1) });
        expect(periodOf("year", now).since).toEqual(new Date(2026, 0, 1));
    });

    it("takes both days of a custom range", () => {
        expect(periodOf("custom", now, "2026-10-01", "2026-10-31"))
            .toEqual({ since: new Date(2026, 9, 1), until: new Date(2026, 10, 1) });
    });
});

describe("formatHours", () => {
    it("writes minutes below an hour and fewer decimals for many hours", () => {
        expect(formatHours(0)).toBe("0 h");
        expect(formatHours(0.25)).toBe("15 min");
        expect(formatHours(2.26)).toMatch(/^2[.,]3 h$/);
        expect(formatHours(123.4)).toBe("123 h");
    });
});
