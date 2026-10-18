import { describe, expect, it } from "vitest";
import {
    DEFAULT_TILT_DISPLAY,
    buildTiltLut,
    loadingOrder,
    seriesReference,
    tiltPixels,
    tiltPlacement,
} from "../../analyze/tilt-image-render";

// Stored levels 0..255 cover mean +/- 5 std: mean 100, std 10 -> 50..150.
const frame = { index: 0, width: 4, height: 2, origWidth: 16, origHeight: 8, low: 50, high: 150, mean: 100, std: 10 };
const levelOf = (value: number) => Math.round(((value - 50) / 100) * 255);

describe("tilt image render", () => {
    it("shows mean +/- 2 standard deviations from black to white", () => {
        const lut = buildTiltLut(frame, DEFAULT_TILT_DISPLAY);
        expect(lut[levelOf(100)]).toBeGreaterThan(125);
        expect(lut[levelOf(100)]).toBeLessThan(131);
        expect(lut[levelOf(80)]).toBeLessThanOrEqual(2);
        expect(lut[levelOf(120)]).toBeGreaterThanOrEqual(253);
        expect(lut[0]).toBe(0);
        expect(lut[255]).toBe(255);
    });

    it("brightens, narrows and inverts the window", () => {
        const base = buildTiltLut(frame, DEFAULT_TILT_DISPLAY)[levelOf(95)];
        expect(buildTiltLut(frame, { ...DEFAULT_TILT_DISPLAY, brightness: 50 })[levelOf(95)]).toBeGreaterThan(base);
        expect(buildTiltLut(frame, { ...DEFAULT_TILT_DISPLAY, contrast: 300 })[levelOf(95)]).toBeLessThan(base);
        expect(buildTiltLut(frame, { ...DEFAULT_TILT_DISPLAY, invert: true })[levelOf(95)]).toBe(255 - base);
    });

    it("uses one window for the series when asked", () => {
        const loaded = { ...frame, data: new Uint8Array(8) };
        const darker = { ...loaded, mean: 90 };
        const reference = seriesReference([loaded, darker, { ...loaded, mean: 110 }, { ...frame, mean: 500 }]);
        expect(reference).toEqual({ mean: 100, std: 10 });
        const own = buildTiltLut(darker, DEFAULT_TILT_DISPLAY, reference);
        const series = buildTiltLut(darker, { ...DEFAULT_TILT_DISPLAY, seriesScale: true }, reference);
        // Its own window centers its mean; the series one shows it darker.
        expect(series[levelOf(90)]).toBeLessThan(own[levelOf(90)]);
    });

    it("writes gray RGBA pixels", () => {
        const lut = new Uint8ClampedArray(256).map((_, level) => 255 - level);
        const pixels = tiltPixels({ ...frame, width: 2, height: 1, data: new Uint8Array([0, 200]) }, lut);
        expect(Array.from(pixels)).toEqual([255, 255, 255, 255, 55, 55, 55, 255]);
    });

    it("places the image as the previews do", () => {
        const aligned = { ...frame, rot: 85, shiftX: 8, shiftY: -4 };
        expect(tiltPlacement(aligned, false, true)).toMatchObject({ canvasRotation: 0, shiftX: 0, flip: true, viewWidth: 4, viewHeight: 2 });
        const placed = tiltPlacement(aligned, true, true);
        expect(placed.canvasRotation).toBeCloseTo((-85 * Math.PI) / 180);
        // Shifts scaled to the reduced image (4 / 16 and 2 / 8).
        expect([placed.shiftX, placed.shiftY]).toEqual([2, -1]);
        // Near 90 degrees the view turns portrait.
        expect([placed.viewWidth, placed.viewHeight]).toEqual([2, 4]);
        expect(tiltPlacement({ ...aligned, rot: 10 }, true, true)).toMatchObject({ viewWidth: 4, viewHeight: 2 });
        expect(tiltPlacement({ ...aligned, shiftY: null }, true, true).canvasRotation).toBe(0);
    });

    it("loads the current tilt first, then outwards", () => {
        expect(loadingOrder(6, 2)).toEqual([2, 3, 1, 4, 0, 5]);
        expect(loadingOrder(3, 9)).toEqual([2, 1, 0]);
        expect(loadingOrder(0, 0)).toEqual([]);
    });
});
