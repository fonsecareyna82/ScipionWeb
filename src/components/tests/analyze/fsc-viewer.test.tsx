import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    fetchFscRows: vi.fn(),
}));

vi.mock("@/ProjectServiceContext", () => ({
    useProjectService: () => serviceMocks,
}));

import FscViewer from "../../analyze/fsc-viewer";

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

function makeFscPayload(
    overrides: Partial<{
        rows: Array<{
            label: string;
            resolution: number | null;
            x: number[];
            y: number[];
        }>;
        threshold: number;
    }> = {},
) {
    return {
        rows: [
            {
                label: "Curve A",
                resolution: 3.21,
                x: [0.1, 0.2],
                y: [0.9, 0.1],
            },
            {
                label: "Curve B",
                resolution: 4.32,
                x: [0.1, 0.2],
                y: [0.8, 0.05],
            },
        ],
        threshold: 0.143,
        ...overrides,
    };
}

function renderViewer() {
    return render(
        <FscViewer projectId={1} protocolId={2} outputName="fscOutput" />,
    );
}

describe("FscViewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows the loading state while FSC rows are pending", async () => {
        const deferred = createDeferred<ReturnType<typeof makeFscPayload>>();
        serviceMocks.fetchFscRows.mockReturnValueOnce(deferred.promise);

        renderViewer();

        expect(await screen.findByText("Loading FSC viewer...")).toBeInTheDocument();

        deferred.resolve(makeFscPayload());

        await waitFor(() => {
            expect(screen.getByText("FSC curves")).toBeInTheDocument();
        });
    });

    it("shows an error state when loading fails", async () => {
        serviceMocks.fetchFscRows.mockRejectedValueOnce(new Error("Boom"));

        renderViewer();

        await waitFor(() => {
            expect(screen.getByText("Boom")).toBeInTheDocument();
        });
    });

    it("shows the empty state when no FSC rows are returned", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce({
            rows: [],
            threshold: 0.143,
        });

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No FSC curves were returned for this output."),
            ).toBeInTheDocument();
        });
    });

    it("shows the empty state when rows are filtered out during normalization", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce({
            rows: [
                {
                    label: "Broken curve",
                    resolution: null,
                    x: [],
                    y: [],
                },
            ],
            threshold: 0.143,
        });

        renderViewer();

        await waitFor(() => {
            expect(
                screen.getByText("No FSC curves were returned for this output."),
            ).toBeInTheDocument();
        });
    });

    it("renders the curves summary and series cards on success", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce(makeFscPayload());

        renderViewer();

        expect(await screen.findByText("FSC curves")).toBeInTheDocument();

        expect(screen.getByText(/2\/2 visible/i)).toBeInTheDocument();
        expect(screen.getByText(/4 points/i)).toBeInTheDocument();
        expect(screen.getByText(/Threshold 0.143/i)).toBeInTheDocument();

        expect(screen.getByText("Curve A")).toBeInTheDocument();
        expect(screen.getByText("Curve B")).toBeInTheDocument();
        expect(screen.getAllByText("Only")).toHaveLength(2);
    });

    it("supports hide all and show all", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce(makeFscPayload());

        renderViewer();

        expect(await screen.findByText("FSC curves")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
        expect(screen.getByText(/0\/2 visible/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Show all" }));
        expect(screen.getByText(/2\/2 visible/i)).toBeInTheDocument();
    });

    it("supports showing only one curve", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce(makeFscPayload());

        renderViewer();

        expect(await screen.findByText("FSC curves")).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole("button", { name: "Only" })[0]);

        expect(screen.getByText(/1\/2 visible/i)).toBeInTheDocument();
    });

    it("toggles the threshold visibility switch", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce(makeFscPayload());

        renderViewer();

        expect(await screen.findByText("FSC curves")).toBeInTheDocument();

        const thresholdSwitch = screen.getByLabelText(/show 0\.143 threshold/i);

        expect(thresholdSwitch).toBeChecked();

        fireEvent.click(thresholdSwitch);

        expect(thresholdSwitch).not.toBeChecked();
    });

    it("calls fetchFscRows with the expected arguments", async () => {
        serviceMocks.fetchFscRows.mockResolvedValueOnce(makeFscPayload());

        renderViewer();

        await waitFor(() => {
            expect(serviceMocks.fetchFscRows).toHaveBeenCalledTimes(1);
        });

        expect(serviceMocks.fetchFscRows).toHaveBeenCalledWith(
            1,
            2,
            "fscOutput",
        );
    });
});