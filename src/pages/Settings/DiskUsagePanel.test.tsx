import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DiskUsagePanel, { idleDays } from "./DiskUsagePanel";
import { getStorageUsage, measureStorage, type StorageReport } from "@/api/storage";

vi.mock("@/api/storage", () => ({
    getStorageUsage: vi.fn(),
    measureStorage: vi.fn().mockResolvedValue({ requested: true }),
}));

const GB = 1024 ** 3;
const longAgo = new Date(Date.now() - 200 * 86400000).toISOString();
const recently = new Date(Date.now() - 2 * 86400000).toISOString();

function totals(totalBytes: number, projects: number, measured = projects) {
    return { projects, measured, totalBytes, runsBytes: totalBytes, uploadsBytes: 0, oldestMeasure: null,
        lastActivity: recently };
}

function project(id: number, name: string, ownerId: number, ownerName: string, totalBytes: number | null,
                 extra: Partial<StorageReport["projects"][number]> = {}) {
    return { id, name, path: `/data/projects/${ownerName.toLowerCase()}/${name}`, ownerId, ownerName,
        ownerEmail: `${ownerName.toLowerCase()}@cnb.csic.es`, totalBytes, runsBytes: totalBytes, uploadsBytes: 0,
        files: 10, location: "managed" as const, measuredAt: "2026-11-04T08:00:00+00:00", durationSeconds: 3,
        error: null, measuring: false, requested: false, lastActivity: recently, ...extra };
}

const report: StorageReport = {
    disk: { path: "/data/projects", totalBytes: 1000 * GB, usedBytes: 600 * GB, freeBytes: 400 * GB },
    total: totals(300 * GB, 3),
    users: [
        { ...totals(250 * GB, 2), userId: 2, name: "Marta", email: "marta@cnb.csic.es" },
        { ...totals(50 * GB, 1), userId: 1, name: "Ana", email: "ana@cnb.csic.es" },
    ],
    groups: [{ ...totals(300 * GB, 3), groupId: 7, name: "Lab Carazo", members: 2, membersWithProjects: 2 }],
    projects: [
        project(11, "Ribosome", 2, "Marta", 200 * GB, { lastActivity: longAgo }),
        project(12, "Apoferritin", 1, "Ana", 50 * GB),
        project(13, "Tomo", 2, "Marta", 50 * GB),
    ],
    pending: 0,
    measuring: [],
};

const colors = { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#eee" };

describe("DiskUsagePanel", () => {
    beforeEach(() => {
        vi.mocked(getStorageUsage).mockResolvedValue(report);
        vi.mocked(measureStorage).mockClear();
    });

    it("shows who uses the most disk and, clicking them, their projects", async () => {
        render(<DiskUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);

        const byUser = await screen.findByRole("table", { name: "Disk usage by user" });
        const rows = within(byUser).getAllByRole("row");
        expect(rows[1]).toHaveTextContent("Marta");
        expect(rows[1]).toHaveTextContent("250 GB");
        expect(rows[1]).toHaveTextContent("83 %");
        expect(screen.getByText(/400 GB free/)).toBeInTheDocument();

        fireEvent.click(rows[1]);

        const byProject = await screen.findByRole("table", { name: "Disk usage by project" });
        expect(within(byProject).getByText("Ribosome")).toBeInTheDocument();
        expect(within(byProject).queryByText("Apoferritin")).not.toBeInTheDocument();
        expect(within(byProject).getByText("Unused for 6 months")).toBeInTheDocument();
        expect(screen.getByText("Projects of Marta")).toBeInTheDocument();
    });

    it("asks for new measures of one project or of all", async () => {
        render(<DiskUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);
        await screen.findByRole("table", { name: "Disk usage by user" });

        fireEvent.click(screen.getByRole("button", { name: "Measure all again" }));
        await waitFor(() => expect(measureStorage).toHaveBeenCalledWith(undefined));

        fireEvent.click(screen.getByRole("button", { name: "By project" }));
        fireEvent.click(await screen.findByRole("button", { name: "Measure Apoferritin again" }));
        await waitFor(() => expect(measureStorage).toHaveBeenCalledWith([12]));
    });

    it("sums the groups and says a user in two groups counts in both", async () => {
        render(<DiskUsagePanel fieldSx={{}} cardSx={{}} cardHeaderSx={{}} colors={colors} />);
        await screen.findByRole("table", { name: "Disk usage by user" });

        fireEvent.click(screen.getByRole("button", { name: "By group" }));

        const byGroup = await screen.findByRole("table", { name: "Disk usage by group" });
        expect(within(byGroup).getByText("Lab Carazo")).toBeInTheDocument();
        expect(screen.getByText(/counts in\s+both/)).toBeInTheDocument();
    });

    it("counts the days a project has been idle", () => {
        expect(idleDays(null)).toBeNull();
        expect(idleDays("2026-11-01T00:00:00Z", Date.parse("2026-11-04T12:00:00Z"))).toBe(3);
    });
});
