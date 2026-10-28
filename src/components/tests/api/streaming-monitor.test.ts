import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStreamingMonitor, fetchTomoMonitor } from "@/api/projects";
import { fetchWithAuth } from "@/api/auth";

vi.mock("@/api/auth", () => ({ fetchWithAuth: vi.fn() }));

function respond(value: unknown) {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

describe("fetchStreamingMonitor", () => {
  beforeEach(() => vi.mocked(fetchWithAuth).mockReset());

  it("keeps where the followed picking has its coordinates, to draw them", async () => {
    respond({ picking: { setId: 40, reset: false, lastRowId: 5, complete: true, counts: { "1": 3 },
                         protocolId: 4, outputName: "outputCoordinates", boxSize: 180 } });

    const { picking } = await fetchStreamingMonitor(7);

    expect(picking).toEqual({ setId: 40, reset: false, lastRowId: 5, complete: true, counts: { "1": 3 },
                              protocolId: "4", outputName: "outputCoordinates", boxSize: 180 });
  });

  it("has no picking location without a picking", async () => {
    respond({ picking: { setId: null, reset: false, lastRowId: null, complete: true, counts: {} } });

    const { picking } = await fetchStreamingMonitor(7);

    expect([picking.protocolId, picking.outputName, picking.boxSize]).toEqual([null, null, null]);
  });

  it("requests a bounded exposure window and preserves explicit missing processing", async () => {
    const exposures = { setId: 10, ctfSetId: 30, windowSize: 50, points: [
      { id: 7, importRowId: 200, movieName: "movie7", time: "t", aligned: false, ctfReady: false, point: null },
    ] };
    respond({ exposures });
    const monitor = await fetchStreamingMonitor(7, { qualityWindowSize: 50 });
    expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringContaining("qualityWindowSize=50"), expect.anything());
    expect(monitor.exposures).toEqual(exposures);
  });

  it("rejects exposure windows with mismatched identities or duplicate imports", async () => {
    const movie = { id: 7, importRowId: 200, aligned: true, ctfReady: true, point: { id: 8 } };
    respond({ exposures: { setId: 10, ctfSetId: 30, windowSize: 50, points: [movie] } });
    expect((await fetchStreamingMonitor(7)).exposures).toBeNull();
    const pending = { ...movie, aligned: false, ctfReady: false, point: null };
    respond({ exposures: { setId: 10, ctfSetId: 30, windowSize: 50, points: [pending, pending] } });
    expect((await fetchStreamingMonitor(7)).exposures).toBeNull();
    respond({});
    expect((await fetchStreamingMonitor(7)).exposures).toBeNull();
  });

  it("keeps the 3D picking of a tomography stream and the particles of each tomogram", async () => {
    const picking = { stage: "coordinates3d", setId: 60, protocolId: "6", outputName: "coordinates", items: 120,
                      tomogramsPicked: 1, boxSize: 40, behind: 0 };
    respond({ stages: [picking], tiltSeries: [{ id: 1, tsId: "TS_01", particles: 120, alerts: [] }] });

    const monitor = await fetchTomoMonitor(7);

    expect(monitor.stages[0]).toEqual(picking);
    expect(monitor.tiltSeries[0].particles).toBe(120);
  });

  it("keeps whether the stream flows, and drops a flow it does not know", async () => {
    respond({ flow: { acquisition: "paused", unit: "movies", items: 120, protocolId: 2, label: "import",
                      lastItemAt: "t", idleMinutes: 12, importClosesInMinutes: 18,
                      stalled: [{ stage: "ctf", protocolId: 3, label: "ctffind", behind: 40, minutes: 20,
                                  protocolStatus: "running" }], complete: false } });

    const { flow } = await fetchStreamingMonitor(7);

    expect(flow).toMatchObject({ acquisition: "paused", protocolId: "2", importClosesInMinutes: 18,
                                 stalled: [{ stage: "ctf", protocolId: "3", behind: 40, minutes: 20 }] });
    respond({ flow: { acquisition: "sleeping" } });
    expect((await fetchStreamingMonitor(7)).flow).toBeNull();
    respond({});
    expect((await fetchStreamingMonitor(7)).flow).toBeNull();
  });

  it("keeps whether the tomography stream flows, its acquisition told in tilts", async () => {
    respond({ stages: [], tiltSeries: [], flow: { acquisition: "finished", unit: "tilt series", activityUnit: "tilts",
                                                  items: 12, protocolId: 1, stalled: [], complete: true } });

    const { flow } = await fetchTomoMonitor(7);

    expect(flow).toMatchObject({ acquisition: "finished", unit: "tilt series", activityUnit: "tilts", complete: true });
  });

  it("keeps the dose of the movies a dose analysis measured", async () => {
    const movie = { id: 2, time: "t", movieName: "movie_002.tiff", meanDose: 1.4, doseDifference: 16, discarded: true,
                    alerts: ["maxDoseDifference"] };
    respond({ dose: { key: 9, label: "dose analysis", reset: false, lastRowId: 502, more: true, points: [movie] } });

    const { dose } = await fetchStreamingMonitor(7);

    expect(dose).toEqual({ key: "9", label: "dose analysis", reset: false, lastRowId: 502, more: true, points: [movie] });
  });
});
