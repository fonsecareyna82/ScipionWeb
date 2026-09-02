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

    onCopyWorkflow: vi.fn(),

    onDelete: vi.fn(),

    onRestartAll: vi.fn(),

    onContinueAll: vi.fn(),

    onResetFrom: vi.fn(),

    onStop: vi.fn(),

    onSelectFrom: vi.fn(),

    onSelectTo: vi.fn(),

    onSelectionChange: vi.fn(),

    onToggleTag: vi.fn(),

    onManageTags: vi.fn(),

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

        expect(
          screen.getByText(
            "Running",
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "7 / 10 steps",
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
      "renders input and output summaries",
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
            "inputMovies",
          ),
        ).toBeInTheDocument();

        expect(
          within(
            motionRow!,
          ).getByText(
            "outputMicrographs",
          ),
        ).toBeInTheDocument();
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
      "supports checkbox multi-selection",
      () => {
        const {
          props,
        } =
          renderTable();

        fireEvent.click(
          screen.getByRole(
            "checkbox",
            {
              name:
                "Select protocol 20",
            },
          ),
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