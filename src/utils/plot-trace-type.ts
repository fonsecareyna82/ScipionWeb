// Plotly draws scatter points with WebGL only where it pays and the browser can: with acceleration off or a
// blocked GPU, a "scattergl" plot shows "WebGL is not supported by your browser" instead of the points
const WEBGL_MIN_POINTS = 2000;

let webglAvailable: boolean | null = null;

export function browserSupportsWebGl(): boolean {
    if (webglAvailable === null) {
        try {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
            webglAvailable = context != null;
            // Browsers allow few live contexts: this one is not needed any more
            (context as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
            webglAvailable = false;
        }
    }
    return webglAvailable;
}

export function scatterTraceType(pointCount: number): "scatter" | "scattergl" {
    return pointCount >= WEBGL_MIN_POINTS && browserSupportsWebGl() ? "scattergl" : "scatter";
}
