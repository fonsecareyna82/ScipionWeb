import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";

import ProjectProtocolTable from "@/components/projects/ProjectProtocolTable";

const rows = [
    {
        id: "10",
        runName: "Import movies",
        label: "ProtImportMovies",
        status: "finished",
        stepsDone: 4,
        numberOfSteps: 4,
        tick: 20,
        children: ["20"],
        inputs: [],
        outputs: [
            {
                name: "outputMovies",
                pointerClass: "SetOfMovies",
            },
        ],
        tags: ["import"],
    },
    {
        id: "20",
        runName: "Motion correction",
        label: "ProtMotionCorr",
        status: "running",
        stepsDone: 7,
        numberOfSteps: 10,
        tick: 75,
        children: [],
        inputs: [
            {
                name: "inputMovies",
                pointerClass: "SetOfMovies",
            },
        ],
        outputs: [
            {
                name: "outputMicrographs",
                pointerClass: "SetOfMicrographs",
            },
            {
                name: "outputMovies",
                pointerClass: "SetOfMovies",
            },
        ],
        tags: ["motion"],
    },
];

function renderTable(
    overrides: Record<string, unknown> = {},
) {
    const props = {
        projectStorageKey:
            "test-project",

        rows,

        allTags: [
            {
                id: "import",
                title: "Import",
                color: "#4f46e5",
            },
            {
                id: "motion",
                title: "Motion",
                color: "#0f766e",
            },
        ],

        tagAssignments: {
            "10": ["import"],
            "20": ["motion"],
        },

        externalTagFilterIds: [],

        searchQuery: "",

        highlightedId: null,

        selectedIds: [],

        isRefreshing: false,

        onRefresh: vi.fn(),

        onActivate: vi.fn(),

        onOpen: vi.fn(),

        onBrowse: vi.fn(),

        onAnnotate: vi.fn(),

        onDuplicate: vi.fn(),

        onDelete: vi.fn(),

        onRestartAll: vi.fn(),

        onContinueAll: vi.fn(),

        onResetFrom: vi.fn(),

        onStop: vi.fn(),

        onSelectionChange: vi.fn(),

        onToggleTag: vi.fn(),

        ...overrides,
    };

    return {
        ...render(
            <ProjectProtocolTable
                {...props}
            />,
        ),

        props,
    };
}

describe(
    "ProjectProtocolTable",
    () => {
        beforeEach(() => {
            window.localStorage.clear();
        });

        it(
            "renders protocol state progress below the state",
            () => {
                renderTable();

                const motionRow =
                    screen
                        .getByText(
                            "Motion correction",
                        )
                        .closest("tr");

                expect(
                    motionRow,
                ).not.toBeNull();

                expect(
                    within(
                        motionRow!,
                    ).getByText(
                        "Running",
                    ),
                ).toBeInTheDocument();

                expect(
                    within(
                        motionRow!,
                    ).getByText(
                        "7/10",
                    ),
                ).toBeInTheDocument();
            },
        );

        it(
            "filters rows using the project search query",
            () => {
                renderTable({
                    searchQuery:
                        "motion",
                });

                expect(
                    screen.getByText(
                        "Motion correction",
                    ),
                ).toBeInTheDocument();

                expect(
                    screen.queryByText(
                        "Import movies",
                    ),
                ).not.toBeInTheDocument();
            },
        );

        it(
            "hides outputs by default",
            () => {
                renderTable({
                    projectId: 1,
                });

                expect(
                    screen.queryByText(
                        "outputMicrographs",
                    ),
                ).not.toBeInTheDocument();

                expect(
                    screen.queryByText(
                        "outputMovies",
                    ),
                ).not.toBeInTheDocument();
            },
        );

        it(
            "renders protocol outputs using node-like output pills",
            () => {

                window.localStorage.setItem(
                    "scipion-project-table:test-project",
                    JSON.stringify({
                        version: 4,

                        visible: {
                            outputs: true,
                        },
                    }),
                );

                renderTable({
                    projectId: 1,
                });

                const motionRow =
                    screen
                        .getByText(
                            "Motion correction",
                        )
                        .closest("tr");

                expect(
                    motionRow,
                ).not.toBeNull();

                expect(
                    within(
                        motionRow!,
                    ).getByText(
                        "outputMicrographs",
                    ),
                ).toBeInTheDocument();

                expect(
                    within(
                        motionRow!,
                    ).getByText(
                        "outputMovies",
                    ),
                ).toBeInTheDocument();

                expect(
                    within(
                        motionRow!,
                    ).getByRole(
                        "button",
                        {
                            name:
                                "View output outputMicrographs",
                        },
                    ),
                ).toBeInTheDocument();

                expect(
                    screen.queryByText(
                        "Inputs",
                    ),
                ).not.toBeInTheDocument();
            },
        );

        it(
            "sorts by protocol name",
            () => {
                renderTable();

                fireEvent.click(screen.getByRole("button", { name: /^Protocol$/i }));

                const renderedRows =
                    Array.from(
                        document
                            .querySelectorAll(
                                "tr[data-protocol-id]",
                            ),
                    );

                expect(
                    renderedRows.map(
                        (row) =>
                            row.getAttribute(
                                "data-protocol-id",
                            ),
                    ),
                ).toEqual([
                    "10",
                    "20",
                ]);
            },
        );

        it(
            "opens a protocol on double click",
            () => {
                const {
                    props,
                } =
                    renderTable();

                fireEvent.doubleClick(
                    screen.getByText(
                        "Motion correction",
                    ),
                );

                expect(
                    props.onOpen,
                ).toHaveBeenCalledWith(
                    "20",
                );
            },
        );

        it(
            "supports ctrl-click multi-selection without checkbox controls",
            () => {
                const {
                    props,
                } =
                    renderTable();

                expect(
                    screen.queryByRole(
                        "checkbox",
                    ),
                ).not.toBeInTheDocument();

                fireEvent.click(
                    screen.getByText(
                        "Motion correction",
                    ),
                    {
                        ctrlKey: true,
                    },
                );

                expect(
                    props.onSelectionChange,
                ).toHaveBeenCalledWith([
                    "20",
                ]);
            },
        );

        it(
            "filters by protocol state",
            () => {
                renderTable();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                /Running/,
                        },
                    ),
                );

                expect(
                    screen.getByText(
                        "Motion correction",
                    ),
                ).toBeInTheDocument();

                expect(
                    screen.queryByText(
                        "Import movies",
                    ),
                ).not.toBeInTheDocument();
            },
        );

        it("keeps the legacy table unchanged when no extra columns are provided", () => {
            renderTable();

            expect(screen.queryByRole("button", { name: /Updated/i })).not.toBeInTheDocument();
            expect(screen.queryByRole("button", { name: /Priority/i })).not.toBeInTheDocument();
        });

        it("discovers, renders and sorts extra table columns", () => {
            const extraRows = [
                {
                    ...rows[0],
                    extraTableColumns: {
                        priority: {
                            label: "Priority",
                            value: 1,
                            type: "number",
                            defaultVisible: true,
                        },
                        owner: {
                            label: "Owner",
                            value: "Alice",
                            type: "text",
                            defaultVisible: true,
                        },
                    },
                },
                {
                    ...rows[1],
                    extraTableColumns: {
                        priority: {
                            label: "Priority",
                            value: 2,
                            type: "number",
                            defaultVisible: true,
                        },
                        owner: {
                            label: "Owner",
                            value: "Bob",
                            type: "text",
                            defaultVisible: true,
                        },
                    },
                },
            ];

            renderTable({ rows: extraRows });

            expect(screen.getByRole("button", { name: /^Priority$/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /^Owner$/i })).toBeInTheDocument();
            expect(screen.getByText("Alice")).toBeInTheDocument();
            expect(screen.getByText("Bob")).toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: /^Priority$/i }));

            const renderedRows = Array.from(document.querySelectorAll("tr[data-protocol-id]"));

            expect(renderedRows.map((row) => row.getAttribute("data-protocol-id"))).toEqual(["10", "20"]);
        });

        it("formats byte extra columns as human readable sizes", () => {
            renderTable({
                rows: [
                    {
                        ...rows[0],
                        extraTableColumns: {
                            workingDirSize: {
                                label: "Working dir",
                                value: 2147483648,
                                type: "bytes",
                                defaultVisible: true,
                            },
                        },
                    },
                ],
            });

            expect(screen.getByRole("button", { name: /^Working dir$/i })).toBeInTheDocument();
            expect(screen.getByText("2 GB")).toBeInTheDocument();
        });

        it("filters dynamic byte columns using human-readable units", async () => {
            const extraRows = [
                {
                    ...rows[0],
                    extraTableColumns: {
                        workingDirSize: {
                            label: "Working dir",
                            value: 500 * 1024 * 1024,
                            type: "bytes",
                            defaultVisible: true,
                        },
                    },
                },
                {
                    ...rows[1],
                    extraTableColumns: {
                        workingDirSize: {
                            label: "Working dir",
                            value: 2 * 1024 * 1024 * 1024,
                            type: "bytes",
                            defaultVisible: true,
                        },
                    },
                },
            ];

            renderTable({ rows: extraRows });

            const filterButton = screen.getByRole("button", { name: "Filter Working dir" });
            fireEvent.keyDown(filterButton, { key: "ArrowDown" });

            const operator = await screen.findByLabelText("Filter operator Working dir");
            const value = await screen.findByLabelText("Filter value Working dir");

            fireEvent.change(operator, { target: { value: "greaterThan" } });
            fireEvent.change(value, { target: { value: "1 GB" } });
            fireEvent.click(screen.getByRole("button", { name: "Apply Working dir filter" }));

            expect(screen.getByText("Motion correction")).toBeInTheDocument();
            expect(screen.queryByText("Import movies")).not.toBeInTheDocument();
            expect(screen.getByText("Working dir > 1 GB")).toBeInTheDocument();
        });

        it("filters custom text columns without knowing their backend semantics", async () => {
            const extraRows = [
                {
                    ...rows[0],
                    extraTableColumns: {
                        owner: {
                            label: "Owner",
                            value: "Alice",
                            type: "text",
                            defaultVisible: true,
                        },
                    },
                },
                {
                    ...rows[1],
                    extraTableColumns: {
                        owner: {
                            label: "Owner",
                            value: "Bob",
                            type: "text",
                            defaultVisible: true,
                        },
                    },
                },
            ];

            renderTable({ rows: extraRows });

            const filterButton = screen.getByRole("button", { name: "Filter Owner" });
            fireEvent.keyDown(filterButton, { key: "ArrowDown" });

            const value = await screen.findByLabelText("Filter value Owner");

            fireEvent.change(value, { target: { value: "ali" } });
            fireEvent.click(screen.getByRole("button", { name: "Apply Owner filter" }));

            expect(screen.getByText("Import movies")).toBeInTheDocument();
            expect(screen.queryByText("Motion correction")).not.toBeInTheDocument();
            expect(screen.getByText('Owner contains "ali"')).toBeInTheDocument();
        });

        it("restores persisted dynamic filters and clears them from the active filter bar", () => {
            window.localStorage.setItem(
                "scipion-project-table:test-project",
                JSON.stringify({
                    version: 4,
                    columnFilters: {
                        "extra:workingDirSize": {
                            operator: "greaterThan",
                            value: "1 GB",
                        },
                    },
                }),
            );

            const extraRows = [
                {
                    ...rows[0],
                    extraTableColumns: {
                        workingDirSize: {
                            label: "Working dir",
                            value: 500 * 1024 * 1024,
                            type: "bytes",
                            defaultVisible: true,
                        },
                    },
                },
                {
                    ...rows[1],
                    extraTableColumns: {
                        workingDirSize: {
                            label: "Working dir",
                            value: 2 * 1024 * 1024 * 1024,
                            type: "bytes",
                            defaultVisible: true,
                        },
                    },
                },
            ];

            renderTable({ rows: extraRows });

            expect(screen.getByText("Motion correction")).toBeInTheDocument();
            expect(screen.queryByText("Import movies")).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

            expect(screen.getByText("Motion correction")).toBeInTheDocument();
            expect(screen.getByText("Import movies")).toBeInTheDocument();
        });

    },
);