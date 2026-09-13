import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClippingSliceImages } from "../../analyze/use-clipping-slice-images";
import { createFullVolumeClipBounds } from "../../analyze/volume-3d-types";
const service = vi.hoisted(() => ({ fetchVolumeSliceObjectUrl: vi.fn() }));
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => service }));
let revokes: Array<ReturnType<typeof vi.fn>>;
beforeEach(() => {
  revokes = [];
  service.fetchVolumeSliceObjectUrl.mockReset().mockImplementation(async () => {
    const revoke = vi.fn(); revokes.push(revoke);
    return { url: `blob:${revokes.length}`, revoke };
  });
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => vi.unstubAllGlobals());
const initial = { enabled: true, projectId: 1, protocolId: 2, outputName: "volume", volumeId: 3, dims: { x: 100, y: 80, z: 60 }, bounds: createFullVolumeClipBounds(), visibility: { x: true, y: false, z: false }, colormap: "gray" };

describe("clipping slice loading", () => {
  it("loads two faces, retains cached images during navigation and does not refetch for a crop on another axis", async () => {
    const { result, rerender, unmount } = renderHook(props => useClippingSliceImages(props), { initialProps: initial });
    await waitFor(() => expect(result.current.images.x.every(Boolean)).toBe(true));
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(2);
    rerender({ ...initial, bounds: { ...initial.bounds, y: [0.2, 0.8] } });
    expect(result.current.images.x.every(Boolean)).toBe(true);
    await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(2);
    rerender({ ...initial, bounds: { ...initial.bounds, x: [0.3, 1] } });
    expect(result.current.images.x[0]).toBeNull();
    await waitFor(() => expect(result.current.images.x[0]).not.toBeNull());
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(3);
    rerender(initial);
    expect(result.current.images.x.every(Boolean)).toBe(true);
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(3);
    unmount();
    expect(revokes.every(revoke => revoke.mock.calls.length === 1)).toBe(true);
  });
  it("evicts old decoded images after sixteen distinct cuts", async () => {
    const { result, rerender } = renderHook(props => useClippingSliceImages(props), { initialProps: { ...initial, bounds: { ...initial.bounds, x: [0, 0] as [number, number] } } });
    for (let i = 0; i < 17; i++) {
      rerender({ ...initial, bounds: { ...initial.bounds, x: [i / 99, i / 99] } });
      await waitFor(() => expect(result.current.images.x[0]).not.toBeNull());
    }
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(17);
    expect(revokes.filter(revoke => revoke.mock.calls.length > 0)).toHaveLength(1);
  });

  it("deduplicates coincident faces", async () => {
    const { result } = renderHook(() => useClippingSliceImages({ ...initial, bounds: { ...initial.bounds, x: [0.5, 0.5] } }));
    await waitFor(() => expect(result.current.images.x.every(Boolean)).toBe(true));
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(1);
    expect(result.current.images.x[0]).toBe(result.current.images.x[1]);
  });
  it("limits concurrency to two and ignores late responses after switching volume", async () => {
    const pending: Array<(value: unknown) => void> = [];
    service.fetchVolumeSliceObjectUrl.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const props = { ...initial, visibility: { x: true, y: true, z: true } };
    const { result, rerender } = renderHook(props => useClippingSliceImages(props), { initialProps: props });
    await waitFor(() => expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(2));
    const signal = service.fetchVolumeSliceObjectUrl.mock.calls[0][5].signal;
    rerender({ ...props, volumeId: 4, enabled: false });
    expect(signal.aborted).toBe(true);
    const revoke = vi.fn();
    await act(async () => pending.forEach(resolve => resolve({ url: "blob:old", revoke })));
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(result.current.images.x).toEqual([null, null]);
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(2);
  });
  it("does not request while dragging, and retries errors only on request", async () => {
    const { result, rerender } = renderHook(props => useClippingSliceImages(props), { initialProps: { ...initial, enabled: false } });
    await act(async () => new Promise(resolve => setTimeout(resolve, 150)));
    expect(service.fetchVolumeSliceObjectUrl).not.toHaveBeenCalled();
    service.fetchVolumeSliceObjectUrl.mockRejectedValueOnce(new Error("Unavailable"));
    rerender(initial);
    await waitFor(() => expect(result.current.error).toBe("Unavailable"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.images.x.every(Boolean)).toBe(true));
    expect(result.current.error).toBeNull();
    expect(service.fetchVolumeSliceObjectUrl).toHaveBeenCalledTimes(3);
  });
});
