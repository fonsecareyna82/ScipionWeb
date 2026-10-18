import { describe, expect, it, vi } from "vitest";
import { loadSignedNodeThumbnails, type SignedThumbnailList } from "@/utils/signed-thumbnails";

function list(signature: string) {
  return {
    projectId: 3,
    size: 640,
    scope: "graph" as const,
    groups: [
      {
        protocolId: "10",
        outputs: [
          { outputName: "outputMicrographs", signature, state: "ready" as const, url: `/m?sig=${signature}` },
          { outputName: "outputBroken", signature: "x", state: "unavailable" as const, url: "/broken" },
        ],
      },
    ],
  };
}

describe("signed node thumbnails", () => {
  it("lists once, downloads each image once and renews it when the output changes", async () => {
    let signature = "a";
    let clock = 0;
    const svc = {
      fetchProjectThumbnails: vi.fn(async () => list(signature)),
      fetchThumbnailImageObjectUrl: vi.fn(async (url: string) => `blob:${url}`),
    };
    const listRef = { current: null as SignedThumbnailList | null };
    const cache = new Map();
    const nodeOutputs = [
      { protocolId: "10", outputName: "outputMicrographs" },
      { protocolId: "10", outputName: "outputBroken" },
      { protocolId: "99", outputName: "outputUnknown" },
    ];
    const load = () => loadSignedNodeThumbnails({ svc, projectId: 3, nodeOutputs, size: 640, listRef, cache, now: () => clock });

    const first = await load();
    expect(first.map((item) => item.thumbnailDataUrl)).toEqual(["blob:/m?sig=a"]);
    expect(svc.fetchProjectThumbnails).toHaveBeenCalledWith(3, { scope: "graph", size: 640 });

    clock = 1000;
    await load();
    expect(svc.fetchProjectThumbnails).toHaveBeenCalledTimes(1);
    expect(svc.fetchThumbnailImageObjectUrl).toHaveBeenCalledTimes(1);

    // Later, the output grew: a new signature, a new image.
    signature = "b";
    clock = 10_000;
    const renewed = await load();
    expect(svc.fetchProjectThumbnails).toHaveBeenCalledTimes(2);
    expect(renewed.map((item) => item.thumbnailDataUrl)).toEqual(["blob:/m?sig=b"]);
  });

  it("skips images that cannot be downloaded", async () => {
    const svc = {
      fetchProjectThumbnails: vi.fn(async () => list("a")),
      fetchThumbnailImageObjectUrl: vi.fn(async () => null),
    };
    const items = await loadSignedNodeThumbnails({
      svc, projectId: 3, nodeOutputs: [{ protocolId: "10", outputName: "outputMicrographs" }], size: 640,
      listRef: { current: null }, cache: new Map(),
    });
    expect(items).toEqual([]);
  });
});
