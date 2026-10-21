import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StreamingMonitorView from "@/components/monitor/StreamingMonitorView";
import type { StreamingMonitor, TomoMonitor, TomoMonitorTiltSeries } from "@/services/ProjectService";
import { POLL_STORAGE_KEY } from "@/components/monitor/streaming-monitor-data";
import { createProjectServiceMock, renderWithProviders } from "@/components/tests/test-utils";

vi.mock("react-plotly.js", () => ({
  default: ({ data, onClick }: { data: Array<{ name: string; x: unknown[]; customdata?: unknown[][] }>; onClick?: (event: unknown) => void }) => (
    <div data-testid="mock-plotly">
      {data.map((serie) => (
        <button key={serie.name} type="button" data-points={serie.x.length}
                onClick={() => onClick?.({ points: [{ customdata: serie.customdata?.[0] }], event: { button: 0 } })}>
          {serie.name}
        </button>
      ))}
    </div>
  ),
}));

const THRESHOLDS = {
  minDefocus: 1000, maxDefocus: 40000, maxAstigmatism: 1000, maxResolution: null, maxFrameShift: 10, maxTotalDrift: 45,
  minParticles: null, minTilts: 30, minAngleSpan: 50, maxFailedCtfTilts: null, maxResidual: null,
};

function spa(stages: StreamingMonitor["stages"] = []): StreamingMonitor {
  return {
    now: "", streaming: false, stages, ctfOutputs: [], coordinatesOutputs: [], thresholds: THRESHOLDS,
    series: { setId: null, kind: null, reset: false, lastRowId: null, more: false, points: [] },
    classes: null, tomography: true,
    picking: { setId: null, reset: false, lastRowId: null, complete: true, counts: {} },
  };
}

function row(id: number, tsId: string, extra: Partial<TomoMonitorTiltSeries> = {}): TomoMonitorTiltSeries {
  return { id, tsId, time: "2026-10-22T12:00:00Z", enabled: true, tilts: 41, complete: true, enabledTilts: 41,
           angleMin: -60, angleMax: 60, dose: 120, defocusU: 30000, astigmatism: 400, aligned: true, alerts: [], ...extra };
}

function tomo(rows: TomoMonitorTiltSeries[]): TomoMonitor {
  return {
    now: "", streaming: true,
    stages: [
      { stage: "tiltseries", setId: 10, protocolId: "1", protocolClassName: "ProtComposeTS", label: "compose",
        status: "running", outputName: "tiltSeries", setClassName: "SetOfTiltSeries", items: 3, maxItemId: 3,
        streaming: true, perMinute: 0.2, trend: "steady", behind: null },
      { stage: "tomograms", setId: 50, protocolId: "5", protocolClassName: "ProtImodTomoReconstruction",
        label: "reconstruct", status: "running", outputName: "Tomograms", setClassName: "SetOfTomograms", items: 1,
        maxItemId: 1, streaming: true, perMinute: 0.1, trend: "steady", behind: 2 },
    ],
    tiltSeriesOutputs: [{ setId: 10, protocolId: "1", label: "compose", outputName: "tiltSeries" }],
    tomograms: { setId: 50, protocolId: "5", outputName: "Tomograms" },
    thresholds: THRESHOLDS,
    tiltSeries: rows,
  };
}

function render(tomoAnswer: TomoMonitor, spaAnswer = spa(), extra = {}) {
  const service = createProjectServiceMock({
    fetchStreamingMonitor: vi.fn().mockResolvedValue(spaAnswer),
    fetchTomoMonitor: vi.fn().mockResolvedValue(tomoAnswer),
    fetchTomoMonitorTiltSeries: vi.fn().mockResolvedValue({ tsId: "TS_01", tilts: [
      { acqOrder: 1, angle: -3, enabled: true, defocusU: 30000, shiftX: 2, shiftY: 1, residual: 0.8 },
      { acqOrder: 2, angle: 0, enabled: false, ctfFailed: true },
    ] }),
    fetchTomoMonitorSliceObjectUrl: vi.fn().mockResolvedValue({ url: "blob:slice", revoke: vi.fn() }),
    ...extra,
  });
  renderWithProviders(<StreamingMonitorView projectId={7} />, { service });
  return service as any;
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.removeItem(POLL_STORAGE_KEY);
});

describe("The tomography view of the monitor", () => {
  it("shows itself when the project has tilt series and no single particle stream", async () => {
    render(tomo([row(1, "TS_01", { tomogramId: 7 }), row(2, "TS_02"), row(3, "TS_03", { complete: false, tilts: 12, enabledTilts: 12 })]));

    expect(await screen.findByTestId("tomo-monitor")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("2 waiting")).toBeInTheDocument();
    // Newest first; the incomplete one says it is still arriving
    expect(screen.getAllByTestId("tilt-series-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("TS_03"), expect.stringContaining("TS_02"), expect.stringContaining("TS_01")]);
    expect(screen.getByText("12/12 …")).toBeInTheDocument();
    expect(screen.getAllByTestId("tomo-session-plot")).toHaveLength(3);
  });

  it("shows the central slice of each tomogram once", async () => {
    const service = render(tomo([row(1, "TS_01", { tomogramId: 7 }), row(2, "TS_02")]));

    await screen.findByTestId("tomo-monitor");
    await waitFor(() => expect(service.fetchTomoMonitorSliceObjectUrl).toHaveBeenCalledTimes(1));
    expect(service.fetchTomoMonitorSliceObjectUrl.mock.calls[0].slice(0, 3)).toEqual([7, 50, 7]);
  });

  it("marks in red what goes past a threshold and lists the runs of tilt series", async () => {
    render(tomo([row(1, "TS_01", { enabledTilts: 20, alerts: ["minTilts"] }),
                 row(2, "TS_02", { enabledTilts: 25, alerts: ["minTilts"] })]));

    expect(await screen.findByText("20/41")).toHaveClass("text-app-danger");
    expect(screen.getByText("Fewer tilts than 30 tilts")).toBeInTheDocument();
    expect(screen.getByText(/2 tilt series in a row/)).toBeInTheDocument();
  });

  it("opens the tilts of a tilt series by angle", async () => {
    const service = render(tomo([row(1, "TS_01", { tomogramId: 7 })]));

    fireEvent.click((await screen.findAllByTestId("tilt-series-row"))[0]);

    const detail = await screen.findByRole("region", { name: "Tilt series TS_01" });
    await waitFor(() => expect(within(detail).getAllByTestId("tilt-plot")).toHaveLength(3));
    expect(service.fetchTomoMonitorTiltSeries).toHaveBeenCalledWith(7, "TS_01", { tsSetId: null });
    expect(within(detail).getByText("Tomogram, central slice")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Close the tilt series" }));
    expect(screen.queryByRole("region", { name: "Tilt series TS_01" })).not.toBeInTheDocument();
  });

  it("asks again as often as chosen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const service = render(tomo([row(1, "TS_01")]));
    await screen.findByTestId("tomo-monitor");

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });

    await waitFor(() => expect(service.fetchTomoMonitor).toHaveBeenCalledTimes(2));
  });

  it("edits the tomography thresholds in its view", async () => {
    const service = render(tomo([row(1, "TS_01")]), spa(),
                           { saveStreamingMonitorThresholds: vi.fn().mockResolvedValue(THRESHOLDS) });
    await screen.findByTestId("tomo-monitor");

    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    expect(screen.getByLabelText("Fewer tilts than")).toHaveValue(30);
    expect(screen.queryByLabelText("Total drift above")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Alignment residual above"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(service.saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, expect.objectContaining({
      minTilts: 30, maxResidual: 1.5 })));
    expect(service.saveStreamingMonitorThresholds.mock.calls[0][1]).not.toHaveProperty("maxTotalDrift");
    await waitFor(() => expect(service.fetchTomoMonitor).toHaveBeenCalledTimes(2));
  });

  it("has a tab for each stream when the project has both", async () => {
    const both = spa([{ stage: "micrographs", setId: 20, protocolId: "2", protocolClassName: "ProtMotionCorr",
                        label: "motioncor", status: "running", outputName: "outputMicrographs",
                        setClassName: "SetOfMicrographs", items: 4, maxItemId: 4, streaming: true, perMinute: 1,
                        trend: "steady", behind: null }]);
    render(tomo([row(1, "TS_01")]), both);

    const tabs = await screen.findByRole("tablist", { name: "Monitor view" });
    expect(screen.queryByTestId("tomo-monitor")).not.toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole("tab", { name: "Tomography" }));

    expect(await screen.findByTestId("tomo-monitor")).toBeInTheDocument();
  });
});
