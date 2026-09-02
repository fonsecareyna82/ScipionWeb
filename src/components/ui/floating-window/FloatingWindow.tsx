import {
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import { createPortal } from "react-dom";
import {
    Maximize2,
    Minimize2,
    X,
} from "lucide-react";

import "./FloatingWindow.css";


type FloatingWindowPosition = {
    x: number;
    y: number;
};


type FloatingWindowDragState = {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
};

type FloatingWindowSize = {
    width: number;
    height: number;
};


type FloatingWindowResizeDirection =
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w"
    | "nw";


type FloatingWindowResizeState = {
    pointerId: number;

    direction:
    FloatingWindowResizeDirection;

    startClientX: number;
    startClientY: number;

    startX: number;
    startY: number;

    startWidth: number;
    startHeight: number;
};


type FloatingWindowProps = {
    open: boolean;

    onClose: () => void;

    title: ReactNode;

    children: ReactNode;

    headerActions?: ReactNode;

    ariaLabel?: string;

    closeAriaLabel?: string;

    initialWidth?: CSSProperties["width"];

    initialHeight?: CSSProperties["height"];

    minWidth?: number;

    minHeight?: number;

    resizable?: boolean;
};


const VIEWPORT_MARGIN = 12;

let floatingWindowZIndex = 10020;

let floatingWindowOpenCount = 0;


function nextFloatingWindowZIndex(): number {
    floatingWindowZIndex += 1;

    return floatingWindowZIndex;
}


function getFloatingWindowPortalContainer():
    | HTMLElement
    | null {
    if (
        typeof document ===
        "undefined"
    ) {
        return null;
    }

    return (
        document.querySelector<HTMLElement>(
            "#projectpage-portal-root",
        ) ??
        document.querySelector<HTMLElement>(
            "#project-widget-root",
        ) ??
        document.body
    );
}


function clampWindowPosition(
    x: number,
    y: number,
    width: number,
    height: number,
): FloatingWindowPosition {
    if (
        typeof window ===
        "undefined"
    ) {
        return {
            x,
            y,
        };
    }

    const maxX =
        Math.max(
            VIEWPORT_MARGIN,
            window.innerWidth -
            width -
            VIEWPORT_MARGIN,
        );

    const maxY =
        Math.max(
            VIEWPORT_MARGIN,
            window.innerHeight -
            height -
            VIEWPORT_MARGIN,
        );

    return {
        x: Math.min(
            Math.max(
                VIEWPORT_MARGIN,
                x,
            ),
            maxX,
        ),

        y: Math.min(
            Math.max(
                VIEWPORT_MARGIN,
                y,
            ),
            maxY,
        ),
    };
}


function FloatingWindow({
    open,
    onClose,
    title,
    children,
    headerActions,
    ariaLabel = "Floating window",
    closeAriaLabel = "Close window",
    initialWidth = "70vw",
    initialHeight = "78vh",
    minWidth = 640,
    minHeight = 420,
    resizable = true,
}: FloatingWindowProps) {
    const windowRef =
        useRef<HTMLDivElement | null>(
            null,
        );

    const dragStateRef =
        useRef<
            FloatingWindowDragState |
            null
        >(
            null,
        );

    const resizeStateRef =
        useRef<
            FloatingWindowResizeState |
            null
        >(
            null,
        );

    const [
        position,
        setPosition,
    ] =
        useState<
            FloatingWindowPosition |
            null
        >(
            null,
        );

    const [
        size,
        setSize,
    ] =
        useState<
            FloatingWindowSize |
            null
        >(
            null,
        );

    const [
        isDragging,
        setIsDragging,
    ] =
        useState(
            false,
        );

    const [
        isMaximized,
        setIsMaximized,
    ] =
        useState(
            false,
        );

    const [
        zIndex,
        setZIndex,
    ] =
        useState(
            floatingWindowZIndex,
        );


    useEffect(
        () => {
            if (
                !open ||
                typeof document ===
                "undefined"
            ) {
                return;
            }

            floatingWindowOpenCount += 1;

            document.body.classList.add(
                "sfw-active",
            );

            return () => {
                floatingWindowOpenCount =
                    Math.max(
                        0,
                        floatingWindowOpenCount - 1,
                    );

                if (
                    floatingWindowOpenCount === 0
                ) {
                    document.body.classList.remove(
                        "sfw-active",
                    );
                }
            };
        },
        [
            open,
        ],
    );
    const bringToFront =
        useCallback(
            () => {
                setZIndex(
                    nextFloatingWindowZIndex(),
                );
            },
            [],
        );


    const clampCurrentPosition =
        useCallback(
            () => {
                const element =
                    windowRef.current;

                if (
                    !element ||
                    isMaximized
                ) {
                    return;
                }

                const rect =
                    element
                        .getBoundingClientRect();

                setPosition(
                    (current) => {
                        if (!current) {
                            return current;
                        }

                        const next =
                            clampWindowPosition(
                                current.x,
                                current.y,
                                rect.width,
                                rect.height,
                            );

                        if (
                            next.x === current.x &&
                            next.y === current.y
                        ) {
                            return current;
                        }

                        return next;
                    },
                );
            },
            [
                isMaximized,
            ],
        );


    useLayoutEffect(
        () => {
            if (
                !open ||
                typeof window ===
                "undefined"
            ) {
                return;
            }

            const element =
                windowRef.current;

            if (!element) {
                return;
            }

            setIsMaximized(
                false,
            );

            setIsDragging(
                false,
            );

            dragStateRef.current =
                null;

            setIsResizing(
                false,
            );

            resizeStateRef.current =
                null;

            setSize(
                null,
            );

            setZIndex(
                nextFloatingWindowZIndex(),
            );

            const rect =
                element
                    .getBoundingClientRect();

            const centered =
                clampWindowPosition(
                    (
                        window.innerWidth -
                        rect.width
                    ) /
                    2,

                    (
                        window.innerHeight -
                        rect.height
                    ) /
                    2,

                    rect.width,
                    rect.height,
                );

            setPosition(
                centered,
            );
        },
        [
            open,
        ],
    );


    useEffect(
        () => {
            if (
                !open ||
                typeof window ===
                "undefined"
            ) {
                return;
            }

            const handleResize =
                () => {
                    clampCurrentPosition();
                };

            window.addEventListener(
                "resize",
                handleResize,
            );

            return () => {
                window.removeEventListener(
                    "resize",
                    handleResize,
                );
            };
        },
        [
            open,
            clampCurrentPosition,
        ],
    );


    useLayoutEffect(
        () => {
            if (
                !open ||
                isMaximized
            ) {
                return;
            }

            clampCurrentPosition();
        },
        [
            open,
            isMaximized,
            clampCurrentPosition,
        ],
    );


    const handleDragStart =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            if (
                event.button !== 0 ||
                isMaximized
            ) {
                return;
            }

            const target =
                event.target as
                HTMLElement;

            if (
                target.closest(
                    "button,[data-floating-window-no-drag]",
                )
            ) {
                return;
            }

            const element =
                windowRef.current;

            if (!element) {
                return;
            }

            bringToFront();

            const rect =
                element
                    .getBoundingClientRect();

            const currentPosition =
                position ?? {
                    x: rect.left,
                    y: rect.top,
                };

            dragStateRef.current = {
                pointerId:
                    event.pointerId,

                startClientX:
                    event.clientX,

                startClientY:
                    event.clientY,

                startX:
                    currentPosition.x,

                startY:
                    currentPosition.y,
            };

            setIsDragging(
                true,
            );

            event.currentTarget
                .setPointerCapture?.(
                    event.pointerId,
                );

            event.preventDefault();

            event.stopPropagation();
        };


    const handleDragMove =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            const dragState =
                dragStateRef.current;

            const element =
                windowRef.current;

            if (
                !dragState ||
                !element ||
                dragState.pointerId !==
                event.pointerId
            ) {
                return;
            }

            const rect =
                element
                    .getBoundingClientRect();

            const deltaX =
                event.clientX -
                dragState.startClientX;

            const deltaY =
                event.clientY -
                dragState.startClientY;

            setPosition(
                clampWindowPosition(
                    dragState.startX +
                    deltaX,

                    dragState.startY +
                    deltaY,

                    rect.width,
                    rect.height,
                ),
            );

            event.preventDefault();

            event.stopPropagation();
        };


    const finishDragging =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            const dragState =
                dragStateRef.current;

            if (
                !dragState ||
                dragState.pointerId !==
                event.pointerId
            ) {
                return;
            }

            dragStateRef.current =
                null;

            setIsDragging(
                false,
            );

            event.currentTarget
                .releasePointerCapture?.(
                    event.pointerId,
                );

            event.stopPropagation();
        };


    const handleResizeStart =
        (
            direction:
                FloatingWindowResizeDirection,
        ) =>
            (
                event:
                    ReactPointerEvent<HTMLDivElement>,
            ) => {
                if (
                    event.button !== 0 ||
                    isMaximized
                ) {
                    return;
                }

                const element =
                    windowRef.current;

                if (!element) {
                    return;
                }

                bringToFront();

                const rect =
                    element
                        .getBoundingClientRect();

                resizeStateRef.current = {
                    pointerId:
                        event.pointerId,

                    direction,

                    startClientX:
                        event.clientX,

                    startClientY:
                        event.clientY,

                    startX:
                        rect.left,

                    startY:
                        rect.top,

                    startWidth:
                        rect.width,

                    startHeight:
                        rect.height,
                };

                setIsResizing(
                    true,
                );

                event.currentTarget
                    .setPointerCapture?.(
                        event.pointerId,
                    );

                event.preventDefault();

                event.stopPropagation();
            };


    const handleResizeMove =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            const state =
                resizeStateRef.current;

            if (
                !state ||
                state.pointerId !==
                event.pointerId ||
                typeof window ===
                "undefined"
            ) {
                return;
            }

            const deltaX =
                event.clientX -
                state.startClientX;

            const deltaY =
                event.clientY -
                state.startClientY;

            const effectiveMinWidth =
                Math.min(
                    minWidth,
                    Math.max(
                        0,
                        window.innerWidth -
                        VIEWPORT_MARGIN *
                        2,
                    ),
                );

            const effectiveMinHeight =
                Math.min(
                    minHeight,
                    Math.max(
                        0,
                        window.innerHeight -
                        VIEWPORT_MARGIN *
                        2,
                    ),
                );

            let nextX =
                state.startX;

            let nextY =
                state.startY;

            let nextWidth =
                state.startWidth;

            let nextHeight =
                state.startHeight;


            const resizeRight =
                state.direction.includes(
                    "e",
                );

            const resizeLeft =
                state.direction.includes(
                    "w",
                );

            const resizeBottom =
                state.direction.includes(
                    "s",
                );

            const resizeTop =
                state.direction.includes(
                    "n",
                );


            if (resizeRight) {
                const maxWidth =
                    Math.max(
                        effectiveMinWidth,

                        window.innerWidth -
                        state.startX -
                        VIEWPORT_MARGIN,
                    );

                nextWidth =
                    Math.min(
                        Math.max(
                            effectiveMinWidth,
                            state.startWidth +
                            deltaX,
                        ),
                        maxWidth,
                    );
            }


            if (resizeLeft) {
                const rightEdge =
                    state.startX +
                    state.startWidth;

                const maxX =
                    rightEdge -
                    effectiveMinWidth;

                nextX =
                    Math.min(
                        Math.max(
                            VIEWPORT_MARGIN,
                            state.startX +
                            deltaX,
                        ),
                        maxX,
                    );

                nextWidth =
                    rightEdge -
                    nextX;
            }


            if (resizeBottom) {
                const maxHeight =
                    Math.max(
                        effectiveMinHeight,

                        window.innerHeight -
                        state.startY -
                        VIEWPORT_MARGIN,
                    );

                nextHeight =
                    Math.min(
                        Math.max(
                            effectiveMinHeight,
                            state.startHeight +
                            deltaY,
                        ),
                        maxHeight,
                    );
            }


            if (resizeTop) {
                const bottomEdge =
                    state.startY +
                    state.startHeight;

                const maxY =
                    bottomEdge -
                    effectiveMinHeight;

                nextY =
                    Math.min(
                        Math.max(
                            VIEWPORT_MARGIN,
                            state.startY +
                            deltaY,
                        ),
                        maxY,
                    );

                nextHeight =
                    bottomEdge -
                    nextY;
            }


            setPosition({
                x:
                    nextX,

                y:
                    nextY,
            });

            setSize({
                width:
                    nextWidth,

                height:
                    nextHeight,
            });

            event.preventDefault();

            event.stopPropagation();
        };


    const finishResizing =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            const state =
                resizeStateRef.current;

            if (
                !state ||
                state.pointerId !==
                event.pointerId
            ) {
                return;
            }

            resizeStateRef.current =
                null;

            setIsResizing(
                false,
            );

            event.currentTarget
                .releasePointerCapture?.(
                    event.pointerId,
                );

            event.stopPropagation();
        };

    const handleToggleMaximize =
        () => {
            bringToFront();

            setIsMaximized(
                (current) =>
                    !current,
            );
        };


    if (!open) {
        return null;
    }


    const portalContainer =
        getFloatingWindowPortalContainer();

    if (!portalContainer) {
        return null;
    }


    const positionStyle:
        CSSProperties =
        isMaximized
            ? {}
            : position
                ? {
                    left:
                        position.x,

                    top:
                        position.y,

                    transform:
                        "none",
                }
                : {
                    left:
                        "50%",

                    top:
                        "50%",

                    transform:
                        "translate(-50%, -50%)",
                };


    const sizeStyle:
        CSSProperties =
        isMaximized
            ? {}
            : {
                width:
                    size?.width ??
                    initialWidth,

                height:
                    size?.height ??
                    initialHeight,

                minWidth:
                    `min(${minWidth}px, calc(100vw - ${VIEWPORT_MARGIN *
                    2
                    }px))`,

                minHeight:
                    `min(${minHeight}px, calc(100vh - ${VIEWPORT_MARGIN *
                    2
                    }px))`,
            };


    return createPortal(
        <div
            ref={
                windowRef
            }
            role="dialog"
            aria-modal="false"
            aria-label={
                ariaLabel
            }
            tabIndex={
                -1
            }
            className={[
                "sfw-window",

                isMaximized
                    ? "sfw-window--maximized"
                    : "",
            ]
                .filter(Boolean)
                .join(" ")}
            data-maximized={
                isMaximized
                    ? "true"
                    : "false"
            }
            data-dragging={
                isDragging
                    ? "true"
                    : "false"
            }
            data-resizing={
                isResizing
                    ? "true"
                    : "false"
            }
            style={{
                ...positionStyle,
                ...sizeStyle,

                zIndex,
            }}
            onPointerDown={(
                event,
            ) => {
                bringToFront();

                event.stopPropagation();
            }}
            onClick={(
                event,
            ) =>
                event
                    .stopPropagation()
            }
            onDoubleClick={(
                event,
            ) =>
                event
                    .stopPropagation()
            }
            onContextMenu={(
                event,
            ) =>
                event
                    .stopPropagation()
            }
            onWheel={(
                event,
            ) =>
                event
                    .stopPropagation()
            }
        >
            <div
                className="sfw-header"
                data-testid="floating-window-drag-handle"
                onPointerDown={
                    handleDragStart
                }
                onPointerMove={
                    handleDragMove
                }
                onPointerUp={
                    finishDragging
                }
                onPointerCancel={
                    finishDragging
                }
            >
                <div className="sfw-title">
                    {title}
                </div>

                <div
                    className="sfw-controls"
                    data-floating-window-no-drag
                >
                    {headerActions}

                    <button
                        type="button"
                        className="sfw-controlButton"
                        aria-label={
                            isMaximized
                                ? "Restore window"
                                : "Maximize window"
                        }
                        title={
                            isMaximized
                                ? "Restore"
                                : "Maximize"
                        }
                        onClick={
                            handleToggleMaximize
                        }
                    >
                        {isMaximized
                            ? (
                                <Minimize2 />
                            )
                            : (
                                <Maximize2 />
                            )}
                    </button>

                    <button
                        type="button"
                        className={[
                            "sfw-controlButton",
                            "sfw-closeButton",
                        ].join(" ")}
                        aria-label={
                            closeAriaLabel
                        }
                        title="Close"
                        onClick={
                            onClose
                        }
                    >
                        <X />
                    </button>
                </div>
            </div>

            <div className="sfw-content">
                {children}
            </div>
            {resizable &&
                !isMaximized && (
                    <>
                        {(
                            [
                                "n",
                                "ne",
                                "e",
                                "se",
                                "s",
                                "sw",
                                "w",
                                "nw",
                            ] as FloatingWindowResizeDirection[]
                        ).map(
                            (
                                direction,
                            ) => (
                                <div
                                    key={
                                        direction
                                    }
                                    className={[
                                        "sfw-resizeHandle",

                                        `sfw-resizeHandle--${direction}`,
                                    ].join(
                                        " ",
                                    )}
                                    data-testid={
                                        `floating-window-resize-${direction}`
                                    }
                                    data-floating-window-no-drag
                                    onPointerDown={
                                        handleResizeStart(
                                            direction,
                                        )
                                    }
                                    onPointerMove={
                                        handleResizeMove
                                    }
                                    onPointerUp={
                                        finishResizing
                                    }
                                    onPointerCancel={
                                        finishResizing
                                    }
                                />
                            ),
                        )}
                    </>
                )}
        </div>,
        portalContainer,
    );
}


export default FloatingWindow;