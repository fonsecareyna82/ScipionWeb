// Isosurfaces computed in the browser while their level changes: each key
// (the live threshold, the inner level) asks for one level, and only its
// latest level is computed. Runs in a worker; without workers, on the page.
import { useEffect, useRef, useState } from "react";
import { surfaceNets, type SurfaceGrid, type SurfaceNetsMesh } from "./surface-nets";

export type LiveSurface = SurfaceNetsMesh & { level: number };

type KeyState = { requestId: number; busy: boolean; wanted: number | null };

export default function useLiveSurfaces(
    grid: SurfaceGrid | null,
    levels: Record<string, number | null>,
): Record<string, LiveSurface | null> {
    const [surfaces, setSurfaces] = useState<Record<string, LiveSurface | null>>({});
    const workerRef = useRef<Worker | null>(null);
    const statesRef = useRef<Record<string, KeyState>>({});
    const sendRef = useRef<(key: string) => void>(() => undefined);
    const levelsRef = useRef(levels);
    levelsRef.current = levels;

    useEffect(() => {
        statesRef.current = {};
        setSurfaces({});
        if (!grid) return;

        let cancelled = false;
        let worker: Worker | null = null;
        if (typeof Worker !== "undefined") {
            try {
                worker = new Worker(new URL("./live-surface-worker.ts", import.meta.url), { type: "module" });
            } catch {
                worker = null;
            }
        }
        workerRef.current = worker;

        const accept = (key: string, requestId: number, level: number, mesh: SurfaceNetsMesh | null) => {
            const state = statesRef.current[key];
            if (cancelled || !state || state.requestId !== requestId) return;
            state.busy = false;
            setSurfaces((current) => ({ ...current, [key]: mesh ? { ...mesh, level } : null }));
            if (state.wanted != null && state.wanted !== level) sendRef.current(key);
        };

        sendRef.current = (key: string) => {
            const state = statesRef.current[key];
            if (!state || state.busy || state.wanted == null) return;
            const level = state.wanted;
            const requestId = ++state.requestId;
            state.busy = true;
            if (worker) {
                worker.postMessage({ type: "surface", key, level, requestId });
            } else {
                window.setTimeout(() => accept(key, requestId, level, surfaceNets(grid, level)), 0);
            }
        };

        if (worker) {
            worker.onmessage = (event) => {
                const { key, requestId, level, mesh, error } = event.data ?? {};
                accept(key, requestId, level, error ? null : mesh);
            };
            worker.onerror = () => {
                for (const state of Object.values(statesRef.current)) state.busy = false;
            };
            const values = new Float32Array(grid.values);
            worker.postMessage({ type: "volume", grid: { ...grid, values } }, [values.buffer]);
        }

        // Ask again for the levels wanted before the volume was ready.
        for (const key of Object.keys(levelsRef.current)) {
            statesRef.current[key] = { requestId: 0, busy: false, wanted: levelsRef.current[key] };
            sendRef.current(key);
        }

        return () => {
            cancelled = true;
            worker?.terminate();
            workerRef.current = null;
            sendRef.current = () => undefined;
        };
    }, [grid]);

    const levelsKey = JSON.stringify(levels);

    useEffect(() => {
        for (const [key, level] of Object.entries(levels)) {
            const state = statesRef.current[key] ?? (statesRef.current[key] = { requestId: 0, busy: false, wanted: null });
            state.wanted = level;
            if (level == null) {
                state.requestId++;
                state.busy = false;
                setSurfaces((current) => (current[key] ? { ...current, [key]: null } : current));
            } else {
                sendRef.current(key);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levelsKey]);

    return surfaces;
}
