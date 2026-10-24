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

  it("keeps the 3D picking of a tomography stream and the particles of each tomogram", async () => {
    const picking = { stage: "coordinates3d", setId: 60, protocolId: "6", outputName: "coordinates", items: 120,
                      tomogramsPicked: 1, boxSize: 40, behind: 0 };
    respond({ stages: [picking], tiltSeries: [{ id: 1, tsId: "TS_01", particles: 120, alerts: [] }] });

    const monitor = await fetchTomoMonitor(7);

    expect(monitor.stages[0]).toEqual(picking);
    expect(monitor.tiltSeries[0].particles).toBe(120);
  });
});
