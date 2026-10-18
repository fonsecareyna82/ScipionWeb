import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Box,
  Button,
  CircularProgress,
  DialogContent,
  Divider,
  IconButton,
  Slider,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Image as ImageIcon,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Sun,
  Contrast as ContrastIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import FloatingWindow from "@/components/ui/floating-window/FloatingWindow";
import ExternalWindowPortal, {
  DetachableContentMount,
  PersistentContentPortal,
  openExternalWindow,
} from "@/components/ui/external-window/ExternalWindowPortal";

export type ImagePreviewSource = {
  title: string;
  path: string;
  details?: Array<{ label: string; value: string | number; highlight?: boolean }>;
  // Each load owns its object URL; the dialog releases it on close or replacement.
  loadImage: (signal: AbortSignal) => Promise<{ url: string; revoke: () => void }>;
  // The image at its full resolution, without compression losses: loaded after
  // the quick one, which it replaces when it arrives.
  loadFullImage?: (signal: AbortSignal) => Promise<{ url: string; revoke: () => void }>;
};

type FullQuality = "loading" | "ready" | "failed" | null;

type ImagePreviewDialogProps = {
  image: ImagePreviewSource | null;
  onClose: () => void;
  ariaLabel?: string;
  className?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function ImagePreviewDialog({
  image,
  onClose,
  ariaLabel = "Image preview",
  className = "image-preview-window",
}: ImagePreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullQuality, setFullQuality] = useState<FullQuality>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // The "Full resolution" badge shows for a moment when the full image arrives.
  const [showFullBadge, setShowFullBadge] = useState(false);

  useEffect(() => {
    if (fullQuality !== "ready") {
      setShowFullBadge(false);
      return;
    }
    setShowFullBadge(true);
    const timer = window.setTimeout(() => setShowFullBadge(false), 2500);
    return () => window.clearTimeout(timer);
  }, [fullQuality]);

  const externalWindowRef = useRef<Window | null>(null);

  const externalWindowActionRef = useRef<
    "return" | "close" | null
  >(null);

  const [
    externalWindow,
    setExternalWindow,
  ] = useState<Window | null>(null);

  const previewContentHost = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }

    const host = document.createElement("div");

    host.setAttribute(
      "data-image-preview-host",
      "true",
    );

    host.style.cssText = `
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      overflow: hidden;
    `;

    return host;
  }, []);

  // View adjustments belong to the current image and reset when it changes.
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPanX(0);
    setPanY(0);
    setBrightness(0);
    setContrast(1);
  }, []);

  useEffect(() => {
    setPreviewUrl(null);
    setError(null);
    setLoading(!!image);
    setFullQuality(image?.loadFullImage ? "loading" : null);
    setNaturalSize(null);
    resetView();
    dragStateRef.current.active = false;
    setIsPanning(false);
    if (!image) return;

    let cancelled = false;
    let revokeCurrent: (() => void) | null = null;
    let showingFull = false;
    let quickFailure: unknown = null;
    let fullFailed = !image.loadFullImage;
    const controller = new AbortController();

    const show = (result: { url: string; revoke: () => void }, full: boolean) => {
      if (cancelled || (showingFull && !full)) {
        result.revoke();
        return;
      }
      revokeCurrent?.();
      revokeCurrent = result.revoke;
      showingFull = full;
      setPreviewUrl(result.url);
      setError(null);
      setLoading(false);
    };
    // An error shows only when neither image could be loaded.
    const failIfNothing = () => {
      if (cancelled || revokeCurrent || !fullFailed || quickFailure === null) return;
      setError(getErrorMessage(quickFailure, "Failed to load image"));
      setLoading(false);
    };

    void (async () => {
      try {
        show(await image.loadImage(controller.signal), false);
      } catch (error) {
        quickFailure = error ?? new Error("Failed to load image");
        failIfNothing();
      }
    })();

    if (image.loadFullImage) {
      const loadFull = image.loadFullImage;
      void (async () => {
        try {
          show(await loadFull(controller.signal), true);
          if (!cancelled) setFullQuality("ready");
        } catch {
          fullFailed = true;
          if (!cancelled) setFullQuality("failed");
          failIfNothing();
        }
      })();
    }

    return () => {
      cancelled = true;
      controller.abort();
      revokeCurrent?.();
      revokeCurrent = null;
    };
  }, [image, resetView]);

  const open = !!image;

  const handleOpenExternal = useCallback(() => {
    const existing =
      externalWindowRef.current;

    if (
      existing &&
      !existing.closed
    ) {
      existing.focus();
      return;
    }

    const popup =
      openExternalWindow({
        title:
          `ScipionWeb - ${image?.title || "Image preview"}`,

        width: 1240,
        height: 900,
      });

    if (!popup) {
      toast.error(
        "The browser blocked the image preview window. Allow pop-ups for ScipionWeb and try again.",
      );

      return;
    }

    externalWindowActionRef.current =
      null;

    externalWindowRef.current =
      popup;

    setExternalWindow(
      popup,
    );
  }, [
    image?.title,
  ]);


  const handleExternalWindowClosed =
    useCallback(() => {
      const action =
        externalWindowActionRef.current;

      externalWindowActionRef.current =
        null;

      externalWindowRef.current =
        null;

      setExternalWindow(
        null,
      );

      if (action === null) {
        onClose();
      }
    }, [
      onClose,
    ]);


  const handleReturnToFloating =
    useCallback(() => {
      const popup =
        externalWindowRef.current;

      externalWindowActionRef.current =
        "return";

      externalWindowRef.current =
        null;

      setExternalWindow(
        null,
      );

      if (
        popup &&
        !popup.closed
      ) {
        popup.close();
      }
    }, []);


  const handleClosePreview =
    useCallback(() => {
      const popup =
        externalWindowRef.current;

      externalWindowActionRef.current =
        "close";

      externalWindowRef.current =
        null;

      setExternalWindow(
        null,
      );

      if (
        popup &&
        !popup.closed
      ) {
        popup.close();
      }

      onClose();
    }, [
      onClose,
    ]);


  useEffect(() => {
    if (open) {
      return;
    }

    const popup =
      externalWindowRef.current;

    externalWindowRef.current =
      null;

    if (
      popup &&
      !popup.closed
    ) {
      popup.close();
    }

    setExternalWindow(
      null,
    );
  }, [
    open,
  ]);


  useEffect(() => {
    return () => {
      const popup =
        externalWindowRef.current;

      externalWindowRef.current =
        null;

      if (
        popup &&
        !popup.closed
      ) {
        popup.close();
      }
    };
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(8, Number((z * 1.25).toFixed(3))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, Number((z / 1.25).toFixed(3))));
  }, []);

  const rotateLeft = useCallback(() => {
    setRotation((r) => (r - 90 + 360) % 360);
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);

  const handleWheelZoom = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!previewUrl) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => Math.min(8, Math.max(0.25, Number((z * factor).toFixed(3)))));
  }, [previewUrl]);

  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  }>({ active: false, startX: 0, startY: 0, originPanX: 0, originPanY: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const handlePanStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!previewUrl || zoom <= 1) return;
      dragStateRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        originPanX: panX,
        originPanY: panY,
      };
      setIsPanning(true);
    },
    [previewUrl, zoom, panX, panY],
  );

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragStateRef.current.active) return;
      setPanX(dragStateRef.current.originPanX + (event.clientX - dragStateRef.current.startX));
      setPanY(dragStateRef.current.originPanY + (event.clientY - dragStateRef.current.startY));
    };

    const handleUp = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      setIsPanning(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);


  const previewTitle = (
    <Box
      sx={{
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 1.1,
        color: "inherit",
      }}
    >
      <ImageIcon
        size={20}
        strokeWidth={1.9}
      />

      <Box
        sx={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0.1,
        }}
      >
        <Typography
          component="div"
          variant="subtitle2"
          sx={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "inherit",
            fontWeight: 750,
            lineHeight: 1.2,
          }}
        >
          {image?.title || "Image preview"}
        </Typography>

        {image?.path ? (
          <Typography
            component="div"
            variant="caption"
            sx={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "rgba(229,231,235,0.76)",
              fontSize: "0.68rem",
              lineHeight: 1.2,
            }}
          >
            {image.path}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );


  return (
    <>
      {open &&
        previewContentHost ? (
        <PersistentContentPortal
          host={
            previewContentHost
          }
        >
          <DialogContent
            sx={{
              p: 0,
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              backgroundColor: "#e2e8f0",
            }}
          >

            {image && (
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1.5,
                  backgroundColor: "#ffffff",
                  borderBottom: "1px solid rgba(148,163,184,0.24)",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                  <Tooltip title="Zoom out">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!previewUrl}
                        onClick={zoomOut}
                        aria-label="Zoom out"
                      >
                        <ZoomOut size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Typography
                    data-testid="preview-zoom-level"
                    variant="caption"
                    sx={{ minWidth: 40, textAlign: "center", color: "#475569", fontWeight: 650 }}
                  >
                    {Math.round(zoom * 100)}%
                  </Typography>
                  <Tooltip title="Zoom in">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!previewUrl}
                        onClick={zoomIn}
                        aria-label="Zoom in"
                      >
                        <ZoomIn size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>

                <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                  <Tooltip title="Rotate left">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!previewUrl}
                        onClick={rotateLeft}
                        aria-label="Rotate left"
                      >
                        <RotateCcw size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Rotate right">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!previewUrl}
                        onClick={rotateRight}
                        aria-label="Rotate right"
                      >
                        <RotateCw size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>

                <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 150 }}>
                  <Sun size={15} color="#64748b" />
                  <Slider
                    size="small"
                    value={brightness}
                    min={-1}
                    max={1}
                    step={0.02}
                    disabled={!previewUrl}
                    onChange={(_, v) => setBrightness(v as number)}
                    aria-label="Brightness"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round((1 + (v as number)) * 100)}%`}
                    sx={{ width: 90 }}
                  />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 150 }}>
                  <ContrastIcon size={15} color="#64748b" />
                  <Slider
                    size="small"
                    value={contrast}
                    min={0.5}
                    max={2}
                    step={0.02}
                    disabled={!previewUrl}
                    onChange={(_, v) => setContrast(v as number)}
                    aria-label="Contrast"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
                    sx={{ width: 90 }}
                  />
                </Box>

                <Button
                  size="small"
                  disabled={!previewUrl}
                  onClick={resetView}
                  sx={{ ml: "auto", textTransform: "none", fontWeight: 650, color: "#475569" }}
                >
                  Reset
                </Button>
              </Box>
            )}

            <Box
              onWheel={handleWheelZoom}
              onMouseDown={handlePanStart}
              sx={{
                flex: 1,
                minHeight: 0,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                cursor: !previewUrl ? "default" : zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
                p: {
                  xs: 2,
                  sm: 3,
                },
                background: `
              radial-gradient(
                circle at 50% 38%,
                rgba(255,255,255,0.98) 0%,
                rgba(248,250,252,0.96) 38%,
                rgba(226,232,240,0.96) 100%
              )
            `,
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(148,163,184,0.22)",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  opacity: 0.32,
                  backgroundImage: `
                linear-gradient(
                  45deg,
                  rgba(148,163,184,0.09) 25%,
                  transparent 25%
                ),
                linear-gradient(
                  -45deg,
                  rgba(148,163,184,0.09) 25%,
                  transparent 25%
                ),
                linear-gradient(
                  45deg,
                  transparent 75%,
                  rgba(148,163,184,0.09) 75%
                ),
                linear-gradient(
                  -45deg,
                  transparent 75%,
                  rgba(148,163,184,0.09) 75%
                )
              `,
                  backgroundSize: "22px 22px",
                  backgroundPosition:
                    "0 0, 0 11px, 11px -11px, -11px 0px",
                }}
              />

              {loading && (
                <Box
                  sx={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 1.5,
                    px: 3,
                    py: 2.5,
                    borderRadius: "16px",
                    backgroundColor: "rgba(255,255,255,0.82)",
                    border: "1px solid rgba(148,163,184,0.25)",
                    boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <CircularProgress
                    size={30}
                    thickness={4}
                    sx={{
                      color: "#4f46e5",
                    }}
                  />

                  <Typography
                    variant="caption"
                    sx={{
                      color: "#64748b",
                      fontWeight: 600,
                    }}
                  >
                    Loading image preview…
                  </Typography>
                </Box>
              )}

              {!loading && error && (
                <Box
                  sx={{
                    position: "relative",
                    zIndex: 1,
                    maxWidth: 520,
                    px: 3,
                    py: 2.5,
                    borderRadius: "16px",
                    textAlign: "center",
                    backgroundColor: "#fff7ed",
                    border: "1px solid #fed7aa",
                    boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      mb: 0.5,
                      color: "#9a3412",
                      fontWeight: 750,
                    }}
                  >
                    Image preview unavailable
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      color: "#c2410c",
                    }}
                  >
                    {error}
                  </Typography>
                </Box>
              )}

              {!loading && !error && previewUrl && (
                <Box
                  sx={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "10px",
                    overflow: "hidden",

                  }}
                >
                  <img
                    src={previewUrl}
                    alt={image?.path ?? ""}
                    draggable={false}
                    onLoad={(event) => {
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      if (naturalWidth && naturalHeight) setNaturalSize({ width: naturalWidth, height: naturalHeight });
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      transform: `translate(${zoom > 1 ? panX : 0}px, ${zoom > 1 ? panY : 0}px) scale(${zoom}) rotate(${rotation}deg)`,
                      filter: `brightness(${1 + brightness}) contrast(${contrast})`,
                      transition: isPanning ? "none" : "transform 120ms ease-out",
                    }}
                  />
                </Box>
              )}

              {!loading && !error && previewUrl && (fullQuality === "loading" || showFullBadge) && (
                <Box
                  role="status"
                  data-testid="preview-quality-badge"
                  sx={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: "999px",
                    color: "#ffffff",
                    backgroundColor: fullQuality === "loading" ? "rgba(15,23,42,0.78)" : "rgba(22,101,52,0.85)",
                    boxShadow: "0 6px 18px rgba(15,23,42,0.18)",
                    pointerEvents: "none",
                  }}
                >
                  {fullQuality === "loading" ? (
                    <CircularProgress size={12} thickness={5} sx={{ color: "#ffffff" }} />
                  ) : null}
                  <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2, color: "inherit" }}>
                    {fullQuality === "loading"
                      ? "Loading full resolution…"
                      : `Full resolution${naturalSize ? ` · ${naturalSize.width} × ${naturalSize.height} px` : ""}`}
                  </Typography>
                </Box>
              )}
            </Box>

            {image && (
              <Box
                sx={{
                  px: 2.5,
                  py: 1.25,
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 0.9,
                  backgroundColor: "#ffffff",
                  borderTop: "1px solid rgba(148,163,184,0.24)",
                }}
              >
                {image.details?.map(({ label, value, highlight }) => (
                  <Box
                    key={label}
                    sx={{
                      px: 1.15,
                      py: 0.55,
                      borderRadius: "9px",
                      backgroundColor: highlight ? "#eef2ff" : "#f8fafc",
                      border: `1px solid ${highlight ? "#c7d2fe" : "#e2e8f0"}`,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: highlight ? "#4338ca" : "#64748b" }}>
                      {label}{" "}
                      <Box component="span" sx={{ color: highlight ? "inherit" : "#0f172a", fontWeight: 750 }}>
                        {value}
                      </Box>
                    </Typography>
                  </Box>
                ))}

                <Box
                  sx={{
                    ml: {
                      xs: 0,
                      sm: "auto",
                    },
                    color: "#64748b",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.72rem",
                      fontWeight: 650,
                      letterSpacing: "0.025em",
                    }}
                  >
                    {fullQuality === "loading"
                      ? "Loading full resolution…"
                      : fullQuality === "ready"
                        ? "Full resolution"
                        : "Preview"}
                    {naturalSize ? ` · ${naturalSize.width} × ${naturalSize.height} px` : ""}
                  </Typography>
                </Box>
              </Box>
            )}
          </DialogContent>
        </PersistentContentPortal>
      ) : null}


      {open &&
        externalWindow &&
        !externalWindow.closed &&
        previewContentHost ? (
        <ExternalWindowPortal
          popupWindow={
            externalWindow
          }
          contentHost={
            previewContentHost
          }
          className={className}
          title={
            image?.title ||
            "Image preview"
          }
          subtitle={
            image?.path ||
            undefined
          }
          headerContent={
            previewTitle
          }
          returnAriaLabel="Return image preview to ScipionWeb"
          returnTitle="Return to ScipionWeb"
          closeAriaLabel="Close image preview"
          closeTitle="Close image preview"
          onReturn={
            handleReturnToFloating
          }
          onClose={
            handleClosePreview
          }
          onWindowClosed={
            handleExternalWindowClosed
          }
        />
      ) : (
        <FloatingWindow
          open={
            open
          }
          onClose={
            handleClosePreview
          }
          className={className}
          ariaLabel={ariaLabel}
          closeAriaLabel="Close image preview"
          initialWidth="82vw"
          initialHeight="86vh"
          minWidth={
            760
          }
          minHeight={
            560
          }
          headerActions={
            <button
              type="button"
              className="sfw-controlButton"
              aria-label="Open image preview in external window"
              title="Open in external window"
              onClick={
                handleOpenExternal
              }
            >
              <ExternalLink />
            </button>
          }
          title={
            previewTitle
          }
        >
          {previewContentHost ? (
            <DetachableContentMount
              host={
                previewContentHost
              }
            />
          ) : null}
        </FloatingWindow>
      )}
    </>
  );

}

