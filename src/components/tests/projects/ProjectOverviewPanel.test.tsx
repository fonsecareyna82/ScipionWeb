import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectOverviewPanel, { formatBytes, formatDuration } from "@/components/projects/ProjectOverviewPanel";
import type { ProjectDiskUsage, ProjectOverview } from "@/services/ProjectService";

const run = (protocolId: string, status: string, extra: Partial<ProjectOverview["running"][number]> = {}) => ({
  protocolId, protocolClassName: "XmippProtCTFMicrographs", label: `run ${protocolId}`, status,
  startedAt: "2026-10-19T10:00:00+00:00", endedAt: "2026-10-19T11:00:00+00:00", seconds: 3600, steps: 4, stepsDone: 4, ...extra,
});

const overview: ProjectOverview = {
  now: "2026-10-19T12:00:00+00:00",
  protocols: 4,
  counts: { finished: 2, failed: 1, running: 1 },
  computeSeconds: 9000,
  running: [run("8", "running", { endedAt: null, seconds: 120, stepsDone: 1 })],
  failed: [run("5", "failed")],
  recent: [run("4", "finished"), run("3", "finished")],
  longest: [run("4", "finished")],
};

const usage: ProjectDiskUsage = {
  computedAt: "2026-10-19T11:59:00+00:00",
  totalBytes: 3 * 1024 ** 3,
  computing: false,
  protocols: [
    { protocolId: "4", protocolClassName: "XmippProtCTFMicrographs", label: "run 4", status: "finished", bytes: 2 * 1024 ** 3, files: 10 },
    { protocolId: "8", protocolClassName: "XmippProtCTFMicrographs", label: "run 8", status: "running", bytes: 1024 ** 3, files: 3 },
  ],
};

function renderPanel(props: Partial<React.ComponentProps<typeof ProjectOverviewPanel>> = {}) {
  const handlers = {
    fetchOverview: vi.fn().mockResolvedValue(overview),
    fetchDiskUsage: vi.fn().mockResolvedValue(usage),
    onOpenProtocol: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  render(<ProjectOverviewPanel open projectTitle="Workflow_2D" {...handlers} />);
  return handlers;
}

describe("ProjectOverviewPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("formats sizes and durations", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(formatDuration(9000)).toBe("2 h 30 min");
    expect(formatDuration(null)).toBe("—");
  });

  it("shows the runs by status and opens one", async () => {
    const handlers = renderPanel();
    expect(await screen.findByText("4 protocols")).toBeTruthy();
    expect(screen.getByText("2 h 30 min of runs")).toBeTruthy();
    expect(screen.getByText("1/4 · 2 min")).toBeTruthy();
    fireEvent.click(screen.getByText("run 5"));
    expect(handlers.onOpenProtocol).toHaveBeenCalledWith("5");
  });

  it("asks again while the disk usage is being counted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchDiskUsage = vi.fn()
      .mockResolvedValueOnce({ computedAt: null, totalBytes: null, protocols: [], computing: true })
      .mockResolvedValue(usage);
    renderPanel({ fetchDiskUsage });
    expect(await screen.findByText("Counting the protocol folders…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(await screen.findByText("2.0 GB")).toBeTruthy();
    expect(fetchDiskUsage).toHaveBeenCalledTimes(2);
  });

  it("lists the protocols by size, without a cleaning action", async () => {
    renderPanel();
    expect(await screen.findByText("2.0 GB")).toBeTruthy();
    expect(screen.getAllByText("run 4").length).toBeGreaterThan(0);
    expect(screen.queryByText(/tmp/)).toBeNull();
  });
});
