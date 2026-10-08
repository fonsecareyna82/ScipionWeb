import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithAuth } = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }));
vi.mock("@/api/auth", () => ({ fetchWithAuth }));
import { fetchProtocolLogSearch } from "@/api/projects";

const response = (data: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});

describe("protocol log search HTTP client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("searches the full server-side log with encoded query and default cursor", async () => {
    const payload = { matches: [{ offset: 17, text: "ERROR" }], nextOffset: 24, sizeBytes: 5000, done: false };
    fetchWithAuth.mockResolvedValue(response(payload));
    const result = await fetchProtocolLogSearch(1, 7, "stdout", "ERROR disk");
    const [rawUrl, options] = fetchWithAuth.mock.calls[0];
    const url = new URL(rawUrl, "http://localhost");
    expect(url.pathname).toMatch(/\/projects\/1\/protocols\/7\/logs\/search$/);
    expect(url.searchParams.get("channel")).toBe("stdout");
    expect(url.searchParams.get("query")).toBe("ERROR disk");
    expect(url.searchParams.has("startOffset")).toBe(false);
    expect(options.method).toBe("GET");
    expect(result).toEqual(payload);
  });

  it("supports paginating the search and cancelling it", async () => {
    fetchWithAuth.mockResolvedValue(response({ matches: [], nextOffset: 42, sizeBytes: 42, done: true }));
    const signal = new AbortController().signal;
    await fetchProtocolLogSearch(1, 7, "stderr", "traceback", {
      startOffset: 12, maxMatches: 10, maxScanBytes: 2048, signal,
    });
    const [rawUrl, options] = fetchWithAuth.mock.calls[0];
    const url = new URL(rawUrl, "http://localhost");
    expect(url.searchParams.get("startOffset")).toBe("12");
    expect(url.searchParams.get("maxMatches")).toBe("10");
    expect(url.searchParams.get("maxScanBytes")).toBe("2048");
    expect(options.signal).toBe(signal);
  });
});
