import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStreamingMonitor } from "@/api/projects";
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
});
