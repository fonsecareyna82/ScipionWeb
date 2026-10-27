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
        <button key={serie.name} type="button" data-points={serie.x.length} data-first-x={String(serie.x[0])}
                onClick={() => onClick?.({ points: [{ customdata: serie.customdata?.[0] }], event: { button: 0 } })}>
          {serie.name}
        </button>
      ))}
    </div>
  ),
}));

// The tomography viewer reads its outputs from the server: it says what it was opened on
vi.mock("@/components/analyze/integrated-tomography-viewer", () => ({
  default: ({ protocolId, outputName, pointerClass, initialTsId }: { protocolId: string; outputName: string;
    pointerClass: string; initialTsId: string }) => (
    <div data-testid="tomography-viewer">{`${protocolId}:${outputName}:${pointerClass}:${initialTsId}`}</div>
  ),
}));

const THRESHOLDS = {
  minDefocus: 1000, maxDefocus: 40000, maxAstigmatism: 1000, maxResolution: null, maxFrameShift: 10, maxTotalDrift: 45,
  minParticles: null, minTilts: 30, minAngleSpan: 50, maxFailedCtfTilts: null, maxResidual: null, maxDoseDifference: 5,
};

function spa(stages: StreamingMonitor["stages"] = []): StreamingMonitor {
  return {
    now: "", streaming: false, stages, ctfOutputs: [], coordinatesOutputs: [], classesOutputs: [], thresholds: THRESHOLDS,
    series: { setId: null, kind: null, reset: false, lastRowId: null, more: false, points: [] },
    classes: null, tomography: true,
    picking: { setId: null, reset: false, lastRowId: null, complete: true, counts: {} },
    dose: { key: null, label: null, reset: false, lastRowId: null, more: false, points: [] },
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
  window.localStorage.clear();
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
    fireEvent.click(await screen.findByRole("button", { name: "Alerts, 1 new" }));
    const panel = screen.getByRole("complementary", { name: "Alerts" });
    expect(within(panel).getByText("Fewer tilts than 30 tilts")).toBeInTheDocument();
    expect(within(panel).getByText(/2 tilt series in a row/)).toBeInTheDocument();

    // The alert opens its tilt series in the tomography view
    fireEvent.click(within(panel).getByRole("button", { name: "TS_01" }));
    expect(await screen.findByRole("region", { name: "Tilt series TS_01" })).toBeInTheDocument();
  });

  it("counts again only the alerts not seen yet, also after reopening the monitor", async () => {
    render(tomo([row(1, "TS_01", { enabledTilts: 20, alerts: ["minTilts"] })]));
    fireEvent.click(await screen.findByRole("button", { name: "Alerts, 1 new" }));
    fireEvent.click(screen.getByRole("button", { name: "Close the alerts" }));

    expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("scipionweb.monitor.seenAlerts.7") ?? "[]")).toEqual(["tilt series:minTilts:1"]);
  });

  it("opens the pipeline with the movies of the tilts, and tells what waits for motion correction", async () => {
    const answer = tomo([row(1, "TS_01")]);
    answer.stages = [{
      stage: "tiltseriesmovies", setId: 5, protocolId: "0", protocolClassName: "ProtImportTsMovies", label: "import",
      status: "running", outputName: "outputTiltSeriesM", setClassName: "SetOfTiltSeriesM", items: 4, maxItemId: 4,
      streaming: true, perMinute: 0.3, trend: "steady", behind: null,
    }, { ...answer.stages[0], behind: 3 }, ...answer.stages.slice(1)];
    render(answer);

    const cards = await screen.findAllByTestId("monitor-stage");
    expect(cards[0]).toHaveTextContent("Tilt series movies");
    expect(cards[1]).toHaveTextContent("3 waiting");
    expect(cards[0].getAttribute("data-phase-hue")).toBe(cards[1].getAttribute("data-phase-hue"));
  });

  it("says why a session plot has nothing to draw", async () => {
    // Tomograms, but no CTF estimation and no residual: an alignment without fiducials
    render(tomo([row(1, "TS_01", { defocusU: undefined })]));

    await screen.findByTestId("tomo-monitor");
    const empty = screen.getAllByTestId("empty-plot").map((plot) => plot.textContent);
    expect(empty).toEqual([
      "Mean defocusNo CTF estimation of these tilt series in the stream yet.",
      "Alignment residualNo residual: only a fiducial alignment (IMOD) writes one; other aligners, such as AreTomo, do not.",
    ]);
  });

  it("draws the thresholds of each session plot as lines", async () => {
    render(tomo([row(1, "TS_01", { residual: 1.5 })]));

    await screen.findByTestId("tomo-monitor");
    const lines = screen.getAllByTestId("tomo-session-plot").map((plot) => plot.getAttribute("data-threshold-lines"));
    // Defocus between 1000 and 40000 A, at least 30 tilts; the residual has no threshold set
    expect(lines).toEqual(["1000,40000", "30", ""]);
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

  it("hides tomography sections while preserving its output selector and polling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const data = tomo([row(1, "TS_01")]);
    data.tiltSeriesOutputs.push({ setId: 11, protocolId: "2", label: "other", outputName: "tiltSeries" });
    const service = render(data);
    await screen.findByTestId("tomo-monitor");
    fireEvent.click(screen.getByRole("button", { name: "Customize view" }));
    const picker = screen.getByRole("dialog", { name: "Customize monitor view" });
    expect(within(picker).queryByRole("checkbox", { name: "2D classes" })).not.toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("checkbox", { name: "Mean defocus" }));
    fireEvent.click(within(picker).getByRole("checkbox", { name: "Pipeline" }));
    fireEvent.click(within(picker).getByRole("checkbox", { name: "Tilt series table" }));
    expect(screen.getAllByTestId("tomo-session-plot")).toHaveLength(2);
    expect(screen.queryByTestId("tilt-series-row")).not.toBeInTheDocument();
    expect(document.querySelector('section[aria-label="Tomography pipeline"]')).toBeNull();
    fireEvent.keyDown(picker, { key: "Escape" });
    expect(screen.getByRole("combobox", { name: "Tilt series to follow" })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(15100); });
    await waitFor(() => expect(service.fetchTomoMonitor).toHaveBeenCalledTimes(2));
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

  it("automatically saves a tomography plot threshold", async () => {
    const service = render(tomo([row(1, "TS_01")]), spa(),
      { saveStreamingMonitorThresholds: vi.fn().mockResolvedValue({ ...THRESHOLDS, minTilts: 40 }) });
    const slider = await screen.findByRole("slider", { name: "Fewer tilts than slider" });
    expect(slider).toHaveValue("30");
    fireEvent.change(slider, { target: { value: "40" } });
    expect(slider).toHaveValue("40");
    expect(service.saveStreamingMonitorThresholds).not.toHaveBeenCalled();
    await waitFor(() => expect(service.saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, { ...THRESHOLDS, minTilts: 40 }));
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
    expect(service.saveStreamingMonitorThresholds.mock.calls[0][1]).toHaveProperty("maxTotalDrift", THRESHOLDS.maxTotalDrift);
    await waitFor(() => expect(service.fetchTomoMonitor).toHaveBeenCalledTimes(2));
  });

  it("is a quality overview of the tilt series when nothing streams", async () => {
    const finished = tomo([row(5, "TS_05"), row(2, "TS_02")]);
    finished.streaming = false;
    render(finished);

    expect(await screen.findByRole("heading", { name: "Quality overview" })).toBeInTheDocument();
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
    // The tilt series in their order: the oldest (TS_02) is the first
    expect(screen.getByRole("button", { name: "Mean defocus" })).toHaveAttribute("data-first-x", "1");
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

  it("shows the particles picked on each tomogram, and opens a tomogram with them", async () => {
    const answer = tomo([row(1, "TS_01", { tomogramId: 7, particles: 120 }), row(2, "TS_02")]);
    answer.stages = [...answer.stages, {
      stage: "coordinates3d", setId: 60, protocolId: "6", protocolClassName: "ProtPick3D", label: "picking",
      status: "running", outputName: "coordinates", setClassName: "SetOfCoordinates3D", items: 120, maxItemId: 120,
      streaming: true, perMinute: 4, trend: "steady", behind: 0, tomogramsPicked: 1, boxSize: 40,
      pickedFrom: { protocolId: "20", label: "cryocare", outputName: "Tomograms", items: 1 },
    }];
    render(answer);

    expect(await screen.findByText("from 1 tomograms")).toBeInTheDocument();
    expect(screen.getByTitle("Picks the 1 tomograms of cryocare (Tomograms)")).toHaveTextContent("from cryocare");
    expect(screen.getAllByTestId("tomo-session-plot")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Particles per tomogram" })).toHaveAttribute("data-points", "1");

    fireEvent.click(screen.getByRole("button", { name: "Open the particles of TS_01" }));
    expect(await screen.findByTestId("tomography-viewer")).toHaveTextContent("6:coordinates:SetOfCoordinates3D:TS_01");
    // Opening the particles does not open the tilts of the row
    expect(screen.queryByRole("region", { name: "Tilt series TS_01" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close the tomography viewer" }));
    await waitFor(() => expect(screen.queryByTestId("tomography-viewer")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Particles per tomogram" }));
    expect(await screen.findByTestId("tomography-viewer")).toHaveTextContent("6:coordinates:SetOfCoordinates3D:TS_01");
  });

  it("opens a tomogram in the tomography viewer, from the table and from the tilt series", async () => {
    render(tomo([row(1, "TS_01", { tomogramId: 7 })]));

    fireEvent.click(await screen.findByRole("button", { name: "Open the tomogram of TS_01" }));
    expect(await screen.findByTestId("tomography-viewer")).toHaveTextContent("5:Tomograms:SetOfTomograms:TS_01");
    expect(screen.queryByRole("region", { name: "Tilt series TS_01" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close the tomography viewer" }));
    fireEvent.click(screen.getAllByTestId("tilt-series-row")[0]);
    const detail = await screen.findByRole("region", { name: "Tilt series TS_01" });
    fireEvent.click(within(detail).getByRole("button", { name: "Open the tomogram of TS_01" }));
    expect(await screen.findByTestId("tomography-viewer")).toHaveTextContent("5:Tomograms:SetOfTomograms:TS_01");
  });

  it("has no particles plot or column without a 3D picking", async () => {
    render(tomo([row(1, "TS_01", { tomogramId: 7 })]));

    await screen.findByTestId("tomo-monitor");
    expect(screen.getAllByTestId("tomo-session-plot")).toHaveLength(3);
    expect(screen.queryByRole("columnheader", { name: "Particles" })).not.toBeInTheDocument();
  });
});
