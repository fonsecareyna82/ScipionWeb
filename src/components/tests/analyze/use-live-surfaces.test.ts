import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useLiveSurfaces from "../../analyze/use-live-surfaces";

const n = 12;
const values = new Float32Array(n * n * n);
for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    values[x + n * (y + n * z)] = 5 - Math.hypot(x - 5.5, y - 5.5, z - 5.5);
}
const grid = { values, dims: { x: n, y: n, z: n }, order: "zyx" as const };

describe("useLiveSurfaces", () => {
    it("ends with the surface of the last level asked for each key", async () => {
        const { result, rerender } = renderHook(
            ({ levels }) => useLiveSurfaces(grid, levels),
            { initialProps: { levels: { preview: 0 as number | null, inner: null as number | null } } },
        );
        rerender({ levels: { preview: 1, inner: 2 } });
        rerender({ levels: { preview: 2, inner: 3 } });

        await waitFor(() => {
            expect(result.current.preview?.level).toBe(2);
            expect(result.current.inner?.level).toBe(3);
        });
        expect(result.current.preview!.indices.length).toBeGreaterThan(result.current.inner!.indices.length);

        rerender({ levels: { preview: null, inner: 3 } });
        await waitFor(() => expect(result.current.preview).toBeNull());
    });

    it("has no surfaces without a volume", () => {
        const { result } = renderHook(() => useLiveSurfaces(null, { preview: 1 }));
        expect(result.current.preview ?? null).toBeNull();
    });
});
