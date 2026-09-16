import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    fetchOutputMetadataTables: vi.fn(),
    fetchMetadataTableSchema: vi.fn(),
    fetchMetadataTableWindow: vi.fn(),
    fetchMetadataImageCellObjectUrl: vi.fn(),
    fetchMetadataImageCellsBatch: vi.fn(),
    runMetadataTableAction: vi.fn(),
    fetchMetadataRowPosition: vi.fn(),
}));

const externalWindowMocks = vi.hoisted(() => ({
    openExternalWindow: vi.fn(),
}));


vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

vi.mock("@/icons", () => ({
    CloseIcon: (props: Record<string, unknown>) => (
        <svg data-testid="close-icon" {...props} />
    ),
}));

vi.mock("lucide-react", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("lucide-react");

    return {
        ...actual,
        LineChart: (props: Record<string, unknown>) => (
            <svg data-testid="plotter-icon" {...props} />
        ),
        ColumnsSettingsIcon: (props: Record<string, unknown>) => (
            <svg data-testid="columns-icon" {...props} />
        ),
        LayoutGrid: (props: Record<string, unknown>) => (
            <svg data-testid="gallery-icon" {...props} />
        ),
        TableIcon: (props: Record<string, unknown>) => (
            <svg data-testid="table-icon" {...props} />
        ),
    };
});

vi.mock("../../analyze/metadata-plotter-dialog", () => ({
    MetadataPlotterDialog: ({
        open,
        selectedTable,
    }: {
        open: boolean;
        selectedTable: string;
    }) =>
        open ? <div>Mock MetadataPlotterDialog {selectedTable}</div> : null,
}));

vi.mock(
    "@/components/ui/external-window/ExternalWindowPortal",
    async () => {
        const actual =
            await vi.importActual<
                typeof import("@/components/ui/external-window/ExternalWindowPortal")
            >(
                "@/components/ui/external-window/ExternalWindowPortal",
            );

        return {
            ...actual,
            openExternalWindow:
                externalWindowMocks.openExternalWindow,
        };
    },
);


import { MetadataViewer } from "../../analyze/metadata-viewer";

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

function getButtonFromIconTestId(testId: string): HTMLButtonElement {
    const icon = screen.getByTestId(testId);
    const button = icon.closest("button");

    if (!button) {
        throw new Error(`Button for icon ${testId} was not found`);
    }

    return button as HTMLButtonElement;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

function makeTables() {
    return [
        {
            name: "particles",
            alias: "Particles",
            rowCount: 2,
        },
        {
            name: "classes",
            alias: "Classes",
            rowCount: 1,
        },
    ];
}

function makeSchema(tableName: "particles" | "classes") {
    if (tableName === "classes") {
        return {
            name: "classes",
            alias: "Classes",
            hasColumnId: true,
            columns: [
                {
                    name: "id",
                    alias: "Id",
                    index: 0,
                    sortable: true,
                    visible: true,
                    rendererType: "int",
                    decimals: 0,
                    hasTransformation: false,
                },
                {
                    name: "size",
                    alias: "Size",
                    index: 1,
                    sortable: true,
                    visible: true,
                    rendererType: "int",
                    decimals: 0,
                    hasTransformation: false,
                },
            ],
            actions: [],
        };
    }

    return {
        name: "particles",
        alias: "Particles",
        hasColumnId: true,
        columns: [
            {
                name: "id",
                alias: "Id",
                index: 0,
                sortable: true,
                visible: true,
                rendererType: "int",
                decimals: 0,
                hasTransformation: false,
            },
            {
                name: "score",
                alias: "Score",
                index: 1,
                sortable: true,
                visible: true,
                rendererType: "float",
                decimals: 2,
                hasTransformation: false,
            },
        ],
        actions: [],
    };
}

function makeWindowRows(tableName: "particles" | "classes") {
    if (tableName === "classes") {
        return {
            rows: [
                {
                    rowId: 10,
                    values: [10, 32],
                },
            ],
            offset: 0,
        };
    }

    return {
        rows: [
            {
                rowId: 1,
                values: [1, 0.91],
            },
            {
                rowId: 2,
                values: [2, 0.82],
            },
        ],
        offset: 0,
    };
}

function renderViewer() {
    return render(
        <MetadataViewer
            projectId={1}
            protocolId={2}
            outputName="metadataOutput"
            embedded
        />,
    );
}

describe("MetadataViewer", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    beforeEach(() => {
        vi.clearAllMocks();

        class ResizeObserverMock {
            observe() { }
            disconnect() { }
            unobserve() { }
        }

        vi.stubGlobal("ResizeObserver", ResizeObserverMock);

        serviceMocks.fetchOutputMetadataTables.mockResolvedValue(makeTables());

        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => makeSchema(tableName as "particles" | "classes"),
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => makeWindowRows(tableName as "particles" | "classes"),
        );

        serviceMocks.fetchMetadataImageCellObjectUrl.mockResolvedValue({
            url: "blob:image-1",
            revoke: vi.fn(),
        });

        // Empty by default (no items matched) -- every cell falls back to
        // fetchMetadataImageCellObjectUrl exactly like before batching
        // existed, so this default doesn't change any other test's
        // assertions. Individual tests override it to exercise batching.
        serviceMocks.fetchMetadataImageCellsBatch.mockResolvedValue({
            tableName: "particles",
            fmt: "png",
            items: [],
            errors: [],
        });

        serviceMocks.runMetadataTableAction.mockResolvedValue({ success: true });

        serviceMocks
            .fetchMetadataRowPosition
            .mockResolvedValue({
                rowId: 2,
                index: 1,
            });

        externalWindowMocks
            .openExternalWindow
            .mockReturnValue(null);

    });

    it("shows the loading state while metadata tables are pending", async () => {
        const deferred = createDeferred<ReturnType<typeof makeTables>>();
        serviceMocks.fetchOutputMetadataTables.mockReturnValueOnce(deferred.promise);

        renderViewer();

        expect(await screen.findByText("Loading tables…")).toBeInTheDocument();

        deferred.resolve([]);

        await waitFor(() => {
            expect(
                screen.getByText("No metadata tables for this output."),
            ).toBeInTheDocument();
        });
    });

    it("shows the schema loading state after tables load", async () => {
        const schemaDeferred = createDeferred<ReturnType<typeof makeSchema>>();
        serviceMocks.fetchMetadataTableSchema.mockReturnValueOnce(schemaDeferred.promise);

        renderViewer();

        expect(await screen.findByText("Loading schema…")).toBeInTheDocument();

        schemaDeferred.resolve(makeSchema("particles"));

        await waitFor(() => {
            expect(screen.getByText("0.91")).toBeInTheDocument();
        });
    });

    it("shows an error when metadata tables loading fails", async () => {
        serviceMocks.fetchOutputMetadataTables.mockRejectedValueOnce(
            new Error("Tables failed"),
        );

        renderViewer();

        await waitFor(() => {
            expect(screen.getByText("Tables failed")).toBeInTheDocument();
        });
    });

    it("shows the empty state when no metadata tables are returned", async () => {
        serviceMocks.fetchOutputMetadataTables.mockResolvedValueOnce([]);

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No metadata tables for this output."),
            ).toBeInTheDocument();
        });
    });

    it("reuses recently visited windows and invalidates them when sorting changes", async () => {
        serviceMocks.fetchOutputMetadataTables.mockResolvedValue([{ name: "particles", alias: "Particles", rowCount: 2000 }]);
        serviceMocks.fetchMetadataTableWindow.mockImplementation(async (_p, _r, _o, _t, options) => ({
            offset: options.offset,
            rows: Array.from({ length: options.limit }, (_, i) => ({ rowId: options.offset + i + 1, values: [options.offset + i + 1, `item ${options.offset + i}`] })),
        }));
        renderViewer();
        expect(await screen.findByText("item 0")).toBeInTheDocument();
        const scroll = screen.getByLabelText("Metadata rows");
        fireEvent.scroll(scroll, { target: { scrollTop: 6400 } });
        expect(await screen.findByText("item 200")).toBeInTheDocument();
        const calls = serviceMocks.fetchMetadataTableWindow.mock.calls.length;
        fireEvent.scroll(scroll, { target: { scrollTop: 0 } });
        expect(await screen.findByText("item 0")).toBeInTheDocument();
        expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalledTimes(calls);
        fireEvent.click(screen.getByText("Score"));
        await waitFor(() => expect(serviceMocks.fetchMetadataTableWindow.mock.calls.length).toBeGreaterThan(calls));
    });

    it("aborts a pending row request when the viewer unmounts", async () => {
        serviceMocks.fetchMetadataTableWindow.mockImplementation(() => new Promise(() => { }));
        const { unmount } = renderViewer();
        await waitFor(() => expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalled());
        const signal = serviceMocks.fetchMetadataTableWindow.mock.lastCall?.[4].signal;
        expect(signal.aborted).toBe(false);
        unmount();
        expect(signal.aborted).toBe(true);
    });

    it("filters columns and applies visibility to matching columns without fetching rows", async () => {
        renderViewer();
        expect(await screen.findByText("0.91")).toBeInTheDocument();
        const calls = serviceMocks.fetchMetadataTableWindow.mock.calls.length;
        fireEvent.click(getButtonFromIconTestId("columns-icon"));
        const dialog = screen.getByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Find columns"), { target: { value: "score" } });
        expect(within(dialog).getByText("1 of 2 columns")).toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Show Id")).not.toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Hide matching" }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Ok" }));
        await waitFor(() => expect(screen.queryByText("Score")).not.toBeInTheDocument());
        expect(screen.getByText("Id")).toBeInTheDocument();
        expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalledTimes(calls);
    });

    it("loads the initial schema and first window of rows", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();
        expect(screen.getByText("0.82")).toBeInTheDocument();
        expect(
            screen.getByText((_, node) => node?.textContent === "Rows: 2"),
        ).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableSchema).toHaveBeenCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
            );
        });

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
                {
                    offset: 0,
                    limit: 60,
                    signal: expect.any(AbortSignal),
                    selectionOnly: false,
                    sortBy: undefined,
                    asc: undefined,
                },
            );
        });
    });

    it("changes table and reloads schema and rows", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByLabelText("Metadata table"));
        fireEvent.click(await screen.findByRole("option", { name: "Classes" }));

        expect(await screen.findByText("32")).toBeInTheDocument();
        expect(
            screen.getByText((_, node) => node?.textContent === "Rows: 1"),
        ).toBeInTheDocument();

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableSchema).toHaveBeenCalledWith(
                1,
                2,
                "metadataOutput",
                "classes",
            );
        });

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalledWith(
                1,
                2,
                "metadataOutput",
                "classes",
                {
                    offset: 0,
                    limit: 60,
                    signal: expect.any(AbortSignal),
                    selectionOnly: false,
                    sortBy: undefined,
                    asc: undefined,
                },
            );
        });
    });

    it("opens the plotter dialog", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const plotterButton = screen.getByTestId("plotter-icon").closest("button");
        expect(plotterButton).not.toBeNull();

        fireEvent.click(plotterButton as HTMLButtonElement);

        expect(
            await screen.findByText("Mock MetadataPlotterDialog particles"),
        ).toBeInTheDocument();
    });

    it("sorts by column ascending and descending", async () => {
        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
                options?: { sortBy?: string; asc?: boolean },
            ) => {
                if (tableName === "particles" && options?.sortBy === "score" && options?.asc === true) {
                    return {
                        rows: [
                            { rowId: 2, values: [2, 0.82] },
                            { rowId: 1, values: [1, 0.91] },
                        ],
                        offset: 0,
                    };
                }

                if (tableName === "particles" && options?.sortBy === "score" && options?.asc === false) {
                    return {
                        rows: [
                            { rowId: 1, values: [1, 0.91] },
                            { rowId: 2, values: [2, 0.82] },
                        ],
                        offset: 0,
                    };
                }

                return makeWindowRows(tableName as "particles" | "classes");
            },
        );

        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const scoreHeader = screen.getAllByText("Score")[0].closest("th");
        expect(scoreHeader).not.toBeNull();

        fireEvent.click(scoreHeader as HTMLTableCellElement);

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenLastCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
                {
                    offset: 0,
                    limit: 60,
                    signal: expect.any(AbortSignal),
                    selectionOnly: false,
                    sortBy: "score",
                    asc: true,
                },
            );
        });

        fireEvent.click(scoreHeader as HTMLTableCellElement);

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenLastCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
                {
                    offset: 0,
                    limit: 60,
                    signal: expect.any(AbortSignal),
                    selectionOnly: false,
                    sortBy: "score",
                    asc: false,
                },
            );
        });
    });

    it("opens the columns dialog and hides a column", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        fireEvent.click(getButtonFromIconTestId("columns-icon"));

        expect(await screen.findByText("Columns")).toBeInTheDocument();

        const dialog = screen.getByRole("dialog");
        const scoreRow = within(dialog).getByText("Score").closest("tr");

        expect(scoreRow).not.toBeNull();

        const visibleCheckbox = within(scoreRow as HTMLElement).getAllByRole("checkbox")[0];
        fireEvent.click(visibleCheckbox);

        fireEvent.click(screen.getByRole("button", { name: "Ok" }));

        await waitFor(() => {
            expect(screen.queryByText("Columns")).not.toBeInTheDocument();
        });

        expect(screen.queryByText("Score")).not.toBeInTheDocument();
    });

    it("supports basic row selection and ctrl multi-selection", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        fireEvent.click(screen.getByText("0.91"));

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 1"),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText("0.82"), { ctrlKey: true });

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();
    });

    it("uses the metadata scroll container as the image lazy-loading root", async () => {
        const observerRoots: Array<Element | Document | null> = [];
        const observedTargets: Element[] = [];

        class IntersectionObserverMock {
            constructor(
                _callback: IntersectionObserverCallback,
                options?: IntersectionObserverInit,
            ) {
                observerRoots.push(options?.root ?? null);
            }

            observe(target: Element) {
                observedTargets.push(target);
            }

            disconnect() { }

            unobserve() { }

            takeRecords() {
                return [];
            }
        }

        vi.stubGlobal(
            "IntersectionObserver",
            IntersectionObserverMock,
        );

        serviceMocks.fetchOutputMetadataTables.mockResolvedValueOnce([
            {
                name: "particles",
                alias: "Particles",
                rowCount: 1,
            },
        ]);

        serviceMocks.fetchMetadataTableSchema.mockResolvedValueOnce({
            name: "particles",
            alias: "Particles",
            hasColumnId: true,
            columns: [
                {
                    name: "id",
                    alias: "Id",
                    index: 0,
                    sortable: true,
                    visible: true,
                    rendererType: "int",
                    decimals: 0,
                    hasTransformation: false,
                },
                {
                    name: "preview",
                    alias: "Preview",
                    index: 1,
                    sortable: false,
                    visible: true,
                    rendererType: "image",
                    decimals: 0,
                    hasTransformation: false,
                },
            ],
            actions: [],
        });

        serviceMocks.fetchMetadataTableWindow.mockResolvedValueOnce({
            rows: [
                {
                    rowId: 1,
                    values: [
                        1,
                        {
                            kind: "image",
                            path: "/images/1.mrc",
                        },
                    ],
                },
            ],
            offset: 0,
        });

        renderViewer();

        await waitFor(() => {
            expect(observerRoots.length).toBeGreaterThan(0);
            expect(observedTargets.length).toBeGreaterThan(0);
        });

        const observerRoot = observerRoots[0];

        expect(observerRoot).not.toBeNull();
        expect(
            (observerRoot as Element).contains(observedTargets[0]),
        ).toBe(true);
    });

    it("aborts an in-flight metadata image when its cell is removed", async () => {
        let capturedSignal: AbortSignal | undefined;

        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(
                    tableName as "particles" | "classes",
                );
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        rows: [
                            {
                                rowId: 901,
                                values: [
                                    1,
                                    {
                                        kind: "image",
                                        path: "/img/1.png",
                                    },
                                ],
                            },
                        ],
                        offset: 0,
                    };
                }

                return makeWindowRows(
                    tableName as "particles" | "classes",
                );
            },
        );

        serviceMocks.fetchMetadataImageCellObjectUrl.mockImplementation(
            (
                _projectId,
                _protocolId,
                _outputName,
                _tableName,
                _rowIndex,
                _columnName,
                options,
            ) => {
                capturedSignal = options?.signal;

                return new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener(
                        "abort",
                        () => {
                            reject(
                                new DOMException(
                                    "Aborted",
                                    "AbortError",
                                ),
                            );
                        },
                        { once: true },
                    );
                });
            },
        );

        renderViewer();

        await waitFor(() => {
            expect(
                serviceMocks.fetchMetadataImageCellObjectUrl,
            ).toHaveBeenCalled();
        });

        expect(serviceMocks.fetchMetadataImageCellObjectUrl.mock.lastCall?.[4]).toBe(0);
        expect(serviceMocks.fetchMetadataImageCellObjectUrl.mock.lastCall?.[6].rowId).toBe(901);
        expect(capturedSignal).toBeDefined();
        expect(capturedSignal?.aborted).toBe(false);

        fireEvent.mouseDown(
            screen.getByLabelText("Metadata table"),
        );

        fireEvent.click(
            await screen.findByRole(
                "option",
                { name: "Classes" },
            ),
        );

        await waitFor(() => {
            expect(capturedSignal?.aborted).toBe(true);
        });
    });

    it("enables gallery mode when the table has image columns and loads gallery rows", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(tableName as "particles" | "classes");
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        rows: [
                            {
                                rowId: 1,
                                values: [1, { kind: "image", path: "/img/1.png" }],
                            },
                            {
                                rowId: 2,
                                values: [2, { kind: "image", path: "/img/2.png" }],
                            },
                        ],
                        offset: 0,
                    };
                }

                return makeWindowRows(tableName as "particles" | "classes");
            },
        );

        renderViewer();

        expect(await screen.findByAltText("/img/1.png")).toBeInTheDocument();

        const galleryButton = getButtonFromIconTestId("gallery-icon");
        expect(galleryButton).not.toBeDisabled();
        fireEvent.click(galleryButton);

        const goToInput =
            screen.getAllByRole("spinbutton")[1];

        expect(goToInput).toBeDisabled();

        await waitFor(() => {
            expect(document.querySelector('[data-row-index="0"]')).not.toBeNull();
        });
        const firstCard = screen.getByRole("button", { name: "Row 1, item 1" });
        const secondCard = screen.getByRole("button", { name: "Row 2, item 2" });
        firstCard.focus();
        fireEvent.keyDown(firstCard, { key: "ArrowRight" });
        expect(secondCard).toHaveFocus();
        fireEvent.keyDown(secondCard, { key: "Enter" });
        expect(secondCard).toHaveAttribute("aria-pressed", "true");
    });

    it("collapses simultaneously visible image cells into a single batch request", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(tableName as "particles" | "classes");
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        rows: [
                            { rowId: 1, values: [1, { kind: "image", path: "/img/1.png" }] },
                            { rowId: 2, values: [2, { kind: "image", path: "/img/2.png" }] },
                        ],
                        offset: 0,
                    };
                }

                return makeWindowRows(tableName as "particles" | "classes");
            },
        );

        serviceMocks.fetchMetadataImageCellsBatch.mockResolvedValue({
            tableName: "particles",
            fmt: "png",
            items: [
                { rowId: 1, rowIndex: 0, columnName: "preview", contentType: "image/png", dataUrl: "data:image/png;base64,row1" },
                { rowId: 2, rowIndex: 1, columnName: "preview", contentType: "image/png", dataUrl: "data:image/png;base64,row2" },
            ],
            errors: [],
        });

        renderViewer();

        expect(await screen.findByAltText("/img/1.png")).toHaveAttribute(
            "src",
            "data:image/png;base64,row1",
        );
        expect(screen.getByAltText("/img/2.png")).toHaveAttribute(
            "src",
            "data:image/png;base64,row2",
        );

        expect(serviceMocks.fetchMetadataImageCellsBatch).toHaveBeenCalledTimes(1);
        expect(serviceMocks.fetchMetadataImageCellsBatch.mock.calls[0][4].items).toEqual([
            { rowId: 1, rowIndex: 0, columnName: "preview" },
            { rowId: 2, rowIndex: 1, columnName: "preview" },
        ]);
        expect(serviceMocks.fetchMetadataImageCellObjectUrl).not.toHaveBeenCalled();
    });

    it("falls back to individual fetches for cells the batch response didn't include", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(tableName as "particles" | "classes");
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _projectId: number,
                _protocolId: number,
                _outputName: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        rows: [
                            { rowId: 1, values: [1, { kind: "image", path: "/img/1.png" }] },
                            { rowId: 2, values: [2, { kind: "image", path: "/img/2.png" }] },
                        ],
                        offset: 0,
                    };
                }

                return makeWindowRows(tableName as "particles" | "classes");
            },
        );

        // Row 1 comes back fine; row 2 is missing from the batch response
        // entirely (e.g. it individually errored server-side).
        serviceMocks.fetchMetadataImageCellsBatch.mockResolvedValue({
            tableName: "particles",
            fmt: "png",
            items: [
                { rowId: 1, rowIndex: 0, columnName: "preview", contentType: "image/png", dataUrl: "data:image/png;base64,row1" },
            ],
            errors: [
                { rowId: 2, rowIndex: 1, columnName: "preview", error: "boom" },
            ],
        });

        serviceMocks.fetchMetadataImageCellObjectUrl.mockResolvedValue({
            url: "blob:fallback-row2",
            revoke: vi.fn(),
        });

        renderViewer();

        expect(await screen.findByAltText("/img/1.png")).toHaveAttribute(
            "src",
            "data:image/png;base64,row1",
        );
        await waitFor(() => {
            expect(screen.getByAltText("/img/2.png")).toHaveAttribute("src", "blob:fallback-row2");
        });

        expect(serviceMocks.fetchMetadataImageCellsBatch).toHaveBeenCalledTimes(1);
        expect(serviceMocks.fetchMetadataImageCellObjectUrl).toHaveBeenCalledTimes(1);
    });

    it("opens a floating image preview and exposes external-window launch", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (
                _p: number,
                _r: number,
                _o: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(
                    tableName as
                    | "particles"
                    | "classes",
                );
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (
                _p: number,
                _r: number,
                _o: string,
                tableName: string,
            ) => {
                if (tableName === "particles") {
                    return {
                        rows: [
                            {
                                rowId: 1,
                                values: [
                                    1,
                                    {
                                        kind: "image",
                                        path: "/img/1.png",
                                    },
                                ],
                            },
                        ],
                        offset: 0,
                    };
                }

                return makeWindowRows(
                    tableName as
                    | "particles"
                    | "classes",
                );
            },
        );

        serviceMocks
            .fetchMetadataImageCellObjectUrl
            .mockImplementation(
                async (
                    _p,
                    _r,
                    _o,
                    _t,
                    _rowIndex,
                    _col,
                    opts,
                ) => ({
                    url:
                        opts.size === 1024
                            ? "blob:preview-large"
                            : "blob:thumb-small",

                    revoke: vi.fn(),
                }),
            );

        renderViewer();

        const thumb =
            await screen.findByAltText(
                "/img/1.png",
            );

        expect(
            thumb,
        ).toHaveAttribute(
            "src",
            "blob:thumb-small",
        );

        fireEvent.doubleClick(
            thumb,
        );

        const dialog =
            await screen.findByRole(
                "dialog",
                {
                    name:
                        "Metadata image preview",
                },
            );

        expect(
            dialog,
        ).toHaveClass(
            "metadata-image-preview-window",
        );

        expect(
            within(dialog)
                .queryByText(
                    "HIGH RES",
                ),
        ).not.toBeInTheDocument();

        const rowLabel =
            within(dialog)
                .getByText(
                    "Row",
                );

        expect(
            rowLabel,
        ).toHaveTextContent(
            /^Row\s*1$/,
        );

        const preview =
            await within(dialog)
                .findByRole(
                    "img",
                );

        expect(
            preview,
        ).toHaveAttribute(
            "src",
            "blob:preview-large",
        );

        const lastCall =
            serviceMocks
                .fetchMetadataImageCellObjectUrl
                .mock.calls[
            serviceMocks
                .fetchMetadataImageCellObjectUrl
                .mock.calls.length - 1
            ];

        expect(
            lastCall[6],
        ).toMatchObject({
            size: 1024,
            format: "webp",
        });

        const externalButton =
            within(dialog)
                .getByRole(
                    "button",
                    {
                        name:
                            "Open image preview in external window",
                    },
                );

        fireEvent.click(
            externalButton,
        );

        expect(
            externalWindowMocks
                .openExternalWindow,
        ).toHaveBeenCalledWith({
            title:
                "ScipionWeb - Preview",
            width: 1240,
            height: 900,
        });

        fireEvent.click(
            within(dialog)
                .getByRole(
                    "button",
                    {
                        name:
                            "Close image preview",
                    },
                ),
        );

        await waitFor(() => {
            expect(
                screen.queryByRole(
                    "dialog",
                    {
                        name:
                            "Metadata image preview",
                    },
                ),
            ).not.toBeInTheDocument();
        });
    });

    it("adjusts zoom, rotation, brightness and contrast in the preview dialog, and resets them", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (_p: number, _r: number, _o: string, tableName: string) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(tableName as "particles" | "classes");
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (_p: number, _r: number, _o: string, tableName: string) => {
                if (tableName === "particles") {
                    return {
                        rows: [{ rowId: 1, values: [1, { kind: "image", path: "/img/1.png" }] }],
                        offset: 0,
                    };
                }

                return makeWindowRows(tableName as "particles" | "classes");
            },
        );

        renderViewer();

        const thumb = await screen.findByAltText("/img/1.png");
        fireEvent.doubleClick(thumb);

        const dialog = await screen.findByRole("dialog");
        const preview = await within(dialog).findByRole("img");

        const zoomLevel = within(dialog).getByTestId("preview-zoom-level");
        expect(zoomLevel).toHaveTextContent("100%");
        expect(preview).toHaveStyle({ filter: "brightness(1) contrast(1)" });

        fireEvent.click(within(dialog).getByRole("button", { name: "Zoom in" }));
        expect(zoomLevel).toHaveTextContent("125%");
        expect(preview.style.transform).toContain("scale(1.25)");

        fireEvent.click(within(dialog).getByRole("button", { name: "Rotate right" }));
        expect(preview.style.transform).toContain("rotate(90deg)");

        const brightnessSlider = within(dialog).getByRole("slider", { name: "Brightness" });
        fireEvent.keyDown(brightnessSlider, { key: "ArrowRight" });

        await waitFor(() => {
            expect(brightnessSlider.getAttribute("aria-valuenow")).not.toBe("0");
        });
        expect(preview.style.filter).not.toBe("brightness(1) contrast(1)");

        fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));

        await waitFor(() => {
            expect(zoomLevel).toHaveTextContent("100%");
        });
        expect(preview.style.transform).toContain("scale(1)");
        expect(preview.style.transform).toContain("rotate(0deg)");
        expect(preview).toHaveStyle({ filter: "brightness(1) contrast(1)" });
    });

    it("opens the preview dialog on double-click in gallery mode too", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (_p: number, _r: number, _o: string, tableName: string) => {
                if (tableName === "particles") {
                    return {
                        name: "particles",
                        alias: "Particles",
                        hasColumnId: true,
                        columns: [
                            {
                                name: "id",
                                alias: "Id",
                                index: 0,
                                sortable: true,
                                visible: true,
                                rendererType: "int",
                                decimals: 0,
                                hasTransformation: false,
                            },
                            {
                                name: "preview",
                                alias: "Preview",
                                index: 1,
                                sortable: false,
                                visible: true,
                                rendererType: "image",
                                decimals: 0,
                                hasTransformation: false,
                            },
                        ],
                        actions: [],
                    };
                }

                return makeSchema(tableName as "particles" | "classes");
            },
        );

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (_p: number, _r: number, _o: string, tableName: string) => {
                if (tableName === "particles") {
                    return {
                        rows: [{ rowId: 1, values: [1, { kind: "image", path: "/img/1.png" }] }],
                        offset: 0,
                    };
                }

                return makeWindowRows(tableName as "particles" | "classes");
            },
        );

        renderViewer();

        expect(await screen.findByAltText("/img/1.png")).toBeInTheDocument();

        fireEvent.click(getButtonFromIconTestId("gallery-icon"));

        await waitFor(() => {
            expect(document.querySelector('[data-row-index="0"]')).not.toBeNull();
        });
        const firstCard = screen.getByRole("button", { name: "Row 1, item 1" });

        fireEvent.doubleClick(firstCard);

        const dialog = await screen.findByRole("dialog");

        const rowLabel = within(dialog).getByText("Row");

        expect(rowLabel).toHaveTextContent(
            /^Row\s*1$/,
        );
    });

    it(
        "resolves an item position directly without scanning metadata rows",
        async () => {
            renderViewer();

            expect(
                await screen.findByText("0.91"),
            ).toBeInTheDocument();

            const rowCallsBeforeGoTo =
                serviceMocks.fetchMetadataTableWindow
                    .mock.calls.length;

            const goToInput =
                screen.getAllByRole("spinbutton")[1];

            fireEvent.change(
                goToInput,
                {
                    target: {
                        value: "2",
                    },
                },
            );

            fireEvent.blur(goToInput);

            await waitFor(() => {
                expect(
                    serviceMocks.fetchMetadataRowPosition,
                ).toHaveBeenCalledWith(
                    1,
                    2,
                    "metadataOutput",
                    "particles",
                    2,
                    {
                        sortBy: undefined,
                        asc: undefined,
                    },
                );
            });

            expect(
                serviceMocks.fetchMetadataRowPosition,
            ).toHaveBeenCalledTimes(1);

            await waitFor(() => {
                expect(
                    screen.getByText(
                        (_, node) =>
                            node?.textContent ===
                            "Selected: 1",
                    ),
                ).toBeInTheDocument();
            });

            expect(
                serviceMocks.fetchMetadataTableWindow
                    .mock.calls.length,
            ).toBe(rowCallsBeforeGoTo);
        },
    );

    it("keeps a stable selection after sorting", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        fireEvent.click(screen.getByText("0.91"));

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 1"),
        ).toBeInTheDocument();

        const scoreHeader = screen.getAllByText("Score")[0].closest("th");
        expect(scoreHeader).not.toBeNull();

        fireEvent.click(scoreHeader as HTMLTableCellElement);

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenLastCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
                {
                    offset: 0,
                    limit: 60,
                    signal: expect.any(AbortSignal),
                    selectionOnly: false,
                    sortBy: "score",
                    asc: true,
                },
            );
        });

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 1"),
        ).toBeInTheDocument();
    });

    it("keeps a multi-row (range) selection pinned to the same particles, not the same positions, after sorting", async () => {
        serviceMocks.fetchOutputMetadataTables.mockResolvedValue([
            { name: "particles", alias: "Particles", rowCount: 3 },
            { name: "classes", alias: "Classes", rowCount: 1 },
        ]);

        serviceMocks.fetchMetadataTableWindow.mockImplementation(
            async (_p: number, _r: number, _o: string, tableName: string, options: any) => {
                if (tableName !== "particles") {
                    return makeWindowRows(tableName as "particles" | "classes");
                }

                if (options?.sortBy === "score") {
                    // Ascending by score: id3 (0.75), id2 (0.82), id1 (0.91) --
                    // a real reorder, not just the identity permutation.
                    return {
                        rows: [
                            { rowId: 3, values: [3, 0.75] },
                            { rowId: 2, values: [2, 0.82] },
                            { rowId: 1, values: [1, 0.91] },
                        ],
                        offset: 0,
                    };
                }

                return {
                    rows: [
                        { rowId: 1, values: [1, 0.91] },
                        { rowId: 2, values: [2, 0.82] },
                        { rowId: 3, values: [3, 0.75] },
                    ],
                    offset: 0,
                };
            },
        );

        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        // Select rows 1 and 2 (id1, id2) by index range, leaving id3 (0.75)
        // unselected.
        fireEvent.click(screen.getByText("0.91"));
        fireEvent.click(screen.getByText("0.82"), { shiftKey: true });

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();

        const scoreHeader = screen.getAllByText("Score")[0].closest("th");
        fireEvent.click(scoreHeader as HTMLTableCellElement);

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenLastCalledWith(
                1, 2, "metadataOutput", "particles",
                expect.objectContaining({ sortBy: "score", asc: true }),
            );
        });

        await screen.findByText("0.75");

        // The selection must still be exactly {id1, id2} -- NOT "whatever
        // now sits at index 0-1" (id3, id2), which is what a stale
        // index-based selection would show after this reorder.
        expect(screen.getByText("0.75").closest("tr")).toHaveAttribute("aria-selected", "false");
        expect(screen.getByText("0.82").closest("tr")).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("0.91").closest("tr")).toHaveAttribute("aria-selected", "true");
        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();
    });

    it("opens the plotter dialog for the currently selected table", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByLabelText("Metadata table"));
        fireEvent.click(await screen.findByRole("option", { name: "Classes" }));

        expect(await screen.findByText("32")).toBeInTheDocument();

        const plotterButton = screen.getByTestId("plotter-icon").closest("button");
        expect(plotterButton).not.toBeNull();

        fireEvent.click(plotterButton as HTMLButtonElement);

        expect(
            await screen.findByText("Mock MetadataPlotterDialog classes"),
        ).toBeInTheDocument();
    });

    it("opens the selection criteria dialog from the header context menu and applies it", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const scoreHeader = screen.getAllByText("Score")[0].closest("th");
        expect(scoreHeader).not.toBeNull();

        fireEvent.contextMenu(scoreHeader as HTMLTableCellElement);

        fireEvent.click(await screen.findByText("Select where…"));

        expect(await screen.findByText("Select where…")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Value"), {
            target: { value: "0.91" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Apply" }));

        await waitFor(() => {
            expect(
                screen.getByText((_, node) => node?.textContent === "Selected: 1"),
            ).toBeInTheDocument();
        });
    });

    it("cancels criteria scans without applying late partial results", async () => {
        renderViewer();
        await screen.findByText("0.91");
        fireEvent.click(screen.getByText("0.82"));
        fireEvent.contextMenu(screen.getAllByText("Score")[0].closest("th")!);
        fireEvent.click(await screen.findByText("Select where…"));
        fireEvent.change(screen.getByLabelText("Value"), { target: { value: "0.91" } });
        const pending = createDeferred<ReturnType<typeof makeWindowRows>>();
        serviceMocks.fetchMetadataTableWindow.mockImplementationOnce(() => pending.promise);
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        const signal = serviceMocks.fetchMetadataTableWindow.mock.calls[serviceMocks.fetchMetadataTableWindow.mock.calls.length - 1]?.[4].signal;
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Stop selection" }));
        expect(signal.aborted).toBe(true);
        await act(async () => pending.resolve(makeWindowRows("particles")));
        expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByText("0.82").closest("tr")).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("0.91").closest("tr")).not.toHaveAttribute("aria-selected", "true");
    });

    it("cancels the create-subset row scan without invoking the action on partial results", async () => {
        serviceMocks.fetchMetadataTableSchema.mockImplementation(
            async (_p: number, _r: number, _o: string, tableName: string) => {
                const schema = makeSchema(tableName as "particles" | "classes");
                return tableName === "particles" ? { ...schema, actions: ["Create subset"] } : schema;
            },
        );

        renderViewer();
        await screen.findByText("0.91");

        fireEvent.contextMenu(screen.getByText("0.91").closest("tr")!);
        fireEvent.click(await screen.findByText("All"));

        fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
        expect(await screen.findByText("Create subset from selected rows")).toBeInTheDocument();

        const pending = createDeferred<ReturnType<typeof makeWindowRows>>();
        serviceMocks.fetchMetadataTableWindow.mockImplementationOnce(() => pending.promise);

        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
        const signal = serviceMocks.fetchMetadataTableWindow.mock.calls[serviceMocks.fetchMetadataTableWindow.mock.calls.length - 1]?.[4].signal;

        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Stop" }));
        expect(signal.aborted).toBe(true);

        await act(async () => pending.resolve(makeWindowRows("particles")));

        expect(serviceMocks.runMetadataTableAction).not.toHaveBeenCalled();
        expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })).toBeEnabled();
        expect(screen.getByText("Create subset from selected rows")).toBeInTheDocument();
    });

    it("supports range selection with shift-click", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        fireEvent.click(screen.getByText("0.91"));
        fireEvent.click(screen.getByText("0.82"), { shiftKey: true });

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();
    });

    it("applies a contains criteria selection from the header context menu", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const scoreHeader = screen.getAllByText("Score")[0].closest("th");
        expect(scoreHeader).not.toBeNull();

        fireEvent.contextMenu(scoreHeader as HTMLTableCellElement);
        fireEvent.click(await screen.findByText("Contains…"));

        expect(await screen.findByText("Select where…")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Value"), {
            target: { value: "0.9" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Apply" }));

        await waitFor(() => {
            expect(
                screen.getByText((_, node) => node?.textContent === "Selected: 1"),
            ).toBeInTheDocument();
        });
    });

    it("applies a greater-than criteria selection from the header context menu", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const scoreHeader = screen.getAllByText("Score")[0].closest("th");
        expect(scoreHeader).not.toBeNull();

        fireEvent.contextMenu(scoreHeader as HTMLTableCellElement);
        fireEvent.click(await screen.findByText("Greater than…"));

        expect(await screen.findByText("Select where…")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Value"), {
            target: { value: "0.85" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Apply" }));

        await waitFor(() => {
            expect(
                screen.getByText((_, node) => node?.textContent === "Selected: 1"),
            ).toBeInTheDocument();
        });
    });

    it("applies a row context menu action", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const firstRow = screen.getByText("0.91").closest("tr");
        expect(firstRow).not.toBeNull();

        fireEvent.contextMenu(firstRow as HTMLElement);
        fireEvent.click(await screen.findByText("From here"));

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();
    });

    it("freezes a sparse selection without scanning unselected rows", async () => {
        renderViewer();
        await screen.findByText("0.82");
        const lastRow = screen.getByText("0.82").closest("tr")!;
        fireEvent.contextMenu(lastRow);
        fireEvent.click(await screen.findByText("From here"));
        serviceMocks.fetchMetadataTableWindow.mockResolvedValueOnce({ offset: 1, rows: [makeWindowRows("particles").rows[1]] });
        fireEvent.contextMenu(lastRow);
        fireEvent.click(await screen.findByText("Freeze selection (ids)"));
        await waitFor(() => expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenLastCalledWith(1, 2, "metadataOutput", "particles", expect.objectContaining({ offset: 1, limit: 1, signal: expect.any(AbortSignal) })));
        expect(lastRow).toHaveAttribute("aria-selected", "true");
    });

    it("freezes an index-based selection into ids", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const firstRow = screen.getByText("0.91").closest("tr");
        expect(firstRow).not.toBeNull();

        fireEvent.contextMenu(firstRow as HTMLElement);
        fireEvent.click(await screen.findByText("From here"));

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();

        fireEvent.contextMenu(firstRow as HTMLElement);
        fireEvent.click(await screen.findByText("Freeze selection (ids)"));

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
                {
                    offset: 0,
                    limit: 2,
                    signal: expect.any(AbortSignal),
                    selectionOnly: false,
                    sortBy: undefined,
                    asc: undefined,
                },
            );
        });

        expect(
            screen.getByText((_, node) => node?.textContent === "Selected: 2"),
        ).toBeInTheDocument();
    });

});