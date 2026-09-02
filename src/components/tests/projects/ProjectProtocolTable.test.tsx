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

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                /Protocol/,
                        },
                    ),
                );

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
    },
);