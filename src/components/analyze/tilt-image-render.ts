// Drawing a reduced tilt image (TiltStackFrame) in the browser: its contrast
// from the original values and its alignment, as the API previews do.
import type { TiltStackFrame } from "@/services/ProjectService";

export type TiltDisplay = {
    // Shifts the window: positive shows the image brighter (percent of half the window).
    brightness: number;
    // Narrows the window: 200 shows half the range (percent).
    contrast: number;
    invert: boolean;
    // One window for the whole series instead of one per tilt.
    seriesScale: boolean;
};

export const DEFAULT_TILT_DISPLAY: TiltDisplay = {
    brightness: 0,
    contrast: 100,
    invert: false,
    seriesScale: false,
};

// The window shows mean +/- this many standard deviations at contrast 100, as
// the previews of the API did (they clipped to 2 standard deviations).
export const TILT_WINDOW_SIGMAS = 2;

export type TiltReference = { mean: number; std: number };

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// The window of the whole series: the median mean and spread of its tilts.
export function seriesReference(frames: Iterable<TiltStackFrame>): TiltReference | null {
    const means: number[] = [];
    const stds: number[] = [];
    for (const frame of frames) {
        if (frame.data && Number.isFinite(frame.mean) && Number.isFinite(frame.std) && (frame.std ?? 0) > 0) {
            means.push(frame.mean as number);
            stds.push(frame.std as number);
        }
    }
    return means.length ? { mean: median(means), std: median(stds) } : null;
}

// The gray (0-255) shown for each of the 256 stored levels of the frame.
export function buildTiltLut(
    frame: TiltStackFrame,
    display: TiltDisplay,
    reference: TiltReference | null = null,
): Uint8ClampedArray {
    const lut = new Uint8ClampedArray(256);
    const low = Number(frame.low ?? 0);
    const high = Number(frame.high ?? 255);
    const useSeries = display.seriesScale && reference != null;
    const mean = useSeries ? reference!.mean : Number(frame.mean ?? (low + high) / 2);
    const std = useSeries ? reference!.std : Number(frame.std ?? (high - low) / 10);
    const half = (TILT_WINDOW_SIGMAS * (std > 0 ? std : 1)) / Math.max(0.05, display.contrast / 100);
    const center = mean - (display.brightness / 100) * half;
    const step = (high - low) / 255;
    for (let level = 0; level < 256; level++) {
        const value = low + level * step;
        let gray = ((value - (center - half)) / (2 * half)) * 255;
        if (display.invert) gray = 255 - gray;
        lut[level] = gray;
    }
    return lut;
}

// The RGBA pixels of the frame through the lookup table.
export function tiltPixels(frame: TiltStackFrame, lut: Uint8ClampedArray, target?: Uint8ClampedArray): Uint8ClampedArray {
    const data = frame.data ?? new Uint8Array();
    const pixels = target && target.length === data.length * 4 ? target : new Uint8ClampedArray(data.length * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
        const gray = lut[data[i]];
        pixels[j] = gray;
        pixels[j + 1] = gray;
        pixels[j + 2] = gray;
        pixels[j + 3] = 255;
    }
    return pixels;
}

export type TiltPlacement = {
    // Rotation to draw with (radians, as the canvas rotates: clockwise on screen).
    canvasRotation: number;
    // Shift in reduced pixels, before the flip.
    shiftX: number;
    shiftY: number;
    flip: boolean;
    // Size of the view the image fits in (the previews swap it for rotations near 90 degrees).
    viewWidth: number;
    viewHeight: number;
};

export function frameHasAlignment(frame: TiltStackFrame): boolean {
    return [frame.rot, frame.shiftX, frame.shiftY].every((value) => value != null && Number.isFinite(Number(value)));
}

// Where the image goes, as the API previews place it: rotated (counterclockwise
// on screen by rot degrees), shifted, then flipped vertically.
export function tiltPlacement(frame: TiltStackFrame, applyTransform: boolean, flip: boolean): TiltPlacement {
    const width = Number(frame.width ?? 0);
    const height = Number(frame.height ?? 0);
    if (!applyTransform || !frameHasAlignment(frame)) {
        return { canvasRotation: 0, shiftX: 0, shiftY: 0, flip, viewWidth: width, viewHeight: height };
    }
    const scaleX = frame.origWidth ? width / frame.origWidth : 1;
    const scaleY = frame.origHeight ? height / frame.origHeight : 1;
    const angle = ((Number(frame.rot) % 360) + 360) % 360;
    const swap = (angle >= 45 && angle <= 135) || (angle >= 225 && angle <= 315);
    return {
        canvasRotation: (-Number(frame.rot) * Math.PI) / 180,
        shiftX: Number(frame.shiftX) * scaleX,
        shiftY: Number(frame.shiftY) * scaleY,
        flip,
        viewWidth: swap ? height : width,
        viewHeight: swap ? width : height,
    };
}

// Order to load the tilts: the current one first, then outwards.
export function loadingOrder(count: number, current: number): number[] {
    const order: number[] = [];
    const start = Math.min(Math.max(current, 0), Math.max(count - 1, 0));
    if (count > 0) order.push(start);
    for (let distance = 1; order.length < count; distance++) {
        if (start + distance < count) order.push(start + distance);
        if (start - distance >= 0) order.push(start - distance);
    }
    return order;
}
