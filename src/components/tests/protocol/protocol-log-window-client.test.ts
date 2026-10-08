import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithAuth } = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
}));
vi.mock("@/api/auth", () => ({ fetchWithAuth }));

import { fetchProtocolLogWindow } from "@/api/projects";

describe("Protocol log window API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the newest window when no end offset is provided", async () => {
    fetchWithAuth.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        channel: "stdout",
        content: "latest",
        startOffset: 100,
        endOffset: 106,
        sizeBytes: 106,
      }),
    });

    const result = await fetchProtocolLogWindow(1, 7, "stdout");
    const [url, options] = fetchWithAuth.mock.calls[0];
    expect(url).toContain("/projects/1/protocols/7/logs/window");
    expect(new URL(url, "http://localhost").searchParams.get("channel")).toBe("stdout");
    expect(new URL(url, "http://localhost").searchParams.has("endOffset")).toBe(false);
    expect(options.method).toBe("GET");
    expect(result.content).toBe("latest");
    expect(result.startOffset).toBe(100);
  });

  it("requests an older window by absolute byte offset", async () => {
    fetchWithAuth.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        channel: "stderr",
        content: "older",
        startOffset: 0,
        endOffset: 50,
        sizeBytes: 9000,
      }),
    });

    const result = await fetchProtocolLogWindow(1, 7, "stderr", {
      endOffset: 50,
      maxBytes: 4096,
    });
    const url = new URL(fetchWithAuth.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("channel")).toBe("stderr");
    expect(url.searchParams.get("endOffset")).toBe("50");
    expect(url.searchParams.get("maxBytes")).toBe("4096");
    expect(result.endOffset).toBe(50);
  });
});
