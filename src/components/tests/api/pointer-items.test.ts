// RED 57: a generic, authenticated and paginated HTTP transport for persisted
// Scipion Set members. This is discovery metadata ONLY; no item pointer token
// is fabricated until the runtime resolver establishes its contract.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api/projects";
import { fetchWithAuth } from "@/api/auth";

vi.mock("@/api/auth", () => ({ fetchWithAuth: vi.fn() }));

const members = [
  {
    scipionItemId: 34,
    name: "Refined volume",
    enabled: true,
    itemClassName: "Volume",
  },
  {
    scipionItemId: 91,
    name: "Disabled volume",
    enabled: false,
    itemClassName: "Volume",
  },
];

const page = {
  items: members,
  nextCursor: "91",
};

function respond(value: unknown, status = 200) {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function getNewApi() {
  // Deliberately avoid a static named import: the RED should fail at the
  // assertion, not prevent Vitest from collecting the baseline test.
  return (api as unknown as Record<string, any>)
    .listPointerSelectableSetItemsPage as (
      projectId: number,
      protocolId: number,
      outputName: string,
      options?: { cursor?: string | null; limit?: number },
    ) => Promise<any>;
}

describe("generic pointer item API contract (RED 57)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the established volume endpoint unchanged (baseline)", async () => {
    const volumeItems = [{ id: 0, scipionItemId: 34, name: "Volume 34" }];
    respond(volumeItems);

    const result = await api.listOutputVolumes(7, 21, "outputVolumes");

    expect(result).toEqual(volumeItems);
    const [url] = vi.mocked(fetchWithAuth).mock.lastCall!;
    expect(String(url)).toContain(
      "/projects/7/protocols/21/outputs/outputVolumes/volumes",
    );
  });

  it("loads the first page with authenticated GET and URL-safe output name", async () => {
    respond(page);
    const result = await getNewApi()(7, 21, "volumes/refined", {
      cursor: null,
      limit: 50,
    });

    const [url, options] = vi.mocked(fetchWithAuth).mock.lastCall!;
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toContain(
      "/projects/7/protocols/21/outputs/volumes%2Frefined/pointer-items",
    );
    expect(parsed.searchParams.get("limit")).toBe("50");
    expect(parsed.searchParams.has("cursor")).toBe(false);
    expect(options).toMatchObject({ method: "GET", cache: "no-store" });
    expect(result).toEqual(page);
  });

  it("forwards the opaque pagination cursor, never an offset or array index", async () => {
    respond({ items: [members[1]], nextCursor: null });

    await getNewApi()(7, 21, "outputVolumes", {
      cursor: "34",
      limit: 25,
    });

    const [url] = vi.mocked(fetchWithAuth).mock.lastCall!;
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.searchParams.get("cursor")).toBe("34");
    expect(parsed.searchParams.get("limit")).toBe("25");
    expect(parsed.searchParams.has("offset")).toBe(false);
    expect(parsed.searchParams.has("page")).toBe(false);
  });

  it("preserves persistent item IDs, class, enabled state and no fake pointer", async () => {
    respond(page);

    const result = await getNewApi()(7, 21, "outputVolumes");

    expect(result.items).toEqual(members);
    expect(result.items[0].scipionItemId).toBe(34);
    expect(result.items[1].enabled).toBe(false);
    expect(result.items[0].itemClassName).toBe("Volume");
    expect(result.items[0]).not.toHaveProperty("value");
    expect(result.items[0]).not.toHaveProperty("selectionKind");
  });

  it("propagates authorization failures instead of returning an empty set", async () => {
    respond({ detail: "Forbidden" }, 403);

    await expect(getNewApi()(7, 21, "outputVolumes")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("exposes the same page contract through the production projects adapter", async () => {
    respond(page);
    const { default: service } = await import("@/adapters/projectsAdapter");
    const client = service as unknown as Record<string, any>;

    const result = await client.listPointerSelectableSetItemsPage(
      7,
      21,
      "outputVolumes",
      { cursor: "34", limit: 50 },
    );

    expect(result).toEqual(page);
    const [url] = vi.mocked(fetchWithAuth).mock.lastCall!;
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.searchParams.get("cursor")).toBe("34");
    expect(parsed.pathname).toContain("/pointer-items");
  });
});
