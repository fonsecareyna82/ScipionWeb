import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TomographySummary from "@/components/monitor/TomographySummary";
import { summarizeTomography } from "@/components/monitor/tomo-overview-data";
import type { StreamingMonitorThresholds, TomoMonitorTiltSeries } from "@/services/ProjectService";

const row: TomoMonitorTiltSeries = { id: 1, tsId: "TS_01", time: null, enabled: true, complete: true,
  tilts: 41, enabledTilts: 38, angleMin: -40, angleMax: 60, aligned: true, alerts: [] };
const thresholds = { minAngleSpan: 50 } as StreamingMonitorThresholds;

describe("TomographySummary", () => {
  it("shows the scope, known exclusions and angular shortfalls and opens the affected series", () => {
    const onOpenSeries = vi.fn();
    render(<TomographySummary data={summarizeTomography([row], thresholds)} filtered onOpenSeries={onOpenSeries} />);
    expect(screen.getByText("Selected range · 1 tilt series")).toBeInTheDocument();
    expect(screen.getByTestId("tomo-complete-count")).toHaveTextContent("1");
    expect(screen.getByTestId("tomo-excluded-tilts")).toHaveTextContent("3");
    expect(screen.getByTestId("tomo-angular-coverage")).toHaveTextContent("0 / 1");
    fireEvent.click(screen.getByRole("button", { name: "Inspect TS_01" }));
    expect(onOpenSeries).toHaveBeenCalledWith("TS_01");
  });

  it("keeps unavailable counts and angles distinct from zero exclusions or successful coverage", () => {
    render(<TomographySummary data={summarizeTomography([{ ...row, enabledTilts: undefined, angleMin: undefined }], thresholds)}
      filtered={false} onOpenSeries={vi.fn()} />);
    expect(screen.getByTestId("tomo-excluded-tilts")).toHaveTextContent("—");
    expect(screen.getByText("Tilt counts unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("tomo-angular-coverage")).toHaveTextContent("—");
    expect(screen.queryByRole("button", { name: /Inspect/ })).not.toBeInTheDocument();
  });
});
