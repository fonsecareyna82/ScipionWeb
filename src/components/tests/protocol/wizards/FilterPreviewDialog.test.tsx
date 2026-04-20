import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FilterPreviewDialog from "@/components/protocol/wizards/FilterPreviewDialog";

vi.mock("@/icons", () => ({
    CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

function renderComponent(
    overrides: Partial<React.ComponentProps<typeof FilterPreviewDialog>> = {},
) {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const onSelectedIndexChange = vi.fn();
    const onLowFreqChange = vi.fn();
    const onLowFreqCommit = vi.fn();
    const onHighFreqChange = vi.fn();
    const onHighFreqCommit = vi.fn();
    const onDecayChange = vi.fn();
    const onDecayCommit = vi.fn();

    render(
        <FilterPreviewDialog
            open={true}
            title="Filter preview"
            message="Adjust the frequencies and inspect the filtered result"
            items={[
                { id: "0", index: 0, label: "Object 0" },
                { id: "1", index: 1, label: "Object 1" },
            ]}
            selectedIndex={0}
            onSelectedIndexChange={onSelectedIndexChange}
            originalPreviewUrl={null}
            filteredPreviewUrl={null}
            previewLoading={false}
            lowFreq={0.1}
            lowFreqMin={0}
            lowFreqMax={1}
            highFreq={0.4}
            highFreqMin={0}
            highFreqMax={1}
            decay={0.05}
            decayMin={0}
            decayMax={1}
            freqStep={0.01}
            unitLabel="1/px"
            filterMode="Band-pass"
            lowFreqParamName="Low freq"
            highFreqParamName="High freq"
            decayParamName="Decay"
            onClose={onClose}
            onConfirm={onConfirm}
            onLowFreqChange={onLowFreqChange}
            onLowFreqCommit={onLowFreqCommit}
            onHighFreqChange={onHighFreqChange}
            onHighFreqCommit={onHighFreqCommit}
            onDecayChange={onDecayChange}
            onDecayCommit={onDecayCommit}
            {...overrides}
        />,
    );

    return {
        onClose,
        onConfirm,
        onSelectedIndexChange,
        onLowFreqChange,
        onLowFreqCommit,
        onHighFreqChange,
        onHighFreqCommit,
        onDecayChange,
        onDecayCommit,
    };
}

describe("FilterPreviewDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render content when closed", () => {
        renderComponent({
            open: false,
        });

        expect(screen.queryByText("Filter preview")).not.toBeInTheDocument();
    });

    it("renders title, message, object list and fallback preview messages", () => {
        renderComponent();

        expect(screen.getByText("Filter preview")).toBeInTheDocument();
        expect(
            screen.getByText("Adjust the frequencies and inspect the filtered result"),
        ).toBeInTheDocument();

        expect(screen.getByText("Object")).toBeInTheDocument();
        expect(screen.getByText("Object 0")).toBeInTheDocument();
        expect(screen.getByText("Object 1")).toBeInTheDocument();

        expect(screen.getByText("Original preview not available.")).toBeInTheDocument();
        expect(screen.getByText("Filtered preview not available.")).toBeInTheDocument();

        expect(screen.getByText("Image")).toBeInTheDocument();
        expect(screen.getByText("Filtered")).toBeInTheDocument();
    });

    it("renders preview images when urls are provided", () => {
        renderComponent({
            originalPreviewUrl: "/original-preview.png",
            filteredPreviewUrl: "/filtered-preview.png",
        });

        const original = screen.getByAltText("Original preview");
        const filtered = screen.getByAltText("Filtered preview");

        expect(original).toBeInTheDocument();
        expect(original).toHaveAttribute("src", "/original-preview.png");

        expect(filtered).toBeInTheDocument();
        expect(filtered).toHaveAttribute("src", "/filtered-preview.png");
    });

    it("shows the loading overlay when previewLoading is true", () => {
        renderComponent({
            previewLoading: true,
        });

        expect(screen.getByText("Loading preview...")).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("calls onSelectedIndexChange when selecting another object", () => {
        const { onSelectedIndexChange } = renderComponent({
            selectedIndex: 0,
        });

        fireEvent.click(screen.getByText("Object 1"));

        expect(onSelectedIndexChange).toHaveBeenCalledWith(1);
    });

    it("renders filter section labels, mode and formatted values", () => {
        renderComponent({
            lowFreq: 0.1,
            highFreq: 0.4,
            decay: 0.05,
            unitLabel: "1/px",
            filterMode: "Band-pass",
        });

        expect(screen.getByText("Frequencies (1/px)")).toBeInTheDocument();
        expect(screen.getByText("Mode: Band-pass")).toBeInTheDocument();

        expect(screen.getByText("Low freq")).toBeInTheDocument();
        expect(screen.getByText("High freq")).toBeInTheDocument();
        expect(screen.getByText("Decay")).toBeInTheDocument();

        expect(screen.getByText("0.10")).toBeInTheDocument();
        expect(screen.getByText("0.40")).toBeInTheDocument();
        expect(screen.getAllByText("0.05").length).toBeGreaterThan(0);
    });

    it("calls onClose and onConfirm from footer buttons", () => {
        const { onClose, onConfirm } = renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.click(screen.getByRole("button", { name: "Select" }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});