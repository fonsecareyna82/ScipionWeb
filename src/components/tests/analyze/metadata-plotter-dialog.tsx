import type { ComponentProps, ReactNode } from "react";
import type {
  MetadataColumn,
  MetadataRow,
  MetadataTableSchema,
} from "@/api/projects";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/icons", () => ({
  CloseIcon: (props: Record<string, unknown>) => (
    <svg data-testid="close-icon" {...props} />
  ),
}));

vi.mock("recharts", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <div data-testid="recharts-wrapper">{children}</div>
  );

  return {
    ResponsiveContainer: ({
      children,
    }: {
      children?: ReactNode;
      width?: string | number;
      height?: string | number;
    }) => <div data-testid="responsive-container">{children}</div>,
    LineChart: Wrapper,
    Line: () => <div data-testid="line-series" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    BarChart: Wrapper,
    Bar: () => <div data-testid="bar-series" />,
    ScatterChart: Wrapper,
    Scatter: () => <div data-testid="scatter-series" />,
    ReferenceArea: () => null,
    Customized: ({
      component,
    }: {
      component?: (props: unknown) => ReactNode;
    }) => (typeof component === "function" ? component({}) : null),
  };
});

import { MetadataPlotterDialog } from "../../analyze/metadata-plotter-dialog";

type MetadataPlotterDialogProps = ComponentProps<typeof MetadataPlotterDialog>;
type PlotterService = MetadataPlotterDialogProps["svcRef"]["current"];

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function makeColumn(overrides: Partial<MetadataColumn> = {}): MetadataColumn {
  return {
    name: "score",
    alias: "Score",
    index: 0,
    sortable: true,
    visible: true,
    rendererType: "float",
    decimals: 2,
    hasTransformation: false,
    ...overrides,
  };
}

function makeSchema(
  columns: MetadataColumn[],
  overrides: Partial<MetadataTableSchema> = {},
): MetadataTableSchema {
  return {
    name: "particles",
    alias: "Particles",
    hasColumnId: true,
    columns,
    ...overrides,
  };
}

function makeRow(overrides: Partial<MetadataRow> = {}): MetadataRow {
  return {
    id: 1,
    values: [0.85],
    ...overrides,
  };
}

function makeService(overrides: Partial<PlotterService> = {}): PlotterService {
  const service = {
    fetchMetadataTableWindow: vi.fn().mockResolvedValue({
      rows: [makeRow()],
      offset: 0,
    }),
    runMetadataTableAction: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };

  return service as unknown as PlotterService;
}

function makeProps(
  overrides: Partial<MetadataPlotterDialogProps> = {},
): MetadataPlotterDialogProps {
  const column = makeColumn();
  const service = makeService();

  return {
    open: true,
    onClose: vi.fn(),
    projectId: 1,
    protocolId: 2,
    outputName: "outputA",
    selectedTable: "particles",
    schema: makeSchema([column]),
    totalRows: 1,
    allColumns: [column],
    schemaActions: ["Create subset"],
    sortBy: null,
    sortAsc: true,
    svcRef: { current: service } as MetadataPlotterDialogProps["svcRef"],
    isRowSelectedInViewer: vi.fn(() => false),
    viewerSelectedCount: 0,
    ...overrides,
  };
}

describe("MetadataPlotterDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the title when closed", () => {
    const props = makeProps({ open: false });

    render(<MetadataPlotterDialog {...props} />);

    expect(screen.queryByText("Plotter")).not.toBeInTheDocument();
    expect(props.svcRef.current.fetchMetadataTableWindow).not.toHaveBeenCalled();
  });

  it("renders the title and loads plot rows on open", async () => {
    const props = makeProps();

    render(<MetadataPlotterDialog {...props} />);

    expect(screen.getByText("Plotter")).toBeInTheDocument();

    await waitFor(() => {
      expect(props.svcRef.current.fetchMetadataTableWindow).toHaveBeenCalledTimes(
        1,
      );
    });

    expect(props.svcRef.current.fetchMetadataTableWindow).toHaveBeenCalledWith(
      1,
      2,
      "outputA",
      "particles",
      {
        offset: 0,
        limit: 1,
        selectionOnly: false,
        sortBy: undefined,
        asc: undefined,
      },
    );
  });

  it("shows the loading state while plot data is pending", async () => {
    const deferred = createDeferred<{
      rows: MetadataRow[];
      offset: number;
    }>();

    const service = makeService({
      fetchMetadataTableWindow: vi.fn().mockReturnValue(
        deferred.promise,
      ) as unknown as PlotterService["fetchMetadataTableWindow"],
    });

    const props = makeProps({
      svcRef: { current: service } as MetadataPlotterDialogProps["svcRef"],
    });

    render(<MetadataPlotterDialog {...props} />);

    expect(await screen.findByText("Loading plot data…")).toBeInTheDocument();

    deferred.resolve({
      rows: [],
      offset: 0,
    });

    await waitFor(() => {
      expect(screen.getByText("No data to plot.")).toBeInTheDocument();
    });
  });

  it("shows an error message when loading plot data fails", async () => {
    const service = makeService({
      fetchMetadataTableWindow: vi.fn().mockRejectedValue(
        new Error("Boom"),
      ) as unknown as PlotterService["fetchMetadataTableWindow"],
    });

    const props = makeProps({
      svcRef: { current: service } as MetadataPlotterDialogProps["svcRef"],
    });

    render(<MetadataPlotterDialog {...props} />);

    await waitFor(() => {
      expect(screen.getByText("Boom")).toBeInTheDocument();
    });
  });

  it("shows the empty state when no rows are returned", async () => {
    const service = makeService({
      fetchMetadataTableWindow: vi.fn().mockResolvedValue({
        rows: [],
        offset: 0,
      }) as unknown as PlotterService["fetchMetadataTableWindow"],
    });

    const props = makeProps({
      svcRef: { current: service } as MetadataPlotterDialogProps["svcRef"],
    });

    render(<MetadataPlotterDialog {...props} />);

    await waitFor(() => {
      expect(screen.getByText("No data to plot.")).toBeInTheDocument();
    });
  });

  it("closes when the footer Close button is clicked", async () => {
    const onClose = vi.fn();
    const props = makeProps({ onClose });

    render(<MetadataPlotterDialog {...props} />);

    const closeButton = await screen.findByRole("button", { name: "Close" });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
  
});