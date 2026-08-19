import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    fetchOutputMetadataTables: vi.fn(),
    fetchMetadataTableSchema: vi.fn(),
    fetchMetadataTableWindow: vi.fn(),
    fetchMetadataImageCellObjectUrl: vi.fn(),
    runMetadataTableAction: vi.fn(),
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

        serviceMocks.runMetadataTableAction.mockResolvedValue({ success: true });
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

        await waitFor(() => {
            expect(document.querySelector('[data-row-index="0"]')).not.toBeNull();
        });
    });

    it("goes to an item by id and selects it", async () => {
        renderViewer();

        expect(await screen.findByText("0.91")).toBeInTheDocument();

        const goToInput = screen.getAllByRole("spinbutton")[1];
        fireEvent.change(goToInput, { target: { value: "2" } });
        fireEvent.blur(goToInput);

        await waitFor(() => {
            expect(
                screen.getByText((_, node) => node?.textContent === "Selected: 1"),
            ).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(serviceMocks.fetchMetadataTableWindow).toHaveBeenCalledWith(
                1,
                2,
                "metadataOutput",
                "particles",
                {
                    offset: 0,
                    limit: 2,
                    selectionOnly: false,
                    sortBy: undefined,
                    asc: undefined,
                },
            );
        });
    });

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