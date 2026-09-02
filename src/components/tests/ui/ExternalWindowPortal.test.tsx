import {
    useState,
} from "react";

import {
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";

import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import ExternalWindowPortal, {
    DetachableContentMount,
    PersistentContentPortal,
} from "@/components/ui/external-window/ExternalWindowPortal";


function StatefulViewer() {
    const [
        value,
        setValue,
    ] =
        useState(
            0,
        );

    return (
        <button
            type="button"
            onClick={
                () =>
                    setValue(
                        (current) =>
                            current + 1,
                    )
            }
        >
            State {value}
        </button>
    );
}


type HarnessProps = {
    external: boolean;

    popupWindow: Window;

    contentHost: HTMLElement;
};


function Harness({
    external,
    popupWindow,
    contentHost,
}: HarnessProps) {
    return (
        <>
            <PersistentContentPortal
                host={
                    contentHost
                }
            >
                <StatefulViewer />
            </PersistentContentPortal>

            {external
                ? (
                    <ExternalWindowPortal
                        popupWindow={
                            popupWindow
                        }
                        contentHost={
                            contentHost
                        }
                        title="Viewer"
                        subtitle="Protocol 1"
                        onReturn={
                            vi.fn()
                        }
                        onClose={
                            vi.fn()
                        }
                        onWindowClosed={
                            vi.fn()
                        }
                    />
                )
                : (
                    <div
                        style={{
                            width:
                                600,

                            height:
                                400,

                            display:
                                "flex",
                        }}
                    >
                        <DetachableContentMount
                            host={
                                contentHost
                            }
                        />
                    </div>
                )}
        </>
    );
}


describe(
    "ExternalWindowPortal",
    () => {
        it(
            "preserves mounted React state while moving content between documents",
            () => {
                const iframe =
                    document.createElement(
                        "iframe",
                    );

                document.body.appendChild(
                    iframe,
                );

                const popupWindow =
                    iframe.contentWindow;

                if (!popupWindow) {
                    throw new Error(
                        "Unable to create test popup window",
                    );
                }

                const contentHost =
                    document.createElement(
                        "div",
                    );

                contentHost.style.cssText =
                    `
                      width: 100%;
                      height: 100%;
                      display: flex;
                    `;


                const {
                    rerender,
                } =
                    render(
                        <Harness
                            external={
                                false
                            }
                            popupWindow={
                                popupWindow
                            }
                            contentHost={
                                contentHost
                            }
                        />,
                    );


                const externalRoot =
                    popupWindow.document
                        .getElementById(
                            "scipion-external-window-root",
                        );


                expect(
                    externalRoot,
                ).not.toBeNull();


                expect(
                    externalRoot?.style
                        .width,
                ).toBe(
                    "100%",
                );


                expect(
                    externalRoot?.style
                        .height,
                ).toBe(
                    "100%",
                );


                expect(
                    externalRoot?.style
                        .display,
                ).toBe(
                    "flex",
                );


                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "State 0",
                        },
                    ),
                );


                expect(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "State 1",
                        },
                    ),
                ).toBeInTheDocument();


                rerender(
                    <Harness
                        external
                        popupWindow={
                            popupWindow
                        }
                        contentHost={
                            contentHost
                        }
                    />,
                );


                const externalStateButton =
                    within(
                        popupWindow.document.body,
                    ).getByRole(
                        "button",
                        {
                            name:
                                "State 1",
                        },
                    );


                expect(
                    externalStateButton
                        .ownerDocument,
                ).toBe(
                    popupWindow.document,
                );


                expect(
                    popupWindow.document.body
                        .contains(
                            externalStateButton,
                        ),
                ).toBe(
                    true,
                );


                rerender(
                    <Harness
                        external={
                            false
                        }
                        popupWindow={
                            popupWindow
                        }
                        contentHost={
                            contentHost
                        }
                    />,
                );


                expect(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "State 1",
                        },
                    ),
                ).toBeInTheDocument();


                iframe.remove();
            },
        );
    },
);