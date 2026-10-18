// Saving the 3D view as a PNG for a figure: rendered again at a multiple of
// the screen resolution, with its background or transparent.

export type VolumeImageOptions = {
    // Multiple of the size of the view on screen (in CSS pixels).
    scale: number;
    transparent: boolean;
};

// Implemented by each 3D view: renders the current view and returns the PNG.
export type VolumeImageCapture = (options: VolumeImageOptions) => Promise<Blob>;

// Larger images fail on many GPUs and browsers.
export const MAX_EXPORT_SIDE = 8192;

// The scale actually used, so the longest side stays within limits.
export function exportScale(width: number, height: number, scale: number, maxSide = MAX_EXPORT_SIDE): number {
    const longest = Math.max(1, width, height);
    return Math.max(0.1, Math.min(scale, maxSide / longest));
}

export function dataUrlToBlob(dataUrl: string): Blob {
    const [header, data] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
    const bytes = atob(data ?? "");
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mime });
}

// The canvas as a PNG, over a background color unless it is transparent.
export async function canvasToPng(canvas: HTMLCanvasElement, background: string | null): Promise<Blob> {
    // Read now: a WebGL canvas may be cleared once the current task ends.
    const dataUrl = canvas.toDataURL("image/png");
    if (!background) return dataUrlToBlob(dataUrl);

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not compose the image."));
        image.src = dataUrl;
    });
    const composed = document.createElement("canvas");
    composed.width = canvas.width;
    composed.height = canvas.height;
    const context = composed.getContext("2d");
    if (!context) return dataUrlToBlob(dataUrl);
    context.fillStyle = background;
    context.fillRect(0, 0, composed.width, composed.height);
    context.drawImage(image, 0, 0);
    return dataUrlToBlob(composed.toDataURL("image/png"));
}

// The first opaque background color behind the element.
export function backgroundBehind(element: HTMLElement | null): string {
    for (let current = element; current; current = current.parentElement) {
        const color = getComputedStyle(current).backgroundColor;
        if (color && color !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(color)) return color;
    }
    return "#ffffff";
}

export function imageFileName(...parts: Array<string | number | null | undefined>): string {
    const name = parts
        .filter((part) => part != null && String(part).trim() !== "")
        .map((part) => String(part).trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, ""))
        .filter(Boolean)
        .join("_");
    return `${name || "volume"}.png`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
