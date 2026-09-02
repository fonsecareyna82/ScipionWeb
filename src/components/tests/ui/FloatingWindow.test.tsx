import {
    fireEvent,
    render,
    screen,
} from "@testing-library/react";

import {
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import FloatingWindow from "@/components/ui/floating-window/FloatingWindow";

beforeAll(
    () => {
        if (
            !window.PointerEvent
        ) {
            Object.defineProperty(
                window,
                "PointerEvent",
                {
                    writable: true,
                    configurable: true,
                    value: MouseEvent,
                },
            );
        }
    },
);

describe(
    "FloatingWindow",
    () => {
        it(
            "does not render when closed",
            () => {
                render(
                    <FloatingWindow
                        open={
                            false
                        }
                        onClose={
                            vi.fn()
                        }
                        title="Viewer"
                    >
                        content
                    </FloatingWindow>,
                );

                expect(
                    screen.queryByRole(
                        "dialog",
                    ),
                ).not.toBeInTheDocument();
            },
        );


        it(
            "renders as a non-modal floating window",
            () => {
                render(
                    <FloatingWindow
                        open
                        onClose={
                            vi.fn()
                        }
                        title="Viewer"
                        ariaLabel="Test viewer"
                    >
                        Viewer content
                    </FloatingWindow>,
                );

                const dialog =
                    screen.getByRole(
                        "dialog",
                        {
                            name:
                                "Test viewer",
                        },
                    );

                expect(
                    dialog,
                ).toHaveAttribute(
                    "aria-modal",
                    "false",
                );

                expect(
                    screen.getByText(
                        "Viewer content",
                    ),
                ).toBeInTheDocument();
            },
        );


        it(
            "calls onClose from the close control",
            () => {
                const onClose =
                    vi.fn();

                render(
                    <FloatingWindow
                        open
                        onClose={
                            onClose
                        }
                        title="Viewer"
                    >
                        content
                    </FloatingWindow>,
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Close window",
                        },
                    ),
                );

                expect(
                    onClose,
                ).toHaveBeenCalledTimes(
                    1,
                );
            },
        );


        it(
            "maximizes and restores the window",
            () => {
                render(
                    <FloatingWindow
                        open
                        onClose={
                            vi.fn()
                        }
                        title="Viewer"
                        ariaLabel="Test viewer"
                    >
                        content
                    </FloatingWindow>,
                );

                const dialog =
                    screen.getByRole(
                        "dialog",
                        {
                            name:
                                "Test viewer",
                        },
                    );

                expect(
                    dialog,
                ).toHaveAttribute(
                    "data-maximized",
                    "false",
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Maximize window",
                        },
                    ),
                );

                expect(
                    dialog,
                ).toHaveAttribute(
                    "data-maximized",
                    "true",
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Restore window",
                        },
                    ),
                );

                expect(
                    dialog,
                ).toHaveAttribute(
                    "data-maximized",
                    "false",
                );
            },
        );


        it(
            "moves when dragging the header",
            () => {
                render(
                    <FloatingWindow
                        open
                        onClose={
                            vi.fn()
                        }
                        title="Viewer"
                        ariaLabel="Test viewer"
                    >
                        content
                    </FloatingWindow>,
                );

                const dialog =
                    screen.getByRole(
                        "dialog",
                        {
                            name:
                                "Test viewer",
                        },
                    );

                const handle =
                    screen.getByTestId(
                        "floating-window-drag-handle",
                    );

                const initialLeft =
                    dialog.style.left;

                fireEvent.pointerDown(
                    handle,
                    {
                        pointerId:
                            1,

                        button:
                            0,

                        clientX:
                            100,

                        clientY:
                            100,
                    },
                );

                fireEvent.pointerMove(
                    handle,
                    {
                        pointerId:
                            1,

                        clientX:
                            160,

                        clientY:
                            130,
                    },
                );

                fireEvent.pointerUp(
                    handle,
                    {
                        pointerId:
                            1,
                    },
                );

                expect(
                    dialog.style.left,
                ).not.toBe(
                    initialLeft,
                );
            },
        );

        it(
            "renders custom header actions",
            () => {
                render(
                    <FloatingWindow
                        open
                        onClose={
                            vi.fn()
                        }
                        title="Viewer"
                        headerActions={
                            <button
                                type="button"
                            >
                                Dock
                            </button>
                        }
                    >
                        content
                    </FloatingWindow>,
                );

                expect(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Dock",
                        },
                    ),
                ).toBeInTheDocument();
            },
        );
    },
);