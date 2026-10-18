// A tilt image drawn from its reduced values: contrast, alignment, zoom
// (wheel, about the cursor) and pan (drag). Shift + wheel changes the tilt.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TiltStackFrame } from "@/services/ProjectService";
import {
    buildTiltLut,
    tiltPixels,
    tiltPlacement,
    type TiltDisplay,
    type TiltReference,
} from "./tilt-image-render";

const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

type Props = {
    frame: TiltStackFrame | null;
    display: TiltDisplay;
    reference: TiltReference | null;
    applyTransform: boolean;
    flipVertically: boolean;
    // Shown over the image (the tilt angle and its position).
    label?: string;
    loading?: boolean;
    onStep?: (direction: 1 | -1) => void;
};

export default function TiltImageCanvas({
    frame,
    display,
    reference,
    applyTransform,
    flipVertically,
    label,
    loading = false,
    onStep,
}: Props) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLCanvasElement | null>(null);
    const drawnFrameRef = useRef<TiltStackFrame | null>(null);
    const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
    const dragRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const onStepRef = useRef(onStep);
    onStepRef.current = onStep;

    // The frame on an offscreen canvas at its own resolution, through the contrast.
    const lut = useMemo(
        () => (frame?.data ? buildTiltLut(frame, display, reference) : null),
        [frame, display, reference],
    );

    useEffect(() => {
        if (!frame?.data || !lut || !frame.width || !frame.height) return;
        const image = imageRef.current ?? document.createElement("canvas");
        imageRef.current = image;
        if (image.width !== frame.width || image.height !== frame.height) {
            image.width = frame.width;
            image.height = frame.height;
        }
        const context = image.getContext("2d");
        if (!context) return;
        const pixels = context.createImageData(frame.width, frame.height);
        tiltPixels(frame, lut, pixels.data);
        context.putImageData(pixels, 0, 0);
        drawnFrameRef.current = frame;
    }, [frame, lut]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const image = imageRef.current;
        const shown = drawnFrameRef.current;
        if (!canvas || !image || !shown) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        const placement = tiltPlacement(shown, applyTransform, flipVertically);
        const fit = Math.min(width / Math.max(1, placement.viewWidth), height / Math.max(1, placement.viewHeight));
        const { zoom: currentZoom, panX, panY } = viewRef.current;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.translate(width / 2 + panX, height / 2 + panY);
        context.scale(fit * currentZoom, fit * currentZoom);
        if (placement.flip) context.scale(1, -1);
        context.translate(placement.shiftX, placement.shiftY);
        context.rotate(placement.canvasRotation);
        context.drawImage(image, -image.width / 2, -image.height / 2);
    }, [applyTransform, flipVertically]);

    // Redraw for every change, once per animation frame.
    const frameRequestRef = useRef<number | null>(null);
    const requestDraw = useCallback(() => {
        if (frameRequestRef.current != null) return;
        frameRequestRef.current = window.requestAnimationFrame(() => {
            frameRequestRef.current = null;
            draw();
        });
    }, [draw]);

    useEffect(() => {
        requestDraw();
    }, [frame, lut, size, zoom, requestDraw]);

    useEffect(() => () => {
        if (frameRequestRef.current != null) window.cancelAnimationFrame(frameRequestRef.current);
    }, []);

    useEffect(() => {
        const host = hostRef.current;
        const canvas = canvasRef.current;
        if (!host || !canvas || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1;
            const width = Math.max(1, host.clientWidth);
            const height = Math.max(1, host.clientHeight);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            setSize({ width, height });
        });
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    const resetView = useCallback(() => {
        viewRef.current = { zoom: 1, panX: 0, panY: 0 };
        setZoom(1);
        requestDraw();
    }, [requestDraw]);

    // Wheel: zoom about the cursor; with Shift, the next or previous tilt.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            if (event.shiftKey) {
                const delta = event.deltaY || event.deltaX;
                if (delta) onStepRef.current?.(delta > 0 ? 1 : -1);
                return;
            }
            const view = viewRef.current;
            const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * Math.exp(-event.deltaY * 0.0015)));
            const rect = host.getBoundingClientRect();
            const cursorX = event.clientX - rect.left - rect.width / 2;
            const cursorY = event.clientY - rect.top - rect.height / 2;
            const ratio = nextZoom / view.zoom;
            view.panX = nextZoom === 1 ? 0 : cursorX - (cursorX - view.panX) * ratio;
            view.panY = nextZoom === 1 ? 0 : cursorY - (cursorY - view.panY) * ratio;
            view.zoom = nextZoom;
            setZoom(nextZoom);
            requestDraw();
        };
        host.addEventListener("wheel", onWheel, { passive: false });
        return () => host.removeEventListener("wheel", onWheel);
    }, [requestDraw]);

    const onPointerDown = (event: React.PointerEvent) => {
        if (event.button !== 0 || viewRef.current.zoom <= 1) return;
        dragRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        viewRef.current.panX += event.clientX - drag.x;
        viewRef.current.panY += event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        requestDraw();
    };
    const onPointerUp = (event: React.PointerEvent) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };

    return (
        <div
            ref={hostRef}
            data-testid="tilt-image-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
                touchAction: "none",
            }}
        >
            <canvas ref={canvasRef} aria-label="Tilt image" style={{ display: "block" }} />
            {label && (
                <div
                    style={{
                        position: "absolute",
                        left: 10,
                        bottom: 8,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(15, 23, 42, 0.62)",
                        color: "#f8fafc",
                        fontSize: 12,
                        fontVariantNumeric: "tabular-nums",
                        pointerEvents: "none",
                    }}
                >
                    {label}
                </div>
            )}
            {zoom > 1 && (
                <button
                    type="button"
                    onClick={resetView}
                    onDoubleClick={(event) => event.stopPropagation()}
                    title="Fit the image in the view"
                    style={{
                        position: "absolute",
                        right: 10,
                        bottom: 8,
                        padding: "2px 8px",
                        borderRadius: 6,
                        border: "none",
                        background: "rgba(15, 23, 42, 0.62)",
                        color: "#f8fafc",
                        fontSize: 12,
                        cursor: "pointer",
                    }}
                >
                    {Math.round(zoom * 100)}% · Fit
                </button>
            )}
            {loading && (
                <div
                    role="status"
                    style={{
                        position: "absolute",
                        right: 10,
                        top: 52,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(15, 23, 42, 0.62)",
                        color: "#f8fafc",
                        fontSize: 12,
                        pointerEvents: "none",
                    }}
                >
                    Loading tilt…
                </div>
            )}
        </div>
    );
}
