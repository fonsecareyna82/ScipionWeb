import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StreamingMonitorView from "@/components/monitor/StreamingMonitorView";
import { POLL_STORAGE_KEY } from "@/components/monitor/streaming-monitor-data";
import type { StreamingMonitor, StreamingMonitorPoint } from "@/services/ProjectService";
import { createProjectServiceMock, renderWithProviders } from "@/components/tests/test-utils";

vi.mock("react-plotly.js", () => ({
  default: ({ data, onClick }: { data: Array<{ name: string; customdata?: unknown[][]; x: unknown[] }>; onClick?: (event: unknown) => void }) => (
    <div data-testid="mock-plotly">
      {data.map((serie) => (
        <button
          key={serie.name}
          type="button"
          data-points={(serie.customdata ?? serie.x).length}
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
  minParticles: null, minTilts: 30, minAngleSpan: 50, maxFailedCtfTilts: null, maxResidual: null,
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
    coordinatesOutputs: [],
    thresholds: THRESHOLDS,
    series: { setId: 30, kind: "ctf", reset: false, lastRowId: points.length ? points[points.length - 1].id : null,
              more: false, points, ...extra },
    classes: null,
    tomography: false,
    picking: { setId: null, reset: false, lastRowId: null, complete: true, counts: {} },
  };
}

afterEach(() => {
  vi.useRealTimers();
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
    expect(screen.getByText("Astigmatism above 1000 Å")).toBeInTheDocument();
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
    // Every part says what it shows
    expect(screen.getByRole("img", { name: /Each card is a step of the processing chain/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Each line is a run of consecutive micrographs/ })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Each point is a micrograph/ })).toHaveLength(4);
    expect(fetchStreamingMonitor).toHaveBeenCalledWith(7, { ctfSetId: null, coordinatesSetId: null, afterSetId: null, afterRowId: null, afterPickSetId: null, afterPickRowId: null });
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

    fireEvent.click(screen.getAllByTestId("latest-micrograph")[0]);
    await waitFor(() => expect(fetchCTFMicrographImageObjectUrl).toHaveBeenCalledTimes(4));
    expect(fetchCTFMicrographImageObjectUrl.mock.calls[3].slice(0, 4)).toEqual([7, "3", "outputCTF", 3]);
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
    expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(7, { ctfSetId: null, coordinatesSetId: null, afterSetId: 30, afterRowId: 2, afterPickSetId: null, afterPickRowId: null });
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
    expect(fetchStreamingMonitor).toHaveBeenNthCalledWith(2, 7, { ctfSetId: null, coordinatesSetId: null, afterSetId: 30, afterRowId: 1, afterPickSetId: null, afterPickRowId: null });
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

    // The single particle view saves its own thresholds only
    await waitFor(() => expect(saveStreamingMonitorThresholds).toHaveBeenCalledWith(7, {
      minDefocus: 1000, maxDefocus: 40000, maxAstigmatism: null, maxResolution: 6, maxFrameShift: 10,
      maxTotalDrift: 45, minParticles: null,
    }));
    await waitFor(() => expect(fetchStreamingMonitor).toHaveBeenLastCalledWith(
      7, { ctfSetId: null, coordinatesSetId: null, afterSetId: null, afterRowId: null, afterPickSetId: null, afterPickRowId: null }));
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
