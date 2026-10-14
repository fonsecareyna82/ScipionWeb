// RED 70: ScipionAPI GREEN 69 makes executable Set-item references an
// explicit opt-in. Do not change metadata-only calls or synthesize values
// from item IDs in the browser. Preserve server-authored values verbatim.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAuth } from "@/api/auth";
import * as api from "@/api/projects";

vi.mock("@/api/auth", () => ({ fetchWithAuth: vi.fn() }));

const metadata = {
  scipionItemId: 34,
  name: "Volume 34",
  enabled: true,
  itemClassName: "Volume",
};
const native = {
  ...metadata,
  value: "2202.outputVolumes.34",
  selectionKind: "set-item",
  pointerClass: "Volume",
  selectable: true,
  parentId: "2202",
  protocolId: "2202",
  key: "outputVolumes",
};
const disabled = {
  scipionItemId: 90,
  name: "Volume 90",
  enabled: false,
  itemClassName: "Volume",
  selectable: false,
};
const firstPage = { items: [native, disabled], nextCursor: "90" };

function respond(json: unknown, status = 200): void {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(JSON.stringify(json), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// The new option does not exist until GREEN 71. Keep the RED collectable and
// make failures originate from the HTTP behavior, not TypeScript imports.
function listPage(
  projectId: number,
  protocolId: number,
  outputName: string,
  options?: { cursor?: string | null; limit?: number; includePointerValues?: boolean },
): Promise<any> {
  return (
    api.listPointerSelectableSetItemsPage as unknown as (
      p: number, protocol: number, name: string,
      opts?: { cursor?: string | null; limit?: number; includePointerValues?: boolean },
    ) => Promise<any>
  )(projectId, protocolId, outputName, options);
}

function lastRequest() {
  const [raw, init] = vi.mocked(fetchWithAuth).mock.lastCall!;
  return { url: new URL(String(raw), "http://localhost"), init };
}

describe("native pointer item HTTP opt-in (RED 70)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retains legacy metadata-only HTTP and never makes a fake pointer (baseline)", async () => {
    const page = { items: [metadata], nextCursor: null };
    respond(page);
    const result = await listPage(1, 2202, "outputVolumes", { limit: 50 });
    const { url } = lastRequest();

    expect(url.pathname).toContain("/projects/1/protocols/2202/outputs/outputVolumes/pointer-items");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.has("includePointerValues")).toBe(false);
    expect(result).toEqual(page);
    expect(result.items[0]).not.toHaveProperty("value");
  });

  it("requests native pointer references ONLY on explicit opt-in", async () => {
    respond(firstPage);
    const result = await listPage(1, 2202, "outputVolumes", {
      includePointerValues: true,
    });
    const { url, init } = lastRequest();

    expect(url.searchParams.get("includePointerValues")).toBe("true");
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(result).toEqual(firstPage);
    expect(result.items[0].value).toBe("2202.outputVolumes.34");
  });

  it("keeps opaque cursor and limit when requesting native values", async () => {
    const lastPage = { items: [native], nextCursor: null };
    respond(lastPage);
    const result = await listPage(1, 2202, "outputVolumes", {
      includePointerValues: true, cursor: "90", limit: 25,
    });
    const { url } = lastRequest();

    expect(url.searchParams.get("includePointerValues")).toBe("true");
    expect(url.searchParams.get("cursor")).toBe("90");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("offset")).toBe(false);
    expect(result).toEqual(lastPage);
  });

  it("allows the production projects adapter to forward the explicit opt-in", async () => {
    respond(firstPage);
    const { default: service } = await import("@/adapters/projectsAdapter");
    const client = service as unknown as Record<string, any>;
    const result = await client.listPointerSelectableSetItemsPage(
      1, 2202, "outputVolumes", { includePointerValues: true, cursor: "34", limit: 20 },
    );
    const { url } = lastRequest();

    expect(url.searchParams.get("includePointerValues")).toBe("true");
    expect(url.searchParams.get("cursor")).toBe("34");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(result).toEqual(firstPage);
  });

  it("does not synthesize a value when an opted-in backend returns metadata only", async () => {
    const page = { items: [metadata], nextCursor: "34" };
    respond(page);
    const result = await listPage(1, 2202, "outputVolumes", {
      includePointerValues: true,
    });
    const { url } = lastRequest();

    expect(url.searchParams.get("includePointerValues")).toBe("true");
    expect(result).toEqual(page);
    expect(result.items[0]).not.toHaveProperty("value");
    expect(result.items[0]).not.toHaveProperty("selectionKind");
  });

  it("passes disabled/unselectable members through without upgrading them", async () => {
    respond(firstPage);
    const result = await listPage(1, 2202, "outputVolumes", {
      includePointerValues: true, cursor: null, limit: 50,
    });
    const { url } = lastRequest();

    expect(url.searchParams.get("includePointerValues")).toBe("true");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(result).toEqual(firstPage);
    expect(result.items[1].enabled).toBe(false);
    expect(result.items[1].selectable).toBe(false);
    expect(result.items[1]).not.toHaveProperty("value");
  });
});
