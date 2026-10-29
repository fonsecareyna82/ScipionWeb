import { afterEach, describe, expect, it, vi } from "vitest";

async function freshModule() {
    vi.resetModules();
    return import("./plot-trace-type");
}

describe("scatterTraceType", () => {
    afterEach(() => vi.restoreAllMocks());

    it("draws without WebGL when the browser cannot create a context", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        const { scatterTraceType } = await freshModule();
        expect(scatterTraceType(50000)).toBe("scatter");
    });

    it("uses WebGL only for many points where the browser supports it", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getExtension: () => null } as any);
        const { scatterTraceType } = await freshModule();
        expect(scatterTraceType(100)).toBe("scatter");
        expect(scatterTraceType(50000)).toBe("scattergl");
    });
});
