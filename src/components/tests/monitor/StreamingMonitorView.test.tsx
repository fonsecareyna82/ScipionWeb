import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StreamingMonitorView, { MONITOR_POLL_MS } from "@/components/monitor/StreamingMonitorView";
import type { StreamingMonitor, StreamingMonitorPoint } from "@/services/ProjectService";
import { createProjectServiceMock, renderWithProviders } from "@/components/tests/test-utils";

vi.mock("react-plotly.js", () => ({
  default: ({ data, onClick }: { data: Array<{ name: string; customdata: unknown[][] }>; onClick?: (event: unknown) => void }) => (
    <div data-testid="mock-plotly">
      {data.map((serie) => (
        <button
          key={serie.name}
          type="button"
          data-points={serie.customdata.length}
          onClick={() => onClick?.({ points: [{ customdata: serie.customdata[0] }], event: { button: 0 } })}
        >
          {serie.name}
        </button>
      ))}
    </div>
  ),
}));

const THRESHOLDS = {
  minDefocus: 1000, maxDefocus: 40000, maxAstigmatism: 1000, maxResolution: null, maxFrameShift: 10, maxTotalDrift: 45,
};

function point(id: number, extra: Partial<StreamingMonitorPoint> = {}): StreamingMonitorPoint {
  return { id, time: "2026-10-21T12:00:00Z", enabled: true, micrographName: `mic_${id}`, defocusU: 20000,
           defocusV: 19500, astigmatism: 500, resolution: 4, alerts: [], ...extra };
}

function answer(points: StreamingMonitorPoint[], extra: Partial<StreamingMonitor["series"]> = {}): StreamingMonitor {
  return {
    now: "2026-10-21T12:00:00Z",
    streaming: true,
    stages: [
      { stage: "micrographs", setId: 20, protocolId: "2", protocolClassName: "ProtMotionCorr", label: "motioncor",
        status: "running", outputName: "outputMicrographs", setClassName: "SetOfMicrographs", items: 12, maxItemId: 12,
        streaming: true, perMinute: 1.5, trend: "up", firstAt: null, lastAt: null, behind: 3 },
      { stage: "ctf", setId: 30, protocolId: "3", protocolClassName: "ProtCTFFind", label: "ctffind",
        status: "running", outputName: "outputCTF", setClassName: "SetOfCTF", items: 9, maxItemId: 9,
        streaming: true, perMinute: 1.2, trend: "steady", firstAt: null, lastAt: null, behind: 3 },
    ],
    ctfOutputs: [{ setId: 30, protocolId: "3", label: "ctffind", outputName: "outputCTF" }],
    thresholds: THRESHOLDS,
    series: { setId: 30, kind: "ctf", reset: false, lastItemId: points.length ? points[points.length - 1].id : null,
              more: false, points, ...extra },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StreamingMonitorView", () => {
  it("shows the stages, the plots and the alerts of the stream", async () => {
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(
      answer([point(1), point(2, { astigmatism: 1500, alerts: ["maxAstigmatism"] })]));
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });

    expect(await screen.findByText("ctffind")).toBeInTheDocument();
    expect(screen.getAllByTestId("monitor-stage")).toHaveLength(2);
    expect(screen.getAllByText("3 waiting")).toHaveLength(2);
    expect(screen.getAllByTestId("monitor-plot")).toHaveLength(4);
    expect(screen.getByText("Astigmatism above 1000 Å")).toBeInTheDocument();
    expect(fetchStreamingMonitor).toHaveBeenCalledWith(7, { ctfSetId: null, afterSetId: null, afterItemId: null });
  });

  it("asks only for the points after the last one it has", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(answer([point(1), point(2)]))
      .mockResolvedValue(answer([point(3)]));
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });
    await screen.findByText("ctffind");

    await act(async () => {
      vi.advanceTimersByTime(MONITOR_POLL_MS + 100);
    });

    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(2));
    expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, { ctfSetId: null, afterSetId: 30, afterItemId: 2 });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Resolution" })[0]).toHaveAttribute("data-points", "3"));
  });

  it("reads every batch the server has before showing them", async () => {
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(answer([point(1)], { more: true }))
      .mockResolvedValueOnce(answer([point(2)]));
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Resolution" })[0]).toHaveAttribute("data-points", "2"));
    expect(fetchStreamingMonitor).toHaveBeenNthCalledWith(2, 7, { ctfSetId: null, afterSetId: 30, afterItemId: 1 });
  });

  it("opens the micrograph of a point", async () => {
    const fetchCTFMicrographImageObjectUrl = vi.fn().mockResolvedValue({ url: "blob:mic", revoke: vi.fn() });
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(5)])),
        fetchCTFMicrographImageObjectUrl,
      }),
    });

    fireEvent.click((await screen.findAllByRole("button", { name: "Resolution" }))[0]);

    await waitFor(() => expect(fetchCTFMicrographImageObjectUrl).toHaveBeenCalled());
    expect(fetchCTFMicrographImageObjectUrl.mock.calls[0].slice(0, 4)).toEqual([7, "3", "outputCTF", 5]);
  });

  it("saves the thresholds and reads the series again with them", async () => {
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(answer([point(1)]));
    const saveStreamingMonitorThresholds = vi.fn().mockResolvedValue({ ...THRESHOLDS, maxResolution: 6 });
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    await screen.findByText("ctffind");

    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    fireEvent.change(screen.getByLabelText("CTF resolution worse than"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Astigmatism above"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, {
      ...THRESHOLDS, maxResolution: 6, maxAstigmatism: null,
    }));
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(
      7, { ctfSetId: null, afterSetId: null, afterItemId: null }));
  });

  it("refuses a threshold that is not a positive number", async () => {
    const saveStreamingMonitorThresholds = vi.fn();
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([])), saveStreamingMonitorThresholds,
      }),
    });
    await screen.findByText("ctffind");

    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    fireEvent.change(screen.getByLabelText("Total drift above"), { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Total drift above");
    expect(saveStreamingMonitorThresholds).not.toHaveBeenCalled();
  });

  it("shows the drift of the micrographs before there is a CTF output", async () => {
    const before = answer([point(1, { defocusU: undefined, defocusV: undefined, astigmatism: undefined,
                                      resolution: undefined, totalDrift: 12 })], { kind: "micrographs", setId: 20 });
    before.stages = before.stages.filter((stage) => stage.stage !== "ctf");
    const fetchCTFMicrographImageObjectUrl = vi.fn();
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(before), fetchCTFMicrographImageObjectUrl,
      }),
    });

    expect(await screen.findByText(/No CTF estimation yet/)).toBeInTheDocument();
    expect(screen.getAllByTestId("monitor-plot")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Total drift" }));
    expect(fetchCTFMicrographImageObjectUrl).not.toHaveBeenCalled();
  });

  it("says so when the project has nothing to follow", async () => {
    const empty = answer([], { kind: null, setId: null });
    empty.stages = [];
    empty.streaming = false;
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(empty) }),
    });

    expect(await screen.findByText(/no movies, micrographs or CTF outputs/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("monitor-plot")).toHaveLength(0);
  });
});
