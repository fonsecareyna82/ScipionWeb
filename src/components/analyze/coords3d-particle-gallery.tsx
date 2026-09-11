import { useEffect, useMemo, useRef, useState } from "react";
import {
    Box,
    CircularProgress,
    IconButton,
    Paper,
    Tooltip,
    Typography,
} from "@mui/material";
import { Trash2, X } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type {
    Coordinates3dPoint,
    Id,
} from "@/services/ProjectService";

type GalleryPoint = Coordinates3dPoint & {
    radius?: number;
};

type Coords3dParticleGalleryProps = {
    open: boolean;
    projectId: Id;
    protocolId: Id;
    outputName: string;
    tomogramId: Id;
    points: GalleryPoint[];
    selectedPointId: string | null;
    boxSize: number;
    brightness: number;
    contrast: number;
    onClose: () => void;
    onSelect: (point: GalleryPoint) => void;
    onRemove: (pointId: string) => void;
    onInteract?: () => void;
};

type GalleryTile = {
    index: number;
    point: GalleryPoint;
    pointId: string;
    signature: string;
    row: number;
    column: number;
};

const TILE_SIZE = 74;
const TILE_GAP = 6;
const COLUMNS = 3;
const ROW_HEIGHT = TILE_SIZE + TILE_GAP;
const OVERSCAN_ROWS = 2;
const DEFAULT_VIEWPORT_HEIGHT = 620;
const MAX_CACHE_ITEMS = 240;
const MAX_BATCH_SIZE = 48;
const REQUEST_DEBOUNCE_MS = 120;

function getPointId(point: GalleryPoint, index: number): string {
    return String(point.id ?? index);
}

function makeSignature(
    tomogramId: Id,
    point: GalleryPoint,
    index: number,
    boxSize: number,
): string {
    return [
        String(tomogramId),
        getPointId(point, index),
        Number(point.x).toFixed(2),
        Number(point.y).toFixed(2),
        Number(point.z).toFixed(2),
        boxSize,
        TILE_SIZE,
    ].join(":");
}

export default function Coords3dParticleGallery({
    open,
    projectId,
    protocolId,
    outputName,
    tomogramId,
    points,
    selectedPointId,
    boxSize,
    brightness,
    contrast,
    onClose,
    onSelect,
    onRemove,
    onInteract,
}: Coords3dParticleGalleryProps) {
    const service = useProjectService();

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const cacheRef = useRef<Map<string, string>>(new Map());
    const requestAbortRef = useRef<AbortController | null>(null);

    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [, setCacheVersion] = useState(0);

    const effectiveBoxSize = Math.max(16, Math.min(Math.round(boxSize || 64), 256));
    const totalRows = Math.ceil(points.length / COLUMNS);
    const totalHeight = Math.max(0, totalRows * ROW_HEIGHT - TILE_GAP);

    const startRow = Math.max(
        0,
        Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
    );

    const endRow = Math.min(
        totalRows,
        Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
    );

    const visibleTiles = useMemo<GalleryTile[]>(() => {
        const firstIndex = startRow * COLUMNS;
        const lastIndex = Math.min(points.length, endRow * COLUMNS);
        const tiles: GalleryTile[] = [];

        for (let index = firstIndex; index < lastIndex; index += 1) {
            const point = points[index];

            tiles.push({
                index,
                point,
                pointId: getPointId(point, index),
                signature: makeSignature(tomogramId, point, index, effectiveBoxSize),
                row: Math.floor(index / COLUMNS),
                column: index % COLUMNS,
            });
        }

        return tiles;
    }, [
        effectiveBoxSize,
        endRow,
        points,
        startRow,
        tomogramId,
    ]);

    const visibleSignatureKey = useMemo(
        () => visibleTiles.map((tile) => tile.signature).join("|"),
        [visibleTiles],
    );

    const scopeKey = `${projectId}:${protocolId}:${outputName}:${String(tomogramId)}`;

    useEffect(() => {
        requestAbortRef.current?.abort();
        cacheRef.current.clear();
        setCacheVersion((current) => current + 1);
        setScrollTop(0);
        setLoadError(null);

        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [scopeKey]);

    useEffect(() => {
        return () => {
            requestAbortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (!open || tomogramId == null || !visibleSignatureKey) return;

        const missingTiles = visibleTiles
            .filter((tile) => !cacheRef.current.has(tile.signature))
            .slice(0, MAX_BATCH_SIZE);

        if (!missingTiles.length) return;

        const controller = new AbortController();
        requestAbortRef.current?.abort();
        requestAbortRef.current = controller;

        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    setLoadError(null);

                    const result = await service.fetchCoords3dTomogramGallery(
                        projectId,
                        protocolId,
                        outputName,
                        tomogramId,
                        {
                            points: missingTiles.map((tile) => ({
                                id: tile.pointId,
                                x: Number(tile.point.x),
                                y: Number(tile.point.y),
                                z: Number(tile.point.z),
                            })),
                            boxSize: effectiveBoxSize,
                            size: TILE_SIZE,
                            format: "webp",
                            quality: 68,
                        },
                        {
                            signal: controller.signal,
                        },
                    );

                    if (controller.signal.aborted) return;

                    const tilesById = new Map(
                        missingTiles.map((tile) => [tile.pointId, tile]),
                    );

                    for (const item of result.items || []) {
                        const tile = tilesById.get(String(item.id));

                        if (!tile || !item.dataUrl) continue;

                        cacheRef.current.delete(tile.signature);
                        cacheRef.current.set(tile.signature, item.dataUrl);
                    }

                    while (cacheRef.current.size > MAX_CACHE_ITEMS) {
                        const oldestKey = cacheRef.current.keys().next().value;

                        if (oldestKey === undefined) break;

                        cacheRef.current.delete(oldestKey);
                    }

                    if (result.errors?.length) {
                        setLoadError(`${result.errors.length} preview(s) could not be rendered.`);
                    }

                    setCacheVersion((current) => current + 1);
                } catch (error) {
                    if (controller.signal.aborted) return;

                    setLoadError(
                        error instanceof Error
                            ? error.message
                            : "Failed to load particle previews.",
                    );
                }
            })();
        }, REQUEST_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [
        effectiveBoxSize,
        open,
        outputName,
        projectId,
        protocolId,
        service,
        tomogramId,
        visibleSignatureKey,
        visibleTiles,
    ]);

    useEffect(() => {
        if (!open || selectedPointId == null) return;

        const selectedIndex = points.findIndex(
            (point, index) => getPointId(point, index) === selectedPointId,
        );

        if (selectedIndex < 0) return;

        const container = scrollRef.current;
        if (!container) return;

        const selectedRow = Math.floor(selectedIndex / COLUMNS);
        const selectedTop = selectedRow * ROW_HEIGHT;
        const selectedBottom = selectedTop + ROW_HEIGHT;

        if (
            selectedTop >= container.scrollTop &&
            selectedBottom <= container.scrollTop + container.clientHeight
        ) {
            return;
        }

        const nextScrollTop = Math.max(
            0,
            selectedTop - Math.max(0, container.clientHeight - ROW_HEIGHT) / 2,
        );

        container.scrollTop = nextScrollTop;
        setScrollTop(nextScrollTop);
    }, [open, points, selectedPointId]);

    if (!open) return null;

    return (
        <Paper
            elevation={10}
            onPointerDownCapture={onInteract}
            sx={{
                position: "fixed",
                top: 24,
                right: 24,
                width: 250,
                maxHeight: "calc(100vh - 48px)",
                zIndex: 1500,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
            }}
        >
            <Box
                sx={{
                    px: 1,
                    py: 0.75,
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.default",
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Particles
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                        {points.length.toLocaleString("en-US")} coordinate(s)
                    </Typography>
                </Box>

                <IconButton size="small" onClick={onClose}>
                    <X size={16} />
                </IconButton>
            </Box>

            {loadError && (
                <Typography
                    variant="caption"
                    color="error"
                    sx={{ px: 1, py: 0.5 }}
                >
                    {loadError}
                </Typography>
            )}

            <Box
                ref={scrollRef}
                onScroll={(event) => {
                    setScrollTop(event.currentTarget.scrollTop);
                    setViewportHeight(
                        event.currentTarget.clientHeight || DEFAULT_VIEWPORT_HEIGHT,
                    );
                }}
                sx={{
                    position: "relative",
                    height: "min(620px, calc(100vh - 120px))",
                    overflowY: "auto",
                    overflowX: "hidden",
                    p: `${TILE_GAP}px`,
                    bgcolor: "background.paper",
                }}
            >
                {points.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                        No coordinates available.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            position: "relative",
                            width: COLUMNS * TILE_SIZE + (COLUMNS - 1) * TILE_GAP,
                            height: totalHeight,
                        }}
                    >
                        {visibleTiles.map((tile) => {
                            const selected = tile.pointId === selectedPointId;
                            const imageUrl = cacheRef.current.get(tile.signature);

                            return (
                                <Box
                                    key={tile.pointId}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Particle ${tile.index + 1}`}
                                    onClick={() => onSelect(tile.point)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            onSelect(tile.point);
                                        }
                                    }}
                                    sx={{
                                        position: "absolute",
                                        top: tile.row * ROW_HEIGHT,
                                        left: tile.column * (TILE_SIZE + TILE_GAP),
                                        width: TILE_SIZE,
                                        height: TILE_SIZE,
                                        overflow: "hidden",
                                        cursor: "pointer",
                                        bgcolor: "#111827",
                                        border: selected
                                            ? "3px solid #ef4444"
                                            : "2px solid #4f46e5",
                                        outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                >
                                    {imageUrl ? (
                                        <Box
                                            component="img"
                                            src={imageUrl}
                                            alt={`Particle ${tile.index + 1}`}
                                            sx={{
                                                width: "100%",
                                                height: "100%",
                                                display: "block",
                                                objectFit: "cover",
                                                filter: `brightness(${brightness}) contrast(${contrast})`,
                                            }}
                                        />
                                    ) : (
                                        <Box
                                            sx={{
                                                width: "100%",
                                                height: "100%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        >
                                            <CircularProgress size={18} sx={{ color: "#cbd5e1" }} />
                                        </Box>
                                    )}

                                    <Tooltip title="Remove coordinate">
                                        <IconButton
                                            size="small"
                                            aria-label={`Remove particle ${tile.index + 1}`}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                onRemove(tile.pointId);
                                            }}
                                            sx={{
                                                position: "absolute",
                                                top: 2,
                                                right: 2,
                                                width: 22,
                                                height: 22,
                                                color: "white",
                                                bgcolor: "rgba(15, 23, 42, 0.72)",
                                                "&:hover": {
                                                    bgcolor: "rgba(220, 38, 38, 0.9)",
                                                },
                                            }}
                                        >
                                            <Trash2 size={13} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>
        </Paper>
    );
}