/// <reference lib="webworker" />
// Computes isosurfaces of one volume for the live threshold and the inner level.
import { surfaceNets, type SurfaceGrid } from "./surface-nets";

type LiveSurfaceMessage =
    | { type: "volume"; grid: SurfaceGrid }
    | { type: "surface"; key: string; level: number; requestId: number };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let grid: SurfaceGrid | null = null;

workerScope.onmessage = (event: MessageEvent<LiveSurfaceMessage>) => {
    const message = event.data;
    if (message.type === "volume") {
        grid = message.grid;
        return;
    }
    if (!grid) {
        workerScope.postMessage({ key: message.key, requestId: message.requestId, error: "No volume" });
        return;
    }
    const mesh = surfaceNets(grid, message.level);
    workerScope.postMessage(
        { key: message.key, requestId: message.requestId, level: message.level, mesh },
        [mesh.vertices.buffer, mesh.normals.buffer, mesh.indices.buffer],
    );
};
