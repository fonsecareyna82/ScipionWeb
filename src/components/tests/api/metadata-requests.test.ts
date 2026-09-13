import { beforeEach, expect, it, vi } from "vitest";
import { fetchMetadataTableWindow, getMetadataImageCellUrl } from "@/api/projects";
import { fetchWithAuth } from "@/api/auth";

vi.mock("@/api/auth", () => ({ fetchWithAuth: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("addresses a thumbnail by logical ID and preserves ordering for legacy sources", () => {
  const url = new URL(getMetadataImageCellUrl(1, 2, "particles/a", "Class 001", 0, "preview", { rowId: 901, sortBy: "score", asc: false }), "http://localhost");
  expect(url.pathname).toContain("particles%2Fa/metadata/tables/Class%20001/image");
  expect(url.searchParams.get("rowId")).toBe("901");
  expect(url.searchParams.get("rowIndex")).toBe("0");
  expect(url.searchParams.get("sortBy")).toBe("score");
  expect(url.searchParams.get("asc")).toBe("false");
});

it("passes row cancellation to authenticated fetch without serializing the signal", async () => {
  const controller = new AbortController();
  vi.mocked(fetchWithAuth).mockResolvedValue(new Response(JSON.stringify({ rows: [], offset: 10 })));
  await fetchMetadataTableWindow(1, 2, "particles", "objects", { offset: 10, limit: 60, signal: controller.signal });
  const [url, options] = vi.mocked(fetchWithAuth).mock.lastCall!;
  expect(options?.signal).toBe(controller.signal);
  expect(String(url)).not.toContain("signal");
});

it("keeps a non-aligned window offset through the production service adapter", async () => {
  const { default: service } = await import("@/adapters/projectsAdapter");
  const controller = new AbortController();
  vi.mocked(fetchWithAuth).mockResolvedValue(new Response(JSON.stringify({ offset: 37, limit: 60, totalRows: 2000, rows: [{ rowId: 901, values: [901] }] })));
  const result = await service.fetchMetadataTableWindow(1, 2, "particles", "objects", { offset: 37, limit: 60, signal: controller.signal, sortBy: "score", asc: false });
  const [url, options] = vi.mocked(fetchWithAuth).mock.lastCall!;
  const parsed = new URL(String(url), "http://localhost");
  expect(parsed.pathname).toMatch(/\/rows$/);
  expect(parsed.searchParams.get("offset")).toBe("37");
  expect(parsed.searchParams.has("page")).toBe(false);
  expect(options?.signal).toBe(controller.signal);
  expect(result).toMatchObject({ offset: 37, limit: 60, totalRows: 2000 });
});
