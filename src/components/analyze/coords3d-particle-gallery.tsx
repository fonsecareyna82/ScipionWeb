import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
    Box,
    CircularProgress,
    IconButton,
    Paper,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import { Trash2, X } from "lucide-react";
import { useProjectService } from "@/ProjectServiceContext";
import type {
    Coordinates3dPoint,
    Coordinates3dGalleryView,
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
    selectedPointIds: ReadonlySet<string>;
    boxSize: number;
    brightness: number;
    contrast: number;
    onClose: () => void;
    onSelect: (point: GalleryPoint, options: { additive: boolean; range: boolean }) => void;
    onRemove: (pointId: string) => void;
    onRemoveSelected: () => void;
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

type GalleryPosition = {
    x: number;
    y: number;
};

type GalleryDrag = {
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
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
const TRIPLE_VIEW_LABELS = [
    { label: "XY", top: 2, left: 2 },
    { label: "XZ", top: 2, left: "calc(50% + 2px)" },
    { label: "YZ", top: "calc(50% + 2px)", left: 2 },
] as const;

function getPointId(point: GalleryPoint, index: number): string {
    return String(point.id ?? index);
}

function makeSignature(
    tomogramId: Id,
    point: GalleryPoint,
    index: number,
    boxSize: number,
    view: Coordinates3dGalleryView,
): string {
    return [
        String(tomogramId),
        getPointId(point, index),
        Number(point.x).toFixed(2),
        Number(point.y).toFixed(2),
        Number(point.z).toFixed(2),
        boxSize,
        TILE_SIZE,
        view,
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
    selectedPointIds,
    boxSize,
    brightness,
    contrast,
    onClose,
    onSelect,
    onRemove,
    onRemoveSelected,
    onInteract,
}: Coords3dParticleGalleryProps) {
    const service = useProjectService();

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const cacheRef = useRef<Map<string, string>>(new Map());
    const requestAbortRef = useRef<AbortController | null>(null);

    const paperRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<GalleryDrag | null>(null);
    const pendingPositionRef = useRef<GalleryPosition | null>(null);
    const dragFrameRef = useRef<number | null>(null);

    const [position, setPosition] = useState<GalleryPosition | null>(null);
    const [dragging, setDragging] = useState(false);

    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [view, setView] = useState<Coordinates3dGalleryView>("xy");
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
                signature: makeSignature(tomogramId, point, index, effectiveBoxSize, view),
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
        view,
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
                            view,
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
        view,
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

    useEffect(() => {
        if (!open) return;

        const clampCurrentPosition = () => {
            setPosition((current) => {
                if (!current || !paperRef.current) return current;

                const rect = paperRef.current.getBoundingClientRect();
                const maxX = Math.max(8, window.innerWidth - rect.width - 8);
                const maxY = Math.max(8, window.innerHeight - rect.height - 8);

                const next = {
                    x: Math.max(8, Math.min(current.x, maxX)),
                    y: Math.max(8, Math.min(current.y, maxY)),
                };

                if (next.x === current.x && next.y === current.y) {
                    return current;
                }

                return next;
            });
        };

        const frame = window.requestAnimationFrame(clampCurrentPosition);
        window.addEventListener("resize", clampCurrentPosition);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("resize", clampCurrentPosition);
        };
    }, [open]);

    useEffect(() => {
        return () => {
            if (dragFrameRef.current !== null) {
                window.cancelAnimationFrame(dragFrameRef.current);
            }
        };
    }, []);

    const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;

        const target = event.target as HTMLElement;

        if (target.closest("button")) return;

        const paper = paperRef.current;

        if (!paper) return;

        const rect = paper.getBoundingClientRect();

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        const initialPosition = {
            x: rect.left,
            y: rect.top,
        };

        pendingPositionRef.current = initialPosition;
        setPosition(initialPosition);

        dragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            width: rect.width,
            height: rect.height,
        };

        setDragging(true);
        onInteract?.();
    };

    const handleHeaderPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;

        event.preventDefault();

        const maxX = Math.max(8, window.innerWidth - drag.width - 8);
        const maxY = Math.max(8, window.innerHeight - drag.height - 8);

        pendingPositionRef.current = {
            x: Math.max(8, Math.min(event.clientX - drag.offsetX, maxX)),
            y: Math.max(8, Math.min(event.clientY - drag.offsetY, maxY)),
        };

        if (dragFrameRef.current !== null) return;

        dragFrameRef.current = window.requestAnimationFrame(() => {
            dragFrameRef.current = null;

            if (pendingPositionRef.current) {
                setPosition(pendingPositionRef.current);
            }
        });
    };

    const finishGalleryDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;

        if (dragFrameRef.current !== null) {
            window.cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }

        if (pendingPositionRef.current) {
            setPosition(pendingPositionRef.current);
        }

        dragRef.current = null;
        pendingPositionRef.current = null;
        setDragging(false);

        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may already have been released.
        }
    };


    if (!open) return null;

    return (
        <Paper
            ref={paperRef}
            elevation={10}
            onPointerDownCapture={onInteract}
            sx={{
                position: "fixed",
                top: position?.y ?? 24,
                left: position?.x ?? "auto",
                right: position ? "auto" : 24,
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
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={finishGalleryDrag}
                onPointerCancel={finishGalleryDrag}
                sx={{
                    px: 1,
                    py: 0.75,
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.default",
                    cursor: dragging ? "grabbing" : "grab",
                    userSelect: "none",
                    touchAction: "none",
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Particles
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                        {points.length.toLocaleString("en-US")} coordinate(s)
                        {selectedPointIds.size > 1 ? ` · ${selectedPointIds.size.toLocaleString("en-US")} selected` : ""}
                    </Typography>
                </Box>

                {selectedPointIds.size > 0 && (
                    <Tooltip title={`Remove ${selectedPointIds.size} selected coordinate(s)`}>
                        <IconButton
                            size="small"
                            aria-label="Remove selected particles"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={onRemoveSelected}
                            sx={{ color: "error.main" }}
                        >
                            <Trash2 size={16} />
                        </IconButton>
                    </Tooltip>
                )}

                <IconButton size="small" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>
                    <X size={16} />
                </IconButton>
            </Box>

            <Box sx={{ px: 1, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                <ToggleButtonGroup
                    value={view}
                    exclusive
                    fullWidth
                    size="small"
                    aria-label="Particle preview orientation"
                    onChange={(_event, nextView: Coordinates3dGalleryView | null) => {
                        if (!nextView) return;
                        setLoadError(null);
                        setView(nextView);
                    }}
                    sx={{
                        "& .MuiToggleButton-root": {
                            py: 0.25,
                            px: 0.5,
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            textTransform: "none",
                        },
                    }}
                >
                    <ToggleButton value="xy" aria-label="XY particle previews">XY</ToggleButton>
                    <ToggleButton value="xz" aria-label="XZ particle previews">XZ</ToggleButton>
                    <ToggleButton value="yz" aria-label="YZ particle previews">YZ</ToggleButton>
                    <ToggleButton value="triple" aria-label="Triple particle previews">Triple</ToggleButton>
                </ToggleButtonGroup>
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
                    height: "min(580px, calc(100vh - 158px))",
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
                            const primary = tile.pointId === selectedPointId;
                            const selected = selectedPointIds.has(tile.pointId);
                            const imageUrl = cacheRef.current.get(tile.signature);

                            return (
                                <Box
                                    key={tile.pointId}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={selected}
                                    aria-label={`Particle ${tile.index + 1}`}
                                    onClick={(event) => onSelect(tile.point, {
                                        additive: event.ctrlKey || event.metaKey,
                                        range: event.shiftKey,
                                    })}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            onSelect(tile.point, {
                                                additive: event.ctrlKey || event.metaKey,
                                                range: event.shiftKey,
                                            });
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
                                        border: primary
                                            ? "3px solid #ef4444"
                                            : selected
                                                ? "3px solid #f59e0b"
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

                                    {view === "triple" && imageUrl && TRIPLE_VIEW_LABELS.map((item) => (
                                        <Box
                                            key={item.label}
                                            component="span"
                                            sx={{
                                                position: "absolute",
                                                top: item.top,
                                                left: item.left,
                                                px: 0.25,
                                                color: "white",
                                                bgcolor: "rgba(15, 23, 42, 0.7)",
                                                fontSize: "7px",
                                                fontWeight: 700,
                                                lineHeight: "10px",
                                                pointerEvents: "none",
                                            }}
                                        >
                                            {item.label}
                                        </Box>
                                    ))}

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
