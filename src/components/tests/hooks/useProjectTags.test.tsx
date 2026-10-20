import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";

import { useProjectTags } from "@/hooks/useProjectTags";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const tagList = [
  { id: "a", title: "Alpha", color: "#ff0000" },
  { id: "b", title: "Beta", color: "#00ff00" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A server that saves what it gets and answers with it.
function createService(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    listProjectTags: vi.fn().mockResolvedValue(tagList),
    createProjectTag: vi.fn(async (_pid: unknown, payload: any) => ({ id: "new", ...payload })),
    setProtocolTagIds: vi.fn(async (_pid: unknown, protocolId: unknown, tagIds: string[]) => ({
      protocolId: String(protocolId),
      tagIds,
      ignoredTagIds: [],
    })),
    ...overrides,
  };
}

async function setup(service: ReturnType<typeof createService>, onAssignmentsChange = vi.fn()) {
  const hook = renderHook(() => useProjectTags({ service, projectId: 7, onAssignmentsChange }));
  await waitFor(() => expect(hook.result.current.tagsLoaded).toBe(true));
  return hook;
}

describe("useProjectTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removing the last tag and adding another does not bring the first back", async () => {
    const service = createService();
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": ["a"] }));

    await act(() => result.current.toggleTag(["10"], "a"));
    expect(result.current.assignments["10"]).toEqual([]);

    await act(() => result.current.toggleTag(["10"], "b"));
    expect(service.setProtocolTagIds).toHaveBeenNthCalledWith(1, 7, "10", []);
    expect(service.setProtocolTagIds).toHaveBeenNthCalledWith(2, 7, "10", ["b"]);
    expect(result.current.assignments["10"]).toEqual(["b"]);
  });

  it("rolls back only the protocols whose request failed, and says so", async () => {
    const service = createService({
      setProtocolTagIds: vi.fn(async (_pid: unknown, protocolId: unknown, tagIds: string[]) => {
        if (String(protocolId) === "20") throw Object.assign(new Error("x"), { data: { detail: "Protocol 20 not found" } });
        return { protocolId: String(protocolId), tagIds, ignoredTagIds: [] };
      }),
    });
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": [], "20": [], "30": [] }));

    let summary: any;
    await act(async () => {
      summary = await result.current.toggleTag(["10", "20", "30"], "a");
    });

    expect(summary).toEqual({ succeeded: ["10", "30"], failed: ["20"] });
    expect(result.current.assignments).toEqual({ "10": ["a"], "20": [], "30": ["a"] });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Tags updated on 2 of 3 protocols; 1 failed: Protocol 20 not found"));
  });

  it("sends rapid toggles of one protocol in order, one at a time", async () => {
    const first = deferred<any>();
    const calls: string[][] = [];
    const service = createService({
      setProtocolTagIds: vi.fn((_pid: unknown, protocolId: unknown, tagIds: string[]) => {
        calls.push(tagIds);
        if (calls.length === 1) return first.promise;
        return Promise.resolve({ protocolId: String(protocolId), tagIds, ignoredTagIds: [] });
      }),
    });
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": [] }));

    let a!: Promise<unknown>;
    let b!: Promise<unknown>;
    act(() => {
      a = result.current.toggleTag(["10"], "a");
      // Built on the first toggle, not on what the server has confirmed.
      b = result.current.toggleTag(["10"], "b");
    });
    expect(result.current.assignments["10"]).toEqual(["a", "b"]);
    await waitFor(() => expect(calls.length).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The second request waits for the first.
    expect(calls).toEqual([["a"]]);

    await act(async () => {
      first.resolve({ protocolId: "10", tagIds: ["a"], ignoredTagIds: [] });
      await a;
      await b;
    });

    expect(calls).toEqual([["a"], ["a", "b"]]);
    // The older answer did not overwrite the newer toggle.
    expect(result.current.assignments["10"]).toEqual(["a", "b"]);
  });

  it("keeps ids it does not know: they are never pruned and saved", async () => {
    const service = createService();
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": ["a", "from-a-collaborator"] }));

    // Loading the list with an id it lacks writes nothing.
    await act(() => result.current.refreshTags());
    expect(service.setProtocolTagIds).not.toHaveBeenCalled();
    expect(result.current.assignments["10"]).toEqual(["a", "from-a-collaborator"]);

    // A toggle keeps it; the server drops it if it really is gone.
    await act(() => result.current.toggleTag(["10"], "b"));
    expect(service.setProtocolTagIds).toHaveBeenCalledWith(7, "10", ["a", "from-a-collaborator", "b"]);
  });

  it("takes the server's answer and reloads the list when it ignored ids", async () => {
    const service = createService({
      setProtocolTagIds: vi.fn().mockResolvedValue({ protocolId: "10", tagIds: ["b"], ignoredTagIds: ["gone"] }),
    });
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": ["gone"] }));
    service.listProjectTags.mockClear();

    await act(() => result.current.toggleTag(["10"], "b"));

    expect(result.current.assignments["10"]).toEqual(["b"]);
    await waitFor(() => expect(service.listProjectTags).toHaveBeenCalledTimes(1));
  });

  it("mirrors every change, so the loaded project can follow", async () => {
    const onChange = vi.fn();
    const { result } = await setup(createService(), onChange);
    act(() => result.current.seedAssignments({ "10": [] }));

    await act(() => result.current.toggleTag(["10"], "a"));

    expect(onChange).toHaveBeenCalledWith({ "10": ["a"] });
  });

  it("creates a tag and assigns it to the protocols it came from", async () => {
    const service = createService();
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": ["a"], "20": [] }));

    await act(async () => {
      await result.current.createTagAndAssign({ title: "Gamma", color: "#123456" }, ["10", "20"]);
    });

    expect(service.createProjectTag).toHaveBeenCalledWith(7, { title: "Gamma", color: "#123456" });
    await waitFor(() => expect(result.current.assignments).toEqual({ "10": ["a", "new"], "20": ["new"] }));
    expect(result.current.tags.map((t) => t.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("keeps the previous list when a reload fails, and ignores stale answers", async () => {
    const slow = deferred<any>();
    const service = createService();
    const { result } = await setup(service);

    service.listProjectTags.mockRejectedValueOnce(new Error("offline"));
    await act(() => result.current.refreshTags());
    expect(result.current.tags).toHaveLength(2);
    expect(toast.error).toHaveBeenCalledWith("offline", expect.anything());

    service.listProjectTags.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([tagList[0]]);
    let stale!: Promise<void>;
    act(() => {
      stale = result.current.refreshTags();
    });
    await act(() => result.current.refreshTags());
    await act(async () => {
      slow.resolve(tagList);
      await stale;
    });
    expect(result.current.tags.map((t) => t.id)).toEqual(["a"]);
  });

  it("forgets a deleted tag everywhere without writing", async () => {
    const service = createService();
    const { result } = await setup(service);
    act(() => result.current.seedAssignments({ "10": ["a", "b"], "20": ["a"] }));

    act(() => result.current.forgetTag("a"));

    expect(result.current.assignments).toEqual({ "10": ["b"], "20": [] });
    expect(result.current.tags.map((t) => t.id)).toEqual(["b"]);
    expect(service.setProtocolTagIds).not.toHaveBeenCalled();
  });
});
