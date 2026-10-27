import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StreamingMonitorView from "@/components/monitor/StreamingMonitorView";
import { POLL_STORAGE_KEY } from "@/components/monitor/streaming-monitor-data";
import type { StreamingMonitor, StreamingMonitorPoint, StreamingMonitorThresholds } from "@/services/ProjectService";
import { createProjectServiceMock, renderWithProviders } from "@/components/tests/test-utils";

vi.mock("react-plotly.js", () => ({
  default: ({ data, layout, onClick, onRelayout }: { onRelayout?: (event: Record<string, unknown>) => void; layout?: { xaxis?: { type?: string; range?: unknown[] }; shapes?: Array<{ y0: number; x0?: number }> }; data: Array<{ name: string; customdata?: unknown[][]; x: unknown[]; marker?: { color: string[] } }>; onClick?: (event: unknown) => void }) => (
    <div data-testid="mock-plotly" data-limits={JSON.stringify(layout?.shapes?.map((shape) => shape.y0) ?? [])}
         data-x-limits={JSON.stringify(layout?.shapes?.map((shape) => shape.x0) ?? [])}
         data-time-range={JSON.stringify(layout?.xaxis?.range ?? [])}>
      {onRelayout ? <>
        <button type="button" aria-label={`Zoom time ${data[0]?.name}`} onClick={() => onRelayout(layout?.xaxis?.type === "date"
          ? { "xaxis.range[0]": "2026-10-21 11:45:00", "xaxis.range[1]": "2026-10-21 12:00:00" }
          : { "xaxis.range[0]": 1.5, "xaxis.range[1]": 2.5 })}>Zoom time</button>
        <button type="button" aria-label={`Reset time ${data[0]?.name}`} onClick={() => onRelayout({ "xaxis.autorange": true })}>Reset time</button>
        <button type="button" aria-label={`Zoom Y ${data[0]?.name}`} onClick={() => onRelayout({ "yaxis.range[0]": 0, "yaxis.range[1]": 5 })}>Zoom Y</button>
      </> : null}
      {data.map((serie) => (
        <button
          key={serie.name}
          type="button"
          data-points={(serie.customdata ?? serie.x).length}
          data-colours={JSON.stringify(serie.marker?.color)}
          data-first-x={String(serie.x?.[0])}
          onClick={() => onClick?.({ points: [{ customdata: serie.customdata?.[0] }], event: { button: 0 } })}
        >
          {serie.name}
        </button>
      ))}
    </div>
  ),
}));

const THRESHOLDS = {
  minDefocus: 1000, maxDefocus: 40000, maxAstigmatism: 1000, maxResolution: null, maxFrameShift: 10, maxTotalDrift: 45,
  minParticles: null, minTilts: 30, minAngleSpan: 50, maxFailedCtfTilts: null, maxResidual: null, maxDoseDifference: 5,
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
        streaming: true, perMinute: 1.5, trend: "up", behind: 3 },
      { stage: "ctf", setId: 30, protocolId: "3", protocolClassName: "ProtCTFFind", label: "ctffind",
        status: "running", outputName: "outputCTF", setClassName: "SetOfCTF", items: 9, maxItemId: 9,
        streaming: true, perMinute: 1.2, trend: "steady", behind: 3 },
    ],
    ctfOutputs: [{ setId: 30, protocolId: "3", label: "ctffind", outputName: "outputCTF" }],
    coordinatesOutputs: [], classesOutputs: [],
    thresholds: THRESHOLDS,
    series: { setId: 30, kind: "ctf", reset: false, lastRowId: points.length ? points[points.length - 1].id : null,
              more: false, points, ...extra },
    classes: null,
    tomography: false,
    picking: { setId: null, reset: false, lastRowId: null, complete: true, counts: {} },
    dose: { key: null, label: null, reset: false, lastRowId: null, more: false, points: [] },
  };
}

function withCoordinates(): StreamingMonitor {
  const next = answer([point(1)]);
  next.stages = [...next.stages, {
    stage: "coordinates", setId: 40, protocolId: "4", protocolClassName: "ProtPick", label: "cryolo",
    status: "running", outputName: "outputCoordinates", setClassName: "SetOfCoordinates", items: 2,
    maxItemId: 2, streaming: true, perMinute: 1, trend: "steady", behind: 0, micrographs: 1,
  }];
  return next;
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  window.localStorage.removeItem(POLL_STORAGE_KEY);
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
    // The alerts are in the panel the bell opens; the bell counts the new ones
    expect(screen.getByTestId("monitor-alerts-badge")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Alerts, 1 new" }));
    const panel = screen.getByRole("complementary", { name: "Alerts" });
    expect(within(panel).getByText("Astigmatism above 1000 Å")).toBeInTheDocument();
    expect(screen.queryByTestId("monitor-alerts-badge")).not.toBeInTheDocument();
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
    // Every part says what it shows
    expect(screen.getByRole("img", { name: /Each card is a step of the processing chain/ })).toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: /Each line is a run of consecutive items/ })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Each point is a micrograph/ })).toHaveLength(4);
    expect(fetchStreamingMonitor).toHaveBeenCalledWith(7, { ctfSetId: null, coordinatesSetId: null, classesSetId: null, afterSetId: null, afterRowId: null, afterPickSetId: null, afterPickRowId: null, afterDoseKey: null, afterDoseRowId: null, qualityWindowSize: 100 });
  });

  it("customizes multiple sections without closing the picker or changing thresholds", async () => {
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(answer([point(1, { astigmatism: 1500, alerts: ["maxAstigmatism"] })]));
    const saveStreamingMonitorThresholds = vi.fn();
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    await screen.findByText("ctffind");
    expect(screen.getByRole("combobox", { name: "Refresh every" }).closest("label"))
      .toHaveTextContent("Refresh every");
    expect(screen.getByRole("button", { name: "Customize view" }).nextElementSibling)
      .toBe(screen.getByRole("button", { name: "Thresholds" }));
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    const picker = screen.getByRole("dialog", { name: "Customize monitor view" });
    fireEvent.click(within(picker).getByRole("checkbox", { name: "Astigmatism" }));
    expect(screen.getAllByTestId("monitor-plot")).toHaveLength(3);
    expect(picker).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("checkbox", { name: "Pipeline" }));
    expect(document.querySelector('section[aria-label="Pipeline"]')).toBeNull();
    fireEvent.keyDown(picker, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Alerts, 1 new" })).toBeInTheDocument();
    expect(saveStreamingMonitorThresholds).not.toHaveBeenCalled();
    expect(fetchStreamingMonitor).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore default view" }));
    expect(screen.getAllByTestId("monitor-plot")).toHaveLength(4);
    expect(document.querySelector('section[aria-label="Pipeline"]')).not.toBeNull();
  });

  it("restores hidden sections when the monitor is opened again", async () => {
    const service = createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(1)])) });
    const first = renderWithProviders(<StreamingMonitorView projectId={7} />, { service });
    await screen.findByText("ctffind");
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Drift" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Distributions" }));
    first.unmount();
    renderWithProviders(<StreamingMonitorView projectId={8} />, { service });
    await screen.findByText("ctffind");
    expect(screen.getAllByTestId("monitor-plot")).toHaveLength(3);
    expect(screen.queryByTestId("monitor-histogram")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
  });

  it("puts the quality summary before the pipeline, updates it with sliders and lets users hide it", async () => {
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(1, { totalDrift: 5, maxFrameShift: 1, astigmatism: 900 })])),
        saveStreamingMonitorThresholds: vi.fn(),
      }),
    });
    const summary = await screen.findByRole("region", { name: "Quality summary" });
    const pipeline = screen.getByRole("region", { name: "Pipeline" });
    expect(summary.compareDocumentPosition(pipeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(summary).getByTestId("quality-within-percent")).toHaveTextContent("100%");
    fireEvent.change(screen.getByRole("slider", { name: "Astigmatism above slider" }), { target: { value: "800" } });
    expect(within(summary).getByTestId("quality-within-percent")).toHaveTextContent("0%");
    expect(within(summary).getByTestId("quality-metric-astigmatism")).toHaveTextContent("1 / 1 measured");
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Quality summary" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Customize monitor view" }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Quality summary" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("monitor-plot")).toHaveLength(4);
  });

  it("configures the quality window without changing project thresholds or the cached plots", async () => {
    const points = [1, 2, 3, 4].map((id) => point(id, { totalDrift: 5, maxFrameShift: 1, astigmatism: id === 4 ? 1500 : 500 }));
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(answer(points));
    const saveStreamingMonitorThresholds = vi.fn();
    const service = createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds });
    const view = renderWithProviders(<StreamingMonitorView projectId={7} />, { service });
    await screen.findByText("ctffind");
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("75%");
    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    expect(screen.getByLabelText("Quality summary window")).toHaveValue(100);
    fireEvent.change(screen.getByLabelText("Quality summary window"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Latest 2 micrographs · window of 2");
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("50%");
    expect(screen.getByText("-50 percentage points vs previous 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-points", "4");
    expect(saveStreamingMonitorThresholds).not.toHaveBeenCalled();
    expect(fetchStreamingMonitor).toHaveBeenCalledTimes(1);
    view.unmount();
    renderWithProviders(<StreamingMonitorView projectId={7} />, { service });
    await screen.findByText("Latest 2 micrographs · window of 2");
    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    expect(screen.getByLabelText("Quality summary window")).toHaveValue(2);
    fireEvent.change(screen.getByLabelText("Quality summary window"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Latest 2 micrographs · window of 2")).toBeInTheDocument();
  });

  it("hides a metric from recent quality and recalculates its score while keeping alerts active", async () => {
    const next = answer([point(1, { resolution: 8, totalDrift: 5, maxFrameShift: 1, alerts: ["maxResolution"] })]);
    next.thresholds = { ...THRESHOLDS, maxResolution: 5 };
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(next);
    const saveStreamingMonitorThresholds = vi.fn();
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    await screen.findByRole("region", { name: "Quality summary" });
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("0%");
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "CTF resolution" }));
    expect(screen.queryByTestId("quality-metric-resolution")).not.toBeInTheDocument();
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("100%");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Customize monitor view" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Alerts, 1 new" })).toBeInTheDocument();
    expect(saveStreamingMonitorThresholds).not.toHaveBeenCalled();
    expect(fetchStreamingMonitor).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore default view" }));
    expect(screen.getByTestId("quality-metric-resolution")).toBeInTheDocument();
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("0%");
  });

  it("summarizes imported movies including unavailable CTF, updates late results and resizes without dropping cached plots", async () => {
    const next = answer([point(1, { totalDrift: 5, maxFrameShift: 1 })]);
    next.exposures = { setId: 10, ctfSetId: 30, windowSize: 100, points: [
      { id: 1, importRowId: 501, movieName: "movie1", time: null, aligned: true, ctfReady: true, point: next.series.points[0] },
      { id: 2, importRowId: 502, movieName: "movie2", time: null, aligned: false, ctfReady: false, point: null },
    ] };
    const fetchStreamingMonitor = vi.fn().mockImplementation(async (_projectId, query) => ({
      ...next, exposures: { ...next.exposures, windowSize: query.qualityWindowSize },
    }));
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor }),
    });
    await screen.findByText("Latest 2 movies imported · window of 100");
    expect(screen.getByText("Aligned 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("CTF available 1 / 2")).toBeInTheDocument();
    expect(screen.getByTestId("quality-within-percent")).toHaveTextContent("100%");
    expect(screen.getByText("No evaluation available").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByTestId("quality-assessment-coverage")).toHaveTextContent("50%");
    expect(screen.queryByText("Awaiting evaluation")).not.toBeInTheDocument();
    next.exposures!.points[1] = { ...next.exposures!.points[1], aligned: true, ctfReady: true,
      point: point(2, { totalDrift: 5, maxFrameShift: 1 }) };
    // No new incremental CTF points: the refreshed snapshot must still update the summary.
    next.series = { ...next.series, points: [] };
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByText("No evaluation available").nextElementSibling).toHaveTextContent("0"));
    expect(screen.getByTestId("quality-assessment-coverage")).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    fireEvent.change(screen.getByLabelText("Quality summary window"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(3));
    expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, expect.objectContaining({ qualityWindowSize: 1, afterSetId: 30, afterRowId: 1 }));
    expect(screen.getByText("Latest 1 movie imported · window of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-points", "1");
  });

  it("filters time charts, histograms and latest images together and synchronizes zoom without changing quality or alerts", async () => {
    const points = [
      point(1, { time: "2026-10-21T09:00:00Z", totalDrift: 5, maxFrameShift: 1, astigmatism: 1500, alerts: ["maxAstigmatism"] }),
      point(2, { time: "2026-10-21T11:40:00Z", totalDrift: 5, maxFrameShift: 1 }),
      point(3, { time: "2026-10-21T11:55:00Z", totalDrift: 5, maxFrameShift: 1 }),
      point(4, { time: null, totalDrift: 5, maxFrameShift: 1 }),
    ];
    const next = answer(points);
    next.dose = { key: "dose", label: "dose", reset: false, lastRowId: 3, more: false, points:
      ["2026-10-21T09:00:00Z", "2026-10-21T11:45:00Z", "2026-10-21T11:59:00Z"].map((time, index) => ({
        id: index + 1, time, meanDose: 1, doseDifference: 0, discarded: false, alerts: [],
      })) };
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(next);
    renderWithProviders(<StreamingMonitorView projectId={7} />, { service: createProjectServiceMock({ fetchStreamingMonitor }) });
    await screen.findByText("ctffind");
    fireEvent.change(screen.getByRole("combobox", { name: "Chart time range" }), { target: { value: "30m" } });
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-points", "2");
    expect(screen.getAllByRole("button", { name: "Selected micrographs" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Selected micrographs" })[0]).toHaveAttribute("data-points", "2");
    expect(screen.getByText("Latest 4 micrographs · window of 100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alerts, 1 new" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom time Resolution" }));
    expect(screen.getByRole("combobox", { name: "Chart time range" })).toHaveValue("custom");
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-points", "1");
    const plots = screen.getAllByTestId("monitor-plot");
    const ranges = plots.map((plot) => within(plot).getByTestId("mock-plotly").getAttribute("data-time-range"));
    expect(new Set(ranges).size).toBe(1);
    expect(JSON.parse(ranges[0]!)).toEqual(["2026-10-21T11:45:00.000Z", "2026-10-21T12:00:00.000Z"]);
    fireEvent.click(screen.getByRole("button", { name: "Zoom Y Resolution" }));
    expect(screen.getByRole("combobox", { name: "Chart time range" })).toHaveValue("custom");
    fireEvent.click(screen.getByRole("button", { name: "Reset time Resolution" }));
    expect(screen.getByRole("combobox", { name: "Chart time range" })).toHaveValue("all");
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-points", "3");
    expect(screen.getAllByRole("button", { name: "All micrographs" })[0]).toHaveAttribute("data-points", "4");
    expect(fetchStreamingMonitor).toHaveBeenCalledTimes(1);
  });

  it("preserves global item positions and synchronized item zoom in completed sessions", async () => {
    const next = answer([point(1, { time: "2026-10-21T09:00:00Z" }),
      point(2, { time: "2026-10-21T11:40:00Z" }), point(3, { time: "2026-10-21T11:55:00Z" })]);
    next.streaming = false;
    renderWithProviders(<StreamingMonitorView projectId={7} />, { service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(next) }) });
    await screen.findByText("ctffind");
    fireEvent.change(screen.getByRole("combobox", { name: "Chart time range" }), { target: { value: "30m" } });
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-first-x", "2");
    fireEvent.click(screen.getByRole("button", { name: "Zoom time Resolution" }));
    expect(screen.getByRole("option", { name: "Custom item range" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-points", "1");
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-first-x", "2");
    fireEvent.click(screen.getByRole("button", { name: "Reset time Resolution" }));
    expect(screen.getByRole("button", { name: "Resolution" })).toHaveAttribute("data-first-x", "1");
  });

  it("shows how the CTF resolution and the defocus are spread, with the last micrographs over the session", async () => {
    const many = Array.from({ length: 120 }, (_, index) => point(index + 1));
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(answer(many)) }),
    });

    await screen.findByText("ctffind");
    expect(screen.getAllByTestId("monitor-histogram")).toHaveLength(2);
    const all = screen.getAllByRole("button", { name: "All micrographs" });
    const last = screen.getAllByRole("button", { name: "Last 50" });
    expect(all[0]).toHaveAttribute("data-points", "120");
    expect(last[0]).toHaveAttribute("data-points", "50");
  });

  it("lists the newest micrographs with their images, reads each image once, and opens one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchCTFMicrographImageObjectUrl = vi.fn().mockResolvedValue({ url: "blob:mic", revoke: vi.fn() });
    const fetchCTFPsdImageObjectUrl = vi.fn().mockResolvedValue({ url: "blob:psd", revoke: vi.fn() });
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(answer([point(1), point(2, { astigmatism: 1500, alerts: ["maxAstigmatism"] })]))
      .mockResolvedValue(answer([point(3)]));
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, fetchCTFMicrographImageObjectUrl, fetchCTFPsdImageObjectUrl }),
    });

    await screen.findByText("ctffind");
    expect(screen.getAllByTestId("latest-micrograph").map((row) => row.textContent)).toEqual([
      expect.stringContaining("mic_2"), expect.stringContaining("mic_1")]);
    expect(screen.getByText("1500 Å")).toHaveClass("text-app-danger");
    await waitFor(() => expect(fetchCTFPsdImageObjectUrl).toHaveBeenCalledTimes(2));

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });
    await waitFor(() => expect(screen.getAllByTestId("latest-micrograph")).toHaveLength(3));
    // Only the new micrograph's images are read
    await waitFor(() => expect(fetchCTFMicrographImageObjectUrl).toHaveBeenCalledTimes(3));
    expect(fetchCTFPsdImageObjectUrl).toHaveBeenCalledTimes(3);

    // The row itself opens nothing; the micrograph opens from its thumbnail
    fireEvent.click(screen.getAllByTestId("latest-micrograph")[0]);
    expect(fetchCTFMicrographImageObjectUrl).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Open the micrograph" })[0]);
    await waitFor(() => expect(fetchCTFMicrographImageObjectUrl).toHaveBeenCalledTimes(4));
    expect(fetchCTFMicrographImageObjectUrl.mock.calls[3].slice(0, 4)).toEqual([7, "3", "outputCTF", 3]);

    // Its power spectrum opens from its thumbnail
    fireEvent.click(screen.getAllByRole("button", { name: "Open the power spectrum" })[0]);
    await waitFor(() => expect(fetchCTFPsdImageObjectUrl).toHaveBeenCalledTimes(4));
    expect(fetchCTFPsdImageObjectUrl.mock.calls[3].slice(0, 4)).toEqual([7, "3", "outputCTF", 3]);
    expect(fetchCTFPsdImageObjectUrl.mock.calls[3][4]).toMatchObject({ size: 1024 });
  });

  it("shows the particles of each micrograph once picked, with the picking backlog in micrographs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const picked = (counts: Record<string, number>, lastRowId: number) => {
      const next = answer([point(1), point(2)]);
      next.stages = [...next.stages, {
        stage: "coordinates", setId: 40, protocolId: "4", protocolClassName: "ProtPick", label: "cryolo",
        status: "running", outputName: "outputCoordinates", setClassName: "SetOfCoordinates", items: 120,
        maxItemId: 120, streaming: true, perMinute: 10, trend: "up", behind: 7, micrographs: 2,
        pickedFrom: { protocolId: "6", label: "ctf consensus", outputName: "outputMicrographs", items: 9 },
      }];
      next.thresholds = { ...THRESHOLDS, minParticles: 50 };
      next.picking = { setId: 40, reset: false, lastRowId, complete: true, counts };
      return next;
    };
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(picked({ "1": 100 }, 10))
      .mockResolvedValue({ ...picked({ "2": 20 }, 12), series: { ...answer([]).series, lastRowId: 2 } });
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });

    expect(await screen.findByText("7 micrographs waiting")).toBeInTheDocument();
    expect(screen.getByText("from 2 micrographs")).toBeInTheDocument();
    expect(screen.getByText("from ctf consensus")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Particles" })).toHaveAttribute("data-points", "1");
    expect(screen.getByText("Not picked")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, expect.objectContaining({
      afterPickSetId: 40, afterPickRowId: 10 })));
    // Micrograph 2 was picked later with too few particles: it shows, and it is an alert
    await waitFor(() => expect(screen.getByRole("button", { name: "Particles" })).toHaveAttribute("data-points", "2"));
    fireEvent.click(screen.getByRole("button", { name: /^Alerts/ }));
    expect(screen.getByText("Fewer particles picked than 50 particles")).toBeInTheDocument();
  });

  it("shows the 2D classes biggest first, and their averages again only after a new round", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const withClasses = (version: string) => {
      const next = answer([point(1)]);
      next.stages = [...next.stages, {
        stage: "classes2d", setId: 90, protocolId: "9", protocolClassName: "XmippProtClassifyPcaStreaming",
        label: "alignPCA-2D", status: "running", outputName: "outputClasses", setClassName: "SetOfClasses2D",
        items: 2, maxItemId: 2, streaming: true, perMinute: null, trend: null, behind: 500, particles: 4300,
      }];
      next.classes = { setId: 90, protocolId: "9", outputName: "outputClasses", version, particles: 4300,
                       classes: [{ id: 2, particles: 3000, enabled: true }, { id: 1, particles: 1300, enabled: true }] };
      return next;
    };
    const fetchMetadataImageCellObjectUrl = vi.fn().mockResolvedValue({ url: "blob:class", revoke: vi.fn() });
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(withClasses("v1"))
      .mockResolvedValueOnce(withClasses("v1"))
      .mockResolvedValue(withClasses("v2"));
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, fetchMetadataImageCellObjectUrl }),
    });

    expect(await screen.findByText(/^4\D?300 particles classified$/)).toBeInTheDocument();
    expect(screen.getByText("500 particles waiting")).toBeInTheDocument();
    expect(screen.getAllByTestId("class-average").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/3\D?000/), expect.stringMatching(/1\D?300/)]);
    await waitFor(() => expect(fetchMetadataImageCellObjectUrl).toHaveBeenCalledTimes(2));
    expect(fetchMetadataImageCellObjectUrl.mock.calls[0].slice(0, 6)).toEqual([7, "9", "outputClasses", "objects", 0, "stack"]);
    expect(fetchMetadataImageCellObjectUrl.mock.calls[0][6]).toMatchObject({ rowId: 2, contrastMode: "enhanced", version: "v1" });

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(2));
    // The same round: the averages are not read again
    expect(fetchMetadataImageCellObjectUrl).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(15100);
    });
    await waitFor(() => expect(fetchMetadataImageCellObjectUrl).toHaveBeenCalledTimes(4));
    expect(fetchMetadataImageCellObjectUrl.mock.calls[3][6]).toMatchObject({ version: "v2" });
  });

  it("follows the picking chosen among several, reading everything again", async () => {
    const several = answer([point(1)]);
    several.coordinatesOutputs = [
      { setId: 40, protocolId: "4", label: "cryolo", outputName: "outputCoordinates" },
      { setId: 41, protocolId: "14", label: "template picking", outputName: "outputCoordinates" },
    ];
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(several);
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });
    await screen.findByText("ctffind");

    fireEvent.change(screen.getByLabelText("Picking to follow"), { target: { value: "41" } });

    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, expect.objectContaining({
      coordinatesSetId: 41, afterSetId: null, afterPickSetId: null })));
  });

  it("follows the 2D classes chosen among several, with their own picking", async () => {
    const several = answer([point(1)]);
    several.classesOutputs = [
      { setId: 90, protocolId: "9", label: "alignPCA-2D", outputName: "outputClasses" },
      { setId: 91, protocolId: "19", label: "alignPCA-2D (2)", outputName: "outputClasses" },
    ];
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(several);
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });
    await screen.findByText("ctffind");

    fireEvent.change(screen.getByLabelText("2D classes to follow"), { target: { value: "91" } });

    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, expect.objectContaining({
      classesSetId: 91, coordinatesSetId: null, afterSetId: null })));
  });

  it("names the micrographs the aligner wrote apart from the ones the CTF reads", async () => {
    const withAligned = answer([point(1)]);
    withAligned.stages = [{ ...withAligned.stages[0], stage: "alignedMicrographs", setId: 19, label: "motioncor" },
                          ...withAligned.stages];
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(withAligned) }),
    });

    expect(await screen.findByText("Aligned micrographs")).toBeInTheDocument();
    expect(screen.getByText("Micrographs")).toBeInTheDocument();
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
      vi.advanceTimersByTime(15000 + 100);
    });

    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(2));
    expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, { ctfSetId: null, coordinatesSetId: null, classesSetId: null, afterSetId: 30, afterRowId: 2, afterPickSetId: null, afterPickRowId: null, afterDoseKey: null, afterDoseRowId: null, qualityWindowSize: 100 });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Resolution" })[0]).toHaveAttribute("data-points", "3"));
  });

  it("reads as often as chosen, keeps the choice, and can be paused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(answer([point(1)]));
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });
    await screen.findByText("ctffind");

    fireEvent.change(screen.getByLabelText("Refresh every"), { target: { value: "5" } });
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(2));
    expect(window.localStorage.getItem(POLL_STORAGE_KEY)).toBe("5");

    fireEvent.change(screen.getByLabelText("Refresh every"), { target: { value: "0" } });
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(fetchStreamingMonitor).toHaveBeenCalledTimes(2);
  });

  it("starts with the interval chosen before in this browser", async () => {
    window.localStorage.setItem(POLL_STORAGE_KEY, "30");
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([])) }),
    });

    expect(await screen.findByLabelText("Refresh every")).toHaveValue("30");
  });

  it("reads every batch the server has before showing them", async () => {
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(answer([point(1)], { more: true }))
      .mockResolvedValueOnce(answer([point(2)]));
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Resolution" })[0]).toHaveAttribute("data-points", "2"));
    expect(fetchStreamingMonitor).toHaveBeenNthCalledWith(2, 7, { ctfSetId: null, coordinatesSetId: null, classesSetId: null, afterSetId: 30, afterRowId: 1, afterPickSetId: null, afterPickRowId: null, afterDoseKey: null, afterDoseRowId: null, qualityWindowSize: 100 });
  });

  it("tints the cards of each phase of the stream with one quiet hue", async () => {
    const answer = withCoordinates();
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(answer) }) });

    await screen.findByText("ctffind");
    const [micrographs, ctf, coordinates] = screen.getAllByTestId("monitor-stage")
      .map((card) => card.getAttribute("data-phase-hue"));
    expect(micrographs).toBe(ctf);
    expect(coordinates).not.toBe(ctf);
  });

  it("shows the dose of each analysed movie, with its alerts, and asks only for the newer ones", async () => {
    const dosed = (points: StreamingMonitor["dose"]["points"], lastRowId: number) => ({
      ...answer([point(1)]),
      dose: { key: "9", label: "dose analysis", reset: false, lastRowId, more: false, points },
    });
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(dosed([
        { id: 1, time: "2026-10-21T12:00:00Z", movieName: "movie_001.tiff", meanDose: 1.2, doseDifference: 0.5,
          discarded: false, alerts: [] },
        { id: 2, time: "2026-10-21T12:01:00Z", movieName: "movie_002.tiff", meanDose: 1.4, doseDifference: 16,
          discarded: true, alerts: ["maxDoseDifference"] },
      ], 502))
      .mockResolvedValue(dosed([], 502));
    renderWithProviders(<StreamingMonitorView projectId={7} />,
                        { service: createProjectServiceMock({ fetchStreamingMonitor }) });

    expect(await screen.findByRole("button", { name: "Dose against the median" })).toHaveAttribute("data-points", "2");
    fireEvent.click(screen.getByRole("button", { name: "Alerts, 1 new" }));
    expect(screen.getByText("Dose off the session median by more than 5 %")).toBeInTheDocument();
    expect(screen.getByText(/^1 movie/)).toBeInTheDocument();
    expect(screen.getByText("movie_002.tiff")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, expect.objectContaining({
      afterDoseKey: "9", afterDoseRowId: 502 })));
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

  it("opens the micrograph of a particles point with the particles picked on it", async () => {
    const picked = answer([point(5)]);
    picked.stages = [...picked.stages, {
      stage: "coordinates", setId: 40, protocolId: "4", protocolClassName: "ProtPick", label: "cryolo",
      status: "running", outputName: "outputCoordinates", setClassName: "SetOfCoordinates", items: 2,
      maxItemId: 2, streaming: true, perMinute: 1, trend: "steady", behind: 0, micrographs: 1,
    }];
    picked.picking = { setId: 40, reset: false, lastRowId: 2, complete: true, counts: { "5": 2 },
                       protocolId: "4", outputName: "outputCoordinates", boxSize: 180 };
    const fetchCoords2dMicrographImageObjectUrl = vi.fn().mockResolvedValue(
      { url: "blob:mic", revoke: vi.fn(), originalWidth: 4096, originalHeight: 4096 });
    const fetchCoords2dForMicrograph = vi.fn().mockResolvedValue(
      [{ id: 1, x: 100, y: 200, micId: 5 }, { id: 2, x: 300, y: 400, micId: 5 }]);
    // The table of the latest micrographs reads its thumbnails from the CTF output
    const fetchCTFMicrographImageObjectUrl = vi.fn().mockResolvedValue({ url: "blob:thumb", revoke: vi.fn() });
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(picked),
        fetchCoords2dMicrographImageObjectUrl, fetchCoords2dForMicrograph, fetchCTFMicrographImageObjectUrl,
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Particles" }));

    expect(await screen.findByRole("button", { name: "Particles (2)" })).toBeInTheDocument();
    expect(fetchCoords2dMicrographImageObjectUrl.mock.calls[0].slice(0, 4)).toEqual([7, "4", "outputCoordinates", 5]);
    expect(fetchCoords2dForMicrograph).toHaveBeenCalledWith(7, "4", "outputCoordinates", 5);
    expect(fetchCoords2dMicrographImageObjectUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("preview-overlay").querySelectorAll("circle")[0]).toHaveAttribute("r", "90");
  });

  it("updates the form immediately and automatically saves slider changes", async () => {
    const fetchStreamingMonitor = vi.fn().mockResolvedValue(answer([point(1)]));
    const saveStreamingMonitorThresholds = vi.fn().mockResolvedValue({ ...THRESHOLDS, maxAstigmatism: 800 });
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    const slider = await screen.findByRole("slider", { name: "Astigmatism above slider" });
    const plot = slider.closest('[data-testid="monitor-plot"]')!;
    fireEvent.change(slider, { target: { value: "800" } });
    expect(within(plot as HTMLElement).getByTestId("mock-plotly")).toHaveAttribute("data-limits", "[800]");
    expect(saveStreamingMonitorThresholds).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Apply thresholds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    expect(screen.getByLabelText("Astigmatism above")).toHaveValue(800);
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, { ...THRESHOLDS, maxAstigmatism: 800 }));
    expect(screen.getByRole("dialog", { name: "Monitor thresholds" })).toBeInTheDocument();
  });

  it("serializes autosaves and retains edits made while an earlier save is pending", async () => {
    let finishFirst!: () => void;
    let stored = 1000;
    const saveStreamingMonitorThresholds = vi.fn().mockImplementation(async (_projectId, changed) => {
      if (saveStreamingMonitorThresholds.mock.calls.length === 1) {
        await new Promise<void>((resolve) => { finishFirst = resolve; });
      }
      stored = changed.maxAstigmatism;
      return { ...THRESHOLDS, maxAstigmatism: stored };
    });
    const fetchStreamingMonitor = vi.fn().mockImplementation(async () => ({
      ...answer([point(1)]), thresholds: { ...THRESHOLDS, maxAstigmatism: stored },
    }));
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    const slider = await screen.findByRole("slider", { name: "Astigmatism above slider" });
    fireEvent.change(slider, { target: { value: "800" } });
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledTimes(1));
    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: "600" } });
    fireEvent.change(slider, { target: { value: "500" } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(saveStreamingMonitorThresholds).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst());
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledTimes(2));
    expect(saveStreamingMonitorThresholds).toHaveBeenLastCalledWith(7, { ...THRESHOLDS, maxAstigmatism: 500 });
    await waitFor(() => expect(slider).toHaveValue("500"));
  });

  it("lets a form save supersede a slider save that has not started", async () => {
    let finishSave!: (value: typeof THRESHOLDS) => void;
    const saveStreamingMonitorThresholds = vi.fn().mockImplementation(() =>
      new Promise<typeof THRESHOLDS>((resolve) => { finishSave = resolve; }));
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(1)])), saveStreamingMonitorThresholds,
      }),
    });
    const slider = await screen.findByRole("slider", { name: "Astigmatism above slider" });
    fireEvent.change(slider, { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Thresholds" }));
    fireEvent.change(screen.getByLabelText("Astigmatism above"), { target: { value: "700" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    await act(async () => finishSave({ ...THRESHOLDS, maxAstigmatism: 700 }));
    expect(saveStreamingMonitorThresholds).toHaveBeenCalledTimes(1);
    expect(saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, expect.objectContaining({ maxAstigmatism: 700 }));
  });

  it("preserves both defocus endpoints and all other thresholds with the server's replacement PUT", async () => {
    let stored: StreamingMonitorThresholds = { ...THRESHOLDS, maxDefocus: 57440, maxAstigmatism: 1770, minTilts: 45 };
    const fetchStreamingMonitor = vi.fn().mockImplementation(async () => ({ ...answer([point(1)]), thresholds: { ...stored } }));
    // The real PUT replaces the stored settings, filling omitted fields with defaults.
    const saveStreamingMonitorThresholds = vi.fn().mockImplementation(async (_projectId, sent) => {
      stored = { ...THRESHOLDS, ...sent };
      return { ...stored };
    });
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    const lower = (await screen.findAllByRole("slider", { name: "Defocus below slider" }))[0];
    const upper = screen.getAllByRole("slider", { name: "Defocus above slider" })[0];
    fireEvent.change(lower, { target: { value: "30000" } });
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(2));
    expect(lower).toHaveValue("30000");
    expect(upper).toHaveValue("57440");
    expect(stored).toEqual({ ...THRESHOLDS, minDefocus: 30000, maxDefocus: 57440, maxAstigmatism: 1770, minTilts: 45 });
    fireEvent.change(upper, { target: { value: "52000" } });
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(3));
    expect(lower).toHaveValue("30000");
    expect(upper).toHaveValue("52000");
    // Attempting to cross the lower endpoint must clamp the upper one, never reset the lower one.
    fireEvent.change(upper, { target: { value: "5200" } });
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(4));
    expect(lower).toHaveValue("30000");
    expect(upper).toHaveValue("30010");
    expect(stored.maxAstigmatism).toBe(1770);
    expect(stored.minTilts).toBe(45);
  });

  it("shares defocus sliders with the histogram and converts its threshold lines to micrometres", async () => {
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(1)])),
        saveStreamingMonitorThresholds: vi.fn(),
      }),
    });
    const sliders = await screen.findAllByRole("slider", { name: "Defocus above slider" });
    expect(sliders).toHaveLength(2);
    fireEvent.change(sliders[0], { target: { value: "30000" } });
    expect(sliders[1]).toHaveValue("30000");
    const histogram = sliders[1].closest('[data-testid="monitor-histogram"]')!;
    expect(within(histogram as HTMLElement).getByTestId("mock-plotly")).toHaveAttribute("data-x-limits", "[0.1,3]");
  });

  it("recalculates point colours while dragging and can preview a disabled limit", async () => {
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(1, { astigmatism: 900 })])),
        saveStreamingMonitorThresholds: vi.fn(),
      }),
    });
    const slider = await screen.findByRole("slider", { name: "Astigmatism above slider" });
    const trace = screen.getByRole("button", { name: "Astigmatism" });
    const original = trace.getAttribute("data-colours")!;
    fireEvent.change(slider, { target: { value: "800" } });
    expect(trace.getAttribute("data-colours")).not.toBe(original);
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable Astigmatism above" }));
    expect(trace).toHaveAttribute("data-colours", original);
    const resolution = within(screen.getAllByTestId("monitor-plot")[0]).getByRole("slider", { name: "CTF resolution worse than slider" });
    expect(resolution).toBeDisabled();
    fireEvent.click(within(screen.getAllByTestId("monitor-plot")[0]).getByRole("checkbox", { name: "Enable CTF resolution worse than" }));
    expect(resolution).toBeEnabled();
  });

  it("queues a full reload when thresholds are saved during a poll", async () => {
    let finishPoll!: (value: StreamingMonitor) => void;
    const fetchStreamingMonitor = vi.fn()
      .mockResolvedValueOnce(answer([point(1)]))
      .mockImplementationOnce(() => new Promise<StreamingMonitor>((resolve) => { finishPoll = resolve; }))
      .mockResolvedValue(answer([point(1)]));
    const saveStreamingMonitorThresholds = vi.fn().mockResolvedValue({ ...THRESHOLDS, maxAstigmatism: 800 });
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor, saveStreamingMonitorThresholds }),
    });
    const slider = await screen.findByRole("slider", { name: "Astigmatism above slider" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.change(slider, { target: { value: "800" } });
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, { ...THRESHOLDS, maxAstigmatism: 800 }));
    await act(async () => finishPoll(answer([point(2)])));
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenCalledTimes(3));
    expect(fetchStreamingMonitor.mock.calls[2][1]).toEqual(expect.objectContaining({ afterSetId: null, afterRowId: null }));
  });

  it("keeps slider edits available when saving fails", async () => {
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({
        fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(1)])),
        saveStreamingMonitorThresholds: vi.fn().mockRejectedValue(new Error("Save failed")),
      }),
    });
    const slider = await screen.findByRole("slider", { name: "Astigmatism above slider" });
    fireEvent.change(slider, { target: { value: "800" } });
    expect(await screen.findByText("Save failed")).toBeInTheDocument();
    expect(slider).toHaveValue("800");
    expect(slider).toBeEnabled();
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

    // The replacement PUT includes the tomography limits too.
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, {
      ...THRESHOLDS, minDefocus: 1000, maxDefocus: 40000, maxAstigmatism: null, maxResolution: 6, maxFrameShift: 10,
      maxTotalDrift: 45, minParticles: null, maxDoseDifference: 5,
    }));
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(
      7, { ctfSetId: null, coordinatesSetId: null, classesSetId: null, afterSetId: null, afterRowId: null, afterPickSetId: null, afterPickRowId: null, afterDoseKey: null, afterDoseRowId: null, qualityWindowSize: 100 }));
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

  it("tells how long each backlog takes to clear, or that it does not move", async () => {
    const busy = answer([point(1)]);
    busy.stages = [{ ...busy.stages[0], etaMinutes: 83.6 }, { ...busy.stages[1], stalled: true }];
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(busy) }),
    });

    expect(await screen.findByText("· about 1 h 24 min")).toBeInTheDocument();
    expect(screen.getByText("· stalled")).toBeInTheDocument();
  });

  it("is a quality overview when nothing streams: no rates or backlogs, micrographs in their order", async () => {
    const finished = answer([point(4), point(9)]);
    finished.streaming = false;
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(finished) }),
    });

    expect(await screen.findByRole("heading", { name: "Quality overview" })).toBeInTheDocument();
    expect(screen.queryByText(/\/ min/)).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Resolution" })[0]).toHaveAttribute("data-first-x", "1");
  });

  it("is a streaming monitor while something streams, with processing times", async () => {
    renderWithProviders(<StreamingMonitorView projectId={7} />, {
      service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(answer([point(4)])) }),
    });

    expect(await screen.findByRole("heading", { name: "Streaming monitor" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Resolution" })[0]).toHaveAttribute("data-first-x", "2026-10-21T12:00:00Z");
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
