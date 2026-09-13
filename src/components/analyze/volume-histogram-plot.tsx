import { useEffect, useRef, useState } from "react";
import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import Plot from "react-plotly.js";

export function VolumeHistogramPlot({ data, range }: { data: { x: number[]; y: number[]; width: number[] }; range: [number, number] | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 280, height: 280 });
  const [scale, setScale] = useState<"linear" | "log">("linear");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const next = { width: Math.floor(width), height: Math.floor(height) };
      setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 320, minWidth: 0, mt: 1 }}>
      <ToggleButtonGroup size="small" exclusive value={scale} onChange={(_, value) => value && setScale(value)} aria-label="Histogram count scale" sx={{ alignSelf: "flex-end" }}>
        <ToggleButton value="linear">Linear</ToggleButton>
        <ToggleButton value="log">Log</ToggleButton>
      </ToggleButtonGroup>
      <Box ref={hostRef} sx={{ position: "relative", flex: 1, minHeight: 270, minWidth: 0 }}>
        <Plot
          data={[{ type: "bar", ...data, hovertemplate: "Intensity %{x:.4g}<br>Count %{y:,}<extra></extra>" }]}
          layout={{
            ...size,
            autosize: false,
            margin: { l: 54, r: 10, t: 12, b: 48 },
            showlegend: false,
            bargap: 0,
            xaxis: { title: { text: "Intensity", standoff: 8 }, range: range ?? undefined, autorange: !range, zeroline: false, automargin: true },
            yaxis: { title: { text: "Count", standoff: 8 }, type: scale, rangemode: "tozero", tickformat: "~s", zeroline: false, automargin: true },
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          config={{ displaylogo: false, responsive: false }}
        />
      </Box>
    </Box>
  );
}
