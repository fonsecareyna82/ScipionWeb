import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectService } from "@/ProjectServiceContext";
import type { VolumeAxis, VolumeClipBounds, VolumeSliceVisibility } from "./volume-3d-types";

export type ClippingSliceImages = Record<VolumeAxis, [HTMLImageElement | null, HTMLImageElement | null]>;
const AXES: VolumeAxis[] = ["x", "y", "z"];
const MAX_IMAGES = 16;

export function decodeClippingImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); image.src = ""; reject(new DOMException("Aborted", "AbortError")); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error("Could not decode clipping slice")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

export function useClippingSliceImages({ enabled, projectId, protocolId, outputName, volumeId, dims, bounds, visibility, colormap, windowMin, windowMax, sourceVersion }: {
  enabled: boolean;
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
  volumeId: string | number | null;
  dims: Record<VolumeAxis, number>;
  bounds: VolumeClipBounds;
  visibility: VolumeSliceVisibility;
  colormap: string;
  windowMin?: number;
  windowMax?: number;
  sourceVersion?: unknown;
}) {
  const service = useProjectService();
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const [failure, setFailure] = useState<{ scope: object; key: string; message: string } | null>(null);
  const cache = useMemo(() => new Map<string, { image: HTMLImageElement; revoke: () => void }>(), [projectId, protocolId, outputName, volumeId, dims.x, dims.y, dims.z, colormap, windowMin, windowMax, sourceVersion]);
  useEffect(() => () => { cache.forEach(entry => entry.revoke()); cache.clear(); }, [cache]);

  const indices = AXES.map(axis => bounds[axis].map(value => Math.round(value * Math.max(0, dims[axis] - 1))));
  const keys = AXES.map((axis, a) => indices[a].map(index => visibility[axis] ? `${axis}:${index}` : ""));
  const requestKey = keys.flat().join("|");
  const requests = useMemo(() => [...new Set(requestKey.split("|").filter(Boolean))].map(key => {
    const [axis, index] = key.split(":");
    return { key, axis: axis as VolumeAxis, index: Number(index) };
  }), [requestKey]);
  const error = failure?.scope === cache && failure.key === requestKey ? failure.message : null;

  useEffect(() => {
    if (!enabled || volumeId == null || !requests.length) return;
    const missing = requests.filter(request => !cache.has(request.key));
    requests.forEach(({ key }) => {
      const hit = cache.get(key);
      if (hit) { cache.delete(key); cache.set(key, hit); }
    });
    if (!missing.length) return;
    const controller = new AbortController();
    let next = 0;
    const timer = setTimeout(() => {
      const worker = async () => {
        while (next < missing.length && !controller.signal.aborted) {
          const request = missing[next++];
          let revoke: (() => void) | undefined;
          try {
            const result = await serviceRef.current.fetchVolumeSliceObjectUrl(projectId, protocolId, outputName, volumeId, request.index, { axis: request.axis, cmap: colormap, thumb: 512, format: "png", fast: false, windowMin, windowMax, signal: controller.signal });
            revoke = result.revoke;
            if (controller.signal.aborted) { revoke(); return; }
            const image = await decodeClippingImage(result.url, controller.signal);
            if (controller.signal.aborted) { revoke(); return; }
            cache.set(request.key, { image, revoke });
            revoke = undefined;
            for (const key of cache.keys()) {
              if (cache.size <= MAX_IMAGES) break;
              if (!requests.some(request => request.key === key)) { cache.get(key)?.revoke(); cache.delete(key); }
            }
            setVersion(value => value + 1);
          } catch (reason) {
            revoke?.();
            if (!controller.signal.aborted) setFailure({ scope: cache, key: requestKey, message: reason instanceof Error ? reason.message : "Could not load clipping slices" });
          }
        }
      };
      void worker();
      void worker();
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, cache, requests, requestKey, retry, projectId, protocolId, outputName, volumeId, colormap, windowMin, windowMax]);

  const images = useMemo(() => Object.fromEntries(AXES.map(axis => {
    const pair = requestKey.split("|").slice(AXES.indexOf(axis) * 2, AXES.indexOf(axis) * 2 + 2);
    return [axis, pair.map(key => cache.get(key)?.image ?? null)];
  })) as ClippingSliceImages, [cache, requestKey, version]);
  return { images, error, loading: enabled && !error && requests.some(request => !cache.has(request.key)), retry: () => { setFailure(null); setRetry(value => value + 1); } };
}
