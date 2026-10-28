import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProtocolRunActions, runProtocolRunAction } from "@/api/projects";
import { fetchWithAuth } from "@/api/auth";

vi.mock("@/api/auth", () => ({ fetchWithAuth: vi.fn() }));

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("the actions of a running protocol", () => {
  beforeEach(() => vi.mocked(fetchWithAuth).mockReset());

  it("reads the labels it offers, and nothing else", async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(json({ actions: ["STOP STREAMING", 3, null] }));

    expect(await fetchProtocolRunActions(7, 2)).toEqual(["STOP STREAMING"]);
    expect(vi.mocked(fetchWithAuth).mock.calls[0][0]).toMatch(/\/projects\/7\/protocols\/2\/run-actions$/);
  });

  it("runs one by its label, and tells when the protocol no longer runs", async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(json({ ran: "STOP STREAMING" }));
    await runProtocolRunAction(7, 2, "STOP STREAMING");
    const [, init] = vi.mocked(fetchWithAuth).mock.calls[0];
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ action: "STOP STREAMING" }) });

    vi.mocked(fetchWithAuth).mockResolvedValue(json({ detail: { code: "not_running" } }, 409));
    await expect(runProtocolRunAction(7, 2, "STOP STREAMING")).rejects.toBeTruthy();
  });
});
