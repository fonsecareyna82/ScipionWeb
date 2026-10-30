import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithAuth } from "@/api/auth";
import { uploadProjectFile } from "@/api/projects";

vi.mock("@/api/auth", () => ({
  fetchWithAuth: vi.fn(),
}));

const MB = 1024 * 1024;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake server keeping what arrived; failAt makes the chunk at that offset drop the connection once. */
function fakeServer(failAt: number | null = null) {
  let received = 0;
  const calls: string[] = [];
  vi.mocked(fetchWithAuth).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    calls.push(`${method} ${url.replace(/^.*\/projects\/7\/uploads/, "")}`);
    if (init?.signal?.aborted) throw new DOMException("The upload was cancelled", "AbortError");
    if (method === "POST" && url.endsWith("/uploads")) return json({ uploadId: "a".repeat(32), received: 0 });
    if (method === "PUT") {
      const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
      const size = (init!.body as Blob).size;
      if (offset !== received) return json({ detail: { message: "wrong offset", received } }, 409);
      received += size;
      if (failAt === offset) {
        failAt = null;
        throw new TypeError("Failed to fetch"); // it arrived, but the answer was lost
      }
      return json({ received });
    }
    if (method === "GET") return json({ received });
    if (method === "POST" && url.endsWith("/complete")) {
      return json({ name: "mask.mrc", path: "Uploads/mask.mrc", absPath: "/p/Proj/Uploads/mask.mrc", size: received });
    }
    if (method === "DELETE") return json({ cancelled: true });
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { calls, received: () => received };
}

describe("uploading a file into a project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("sends it in 8 MB chunks and reports progress", async () => {
    const server = fakeServer();
    const file = new File([new Uint8Array(20 * MB)], "mask.mrc");
    const progress: number[] = [];

    const done = await uploadProjectFile(7, file, { onProgress: (sent) => progress.push(sent) });

    expect(done.absPath).toBe("/p/Proj/Uploads/mask.mrc");
    expect(server.received()).toBe(20 * MB);
    expect(server.calls.filter((call) => call.startsWith("PUT"))).toEqual([
      `PUT /${"a".repeat(32)}?offset=0`, `PUT /${"a".repeat(32)}?offset=${8 * MB}`, `PUT /${"a".repeat(32)}?offset=${16 * MB}`,
    ]);
    expect(progress).toEqual([0, 8 * MB, 16 * MB, 20 * MB]);
  });

  it("goes on from what the server has after a dropped connection", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = fakeServer(8 * MB);
    const file = new File([new Uint8Array(20 * MB)], "mask.mrc");

    const upload = uploadProjectFile(7, file);
    await vi.advanceTimersByTimeAsync(5000);
    await upload;

    // The chunk that arrived is not sent twice: the server is asked where to go on
    expect(server.received()).toBe(20 * MB);
    expect(server.calls).toContain(`GET /${"a".repeat(32)}`);
    expect(server.calls.filter((call) => call.endsWith(`offset=${8 * MB}`))).toHaveLength(1);
  });

  it("drops what was sent when it is cancelled", async () => {
    const server = fakeServer();
    const controller = new AbortController();
    const file = new File([new Uint8Array(20 * MB)], "mask.mrc");
    const upload = uploadProjectFile(7, file, {
      signal: controller.signal,
      onProgress: (sent) => { if (sent >= 8 * MB) controller.abort(); },
    });

    await expect(upload).rejects.toThrow();
    await vi.waitFor(() => expect(server.calls.some((call) => call.startsWith("DELETE"))).toBe(true));
    expect(server.calls.some((call) => call.endsWith("/complete"))).toBe(false);
  });

  it("stops with the server's reason when it refuses the file", async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(json({ detail: "mask.mrc is 12.0 GB; files up to 10.0 GB can be uploaded" }, 413));
    const file = new File([new Uint8Array(10)], "mask.mrc");

    await expect(uploadProjectFile(7, file)).rejects.toThrow("files up to 10.0 GB");
  });
});
