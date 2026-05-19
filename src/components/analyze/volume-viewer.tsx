import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  MenuItem,
  Button,
  Paper,
  Slider,
  IconButton,
  Popover,
  Tooltip,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import Plot from "react-plotly.js";
import { useProjectService } from "@/ProjectServiceContext";
import { ZoomIn, Layers3, HelpCircle, BoxIcon, Table as TableLucide, Pause, Play } from "lucide-react";
import GpuVolumeView from "./gpu-volume-view";
import MeshVolumeView from "./mesh-volume-view";
import type { VolumeSurfaceMesh } from "@/services/ProjectService";
import { MetadataViewer } from "./metadata-viewer";
import ExternalViewersBar from "./ExternalViewersBar";

type VolumeViewerProps = {
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
  protocolLabel?: string;
  pointerClass?: string
};

type VolumeLite = { id: string | number; label?: string; name?: string };

type HistogramData = {
  binEdges: number[];
  counts: number[];
};

type ViewMode = "slices" | "map3d" | "metadata";
type ThrMode = "percentile" | "absolute";
type RightTab = "ctrl" | "hist";
type Interp2d = "nearest" | "linear" | "high";
type RenderMode3d = "surface" | "volume";
type SliceLayoutMode = "single" | "triple";

type SliceImageState = {
  url: string | null;
  loading: boolean;
  error: string | null;
};

const DEFAULT_AXIS: "z" | "y" | "x" = "z";
const CMAP_OPTIONS = [
  "viridis",
  "gray",
  "magma",
  "plasma",
  "inferno",
  "cividis",
  "turbo",
];

const HELP_TEXT: Record<string, string> = {
  maxDim3d:
    "Maximum dimension used for the downsampled 3D volume. Higher values look better but are slower.",
  method3d:
    "Downsampling method. Binning averages blocks. Stride skips voxels. None keeps original size (can be heavy).",
  colormap3d: "Colormap applied to the rendered 3D volume.",
  opacity3d:
    "Opacity of the volume along the ray. Higher values make the map more solid.",
  thrMode:
    "Threshold mode. Percentile uses histogram percentiles; Absolute uses real intensity values.",
  thrPct:
    "Percentile threshold range (0–100). The map is rendered between these percentiles.",
  thrAbs:
    "Absolute intensity threshold range. Voxels outside this range are suppressed.",
  surfaceCount:
    "Number of isosurfaces in Plotly fallback. Does not affect GPU raycasting.",
  isoRenderMode3d:
    "Surface loads a real marching-cubes mesh, closer to Chimera/EMAN. Volume renders the density field by GPU raycasting.",
  axis: "Slice axis. Z/Y/X correspond to the 3D volume axes.",
  sliceLayout:
    "Single shows one slice view at a time. Triple shows synchronized orthogonal Z/Y/X views at once.",
  sliceIndex: "Slice index along the selected axis.",
  sliceIndexZ: "Z slice index (XY plane).",
  sliceIndexY: "Y slice index (XZ plane).",
  sliceIndexX: "X slice index (YZ plane).",
  colormap2d: "Colormap used for 2D slice rendering.",
  histogram: "Shows the intensity distribution of the selected volume.",
  interp2d:
    "Interpolation when zooming slices. Nearest for pixel look, Linear for smooth, High for best smoothing.",
  sharpen2d:
    "Applies a light 3×3 sharpening filter to the current slice (frontend only).",
  brightness2d:
    "Adjust brightness for slice display only (percentage around 100% neutral). Does not refetch the slice.",
  contrast2d:
    "Adjust contrast for slice display only (percentage around 100% neutral). Does not refetch the slice.",
  pan2d:
    "Pan single-view slices with Ctrl+drag or middle mouse. Reset with Fit.",
  zoom2d:
    "Mouse wheel zooms single-view slices. Double-click fits and resets pan.",
  surfaceLevel3d:
    "Absolute iso level for the marching-cubes surface. Leave it empty to let the backend choose an automatic level.",
  maxTriangles3d:
    "Maximum number of triangles returned by the backend surface mesh. Higher values preserve more detail but are heavier.",
};

const SliceSlider = styled(Slider)(({ theme }) => ({
  height: 4,
  paddingTop: 14,
  paddingBottom: 30,
  "& .MuiSlider-thumb": { width: 14, height: 14 },
  "& .MuiSlider-valueLabel": {
    top: "unset",
    bottom: -26,
    transform: "translateY(0) scale(1)",
    background: "transparent",
    color: theme.palette.text.secondary,
    fontSize: "0.75rem",
    fontWeight: 500,
    "&:before": { display: "none" },
  },
  "& .MuiSlider-valueLabel.MuiSlider-valueLabelOpen": {
    transform: "translateY(0) scale(1)",
  },
}));

export default function VolumeViewer({
  projectId,
  protocolId,
  outputName,
  pointerClass,
}: VolumeViewerProps) {
  const svc = useProjectService();

  const projectIdNum = useMemo(() => Number(projectId), [projectId]);
  const protocolIdNum = useMemo(() => Number(protocolId), [protocolId]);
  const pClass = useMemo(() => String(pointerClass), [pointerClass]);

  const canOpenMetadata = useMemo(() => {
    return Number.isFinite(projectIdNum) && Number.isFinite(protocolIdNum);
  }, [projectIdNum, protocolIdNum]);

  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<VolumeLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);
  const [showHistogram, setShowHistogram] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("slices");
  const [rightTab, setRightTab] = useState<RightTab>("ctrl");

  const [sliceLayoutMode, setSliceLayoutMode] =
    useState<SliceLayoutMode>("triple");

  const [axis, setAxis] = useState<"z" | "y" | "x">(DEFAULT_AXIS);
  const [sliceIndex, setSliceIndex] = useState(0);
  const throttledSliceIndex = useThrottledValue(sliceIndex, 200);

  const [sliceIndexZ, setSliceIndexZ] = useState(0);
  const [sliceIndexY, setSliceIndexY] = useState(0);
  const [sliceIndexX, setSliceIndexX] = useState(0);

  const throttledSliceIndexZ = useThrottledValue(sliceIndexZ, 200);
  const throttledSliceIndexY = useThrottledValue(sliceIndexY, 200);
  const throttledSliceIndexX = useThrottledValue(sliceIndexX, 200);

  const [colormap, setColormap] = useState<string>("viridis");
  const [interp2d, setInterp2d] = useState<Interp2d>("linear");
  const [sharpen2d, setSharpen2d] = useState(false);
  const [brightness2d, setBrightness2d] = useState(0);
  const [contrast2d, setContrast2d] = useState(1);

  const [pan2d, setPan2d] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [_, setLoadingSlice] = useState(false);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [sliceReloadNonce, setSliceReloadNonce] = useState(0);
  const bumpSliceReload = useCallback(() => {
    setSliceReloadNonce((n) => n + 1);
  }, []);

  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<{
    dims: { x: number; y: number; z: number };
    values: number[];
    order: "zyx" | "xyz";
    min?: number;
    max?: number;
  } | null>(null);

  const [surfaceMesh, setSurfaceMesh] = useState<VolumeSurfaceMesh | null>(null);
  const [surfaceLevel3d, setSurfaceLevel3d] = useState<number | null>(null);
  const [surfaceResolvedLevel, setSurfaceResolvedLevel] = useState<number | null>(null);
  const [maxTriangles3d, setMaxTriangles3d] = useState(350000);

  const [maxDim3d, setMaxDim3d] = useState(192);
  const [method3d, setMethod3d] = useState<"binning" | "stride" | "none">(
    "stride",
  );

  const [surfaceCount, setSurfaceCount] = useState(3);
  const [opacity3d, setOpacity3d] = useState(1);
  const [colormap3d, setColormap3d] = useState<string>("viridis");

  const [thrMode, setThrMode] = useState<ThrMode>("percentile");
  const [thrPct, setThrPct] = useState<[number, number]>([55, 98]);
  const [thrAbs, setThrAbs] = useState<[number, number]>([0, 1]);

  const [renderMode3d, setRenderMode3d] =
    useState<RenderMode3d>("surface");

  const lastLoadedRef = useRef<{
    volumeId: string | number | null;
    maxDim: number;
    method: "binning" | "stride" | "none";
    renderMode: RenderMode3d;
    surfaceLevel: number | null;
    maxTriangles: number;
  }>({
    volumeId: null,
    maxDim: 192,
    method: "stride",
    renderMode: "surface",
    surfaceLevel: null,
    maxTriangles: 350000,
  });

  const lastThrVolumeRef = useRef<string | number | null>(null);

  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const [helpKey, setHelpKey] = useState<string | null>(null);

  const openHelp = (key: string) => (e: React.MouseEvent<HTMLElement>) => {
    setHelpKey(key);
    setHelpAnchor(e.currentTarget);
  };
  const closeHelp = () => {
    setHelpAnchor(null);
    setHelpKey(null);
  };

  const [autoRotate3d, setAutoRotate3d] = useState(false);

  // stopAutoRotateWhenLeaving3d
  useEffect(() => {
    if (viewMode !== "map3d") {
      setAutoRotate3d(false);
    }
  }, [viewMode]);

  const plotlyAnimHandleRef = useRef<number | null>(null);
  const plotlyAnimAngleRef = useRef(0);
  const [plotlyAnimTick, setPlotlyAnimTick] = useState(0);

  useEffect(() => {
    const shouldAnimatePlotly =
      viewMode === "map3d" &&
      renderMode3d === "volume" &&
      autoRotate3d &&
      (gpuError || !mapData);

    if (!shouldAnimatePlotly) {
      if (plotlyAnimHandleRef.current != null) {
        window.clearInterval(plotlyAnimHandleRef.current);
        plotlyAnimHandleRef.current = null;
      }
      return;
    }

    if (plotlyAnimHandleRef.current != null) {
      window.clearInterval(plotlyAnimHandleRef.current);
    }

    plotlyAnimHandleRef.current = window.setInterval(() => {
      plotlyAnimAngleRef.current += 0.03;

      const prev = plotlyCameraRef.current ?? {};
      const prevEye = prev?.eye ?? { x: 1.6, y: 1.2, z: 1.4 };

      const r = Math.max(
        0.8,
        Math.sqrt((prevEye.x ?? 0) * (prevEye.x ?? 0) + (prevEye.y ?? 0) * (prevEye.y ?? 0)) || 1.8,
      );
      const z = Number.isFinite(prevEye.z) ? prevEye.z : 1.4;

      const a = plotlyAnimAngleRef.current;
      plotlyCameraRef.current = {
        ...prev,
        eye: {
          x: r * Math.cos(a),
          y: r * Math.sin(a),
          z,
        },
      };

      setPlotlyAnimTick((t) => (t + 1) % 1000000);
    }, 33);

    return () => {
      if (plotlyAnimHandleRef.current != null) {
        window.clearInterval(plotlyAnimHandleRef.current);
        plotlyAnimHandleRef.current = null;
      }
    };
  }, [viewMode, renderMode3d, autoRotate3d, gpuError, mapData]);

  useEffect(() => {
    setSurfaceMesh(null);
    setSurfaceResolvedLevel(null);
    setSurfaceLevel3d(null);
    setGpuError(null);
  }, [selectedId]);

  useEffect(() => {
    setRightTab("ctrl");
    setShowHistogram(false);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        setListError(null);
        const items = await svc.listOutputVolumes(
          projectId,
          protocolId,
          outputName,
        );
        if (cancelled) return;
        const mapped: VolumeLite[] = (items || []).map((v: any, i: number) => ({
          id: v?.id ?? i,
          label: v?.label ?? v?.name ?? `Volume ${v?.id ?? i}`,
          name: v?.name,
        }));
        setVolumes(mapped);
        setSelectedId((prev) => {
          const exists = mapped.find(
            (m) => String(m.id) === String(prev ?? -999),
          );
          return exists ? (prev as any) : mapped[0]?.id ?? null;
        });
      } catch (e: any) {
        if (!cancelled) setListError(e?.message || "Failed to list volumes");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, protocolId, outputName, svc]);

  useEffect(() => {
    if (selectedId == null) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setMetaLoading(true);
        setMetaError(null);
        const info = await svc.getVolumeInfo(
          projectId,
          protocolId,
          outputName,
          selectedId,
        );
        if (cancelled) return;
        setMeta(info || null);
      } catch (e: any) {
        if (!cancelled)
          setMetaError(e?.message || "Failed to fetch volume info");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, projectId, protocolId, outputName, svc]);

  useEffect(() => {
    if (!showHistogram || selectedId == null) {
      setHistogram(null);
      setHistError(null);
      setHistLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setHistLoading(true);
        setHistError(null);

        const h = await svc.getVolumeHistogram(
          projectId,
          protocolId,
          outputName,
          selectedId,
        );
        if (cancelled) return;

        const raw: any = h ?? {};
        const binEdges: number[] =
          raw.binEdges ?? raw.bin_edges ?? raw.bins ?? [];
        const counts: number[] = raw.counts ?? raw.values ?? [];

        setHistogram({ binEdges, counts });
      } catch (e: any) {
        if (!cancelled) {
          setHistError(e?.message || "Failed to load histogram");
          setHistogram(null);
        }
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showHistogram, selectedId, projectId, protocolId, outputName, svc]);

  const dims = useMemo(() => getDimsZYXtoXYZ(meta), [meta]);

  const maxSlice = Math.max(0, dims[axis] - 1);
  const maxSliceZ = Math.max(0, dims.z - 1);
  const maxSliceY = Math.max(0, dims.y - 1);
  const maxSliceX = Math.max(0, dims.x - 1);

  useEffect(() => {
    const mid = Math.max(0, Math.floor(maxSlice / 2));
    setSliceIndex(mid);
  }, [selectedId, axis, maxSlice]);

  useEffect(() => {
    setSliceIndexZ(Math.max(0, Math.floor(maxSliceZ / 2)));
    setSliceIndexY(Math.max(0, Math.floor(maxSliceY / 2)));
    setSliceIndexX(Math.max(0, Math.floor(maxSliceX / 2)));
  }, [selectedId, maxSliceZ, maxSliceY, maxSliceX]);

  const readySlices = selectedId != null && !!meta && dims[axis] > 0;
  const readyTripleSlices =
    selectedId != null && !!meta && dims.x > 0 && dims.y > 0 && dims.z > 0;

  useEffect(() => {
    if (viewMode === "slices" && (readySlices || readyTripleSlices)) {
      bumpSliceReload();
    }
  }, [viewMode, readySlices, readyTripleSlices, bumpSliceReload]);

  useEffect(() => {
    setZoomMul(1);
    setPan2d({ x: 0, y: 0 });
  }, [selectedId, axis]);

  useEffect(() => {
    if (
      !readySlices ||
      viewMode !== "slices" ||
      sliceLayoutMode !== "single"
    ) {
      setImgError(null);
      return;
    }

    const idx = Math.max(0, Math.min(throttledSliceIndex, maxSlice));

    abortRef.current?.abort();
    const myAbort = new AbortController();
    abortRef.current = myAbort;

    const myReq = ++reqIdRef.current;
    setImgError(null);

    (async () => {
      try {
        setLoadingSlice(true);
        const { url, revoke } = await svc.fetchVolumeSliceObjectUrl(
          projectId,
          protocolId,
          outputName,
          selectedId!,
          idx,
          { axis, cmap: colormap, signal: myAbort.signal },
        );

        if (reqIdRef.current !== myReq) {
          revoke();
          return;
        }

        setFrontUrl((prev) => {
          if (prev && prev !== url) {
            // Previous URL can be revoked by the service if needed.
          }
          return url;
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (reqIdRef.current === myReq) {
          setImgError(e?.message || "Failed to render slice");
        }
      } finally {
        if (reqIdRef.current === myReq) setLoadingSlice(false);
      }
    })();

    return () => {
      myAbort.abort();
    };
  }, [
    readySlices,
    viewMode,
    sliceLayoutMode,
    throttledSliceIndex,
    axis,
    colormap,
    selectedId,
    maxSlice,
    projectId,
    protocolId,
    outputName,
    svc,
    sliceReloadNonce,
  ]);

  const zSlice = useVolumeSliceImage({
    enabled: viewMode === "slices" && sliceLayoutMode === "triple" && readyTripleSlices,
    svc,
    projectId,
    protocolId,
    outputName,
    volumeId: selectedId,
    axis: "z",
    sliceIndex: throttledSliceIndexZ,
    maxSlice: maxSliceZ,
    colormap,
    reloadKey: sliceReloadNonce,
  });

  const ySlice = useVolumeSliceImage({
    enabled: viewMode === "slices" && sliceLayoutMode === "triple" && readyTripleSlices,
    svc,
    projectId,
    protocolId,
    outputName,
    volumeId: selectedId,
    axis: "y",
    sliceIndex: throttledSliceIndexY,
    maxSlice: maxSliceY,
    colormap,
    reloadKey: sliceReloadNonce,
  });

  const xSlice = useVolumeSliceImage({
    enabled: viewMode === "slices" && sliceLayoutMode === "triple" && readyTripleSlices,
    svc,
    projectId,
    protocolId,
    outputName,
    volumeId: selectedId,
    axis: "x",
    sliceIndex: throttledSliceIndexX,
    maxSlice: maxSliceX,
    colormap,
    reloadKey: sliceReloadNonce,
  });

  const load3d = useCallback(async () => {
    if (selectedId == null) return;

    setMapLoading(true);
    setMapError(null);
    setGpuError(null);

    try {
      if (renderMode3d === "surface") {
        const mesh = await svc.getVolumeSurfaceMesh(
          projectId,
          protocolId,
          outputName,
          selectedId,
          {
            level: surfaceLevel3d,
            maxDim: maxDim3d,
            method: method3d,
            maxTriangles: maxTriangles3d,
          },
        );

        setSurfaceMesh(mesh);
        setSurfaceResolvedLevel(
          Number.isFinite(mesh?.level) ? Number(mesh.level) : null,
        );
        setMapData(null);

        lastLoadedRef.current = {
          volumeId: selectedId,
          maxDim: maxDim3d,
          method: method3d,
          renderMode: renderMode3d,
          surfaceLevel: surfaceLevel3d,
          maxTriangles: maxTriangles3d,
        };

        return;
      }

      const raw = await svc.getVolumeData3d(
        projectId,
        protocolId,
        outputName,
        selectedId,
        { maxDim: maxDim3d, method: method3d },
      );

      const parsed = normalize3dPayload(raw);

      setMapData(parsed);
      setSurfaceMesh(null);
      setSurfaceResolvedLevel(null);

      lastLoadedRef.current = {
        volumeId: selectedId,
        maxDim: maxDim3d,
        method: method3d,
        renderMode: renderMode3d,
        surfaceLevel: surfaceLevel3d,
        maxTriangles: maxTriangles3d,
      };
    } catch (e: any) {
      setMapError(e?.message || "Failed to load 3D data");
      setMapData(null);
      setSurfaceMesh(null);
      setSurfaceResolvedLevel(null);
    } finally {
      setMapLoading(false);
    }
  }, [
    selectedId,
    svc,
    projectId,
    protocolId,
    outputName,
    maxDim3d,
    method3d,
    renderMode3d,
    surfaceLevel3d,
    maxTriangles3d,
  ]);

  useEffect(() => {
    if (viewMode !== "map3d") return;
    if (selectedId == null) return;

    const last = lastLoadedRef.current;
    if (last.volumeId !== selectedId || last.renderMode !== renderMode3d) {
      load3d();
    }
  }, [viewMode, selectedId, renderMode3d, load3d]);

  const dataDirty = useMemo(() => {
    const last = lastLoadedRef.current;

    return (
      viewMode === "map3d" &&
      selectedId != null &&
      (last.volumeId !== selectedId ||
        last.maxDim !== maxDim3d ||
        last.method !== method3d ||
        last.renderMode !== renderMode3d ||
        last.surfaceLevel !== surfaceLevel3d ||
        last.maxTriangles !== maxTriangles3d)
    );
  }, [
    viewMode,
    selectedId,
    maxDim3d,
    method3d,
    renderMode3d,
    surfaceLevel3d,
    maxTriangles3d,
  ]);

  const sortedValues = useMemo(() => {
    if (!mapData?.values?.length) return null;
    const clean = mapData.values.filter((n) => Number.isFinite(n));
    if (clean.length === 0) return null;
    clean.sort((a, b) => a - b);
    return clean;
  }, [mapData]);

  const stats3d = useMemo(() => {
    if (!sortedValues || sortedValues.length === 0) return null;
    return { min: sortedValues[0], max: sortedValues[sortedValues.length - 1] };
  }, [sortedValues]);

  useEffect(() => {
    if (!sortedValues || selectedId == null) return;
    if (lastThrVolumeRef.current === selectedId) return;

    const loAbs = percentileFromSorted(sortedValues, 55);
    const hiAbs = percentileFromSorted(sortedValues, 98);

    setThrPct([55, 98]);
    setThrAbs([loAbs, hiAbs]);
    lastThrVolumeRef.current = selectedId;
  }, [sortedValues, selectedId]);

  const thrPctAbs = useMemo(() => {
    if (!sortedValues) return null;
    const lo = percentileFromSorted(sortedValues, thrPct[0]);
    const hi = percentileFromSorted(sortedValues, thrPct[1]);
    return [lo, hi] as [number, number];
  }, [sortedValues, thrPct]);

  const isoRange3d = useMemo(() => {
    if (!stats3d) return null;
    if (thrMode === "percentile") return thrPctAbs;
    const lo = Math.min(thrAbs[0], thrAbs[1]);
    const hi = Math.max(thrAbs[0], thrAbs[1]);
    return [lo, hi] as [number, number];
  }, [thrMode, thrPctAbs, thrAbs, stats3d]);

  const plotlyCameraRef = useRef<any>(null);
  const handleRelayout = useCallback((ev: any) => {
    const cam = ev?.["scene.camera"] ?? ev?.scene?.camera;
    if (cam) plotlyCameraRef.current = cam;
  }, []);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [naturalW, setNaturalW] = useState<number | null>(null);
  const [naturalH, setNaturalH] = useState<number | null>(null);
  const [zoomMul, setZoomMul] = useState(1);
  const MIN_MUL = 0.25;
  const MAX_MUL = 4;

  const { width: vw, height: vh } = useElementSize(viewerRef);

  const fitScale = useMemo(() => {
    if (!naturalW || !naturalH || !vw || !vh) return 1;
    const sx = vw / naturalW;
    const sy = vh / naturalH;
    return Math.min(sx, sy);
  }, [naturalW, naturalH, vw, vh]);

  const renderScale = useMemo(() => fitScale * zoomMul, [fitScale, zoomMul]);

  const applyZoom = (mul: number) =>
    setZoomMul(() => Math.min(MAX_MUL, Math.max(MIN_MUL, mul)));
  const stepZoom = (factor: number) => applyZoom(zoomMul * factor);
  const fitZoom = () => {
    applyZoom(1);
    setPan2d({ x: 0, y: 0 });
  };

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (
        viewMode !== "slices" ||
        sliceLayoutMode !== "single" ||
        !frontUrl
      ) {
        return;
      }
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      stepZoom(factor);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewMode, sliceLayoutMode, frontUrl, zoomMul]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    let panning = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (
        viewMode !== "slices" ||
        sliceLayoutMode !== "single" ||
        !frontUrl
      ) {
        return;
      }
      const isMiddle = e.button === 1;
      if (!e.ctrlKey && !isMiddle) return;

      panning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      (el as any).setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      setPan2d((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!panning) return;
      panning = false;
      (el as any).releasePointerCapture?.(e.pointerId);
      el.style.cursor = "default";
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("pointerleave", onPointerUp);
    };
  }, [viewMode, sliceLayoutMode, frontUrl]);

  const handleMeshError = useCallback((msg: string) => {
    setGpuError(msg);
  }, []);

  const panelBasis = 340;

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: 270,
          borderRight: "1px solid #eee",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: 1.5, flexShrink: 0 }}>
          <Typography variant="subtitle2">Volumes</Typography>
          <Typography variant="caption" color="text.secondary">
            {loadingList ? "" : `${volumes.length} item(s)`}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {loadingList ? (
            <Box sx={{ p: 2, display: "flex", gap: 1, alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2"></Typography>
            </Box>
          ) : listError ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="error">
                {listError}
              </Typography>
            </Box>
          ) : volumes.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No volumes in this output.
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {volumes.map((v) => {
                const selected = String(selectedId) === String(v.id);
                return (
                  <ListItemButton
                    key={String(v.id)}
                    selected={selected}
                    onClick={() => setSelectedId(v.id)}
                    sx={{ px: 1.5, py: 1 }}
                  >
                    <ListItemText
                      primaryTypographyProps={{
                        variant: "body2",
                        noWrap: true,
                      }}
                      primary={v.label || `Volume ${String(v.id)}`}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Paper
          elevation={0}
          square
          sx={{ p: 0.75, borderBottom: "1px solid #eee", flexShrink: 0 }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              columnGap: 1.5,
              rowGap: 0.75,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={viewMode}
                onChange={(_, v) => v && setViewMode(v)}
              >
                <ToggleButton value="slices">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <Layers3 size={14} />
                    Slices
                  </Box>
                </ToggleButton>
                <ToggleButton value="map3d">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <BoxIcon size={14} />
                    3D Map
                  </Box>
                </ToggleButton>
                {pClass.toLowerCase().startsWith('setof') && (
                  <ToggleButton value="metadata" disabled={!canOpenMetadata}>
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                      <TableLucide size={14} />
                      Metadata
                    </Box>
                  </ToggleButton>
                )}

              </ToggleButtonGroup>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 0.75,
                flexWrap: "wrap",
                minWidth: 0,
              }}
            >
              <ExternalViewersBar
                projectId={projectId}
                protocolId={protocolId}
                outputName={outputName}
                objectId={selectedId}
                objectKind="volume"
                disabled={selectedId == null}
              />

              {viewMode === "map3d" && (
                <Tooltip title={autoRotate3d ? "Pause rotation" : "Play rotation"}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => setAutoRotate3d((v) => !v)}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1.5,
                      }}
                    >
                      {autoRotate3d ? <Pause size={16} /> : <Play size={16} />}
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "default",
                    opacity:
                      viewMode === "slices" && sliceLayoutMode === "single"
                        ? 1
                        : 0.4,
                  }}
                >
                  <ZoomIn size={14} style={{ opacity: 0.6 }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontVariantNumeric: "tabular-nums",
                      minWidth: "5ch",
                      textAlign: "right",
                    }}
                  >
                    {Math.round(zoomMul * 100)}%
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Paper>

        <Box sx={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <Box
              ref={viewerRef}
              onDoubleClick={
                viewMode === "slices" && sliceLayoutMode === "single"
                  ? fitZoom
                  : undefined
              }
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                alignItems: viewMode === "metadata" ? "stretch" : "center",
                justifyContent: viewMode === "metadata" ? "stretch" : "center",
                p: viewMode === "metadata" ? 0 : 1.0,
                overflow: viewMode === "metadata" ? "auto" : "hidden",
                position: "relative",
                cursor: "default",
                bgcolor: "background.default",
              }}
              title={
                viewMode === "slices" && sliceLayoutMode === "single"
                  ? "Wheel: zoom | Ctrl+drag: pan | Double-click: fit"
                  : undefined
              }
            >
              {metaLoading ? (
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2"></Typography>
                </Box>
              ) : metaError ? (
                <Typography variant="body2" color="error">
                  {metaError}
                </Typography>
              ) : selectedId == null ? (
                <Typography variant="body2" color="text.secondary">
                  Select a volume
                </Typography>
              ) : viewMode === "metadata" ? (
                <Box sx={{ width: "100%", height: "100%", minHeight: 0 }}>
                  {canOpenMetadata ? (
                    <MetadataViewer
                      projectId={projectIdNum}
                      protocolId={protocolIdNum}
                      outputName={outputName}
                      onClose={() => setViewMode("slices")}
                      embedded={true}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Metadata view requires numeric projectId/protocolId.
                    </Typography>
                  )}
                </Box>
              ) : viewMode === "slices" ? (
                sliceLayoutMode === "triple" ? (
                  <OrthoSlicesGrid
                    dims={dims}
                    zSlice={zSlice}
                    ySlice={ySlice}
                    xSlice={xSlice}
                    sliceIndexX={sliceIndexX}
                    sliceIndexY={sliceIndexY}
                    sliceIndexZ={sliceIndexZ}
                    brightness={brightness2d}
                    contrast={contrast2d}
                  />
                ) : imgError ? (
                  <Typography variant="body2" color="error">
                    {imgError}
                  </Typography>
                ) : frontUrl ? (
                  <>
                    <SlicesCanvas
                      url={frontUrl}
                      containerW={vw}
                      containerH={vh}
                      scale={renderScale}
                      pan={pan2d}
                      interp={interp2d}
                      sharpen={sharpen2d}
                      brightness={brightness2d}
                      contrast={contrast2d}
                      onNaturalSize={(w, h) => {
                        setNaturalW(w);
                        setNaturalH(h);
                      }}
                    />
                    <SlicesStatusBar
                      axis={axis}
                      sliceIndex={sliceIndex}
                      maxSlice={maxSlice}
                      zoomMul={zoomMul}
                      colormap={colormap}
                      interp={interp2d}
                      sharpen={sharpen2d}
                      brightness={brightness2d}
                      contrast={contrast2d}
                    />
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No image
                  </Typography>
                )
              ) : mapLoading ? (
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2">Loading 3D volume…</Typography>
                </Box>
              ) : mapError ? (
                <Typography variant="body2" color="error">
                  {mapError}
                </Typography>
              ) : renderMode3d === "surface" && surfaceMesh && !gpuError ? (
                <MeshVolumeView
                  mesh={surfaceMesh}
                  opacity={opacity3d}
                  colormap={colormap3d}
                  autoRotate={autoRotate3d}
                  autoRotateSpeed={3.8}
                  onError={handleMeshError}
                />
              ) : renderMode3d === "surface" && gpuError ? (
                <Typography variant="body2" color="error">
                  {gpuError}
                </Typography>
              ) : renderMode3d === "volume" && mapData && stats3d && isoRange3d && !gpuError ? (
                <GpuVolumeView
                  values={mapData.values}
                  dims={mapData.dims}
                  order={mapData.order}
                  spacing={meta?.spacing}
                  rangeMin={stats3d.min}
                  rangeMax={stats3d.max}
                  isoMin={isoRange3d[0]}
                  isoMax={isoRange3d[1]}
                  opacity={opacity3d}
                  colormap={colormap3d}
                  renderMode="volume"
                  autoRotate={autoRotate3d}
                  autoRotateSpeed={3.8}
                  onError={(msg) => setGpuError(msg)}
                />
              ) : renderMode3d === "volume" && mapData && stats3d && isoRange3d ? (
                <Box sx={{ width: "100%", height: "100%" }}>
                  {(() => {
                    const plotProps: any = {
                      data: [
                        {
                          type: "isosurface",
                          value: mapData.values,
                          isomin: isoRange3d[0],
                          isomax: isoRange3d[1],
                          surface: { count: surfaceCount },
                          caps: { x: { show: false }, y: { show: false }, z: { show: false } },
                          opacity: opacity3d,
                          colorscale: toPlotlyColorscale(colormap3d),
                          showscale: false,
                        } as any,
                      ],
                      layout: {
                        autosize: true,
                        margin: { l: 0, r: 0, t: 0, b: 0 },
                        scene: {
                          aspectmode: "data",
                          xaxis: { visible: false },
                          yaxis: { visible: false },
                          zaxis: { visible: false },
                          camera: plotlyCameraRef.current ?? undefined,
                        },
                        showlegend: false,
                      },
                      style: { width: "100%", height: "100%" },
                      useResizeHandler: true,
                      config: { displaylogo: false, responsive: true, scrollZoom: true },
                      onRelayout: handleRelayout,
                    };

                    void plotlyAnimTick;
                    return <Plot {...plotProps} />;
                  })()}
                </Box>
              ) : gpuError ? (
                <Typography variant="body2" color="error">
                  {gpuError}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No 3D data. Press Reload.
                </Typography>
              )}
            </Box>
            {viewMode !== "metadata" && (
              <>
                <Divider />
                <Box sx={{ p: 1.0, display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
                  <MetaItem label="Dims" value={dimsToStringXYZ(dims)} />
                  {"min" in (meta || {}) && <MetaItem label="Min" value={num(meta?.min)} />}
                  {"max" in (meta || {}) && <MetaItem label="Max" value={num(meta?.max)} />}
                  {"mean" in (meta || {}) && <MetaItem label="Mean" value={num(meta?.mean)} />}
                  {"std" in (meta || {}) && <MetaItem label="Std" value={num(meta?.std)} />}
                  {viewMode === "map3d" && mapData?.dims && (
                    <MetaItem
                      label="Downsampled"
                      value={`${mapData.dims.x} × ${mapData.dims.y} × ${mapData.dims.z}`}
                    />
                  )}
                  {viewMode === "map3d" && renderMode3d === "surface" && surfaceMesh && (
                    <>
                      <MetaItem
                        label="Surface"
                        value={`${surfaceMesh.vertexCount} vertices / ${surfaceMesh.triangleCount} tris`}
                      />
                      <MetaItem
                        label="Level"
                        value={formatSci(surfaceResolvedLevel ?? surfaceMesh.level)}
                      />
                    </>
                  )}
                </Box>
              </>
            )}
          </Box>

          {viewMode !== "metadata" && (
            <>
              <Divider orientation="vertical" flexItem />
              <Box
                sx={{
                  flexBasis: panelBasis,
                  flexShrink: 0,
                  minWidth: panelBasis,
                  maxWidth: panelBasis,
                  p: 1.25,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "background.paper",
                  gap: 1,
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={rightTab}
                  onChange={(_, v) => {
                    if (!v) return;
                    setRightTab(v);
                    setShowHistogram(v === "hist");
                  }}
                  sx={{ flexShrink: 0 }}
                >
                  <ToggleButton value="ctrl">Controls</ToggleButton>
                  <ToggleButton value="hist">Histogram</ToggleButton>
                </ToggleButtonGroup>

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    pr: 1,
                    pb: 2,
                    mt: 1,
                  }}
                >
                  {rightTab === "ctrl" && viewMode === "slices" && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, ml: 1 }}>
                      <SectionTitle title="Slices" />

                      <ParamRow
                        label="Layout"
                        helpKey="sliceLayout"
                        onHelp={openHelp}
                        control={
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={sliceLayoutMode}
                            onChange={(_, v) => v && setSliceLayoutMode(v)}
                          >
                            <ToggleButton value="single">single</ToggleButton>
                            <ToggleButton value="triple">3 Views</ToggleButton>
                          </ToggleButtonGroup>
                        }
                      />

                      {sliceLayoutMode === "single" ? (
                        <>
                          <ParamRow
                            label="Axis"
                            helpKey="axis"
                            onHelp={openHelp}
                            control={
                              <ToggleButtonGroup
                                size="small"
                                value={axis}
                                exclusive
                                onChange={(_, v) => v && setAxis(v)}
                              >
                                <ToggleButton value="z">Z</ToggleButton>
                                <ToggleButton value="y">Y</ToggleButton>
                                <ToggleButton value="x">X</ToggleButton>
                              </ToggleButtonGroup>
                            }
                          />

                          <AxisSliceSliderControl
                            title="Slice"
                            helpKey="sliceIndex"
                            onHelp={openHelp}
                            value={Math.min(sliceIndex, maxSlice)}
                            min={0}
                            max={maxSlice}
                            onChange={(v) => setSliceIndex(v)}
                            disabled={!readySlices}
                          />
                        </>
                      ) : (
                        <>
                          <AxisSliceSliderControl
                            title="Slice Z"
                            helpKey="sliceIndexZ"
                            onHelp={openHelp}
                            value={Math.min(sliceIndexZ, maxSliceZ)}
                            min={0}
                            max={maxSliceZ}
                            onChange={(v) => setSliceIndexZ(v)}
                            disabled={!readyTripleSlices}
                          />
                          <AxisSliceSliderControl
                            title="Slice Y"
                            helpKey="sliceIndexY"
                            onHelp={openHelp}
                            value={Math.min(sliceIndexY, maxSliceY)}
                            min={0}
                            max={maxSliceY}
                            onChange={(v) => setSliceIndexY(v)}
                            disabled={!readyTripleSlices}
                          />
                          <AxisSliceSliderControl
                            title="Slice X"
                            helpKey="sliceIndexX"
                            onHelp={openHelp}
                            value={Math.min(sliceIndexX, maxSliceX)}
                            min={0}
                            max={maxSliceX}
                            onChange={(v) => setSliceIndexX(v)}
                            disabled={!readyTripleSlices}
                          />
                        </>
                      )}

                      <ParamRow
                        label="Colormap"
                        helpKey="colormap2d"
                        onHelp={openHelp}
                        control={
                          <TextField
                            size="small"
                            select
                            value={colormap}
                            onChange={(e) => setColormap(e.target.value)}
                            SelectProps={{ MenuProps: { disablePortal: true } }}
                          >
                            {CMAP_OPTIONS.map((cm) => (
                              <MenuItem key={cm} value={cm}>{cm}</MenuItem>
                            ))}
                          </TextField>
                        }
                      />

                      <ParamRow
                        label="Interpolation"
                        helpKey="interp2d"
                        onHelp={openHelp}
                        control={
                          <TextField
                            size="small"
                            select
                            value={interp2d}
                            disabled={sliceLayoutMode === "triple"}
                            onChange={(e) => setInterp2d(e.target.value as Interp2d)}
                            SelectProps={{ MenuProps: { disablePortal: true } }}
                          >
                            <MenuItem value="nearest">nearest</MenuItem>
                            <MenuItem value="linear">linear</MenuItem>
                            <MenuItem value="high">high</MenuItem>
                          </TextField>
                        }
                      />

                      <ParamRow
                        label="Sharpen"
                        helpKey="sharpen2d"
                        onHelp={openHelp}
                        control={
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={sharpen2d ? "on" : "off"}
                            disabled={sliceLayoutMode === "triple"}
                            onChange={(_, v) => {
                              if (v === "on") setSharpen2d(true);
                              if (v === "off") setSharpen2d(false);
                            }}
                          >
                            <ToggleButton value="off">off</ToggleButton>
                            <ToggleButton value="on">on</ToggleButton>
                          </ToggleButtonGroup>
                        }
                      />

                      <Divider />

                      <SectionTitle title="Display" />

                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mt: 0.5,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Intensity
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => {
                            setBrightness2d(0);
                            setContrast2d(1);
                          }}
                        >
                          Reset
                        </Button>
                      </Box>

                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                          <Typography variant="caption" color="text.secondary">
                            Brightness
                          </Typography>
                          <IconButton size="small" onClick={openHelp("brightness2d")}>
                            <HelpCircle size={14} />
                          </IconButton>
                        </Box>
                        <Slider
                          size="small"
                          value={brightness2d}
                          min={-1}
                          max={1}
                          step={0.02}
                          onChange={(_, v) => setBrightness2d(v as number)}
                          valueLabelDisplay="auto"
                          valueLabelFormat={(v) =>
                            `${Math.round((1 + (v as number)) * 100)}%`
                          }
                        />
                      </Box>

                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
                          <Typography variant="caption" color="text.secondary">
                            Contrast
                          </Typography>
                          <IconButton size="small" onClick={openHelp("contrast2d")}>
                            <HelpCircle size={14} />
                          </IconButton>
                        </Box>
                        <Slider
                          size="small"
                          value={contrast2d}
                          min={0.5}
                          max={2}
                          step={0.02}
                          onChange={(_, v) => setContrast2d(v as number)}
                          valueLabelDisplay="auto"
                          valueLabelFormat={(v) =>
                            `${Math.round((v as number) * 100)}%`
                          }
                        />
                      </Box>

                      <Divider />

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={fitZoom}
                        disabled={sliceLayoutMode !== "single"}
                        sx={{ textTransform: "none" }}
                      >
                        Fit + reset pan
                      </Button>

                      <Typography variant="caption" color="text.secondary">
                        {sliceLayoutMode === "single"
                          ? "Pan: Ctrl+drag or middle mouse"
                          : "Triple view: synchronized orthogonal slices (Z/Y/X)"}
                      </Typography>
                    </Box>
                  )}

                  {rightTab === "ctrl" && viewMode === "map3d" && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, marginRight: "12px" }}>
                      <SectionTitle title="Data" />
                      <ParamRow
                        label="maxDim"
                        helpKey="maxDim3d"
                        onHelp={openHelp}
                        control={
                          <TextField
                            size="small"
                            type="number"
                            value={maxDim3d}
                            onChange={(e) => setMaxDim3d(clampInt(e.target.value, 48, 256))}
                            inputProps={{ min: 48, max: 256, step: 8 }}
                          />
                        }
                      />
                      <ParamRow
                        label="Method"
                        helpKey="method3d"
                        onHelp={openHelp}
                        control={
                          <TextField
                            size="small"
                            select
                            value={method3d}
                            onChange={(e) => setMethod3d(e.target.value as any)}
                            SelectProps={{ MenuProps: { disablePortal: true } }}
                          >
                            <MenuItem value="binning">binning</MenuItem>
                            <MenuItem value="stride">stride</MenuItem>
                            <MenuItem value="none">none</MenuItem>
                          </TextField>
                        }
                      />
                      {renderMode3d === "surface" && (
                        <ParamRow
                          label="Max triangles"
                          helpKey="maxTriangles3d"
                          onHelp={openHelp}
                          control={
                            <TextField
                              size="small"
                              type="number"
                              value={maxTriangles3d}
                              onChange={(e) =>
                                setMaxTriangles3d(clampInt(e.target.value, 1000, 1500000))
                              }
                              inputProps={{ min: 1000, max: 1500000, step: 50000 }}
                            />
                          }
                        />
                      )}
                      <Button
                        size="small"
                        variant={dataDirty ? "contained" : "outlined"}
                        onClick={load3d}
                        disabled={selectedId == null || mapLoading}
                        sx={{ textTransform: "none", borderRadius: 1.5 }}
                      >
                        Reload data
                      </Button>

                      <Divider />

                      <SectionTitle title="Appearance" />
                      <ParamRow
                        label="Colormap"
                        helpKey="colormap3d"
                        onHelp={openHelp}
                        control={
                          <TextField
                            size="small"
                            select
                            value={colormap3d}
                            onChange={(e) => setColormap3d(e.target.value)}
                            SelectProps={{ MenuProps: { disablePortal: true } }}
                          >
                            {CMAP_OPTIONS.map((cm) => (
                              <MenuItem key={cm} value={cm}>{cm}</MenuItem>
                            ))}
                          </TextField>
                        }
                      />

                      <ParamRow
                        label="Opacity"
                        helpKey="opacity3d"
                        onHelp={openHelp}
                        control={
                          <TextField
                            size="small"
                            type="number"
                            value={opacity3d}
                            onChange={(e) => setOpacity3d(clampFloat(e.target.value, 0.05, 1))}
                            inputProps={{ min: 0.05, max: 1, step: 0.05 }}
                          />
                        }
                      />

                      {renderMode3d === "volume" && (
                        <ParamRow
                          label="Surfaces"
                          helpKey="surfaceCount"
                          onHelp={openHelp}
                          control={
                            <TextField
                              size="small"
                              type="number"
                              value={surfaceCount}
                              onChange={(e) => setSurfaceCount(clampInt(e.target.value, 1, 8))}
                              inputProps={{ min: 1, max: 8, step: 1 }}
                            />
                          }
                        />
                      )}

                      <Divider />

                      <SectionTitle title="Iso rendering" />
                      <ParamRow
                        label="Iso mode"
                        helpKey="isoRenderMode3d"
                        onHelp={openHelp}
                        control={
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={renderMode3d}
                            onChange={(_, v) => v && setRenderMode3d(v)}
                          >
                            <ToggleButton value="surface">surface</ToggleButton>
                            <ToggleButton value="volume">volume</ToggleButton>
                          </ToggleButtonGroup>
                        }
                      />

                      {renderMode3d === "surface" && (
                        <>
                          <ParamRow
                            label="Iso level"
                            helpKey="surfaceLevel3d"
                            onHelp={openHelp}
                            control={
                              <TextField
                                size="small"
                                type="number"
                                value={surfaceLevel3d ?? ""}
                                placeholder="auto"
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  if (!raw) {
                                    setSurfaceLevel3d(null);
                                    return;
                                  }

                                  const value = Number(raw);
                                  if (Number.isFinite(value)) {
                                    setSurfaceLevel3d(value);
                                  }
                                }}
                                inputProps={{ step: 0.001 }}
                              />
                            }
                          />

                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setSurfaceLevel3d(null)}
                            sx={{ textTransform: "none", borderRadius: 1.5 }}
                          >
                            Auto level
                          </Button>

                          {surfaceResolvedLevel != null && (
                            <Typography variant="caption" color="text.secondary">
                              Current level: {formatSci(surfaceResolvedLevel)}
                            </Typography>
                          )}
                        </>
                      )}

                      {renderMode3d === "volume" && (
                        <Box sx={{ mt: 0.5 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Threshold
                            </Typography>
                            <IconButton size="small" onClick={openHelp("thrMode")}>
                              <HelpCircle size={14} />
                            </IconButton>
                          </Box>

                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={thrMode}
                            onChange={(_, v) => v && setThrMode(v)}
                            sx={{ mb: 0.75 }}
                          >
                            <ToggleButton value="percentile">Percentile</ToggleButton>
                            <ToggleButton value="absolute">Absolute</ToggleButton>
                          </ToggleButtonGroup>

                          {thrMode === "percentile" && (
                            <>
                              <Slider
                                size="small"
                                value={thrPct}
                                min={0}
                                max={100}
                                step={1}
                                onChange={(_, v) => {
                                  const arr = v as number[];
                                  const lo = Math.min(arr[0], arr[1]);
                                  const hi = Math.max(arr[0], arr[1]);
                                  setThrPct([lo, Math.max(lo + 1, hi)] as [number, number]);
                                }}
                                valueLabelDisplay="auto"
                                disabled={!sortedValues}
                              />
                              {thrPctAbs && (
                                <Typography variant="caption" color="text.secondary">
                                  ≈ {formatSci(thrPctAbs[0])} – {formatSci(thrPctAbs[1])}
                                </Typography>
                              )}
                            </>
                          )}

                          {thrMode === "absolute" && (
                            <Slider
                              size="small"
                              value={thrAbs}
                              min={stats3d?.min ?? 0}
                              max={stats3d?.max ?? 1}
                              step={stats3d ? (stats3d.max - stats3d.min) / 400 : 0.001}
                              onChange={(_, v) => {
                                const [lo, hi] = v as number[];
                                setThrAbs([Math.min(lo, hi), Math.max(lo, hi)] as [number, number]);
                              }}
                              valueLabelDisplay="auto"
                              valueLabelFormat={(v) => formatSci(v as number)}
                              disabled={!stats3d}
                            />
                          )}
                        </Box>
                      )}
                    </Box>
                  )}

                  {rightTab === "hist" && (
                    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Intensity histogram
                      </Typography>

                      {selectedId == null ? (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                          Select a volume to see the histogram.
                        </Typography>
                      ) : histLoading ? (
                        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="caption">Loading histogram…</Typography>
                        </Box>
                      ) : histError ? (
                        <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                          {histError}
                        </Typography>
                      ) : histogram && histogram.binEdges.length > 1 ? (
                        <Box sx={{ mt: 1, flex: 1, minHeight: 240 }}>
                          <Plot
                            data={[
                              {
                                type: "bar",
                                x: histogram.binEdges
                                  .slice(0, -1)
                                  .map((b, i) => 0.5 * (b + histogram.binEdges[i + 1])),
                                y: histogram.counts,
                              },
                            ]}
                            layout={{
                              margin: { l: 40, r: 10, t: 10, b: 30 },
                              autosize: true,
                              showlegend: false,
                              xaxis: { title: "Intensity" },
                              yaxis: { title: "Count" },
                            }}
                            style={{ width: "100%", height: "100%" }}
                            useResizeHandler
                            config={{ displaylogo: false, responsive: true }}
                          />
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                          No histogram data.
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>

      <Popover
        open={Boolean(helpAnchor && helpKey)}
        anchorEl={helpAnchor}
        onClose={closeHelp}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        disableRestoreFocus
        PaperProps={{ sx: { p: 1.25, maxWidth: 320 } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {helpKey}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {helpKey ? HELP_TEXT[helpKey] ?? "No help available." : ""}
        </Typography>
      </Popover>
    </Box>
  );
}

function AxisSliceSliderControl({
  title,
  helpKey,
  onHelp,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  title: string;
  helpKey: string;
  onHelp: (key: string) => (e: React.MouseEvent<HTMLElement>) => void;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ mt: 0.5 }}>
      <Box sx={{ display: "inline-flex", gap: 0.5, alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <IconButton size="small" onClick={onHelp(helpKey)}>
          <HelpCircle size={14} />
        </IconButton>
      </Box>

      <SliceSlider
        size="small"
        value={Math.max(min, Math.min(value, max))}
        min={min}
        max={Math.max(min, max)}
        step={1}
        onChange={(_, v) => onChange(v as number)}
        disabled={disabled}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => `${(v as number) + 1}`}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary">
          {min + 1}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.max(min, max) + 1}
        </Typography>
      </Box>
    </Box>
  );
}

function OrthoSlicesGrid({
  dims,
  zSlice,
  ySlice,
  xSlice,
  sliceIndexX,
  sliceIndexY,
  sliceIndexZ,
  brightness,
  contrast,
}: {
  dims: Record<"x" | "y" | "z", number>;
  zSlice: SliceImageState;
  ySlice: SliceImageState;
  xSlice: SliceImageState;
  sliceIndexX: number;
  sliceIndexY: number;
  sliceIndexZ: number;
  brightness: number;
  contrast: number;
}) {
  const colX = "#ef4444";
  const colY = "#22c55e";
  const colZ = "#3b82f6";

  const gx = Math.max(1, dims.x || 1);
  const gy = Math.max(1, dims.y || 1);
  const gz = Math.max(1, dims.z || 1);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: `${gx}fr ${gz}fr`,
        gridTemplateRows: `${gz}fr ${gy}fr`,
        gap: 0.5,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <OrthoSlicePanel
        label="Y (XZ)"
        labelDotColor={colY}
        gridArea={{ col: "1 / 2", row: "1 / 2" }}
        imageUrl={ySlice.url}
        loading={ySlice.loading}
        error={ySlice.error}
        imageWidth={Math.max(1, dims.x)}
        imageHeight={Math.max(1, dims.z)}
        brightness={brightness}
        contrast={contrast}
        crossV={{
          pos: clampInt(sliceIndexX, 0, Math.max(0, dims.x - 1)),
          color: colX,
          max: Math.max(1, dims.x),
        }}
        crossH={{
          pos: clampInt(sliceIndexZ, 0, Math.max(0, dims.z - 1)),
          color: colZ,
          max: Math.max(1, dims.z),
        }}
      />



      <OrthoSlicePanel
        label="Z (XY)"
        labelDotColor={colZ}
        gridArea={{ col: "1 / 2", row: "2 / 3" }}
        imageUrl={zSlice.url}
        loading={zSlice.loading}
        error={zSlice.error}
        imageWidth={Math.max(1, dims.x)}
        imageHeight={Math.max(1, dims.y)}
        brightness={brightness}
        contrast={contrast}
        crossV={{
          pos: clampInt(sliceIndexX, 0, Math.max(0, dims.x - 1)),
          color: colX,
          max: Math.max(1, dims.x),
        }}
        crossH={{
          pos: clampInt(sliceIndexY, 0, Math.max(0, dims.y - 1)),
          color: colY,
          max: Math.max(1, dims.y),
        }}
      />

      <OrthoSlicePanel
        label="X (YZ)"
        labelDotColor={colX}
        gridArea={{ col: "2 / 3", row: "2 / 3" }}
        imageUrl={xSlice.url}
        loading={xSlice.loading}
        error={xSlice.error}
        imageWidth={Math.max(1, dims.y)}
        imageHeight={Math.max(1, dims.z)}
        brightness={brightness}
        contrast={contrast}
        rotate90
        crossV={{
          pos: clampInt(sliceIndexY, 0, Math.max(0, dims.y - 1)),
          color: colY,
          max: Math.max(1, dims.y),
        }}
        crossH={{
          pos: clampInt(sliceIndexZ, 0, Math.max(0, dims.z - 1)),
          color: colZ,
          max: Math.max(1, dims.z),
        }}
      />
    </Box>
  );
}

function OrthoSlicePanel({
  label,
  labelDotColor,
  gridArea,
  imageUrl,
  loading,
  error,
  imageWidth,
  imageHeight,
  brightness,
  contrast,
  rotate90 = false,
  crossV,
  crossH,
}: {
  label: string;
  labelDotColor?: string;
  gridArea: { col: string; row: string };
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  imageWidth: number;
  imageHeight: number;
  brightness: number;
  contrast: number;
  rotate90?: boolean;
  crossV?: { pos: number; color: string; max: number };
  crossH?: { pos: number; color: string; max: number };
}) {
  const viewBoxW = rotate90 ? imageHeight : imageWidth;
  const viewBoxH = rotate90 ? imageWidth : imageHeight;

  const filterCss = `brightness(${1 + brightness}) contrast(${contrast})`;

  const strokeW = Math.max(1, Math.min(viewBoxW, viewBoxH) * 0.0025);

  const renderContent = () => {
    if (loading && !imageUrl) {
      return (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <CircularProgress size={16} />
          <Typography variant="caption">Loading…</Typography>
        </Box>
      );
    }

    if (error && !imageUrl) {
      return (
        <Typography variant="caption" color="error" sx={{ textAlign: "center", px: 1 }}>
          {error}
        </Typography>
      );
    }

    if (!imageUrl) {
      return (
        <Typography variant="caption" color="text.secondary">
          No image
        </Typography>
      );
    }

    return (
      <svg
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {rotate90 ? (
          <g transform={`translate(${imageHeight}, 0) rotate(90)`}>
            <image
              href={imageUrl}
              x={0}
              y={0}
              width={imageWidth}
              height={imageHeight}
              preserveAspectRatio="none"
              style={{ filter: filterCss }}
            />
            {crossV && (
              <line
                x1={clampFloat(crossV.pos, 0, Math.max(0, imageWidth - 1))}
                y1={0}
                x2={clampFloat(crossV.pos, 0, Math.max(0, imageWidth - 1))}
                y2={imageHeight}
                stroke={crossV.color}
                strokeWidth={strokeW}
                opacity={0.95}
              />
            )}
            {crossH && (
              <line
                x1={0}
                y1={clampFloat(crossH.pos, 0, Math.max(0, imageHeight - 1))}
                x2={imageWidth}
                y2={clampFloat(crossH.pos, 0, Math.max(0, imageHeight - 1))}
                stroke={crossH.color}
                strokeWidth={strokeW}
                opacity={0.95}
              />
            )}
          </g>
        ) : (
          <>
            <image
              href={imageUrl}
              x={0}
              y={0}
              width={imageWidth}
              height={imageHeight}
              preserveAspectRatio="none"
              style={{ filter: filterCss }}
            />
            {crossV && (
              <line
                x1={clampFloat(crossV.pos, 0, Math.max(0, imageWidth - 1))}
                y1={0}
                x2={clampFloat(crossV.pos, 0, Math.max(0, imageWidth - 1))}
                y2={imageHeight}
                stroke={crossV.color}
                strokeWidth={strokeW}
                opacity={0.95}
              />
            )}
            {crossH && (
              <line
                x1={0}
                y1={clampFloat(crossH.pos, 0, Math.max(0, imageHeight - 1))}
                x2={imageWidth}
                y2={clampFloat(crossH.pos, 0, Math.max(0, imageHeight - 1))}
                stroke={crossH.color}
                strokeWidth={strokeW}
                opacity={0.95}
              />
            )}
          </>
        )}
      </svg>
    );
  };

  return (
    <Box
      sx={{
        gridColumn: gridArea.col,
        gridRow: gridArea.row,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {renderContent()}

      <Box
        sx={{
          position: "absolute",
          top: 6,
          left: 6,
          px: 0.75,
          py: 0.25,
          borderRadius: 0.75,
          bgcolor: "rgba(0,0,0,0.55)",
          color: "common.white",
          pointerEvents: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 0.6,
        }}
      >
        {labelDotColor && (
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: labelDotColor,
              flexShrink: 0,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.35)",
            }}
          />
        )}
        <Typography variant="caption" sx={{ color: "inherit", lineHeight: 1.2 }}>
          {label}
        </Typography>
      </Box>

      {loading && imageUrl && (
        <Box
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            bgcolor: "rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CircularProgress size={12} />
        </Box>
      )}

      {error && imageUrl && (
        <Box
          sx={{
            position: "absolute",
            bottom: 6,
            left: 6,
            right: 6,
            px: 0.75,
            py: 0.5,
            borderRadius: 0.75,
            bgcolor: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            backdropFilter: "blur(2px)",
          }}
        >
          <Typography variant="caption" color="error" noWrap>
            {error}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function useVolumeSliceImage({
  enabled,
  svc,
  projectId,
  protocolId,
  outputName,
  volumeId,
  axis,
  sliceIndex,
  maxSlice,
  colormap,
  reloadKey,
}: {
  enabled: boolean;
  svc: any;
  projectId: string | number;
  protocolId: string | number;
  outputName: string;
  volumeId: string | number | null;
  axis: "x" | "y" | "z";
  sliceIndex: number | null;
  maxSlice: number;
  colormap: string;
  reloadKey?: number;
}): SliceImageState {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  const revokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || volumeId == null || sliceIndex == null) {
      abortRef.current?.abort();
      setLoading(false);
      setError(null);
      return;
    }

    const clampedIndex = Math.max(0, Math.min(sliceIndex, maxSlice));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const reqId = ++reqIdRef.current;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await svc.fetchVolumeSliceObjectUrl(
          projectId,
          protocolId,
          outputName,
          volumeId,
          clampedIndex,
          {
            axis,
            cmap: colormap,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted || reqIdRef.current !== reqId) {
          result?.revoke?.();
          return;
        }

        if (revokeRef.current) {
          try {
            revokeRef.current();
          } catch {
            // Ignore revoke errors.
          }
        }

        revokeRef.current = result?.revoke ?? null;
        setUrl(result?.url ?? null);
      } catch (e: any) {
        if (controller.signal.aborted || reqIdRef.current !== reqId) return;
        setError(e?.message || `Failed to load ${axis.toUpperCase()} slice`);
        setUrl(null);
      } finally {
        if (reqIdRef.current === reqId) setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    enabled,
    svc,
    projectId,
    protocolId,
    outputName,
    volumeId,
    axis,
    sliceIndex,
    maxSlice,
    colormap,
    reloadKey,
  ]);

  useEffect(() => {
    return () => {
      if (revokeRef.current) {
        try {
          revokeRef.current();
        } catch {
          // Ignore revoke errors.
        }
      }
    };
  }, []);

  return { url, loading, error };
}

/**
 * Throttle a value so it only updates at most once every `intervalMs` milliseconds.
 * Unlike debounce, this still updates while the user is moving the slider.
 */
function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastExecutedRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastExecutedRef.current;

    if (elapsed >= intervalMs) {
      // Enough time passed: update immediately.
      lastExecutedRef.current = now;
      setThrottled(value);
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      // Not enough time: schedule a trailing update.
      const remaining = intervalMs - elapsed;
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        lastExecutedRef.current = Date.now();
        setThrottled(value);
        timeoutRef.current = null;
      }, remaining);
    }

    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [value, intervalMs]);

  return throttled;
}

function SlicesCanvas({
  url,
  containerW,
  containerH,
  scale,
  pan,
  interp,
  sharpen,
  brightness,
  contrast,
  onNaturalSize,
}: {
  url: string;
  containerW: number;
  containerH: number;
  scale: number;
  pan: { x: number; y: number };
  interp: Interp2d;
  sharpen: boolean;
  brightness: number;
  contrast: number;
  onNaturalSize: (w: number, h: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const processedRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      onNaturalSize(img.naturalWidth, img.naturalHeight);
      prepareProcessed(img, sharpen, processedRef);
      scheduleDraw();
    };
    img.src = url;
  }, [url]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    prepareProcessed(img, sharpen, processedRef);
    scheduleDraw();
  }, [sharpen]);

  useEffect(() => {
    scheduleDraw();
  }, [containerW, containerH, scale, pan.x, pan.y, interp, brightness, contrast]);

  const scheduleDraw = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, containerW);
    const h = Math.max(1, containerH);

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (interp === "nearest") {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality =
        interp === "high" ? "high" : "medium";
    }

    const src = sharpen && processedRef.current ? processedRef.current : img;

    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    const cx = w / 2 + pan.x;
    const cy = h / 2 + pan.y;
    const x0 = cx - drawW / 2;
    const y0 = cy - drawH / 2;

    const b = 1 + brightness;
    const c = contrast;

    ctx.filter = `brightness(${b}) contrast(${c})`;
    ctx.globalAlpha = 1;
    ctx.drawImage(src, x0, y0, drawW, drawH);
    ctx.filter = "none";
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
      }}
    />
  );
}

function prepareProcessed(
  img: HTMLImageElement,
  sharpen: boolean,
  processedRef: React.MutableRefObject<HTMLCanvasElement | null>,
) {
  if (!sharpen) {
    processedRef.current = null;
    return;
  }

  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const ctx = off.getContext("2d");
  if (!ctx) {
    processedRef.current = null;
    return;
  }
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, off.width, off.height);
  const out = sharpenImageData(id);
  ctx.putImageData(out, 0, 0);
  processedRef.current = off;
}

function sharpenImageData(src: ImageData): ImageData {
  const { width, height, data } = src;
  const out = new ImageData(width, height);
  const dst = out.data;

  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const idx = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let ki = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++, ki++) {
          const xx = Math.max(0, Math.min(width - 1, x + i));
          const yy = Math.max(0, Math.min(height - 1, y + j));
          const p = idx(xx, yy);
          const w = k[ki];
          r += data[p] * w;
          g += data[p + 1] * w;
          b += data[p + 2] * w;
          a += data[p + 3] * w;
        }
      }

      const o = idx(x, y);
      dst[o] = clampByte(r);
      dst[o + 1] = clampByte(g);
      dst[o + 2] = clampByte(b);
      dst[o + 3] = clampByte(a);
    }
  }
  return out;
}

function clampByte(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function SlicesStatusBar({
  axis,
  sliceIndex,
  maxSlice,
  zoomMul,
  colormap,
  interp,
  sharpen,
  brightness,
  contrast,
}: {
  axis: "x" | "y" | "z";
  sliceIndex: number;
  maxSlice: number;
  zoomMul: number;
  colormap: string;
  interp: Interp2d;
  sharpen: boolean;
  brightness: number;
  contrast: number;
}) {
  const bPct = Math.round((1 + brightness) * 100);
  const cPct = Math.round(contrast * 100);

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 8,
        right: 8,
        bgcolor: "rgba(0,0,0,0.55)",
        color: "white",
        px: 1,
        py: 0.5,
        borderRadius: 1,
        fontSize: 12,
        display: "flex",
        gap: 1.0,
        alignItems: "center",
        pointerEvents: "none",
        flexWrap: "wrap",
        maxWidth: "90%",
      }}
    >
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {axis.toUpperCase()} {sliceIndex + 1}/{maxSlice + 1}
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {Math.round(zoomMul * 100)}%
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {colormap}
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        {interp}
      </Typography>
      {sharpen && (
        <Typography variant="caption" sx={{ color: "inherit" }}>
          sharpen
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: "inherit" }}>
        b {bPct}%
      </Typography>
      <Typography variant="caption" sx={{ color: "inherit" }}>
        c {cPct}%
      </Typography>
    </Box>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontWeight: 700 }}
    >
      {title}
    </Typography>
  );
}

function ParamRow({
  label,
  helpKey,
  onHelp,
  control,
}: {
  label: string;
  helpKey: string;
  onHelp: (key: string) => (e: React.MouseEvent<HTMLElement>) => void;
  control: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1.2fr",
        gap: 1,
        alignItems: "center",
      }}
    >
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <IconButton size="small" onClick={onHelp(helpKey)}>
          <HelpCircle size={14} />
        </IconButton>
      </Box>
      {control}
    </Box>
  );
}

function useElementSize<T extends Element>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function getDimsZYXtoXYZ(info: any): Record<"x" | "y" | "z", number> {
  const raw = info?.dims || info?.shape || info?.size || [];
  if (Array.isArray(raw) && raw.length >= 3) {
    const z = Number(raw[0]) || 0;
    const y = Number(raw[1]) || 0;
    const x = Number(raw[2]) || 0;
    return { x, y, z };
  }
  return {
    x: Number(info?.width ?? 0),
    y: Number(info?.height ?? 0),
    z: Number(info?.depth ?? info?.slices ?? 0),
  };
}

function dimsToStringXYZ(d: Record<"x" | "y" | "z", number>) {
  return d.x && d.y && d.z ? `${d.x} × ${d.y} × ${d.z}` : "–";
}

function num(n: any) {
  return Number.isFinite(n) ? Number(n).toFixed(3) : "–";
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="caption">{value}</Typography>
    </Box>
  );
}

function normalize3dPayload(raw: any): {
  dims: { x: number; y: number; z: number };
  values: number[];
  order: "zyx" | "xyz";
  min?: number;
  max?: number;
} {
  const dimsRaw = raw?.dims;
  const shapeRaw = raw?.shape ?? raw?.size;

  let x = 0, y = 0, z = 0;

  if (Array.isArray(dimsRaw) && dimsRaw.length >= 3) {
    x = Number(dimsRaw[0]) || 0;
    y = Number(dimsRaw[1]) || 0;
    z = Number(dimsRaw[2]) || 0;
  } else if (Array.isArray(shapeRaw) && shapeRaw.length >= 3) {
    z = Number(shapeRaw[0]) || 0;
    y = Number(shapeRaw[1]) || 0;
    x = Number(shapeRaw[2]) || 0;
  }

  let values: number[] = [];
  const vRaw = raw?.values ?? raw?.data ?? raw?.volume;
  if (Array.isArray(vRaw)) {
    if (Array.isArray(vRaw[0])) {
      values = flatten3dNested(vRaw as any);
      if (!x || !y || !z) {
        z = vRaw.length;
        y = (vRaw[0] as any).length;
        x = ((vRaw[0] as any)[0] as any).length;
      }
    } else {
      values = (vRaw as any[]).map((n) => Number(n) || 0);
    }
  }

  const orderRaw = (raw?.order ?? raw?.dimsOrder ?? "zyx").toLowerCase();
  const order: "zyx" | "xyz" = orderRaw === "xyz" ? "xyz" : "zyx";

  return { dims: { x, y, z }, values, order, min: raw?.min, max: raw?.max };
}

function flatten3dNested(v: number[][][]): number[] {
  const out: number[] = [];
  for (let k = 0; k < v.length; k++) {
    const yz = v[k] || [];
    for (let j = 0; j < yz.length; j++) {
      const row = yz[j] || [];
      for (let i = 0; i < row.length; i++) out.push(Number(row[i]) || 0);
    }
  }
  return out;
}

function percentileFromSorted(sorted: number[], pct: number): number {
  const p = clampFloat(pct, 0, 100) / 100;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
}

function clampInt(v: any, lo: number, hi: number) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function clampFloat(v: any, lo: number, hi: number) {
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function formatSci(v: number) {
  if (!Number.isFinite(v)) return "–";
  const av = Math.abs(v);
  if (av >= 1000 || (av > 0 && av < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

function toPlotlyColorscale(name: string) {
  const n = (name || "viridis").toLowerCase();
  if (n === "gray" || n === "grey") return "Greys";
  if (n === "turbo") return "Turbo";
  if (n === "cividis") return "Cividis";
  if (n === "inferno") return "Inferno";
  if (n === "plasma") return "Plasma";
  if (n === "magma") return "Magma";
  return "Viridis";
}