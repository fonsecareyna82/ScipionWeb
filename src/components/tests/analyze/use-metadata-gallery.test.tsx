import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataTableSchema } from "@/api/projects";
import { getGalleryLayout, useMetadataGalleryRows } from "../../analyze/use-metadata-gallery";
import { metadataScanWindows } from "../../analyze/metadata-scan-windows";

const service = vi.hoisted(() => ({ fetchMetadataTableWindow: vi.fn() }));
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => service }));
const schema = { name: "particles", columns: [], actions: [] } as unknown as MetadataTableSchema;

function mountGallery() {
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  const params = { projectId: 1, protocolId: 2, outputName: "particles", selectedTable: "particles", schema, totalRows: 100_000_000, viewMode: "gallery" as const, sortBy: null as string | null, sortAsc: true, anchorRowIndex: null, imageThumbSize: 128, galleryScrollRef: { current: host } };
  return { ...renderHook((props) => useMetadataGalleryRows(props), { initialProps: params }), params };
}

beforeEach(() => {
  service.fetchMetadataTableWindow.mockReset();
  service.fetchMetadataTableWindow.mockImplementation(async (_p, _r, _o, _t, { offset, limit }) => ({ offset, rows: Array.from({ length: limit }, (_, i) => ({ id: offset + i + 1, values: [] })) }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("metadata gallery", () => {
  it("keeps card size and reaches the last item beyond browser scroll limits", () => {
    const layout = getGalleryLayout(100_000_000, 800, 600, 128, Number.MAX_SAFE_INTEGER);
    expect(layout.scrollHeight).toBe(16_000_000);
    expect(layout.end).toBe(100_000_000);
    expect(layout.end - layout.start).toBeLessThan(50);
    expect(layout.cardHeight).toBe(176);
    const lastTop = Math.floor((layout.end - 1) / layout.columns) * layout.cardHeight - layout.logicalTop;
    expect(lastTop).toBeGreaterThanOrEqual(0);
    expect(lastTop + layout.cardHeight).toBeLessThanOrEqual(600);
  });

  it("jumps to the end with one small request and reuses recent windows", async () => {
    const { result } = mountGallery();
    await waitFor(() => expect(result.current.galleryRows.length).toBeGreaterThan(0));
    act(() => result.current.jumpToGalleryIndex(99_999_999));
    await waitFor(() => expect(result.current.galleryRows[result.current.galleryRows.length - 1]?.id).toBe(100_000_000));
    expect(result.current.galleryRows.length).toBeLessThanOrEqual(160);
    expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(2);
    act(() => result.current.jumpToGalleryIndex(0));
    await waitFor(() => expect(result.current.galleryRows[0]?.id).toBe(1));
    expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(2);
  });

  it("evicts old windows after visiting more than eight locations", async () => {
    const { result } = mountGallery();
    await waitFor(() => expect(result.current.galleryRows.length).toBeGreaterThan(0));
    for (let i = 1; i <= 8; i++) {
      act(() => result.current.jumpToGalleryIndex(i * 10_000));
      await waitFor(() => expect(result.current.galleryRows.some(row => row.id === i * 10_000 + 1)).toBe(true));
    }
    expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(9);
    act(() => result.current.jumpToGalleryIndex(0));
    await waitFor(() => expect(result.current.galleryRows[0]?.id).toBe(1));
    expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(10);
  });

  it("aborts obsolete requests and ignores their late responses", async () => {
    let resolveOld!: (value: unknown) => void;
    service.fetchMetadataTableWindow.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { result, unmount } = mountGallery();
    await waitFor(() => expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(1));
    const signal = service.fetchMetadataTableWindow.mock.calls[0][4].signal;
    act(() => result.current.jumpToGalleryIndex(99_999_999));
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.galleryRows[result.current.galleryRows.length - 1]?.id).toBe(100_000_000));
    await act(async () => resolveOld({ offset: 0, rows: [{ id: -1, values: [] }] }));
    expect(result.current.galleryRows[result.current.galleryRows.length - 1]?.id).toBe(100_000_000);
    unmount();
    expect(service.fetchMetadataTableWindow.mock.calls[service.fetchMetadataTableWindow.mock.calls.length - 1]?.[4].signal.aborted).toBe(true);
  });

  it("retries a failed window without jumping back to the beginning", async () => {
    const { result } = mountGallery();
    await waitFor(() => expect(result.current.galleryRows.length).toBeGreaterThan(0));
    service.fetchMetadataTableWindow.mockRejectedValueOnce(new Error("Temporary failure"));
    act(() => result.current.jumpToGalleryIndex(99_999_999));
    await waitFor(() => expect(result.current.galleryError).toBe("Temporary failure"));
    act(() => result.current.invalidateGalleryState());
    await waitFor(() => expect(result.current.galleryRows[result.current.galleryRows.length - 1]?.id).toBe(100_000_000));
    expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(3);
  });

  it("invalidates cached rows when sorting changes", async () => {
    const { result, rerender, params } = mountGallery();
    await waitFor(() => expect(result.current.galleryRows.length).toBeGreaterThan(0));
    rerender({ ...params, sortBy: "score" });
    await waitFor(() => expect(service.fetchMetadataTableWindow).toHaveBeenCalledTimes(2));
    expect(service.fetchMetadataTableWindow.mock.calls[1][4]).toMatchObject({ sortBy: "score", asc: true });
  });
});

describe("metadata scan windows", () => {
  it("reads only selected ranges, including a partial last window", () => {
    expect([...metadataScanWindows([{ start: 100, end: 102 }, { start: 900, end: 1400 }], 500)]).toEqual([{ offset: 100, limit: 3 }, { offset: 900, limit: 500 }, { offset: 1400, limit: 1 }]);
  });
  it("starts scanning enormous ranges without allocating every page", () => {
    const windows = metadataScanWindows([{ start: 0, end: Number.MAX_SAFE_INTEGER - 1 }], 500);
    expect(windows.next().value).toEqual({ offset: 0, limit: 500 });
    expect(windows.next().value).toEqual({ offset: 500, limit: 500 });
  });
});
