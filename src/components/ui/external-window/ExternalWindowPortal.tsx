import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import {
    createPortal,
} from "react-dom";

import {
    ArrowLeft,
    X,
} from "lucide-react";

import "./ExternalWindowPortal.css";


const EXTERNAL_WINDOW_ROOT_ID =
    "scipion-external-window-root";

const MIRRORED_STYLE_ATTR =
    "data-scipion-external-style";


type OpenExternalWindowOptions = {
    title: string;

    width?: number;

    height?: number;
};

type ExternalWindowDragState = {
    pointerId: number;

    startScreenX: number;
    startScreenY: number;

    startWindowX: number;
    startWindowY: number;
};


type DetachableContentMountProps = {
    host: HTMLElement;

    className?: string;
};


type PersistentContentPortalProps = {
    host: HTMLElement;

    children: ReactNode;
};


type ExternalWindowPortalProps = {
    popupWindow: Window;

    contentHost: HTMLElement;

    title: string;

    subtitle?: ReactNode;

    className?: string;

    badge?: string;

    darkMode?: boolean;

    headerContent?: ReactNode;

    headerActions?: ReactNode;

    returnAriaLabel?: string;

    returnTitle?: string;

    closeAriaLabel?: string;

    closeTitle?: string;

    onReturn: () => void;

    onClose: () => void;

    onWindowClosed: () => void;
};


function ensureExternalWindowRoot(
    targetDocument: Document,
): HTMLElement {
    let root =
        targetDocument.getElementById(
            EXTERNAL_WINDOW_ROOT_ID,
        ) as HTMLElement | null;


    if (!root) {
        root =
            targetDocument.createElement(
                "div",
            );

        root.id =
            EXTERNAL_WINDOW_ROOT_ID;

        targetDocument.body.appendChild(
            root,
        );
    }


    root.style.width =
        "100%";

    root.style.height =
        "100%";

    root.style.minWidth =
        "0";

    root.style.minHeight =
        "0";

    root.style.display =
        "flex";

    root.style.overflow =
        "hidden";


    return root;
}


function ensureExternalBase(
    targetDocument: Document,
    href: string,
) {
    let base =
        targetDocument.head.querySelector(
            "base[data-scipion-external-base]",
        ) as HTMLBaseElement | null;

    if (!base) {
        base =
            targetDocument.createElement(
                "base",
            );

        base.setAttribute(
            "data-scipion-external-base",
            "true",
        );

        targetDocument.head.prepend(
            base,
        );
    }

    base.href =
        href;
}


function prepareExternalDocument(
    targetDocument: Document,
) {
    targetDocument.documentElement.style.width =
        "100%";

    targetDocument.documentElement.style.height =
        "100%";

    targetDocument.body.style.margin =
        "0";

    targetDocument.body.style.width =
        "100%";

    targetDocument.body.style.height =
        "100%";

    targetDocument.body.style.overflow =
        "hidden";

    targetDocument.body.classList.add(
        "sfw-active",
        "projectpage-widget-root",
    );
}


function getStyleSheetCssText(
    sheet: CSSStyleSheet,
    ownerElement:
        Element |
        null,
): string {
    try {
        return Array.from(
            sheet.cssRules,
        )
            .map(
                (rule) =>
                    rule.cssText,
            )
            .join(
                "\n",
            );
    } catch {
        return ownerElement
            ?.textContent ??
            "";
    }
}


// What a popup already has of each source stylesheet, so a sync only copies what changed: turning every
// rule of every sheet into text on each change of the page made the whole application slow while a
// popup was open (styles are injected into <head> on almost any render).
type MirroredSheet = {
    node: HTMLElement;
    href: string | null;
    ruleCount: number;
};

type StyleMirrorState = {
    // By source element, or by the sheet itself where it has none
    sheets: WeakMap<object, MirroredSheet>;
    // Source <style>/<link> elements whose content changed since the last sync
    dirty: Set<Node>;
};

const styleMirrorStates =
    new WeakMap<Document, StyleMirrorState>();


function getStyleMirrorState(
    targetDocument: Document,
): StyleMirrorState {
    let state =
        styleMirrorStates.get(
            targetDocument,
        );

    if (!state) {
        state = {
            sheets: new WeakMap(),
            dirty: new Set(),
        };

        styleMirrorStates.set(
            targetDocument,
            state,
        );
    }

    return state;
}


/** Note the source style elements a mutation touched, so the next sync copies them again. */
export function markMirroredStylesDirty(
    targetDocument: Document,
    records: MutationRecord[],
) {
    const state =
        getStyleMirrorState(
            targetDocument,
        );

    records.forEach(
        (record) => {
            let node: Node | null =
                record.target;

            while (
                node &&
                !(
                    node instanceof Element &&
                    ["style", "link"].includes(
                        node.tagName.toLowerCase(),
                    )
                )
            ) {
                node = node.parentNode;
            }

            if (node) {
                state.dirty.add(
                    node,
                );
            }
        },
    );
}


function getRuleCount(
    sheet: CSSStyleSheet,
): number {
    try {
        return sheet.cssRules.length;
    } catch {
        return -1;
    }
}


function appendNewRules(
    sheet: CSSStyleSheet,
    targetNode: HTMLElement,
    from: number,
): boolean {
    const targetSheet =
        (targetNode as HTMLStyleElement).sheet;

    if (!targetSheet) {
        return false;
    }

    try {
        const rules =
            sheet.cssRules;

        for (let index = from; index < rules.length; index += 1) {
            targetSheet.insertRule(
                rules[index].cssText,
                targetSheet.cssRules.length,
            );
        }

        return true;
    } catch {
        return false;
    }
}


export function mirrorDocumentStyles(
    sourceDocument: Document,
    targetDocument: Document,
) {
    const state =
        getStyleMirrorState(
            targetDocument,
        );

    const wanted: HTMLElement[] = [];

    Array.from(
        sourceDocument.styleSheets,
    ).forEach(
        (sheet) => {
            const ownerNode =
                sheet.ownerNode instanceof Element
                    ? sheet.ownerNode
                    : null;

            const key: object =
                ownerNode ?? sheet;

            const ownerTag =
                ownerNode?.tagName.toLowerCase() ?? "";

            const known =
                state.sheets.get(
                    key,
                );

            const knownIsHere =
                known &&
                known.node.ownerDocument === targetDocument;

            if (ownerTag === "link") {
                const href =
                    (ownerNode as HTMLLinkElement).href;

                if (knownIsHere && known!.href === href) {
                    wanted.push(known!.node);

                    return;
                }

                const clonedLink =
                    ownerNode!.cloneNode(false) as HTMLLinkElement;

                clonedLink.setAttribute(
                    MIRRORED_STYLE_ATTR,
                    "link",
                );

                state.sheets.set(
                    key,
                    { node: clonedLink, href, ruleCount: -1 },
                );

                wanted.push(clonedLink);

                return;
            }

            const ruleCount =
                getRuleCount(
                    sheet,
                );

            // Unchanged: the same rules, and no mutation of its element since the last sync
            if (
                knownIsHere &&
                known!.ruleCount === ruleCount &&
                ruleCount !== -1 &&
                !(ownerNode && state.dirty.has(ownerNode))
            ) {
                wanted.push(known!.node);

                return;
            }

            // Grown at its end (emotion inserts its rules there): only the new rules are copied
            if (
                knownIsHere &&
                ruleCount > known!.ruleCount &&
                known!.ruleCount >= 0 &&
                !(ownerNode && state.dirty.has(ownerNode)) &&
                appendNewRules(
                    sheet,
                    known!.node,
                    known!.ruleCount,
                )
            ) {
                known!.ruleCount = ruleCount;

                wanted.push(known!.node);

                return;
            }

            const targetStyle =
                knownIsHere
                    ? known!.node
                    : (
                        ownerNode && ownerTag === "style"
                            ? ownerNode.cloneNode(false) as HTMLElement
                            : targetDocument.createElement("style")
                    );

            targetStyle.setAttribute(
                MIRRORED_STYLE_ATTR,
                "style",
            );

            const cssText =
                getStyleSheetCssText(
                    sheet,
                    ownerNode,
                );

            if (targetStyle.textContent !== cssText) {
                targetStyle.textContent = cssText;
            }

            state.sheets.set(
                key,
                { node: targetStyle, href: null, ruleCount },
            );

            wanted.push(targetStyle);
        },
    );

    state.dirty.clear();

    const wantedSet =
        new Set<Node>(wanted);

    const current =
        Array.from(
            targetDocument.head.querySelectorAll<HTMLElement>(
                `[${MIRRORED_STYLE_ATTR}]`,
            ),
        );

    current.forEach(
        (node) => {
            if (!wantedSet.has(node)) {
                node.remove();
            }
        },
    );

    // The cascade follows the source order: the elements move only when it changed
    const inOrder =
        current.filter(
            (node) => wantedSet.has(node),
        );

    const sameOrder =
        inOrder.length === wanted.length &&
        inOrder.every(
            (node, index) => node === wanted[index],
        );

    if (!sameOrder) {
        wanted.forEach(
            (node) => {
                targetDocument.head.appendChild(
                    node,
                );
            },
        );
    }
}


export function openExternalWindow({
    title,
    width = 1280,
    height = 860,
}: OpenExternalWindowOptions):
    Window |
    null {
    if (
        typeof window ===
        "undefined" ||
        typeof document ===
        "undefined"
    ) {
        return null;
    }

    const left =
        Math.round(
            window.screenX +
            (
                window.outerWidth -
                width
            ) /
            2,
        );

    const top =
        Math.round(
            window.screenY +
            (
                window.outerHeight -
                height
            ) /
            2,
        );

    const popup =
        window.open(
            "",
            "_blank",
            [
                "popup=yes",

                `width=${width}`,
                `height=${height}`,

                `left=${left}`,
                `top=${top}`,

                "resizable=yes",
                "scrollbars=no",
            ].join(
                ",",
            ),
        );

    if (!popup) {
        return null;
    }


    try {
        popup.history.replaceState(
            null,
            "",
            window.location.href,
        );
    } catch {
        // Keep the popup usable even if the browser
        // refuses to replace the initial about:blank URL.
    }


    const targetDocument =
        popup.document;

    targetDocument.head
        .replaceChildren();

    targetDocument.body
        .replaceChildren();

    const charset =
        targetDocument.createElement(
            "meta",
        );

    charset.setAttribute(
        "charset",
        "utf-8",
    );

    targetDocument.head.appendChild(
        charset,
    );

    ensureExternalBase(
        targetDocument,
        document.baseURI,
    );

    targetDocument.title =
        title;

    prepareExternalDocument(
        targetDocument,
    );

    ensureExternalWindowRoot(
        targetDocument,
    );

    mirrorDocumentStyles(
        document,
        targetDocument,
    );

    return popup;
}


export function DetachableContentMount({
    host,
    className,
}: DetachableContentMountProps) {
    const mountRef =
        useRef<HTMLDivElement | null>(
            null,
        );

    useLayoutEffect(
        () => {
            const mount =
                mountRef.current;

            if (!mount) {
                return;
            }

            const targetDocument =
                mount.ownerDocument;

            if (
                host.ownerDocument !==
                targetDocument
            ) {
                targetDocument.adoptNode(
                    host,
                );
            }

            mount.appendChild(
                host,
            );

            return () => {
                if (
                    host.parentNode ===
                    mount
                ) {
                    mount.removeChild(
                        host,
                    );
                }
            };
        },
        [
            host,
        ],
    );


    return (
        <div
            ref={
                mountRef
            }
            className={[
                "dch-contentMount",
                className,
            ]
                .filter(
                    Boolean,
                )
                .join(
                    " ",
                )}
        />
    );
}


export function PersistentContentPortal({
    host,
    children,
}: PersistentContentPortalProps) {
    return createPortal(
        children,
        host,
    );
}


function restoreContentHostToSourceDocument(
    host: HTMLElement,
) {
    if (
        typeof document ===
        "undefined"
    ) {
        return;
    }

    if (
        host.ownerDocument ===
        document
    ) {
        return;
    }

    document.adoptNode(
        host,
    );
}


function ExternalWindowPortal({
    popupWindow,
    contentHost,
    title,
    subtitle,
    badge,
    darkMode = false,
    headerContent,
    headerActions,
    className,
    returnAriaLabel =
    "Return viewer to ScipionWeb",
    returnTitle =
    "Return to ScipionWeb",
    closeAriaLabel =
    "Close analyze dialog",
    closeTitle =
    "Close viewer",
    onReturn,
    onClose,
    onWindowClosed,
}: ExternalWindowPortalProps) {
    const closeNotifiedRef =
        useRef(
            false,
        );

    const dragStateRef =
        useRef<
            ExternalWindowDragState |
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

    const targetDocument =
        popupWindow.document;

    prepareExternalDocument(
        targetDocument,
    );

    targetDocument.documentElement
        .classList.toggle(
            "dark",
            darkMode,
        );

    targetDocument.body
        .classList.toggle(
            "dark",
            darkMode,
        );

    const externalTheme =
        darkMode
            ? "dark"
            : "light";

    targetDocument.documentElement
        .dataset.theme =
        externalTheme;

    targetDocument.body
        .dataset.theme =
        externalTheme;

    targetDocument.documentElement
        .style.colorScheme =
        externalTheme;

    targetDocument.body
        .style.colorScheme =
        externalTheme;

    ensureExternalBase(
        targetDocument,
        document.baseURI,
    );

    const portalRoot =
        ensureExternalWindowRoot(
            targetDocument,
        );


    useEffect(
        () => {
            closeNotifiedRef.current =
                false;

            let firstSyncTimer:
                number |
                null =
                null;

            let secondSyncTimer:
                number |
                null =
                null;


            const syncStyles =
                () => {
                    if (
                        popupWindow.closed
                    ) {
                        return;
                    }

                    mirrorDocumentStyles(
                        document,
                        targetDocument,
                    );
                };


            const scheduleStyleSync =
                () => {
                    if (
                        firstSyncTimer !==
                        null
                    ) {
                        window.clearTimeout(
                            firstSyncTimer,
                        );
                    }

                    if (
                        secondSyncTimer !==
                        null
                    ) {
                        window.clearTimeout(
                            secondSyncTimer,
                        );
                    }

                    firstSyncTimer =
                        window.setTimeout(
                            syncStyles,
                            0,
                        );

                    secondSyncTimer =
                        window.setTimeout(
                            syncStyles,
                            120,
                        );
                };


            const handlePopupClosed =
                () => {
                    if (
                        closeNotifiedRef.current
                    ) {
                        return;
                    }

                    closeNotifiedRef.current =
                        true;

                    restoreContentHostToSourceDocument(
                        contentHost,
                    );

                    onWindowClosed();
                };


            const handleSourceUnload =
                () => {
                    if (
                        !popupWindow.closed
                    ) {
                        popupWindow.close();
                    }
                };


            const observer =
                typeof MutationObserver !==
                    "undefined"
                    ? new MutationObserver(
                        (records) => {
                            markMirroredStylesDirty(
                                targetDocument,
                                records,
                            );

                            scheduleStyleSync();
                        },
                    )
                    : null;

            observer?.observe(
                document.head,
                {
                    childList:
                        true,

                    subtree:
                        true,

                    characterData:
                        true,
                },
            );

            popupWindow.addEventListener(
                "beforeunload",
                handlePopupClosed,
            );

            popupWindow.addEventListener(
                "pagehide",
                handlePopupClosed,
            );

            popupWindow.addEventListener(
                "focus",
                syncStyles,
            );

            window.addEventListener(
                "beforeunload",
                handleSourceUnload,
            );

            targetDocument.addEventListener(
                "click",
                scheduleStyleSync,
                true,
            );

            targetDocument.addEventListener(
                "keydown",
                scheduleStyleSync,
                true,
            );

            syncStyles();


            return () => {
                observer?.disconnect();

                if (
                    firstSyncTimer !==
                    null
                ) {
                    window.clearTimeout(
                        firstSyncTimer,
                    );
                }

                if (
                    secondSyncTimer !==
                    null
                ) {
                    window.clearTimeout(
                        secondSyncTimer,
                    );
                }

                popupWindow.removeEventListener(
                    "beforeunload",
                    handlePopupClosed,
                );

                popupWindow.removeEventListener(
                    "pagehide",
                    handlePopupClosed,
                );

                popupWindow.removeEventListener(
                    "focus",
                    syncStyles,
                );

                window.removeEventListener(
                    "beforeunload",
                    handleSourceUnload,
                );

                targetDocument.removeEventListener(
                    "click",
                    scheduleStyleSync,
                    true,
                );

                targetDocument.removeEventListener(
                    "keydown",
                    scheduleStyleSync,
                    true,
                );
            };
        },
        [
            popupWindow,
            targetDocument,
            contentHost,
            onWindowClosed,
        ],
    );


    const handleDragStart =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            if (
                event.button !== 0
            ) {
                return;
            }

            const target =
                event.target as
                HTMLElement;

            if (
                target.closest(
                    "button,[data-external-window-no-drag]",
                )
            ) {
                return;
            }

            dragStateRef.current = {
                pointerId:
                    event.pointerId,

                startScreenX:
                    event.screenX,

                startScreenY:
                    event.screenY,

                startWindowX:
                    popupWindow.screenX,

                startWindowY:
                    popupWindow.screenY,
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
            const state =
                dragStateRef.current;

            if (
                !state ||
                state.pointerId !==
                event.pointerId
            ) {
                return;
            }

            const deltaX =
                event.screenX -
                state.startScreenX;

            const deltaY =
                event.screenY -
                state.startScreenY;

            try {
                popupWindow.moveTo(
                    Math.round(
                        state.startWindowX +
                        deltaX,
                    ),

                    Math.round(
                        state.startWindowY +
                        deltaY,
                    ),
                );
            } catch {
                // Some browsers/window managers may restrict
                // scripted window movement.
            }

            event.preventDefault();

            event.stopPropagation();
        };


    const finishDragging =
        (
            event:
                ReactPointerEvent<HTMLDivElement>,
        ) => {
            const state =
                dragStateRef.current;

            if (
                !state ||
                state.pointerId !==
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

    return createPortal(
        <div
            className={[
                "projectpage-widget-root",
                "sew-root",

                className ?? "",

                darkMode
                    ? "dark"
                    : "",
            ]
                .filter(
                    Boolean,
                )
                .join(
                    " ",
                )}
        >
            <div
                className="sew-window"
                data-dragging={
                    isDragging
                        ? "true"
                        : "false"
                }
            >
                <div
                    className="sew-header"
                    data-testid="external-window-drag-handle"
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
                    <div className="sew-headerText">
                        {headerContent
                            ? (
                                headerContent
                            )
                            : (
                                <>
                                    <div className="sew-title">
                                        {title}
                                    </div>

                                    {subtitle
                                        ? (
                                            <div className="sew-subtitle">
                                                {subtitle}
                                            </div>
                                        )
                                        : null}
                                </>
                            )}
                    </div>

                    {!headerContent &&
                        badge
                        ? (
                            <span className="sew-badge">
                                {badge}
                            </span>
                        )
                        : null}

                    <div
                        className="sew-controls"
                        data-external-window-no-drag
                    >
                        {headerActions}
                        <button
                            type="button"
                            className="sew-controlButton"
                            aria-label={
                                returnAriaLabel
                            }
                            title={
                                returnTitle
                            }
                            onClick={
                                onReturn
                            }
                        >
                            <ArrowLeft />
                        </button>

                        <button
                            type="button"
                            className={[
                                "sew-controlButton",
                                "sew-closeButton",
                            ].join(
                                " ",
                            )}
                            aria-label={
                                closeAriaLabel
                            }
                            title={
                                closeTitle
                            }
                            onClick={
                                onClose
                            }
                        >
                            <X />
                        </button>
                    </div>
                </div>

                <div className="sew-content">
                    <DetachableContentMount
                        host={
                            contentHost
                        }
                    />
                </div>
            </div>
        </div>,
        portalRoot,
    );
}


export default ExternalWindowPortal;