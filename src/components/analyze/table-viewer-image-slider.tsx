import { useEffect, useMemo, useRef, useState } from "react";
import { Box, FormControlLabel, Slider, Switch, Typography } from "@mui/material";

export type ImageSliderAxisContent = {
  slices: Record<string, string>;
  sliderPrefix?: string;
};

export type VolumeCoordinates = {
  x: number[];
  y: number[];
  z: number[];
};

export type TableViewerImageSliderContent = {
  kind: "imageSlider";
  title?: string;
  /** Single-axis payload (base64 PNG strings, without data: prefix). */
  slices?: Record<string, string>;
  sliderPrefix?: string;
  /** Multi-axis payload keyed by x/y/z. */
  axes?: Record<string, ImageSliderAxisContent>;
  initialSlice?: string | number;
  dimensions?: [number, number, number];
  /** Volume layout: Y slider on top, Z and X side-by-side below (like VolumeSliderCard). */
  layout?: "volume" | "stack";
  /** Picking coordinates overlaid on the Z-axis slider (VolumeSliderCard behaviour). */
  coordinates?: VolumeCoordinates;
};

function sortedSliceKeys(slices: Record<string, string>): string[] {
  return Object.keys(slices).sort((left, right) => Number(left) - Number(right));
}

function toDataUrl(base64: string): string {
  if (base64.startsWith("data:")) return base64;
  return `data:image/png;base64,${base64}`;
}

function pointsForSlice(
  coordinates: VolumeCoordinates,
  sliceIndex: number,
  axis: "x" | "y" | "z",
  tolerance = 10,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < coordinates.x.length; i += 1) {
    const axisValue =
      axis === "z" ? coordinates.z[i] : axis === "y" ? coordinates.y[i] : coordinates.x[i];
    if (Math.abs(axisValue - sliceIndex) > tolerance) continue;
    if (axis === "z") {
      points.push([coordinates.x[i], coordinates.y[i]]);
    } else if (axis === "y") {
      points.push([coordinates.x[i], coordinates.z[i]]);
    } else {
      points.push([coordinates.y[i], coordinates.z[i]]);
    }
  }
  return points;
}

function SliceImage({
  imageBase64,
  alt,
  coordinates,
  sliceIndex,
  volumeAxis,
  volumeDimensions,
  showParticles = true,
}: {
  imageBase64: string;
  alt: string;
  coordinates?: VolumeCoordinates;
  sliceIndex: number;
  volumeAxis?: "x" | "y" | "z";
  volumeDimensions?: [number, number, number];
  showParticles?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canOverlayParticles =
    showParticles &&
    coordinates != null &&
    volumeAxis != null &&
    volumeDimensions != null &&
    coordinates.x.length > 0;

  useEffect(() => {
    if (!canOverlayParticles) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const [dimX, dimY] =
        volumeAxis === "z"
          ? [volumeDimensions[0], volumeDimensions[1]]
          : volumeAxis === "y"
            ? [volumeDimensions[0], volumeDimensions[2]]
            : [volumeDimensions[1], volumeDimensions[2]];

      const scaleX = canvas.width / dimX;
      const scaleY = canvas.height / dimY;
      const points = pointsForSlice(coordinates, sliceIndex, volumeAxis);

      for (const [x, y] of points) {
        const px = x * scaleX;
        const py = y * scaleY;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0, 255, 0, 0.9)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };
    image.src = toDataUrl(imageBase64);
  }, [
    canOverlayParticles,
    imageBase64,
    sliceIndex,
    coordinates,
    volumeAxis,
    volumeDimensions,
  ]);

  if (!canOverlayParticles) {
    return (
      <Box
        component="img"
        src={toDataUrl(imageBase64)}
        alt={alt}
        sx={{
          display: "block",
          maxWidth: "100%",
          height: "auto",
        }}
      />
    );
  }

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      role="img"
      aria-label={alt}
      sx={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
      }}
    />
  );
}

function ImageSliderPanel({
  label,
  slices,
  sliderPrefix = "Slice: ",
  initialSlice,
  sliderOnTop = false,
  coordinates,
  volumeAxis,
  volumeDimensions,
  showParticles = true,
}: {
  label?: string;
  slices: Record<string, string>;
  sliderPrefix?: string;
  initialSlice?: string | number;
  sliderOnTop?: boolean;
  coordinates?: VolumeCoordinates;
  volumeAxis?: "x" | "y" | "z";
  volumeDimensions?: [number, number, number];
  showParticles?: boolean;
}) {
  const keys = useMemo(() => sortedSliceKeys(slices), [slices]);
  const defaultIndex = useMemo(() => {
    if (!keys.length) return 0;
    if (initialSlice != null) {
      const idx = keys.indexOf(String(initialSlice));
      if (idx >= 0) return idx;
    }
    return Math.floor(keys.length / 2);
  }, [keys, initialSlice]);

  const [index, setIndex] = useState(defaultIndex);

  useEffect(() => {
    setIndex(defaultIndex);
  }, [defaultIndex, keys.join("|")]);

  if (!keys.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No slices available.
      </Typography>
    );
  }

  const activeKey = keys[Math.min(Math.max(index, 0), keys.length - 1)];
  const sliceIndex = Number(activeKey);
  const imageBase64 = slices[activeKey];

  const slider = (
    <Slider
      size="small"
      min={0}
      max={Math.max(keys.length - 1, 0)}
      step={1}
      value={index}
      onChange={(_, value) => setIndex(Array.isArray(value) ? value[0] : value)}
      sx={{ width: "100%", display: "block", px: 0.5 }}
    />
  );

  return (
    <Box
      sx={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        maxWidth: "100%",
        width: "fit-content",
        gap: 0.75,
      }}
    >
      {label ? (
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      ) : null}
      {sliderOnTop ? slider : null}
      <SliceImage
        imageBase64={imageBase64}
        alt={`${sliderPrefix}${activeKey}`}
        coordinates={coordinates}
        sliceIndex={sliceIndex}
        volumeAxis={volumeAxis}
        volumeDimensions={volumeDimensions}
        showParticles={showParticles}
      />
      {!sliderOnTop ? slider : null}
      <Typography variant="caption" color="text.secondary" align="right">
        {sliderPrefix}
        {activeKey}
      </Typography>
    </Box>
  );
}

function axisContentMap(
  axisEntries: ReadonlyArray<readonly [string, ImageSliderAxisContent]>,
): Record<string, ImageSliderAxisContent> {
  return Object.fromEntries(axisEntries);
}

function VolumeSliderLayout({
  axisEntries,
  initialSlice,
  coordinates,
  volumeDimensions,
  showParticles,
}: {
  axisEntries: ReadonlyArray<readonly [string, ImageSliderAxisContent]>;
  initialSlice?: string | number;
  coordinates?: VolumeCoordinates;
  volumeDimensions?: [number, number, number];
  showParticles: boolean;
}) {
  const byAxis = axisContentMap(axisEntries);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
      }}
    >
      {byAxis.y ? (
        <ImageSliderPanel
          label="Y axis"
          slices={byAxis.y.slices}
          sliderPrefix={byAxis.y.sliderPrefix}
          initialSlice={initialSlice}
          sliderOnTop
        />
      ) : null}
      {byAxis.z || byAxis.x ? (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          {byAxis.z ? (
            <ImageSliderPanel
              label="Z axis"
              slices={byAxis.z.slices}
              sliderPrefix={byAxis.z.sliderPrefix}
              initialSlice={initialSlice}
              coordinates={coordinates}
              volumeAxis="z"
              volumeDimensions={volumeDimensions}
              showParticles={showParticles}
            />
          ) : null}
          {byAxis.x ? (
            <ImageSliderPanel
              label="X axis"
              slices={byAxis.x.slices}
              sliderPrefix={byAxis.x.sliderPrefix}
              initialSlice={initialSlice}
            />
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

export default function TableViewerImageSlider({
  content,
}: {
  content: TableViewerImageSliderContent;
}) {
  const axisEntries = useMemo(() => {
    if (content.axes && Object.keys(content.axes).length > 0) {
      return Object.entries(content.axes).filter(([, axis]) =>
        Object.keys(axis.slices ?? {}).length > 0,
      );
    }
    if (content.slices && Object.keys(content.slices).length > 0) {
      return [["z", { slices: content.slices, sliderPrefix: content.sliderPrefix }]] as const;
    }
    return [];
  }, [content.axes, content.slices, content.sliderPrefix]);

  const useVolumeLayout =
    content.layout === "volume" ||
    (axisEntries.length >= 3 &&
      axisEntries.some(([axis]) => axis === "x") &&
      axisEntries.some(([axis]) => axis === "y") &&
      axisEntries.some(([axis]) => axis === "z"));

  const hasParticles = (content.coordinates?.x.length ?? 0) > 0;
  const [showParticles, setShowParticles] = useState(true);

  useEffect(() => {
    setShowParticles(true);
  }, [content.coordinates?.x.length, content.title]);

  if (!axisEntries.length) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No image slices to display.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
      }}
    >
      {content.dimensions ? (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Volume dimensions (X × Y × Z): {content.dimensions.join(" × ")}
            {hasParticles ? ` · ${content.coordinates!.x.length} particles` : ""}
          </Typography>
          {hasParticles ? (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showParticles}
                  onChange={(_, checked) => setShowParticles(checked)}
                />
              }
              label={
                <Typography variant="caption" color="text.secondary">
                  Show particles
                </Typography>
              }
              sx={{ m: 0 }}
            />
          ) : null}
        </Box>
      ) : hasParticles ? (
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showParticles}
              onChange={(_, checked) => setShowParticles(checked)}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Show particles
            </Typography>
          }
          sx={{ m: 0 }}
        />
      ) : null}
      {useVolumeLayout ? (
        <VolumeSliderLayout
          axisEntries={axisEntries}
          initialSlice={content.initialSlice}
          coordinates={content.coordinates}
          volumeDimensions={content.dimensions}
          showParticles={showParticles}
        />
      ) : (
        axisEntries.map(([axis, axisContent]) => (
          <ImageSliderPanel
            key={axis}
            label={axisEntries.length > 1 ? `${axis.toUpperCase()} axis` : undefined}
            slices={axisContent.slices}
            sliderPrefix={axisContent.sliderPrefix}
            initialSlice={content.initialSlice}
          />
        ))
      )}
    </Box>
  );
}
