import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import QualitySummary from "@/components/monitor/QualitySummary";
import { summarizeQuality } from "@/components/monitor/quality-summary-data";
import { THRESHOLD_ORDER, TOMO_THRESHOLD_ORDER } from "@/components/monitor/streaming-monitor-data";
import type { StreamingMonitorThresholds } from "@/services/ProjectService";

const limits = { ...Object.fromEntries([...new Set([...THRESHOLD_ORDER, ...TOMO_THRESHOLD_ORDER])].map((name) => [name, null])), maxResolution: 5 } as StreamingMonitorThresholds;
const metrics = [{ id: "resolution", label: "CTF resolution", limits: ["maxResolution" as const] }];

describe("QualitySummary", () => {
  it("renders a startup state and does not claim a pass rate without measurements", () => {
    const view = render(<QualitySummary unit="micrographs" data={summarizeQuality([], limits, metrics, 100)} />);
    expect(screen.getByText("Waiting for micrographs to assess.")).toBeInTheDocument();
    view.rerender(<QualitySummary unit="micrographs" data={summarizeQuality([{ id: 1, values: {} }], limits, metrics, 100)} />);
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("—");
    expect(screen.getByText("Measurements missing").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByTestId("quality-metric-resolution")).toHaveTextContent("0 / 0 measured");
  });

  it("shows percentage points for comparable windows and the sample sizes", () => {
    const data = summarizeQuality([1, 2, 3, 4].map((id) => ({ id, values: { maxResolution: id === 4 ? 8 : 4 } })), limits, metrics, 2);
    render(<QualitySummary unit="micrographs" data={data} />);
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("50%");
    expect(screen.getByText("Latest 2 micrographs · window of 2")).toBeInTheDocument();
    expect(screen.getByText("-50 percentage points vs previous 2")).toBeInTheDocument();
    expect(within(screen.getByTestId("quality-metric-resolution")).getByText("1 / 2 measured")).toBeInTheDocument();
  });

  it("separates quality among evaluated movies from coverage and labels unknown causes neutrally", () => {
    const samples = [
      { id: 1, values: { maxResolution: 4 } },
      { id: 2, values: { maxResolution: 8 } },
      { id: 3, unavailable: true, values: {} },
      { id: 4, failed: true, values: {} },
    ];
    render(<QualitySummary unit="movies" data={summarizeQuality(samples, limits, metrics, 100)} />);
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("50%");
    expect(screen.getByText("1 of 2 evaluated movies pass all shown checks")).toBeInTheDocument();
    expect(screen.getByTestId("quality-assessment-coverage")).toHaveTextContent("50%assessment coverage · 2 / 4");
    expect(screen.getByText("No evaluation available").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("CTF failed").nextElementSibling).toHaveTextContent("1");
    expect(screen.queryByText("Awaiting evaluation")).not.toBeInTheDocument();
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("shows disabled thresholds explicitly and unfinished tomography separately", () => {
    const samples = [{ id: 1, pending: true, values: {} }];
    const view = render(<QualitySummary unit="tilt series" data={summarizeQuality(samples, limits, metrics, 20)} />);
    expect(screen.getByText("Incomplete series").nextElementSibling).toHaveTextContent("1");
    expect(screen.queryByText("CTF failed")).not.toBeInTheDocument();
    view.rerender(<QualitySummary unit="tilt series" data={summarizeQuality(samples, { ...limits, maxResolution: null }, metrics, 20)} />);
    expect(screen.getByText("No enabled thresholds for the visible metrics.")).toBeInTheDocument();
    expect(screen.getByText("Enable thresholds to assess quality")).toBeInTheDocument();
  });
});
