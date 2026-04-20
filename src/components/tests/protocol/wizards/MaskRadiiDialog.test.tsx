import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import MaskRadiiDialog from "@/components/protocol/wizards/MaskRadiiDialog";

vi.mock("@/icons", () => ({
    CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

beforeAll(() => {
    class ResizeObserverMock {
        observe() { }
        disconnect() { }
        unobserve() { }
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
        value: ResizeObserverMock,
        configurable: true,
    });
});

function renderComponent(
    overrides: Partial<React.ComponentProps<typeof MaskRadiiDialog>> = {},
) {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const onInnerRadiusChange = vi.fn();
    const onInnerRadiusCommit = vi.fn();
    const onOuterRadiusChange = vi.fn();
    const onOuterRadiusCommit = vi.fn();
    const onSelectedIndexChange = vi.fn();

    render(
        <MaskRadiiDialog
            open={true}
            title="Mask radii"
            innerRadius={8}
            outerRadius={16}
            innerMin={0}
            outerMin={4}
            max={30}
            step={2}
            innerRadiusAngstrom={12}
            outerRadiusAngstrom={24}
            samplingRate={1.5}
            selectedIndex={1}
            items={[
                { id: "p0", index: 0, label: "Particle 0" },
                { id: "p1", index: 1, label: "Particle 1" },
            ]}
            message="Adjust inner and outer radii"
            previewUrl={null}
            previewCaption="Central slice"
            previewSourceWidth={100}
            previewSourceHeight={100}
            primaryParamName="Inner radius"
            secondaryParamName="Outer radius"
            onClose={onClose}
            onConfirm={onConfirm}
            onInnerRadiusChange={onInnerRadiusChange}
            onInnerRadiusCommit={onInnerRadiusCommit}
            onOuterRadiusChange={onOuterRadiusChange}
            onOuterRadiusCommit={onOuterRadiusCommit}
            onSelectedIndexChange={onSelectedIndexChange}
            {...overrides}
        />,
    );

    return {
        onClose,
        onConfirm,
        onInnerRadiusChange,
        onInnerRadiusCommit,
        onOuterRadiusChange,
        onOuterRadiusCommit,
        onSelectedIndexChange,
    };
}

describe("MaskRadiiDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render content when closed", () => {
        renderComponent({
            open: false,
        });

        expect(screen.queryByText("Mask radii")).not.toBeInTheDocument();
    });

    it("renders title, message, particle list and radii info", () => {
        renderComponent();

        expect(screen.getByText("Mask radii")).toBeInTheDocument();
        expect(screen.getByText("Adjust inner and outer radii")).toBeInTheDocument();
        expect(screen.getByText("Particles")).toBeInTheDocument();
        expect(screen.getByText("Particle 0")).toBeInTheDocument();
        expect(screen.getByText("Particle 1")).toBeInTheDocument();

        expect(screen.getByText("Inner radius")).toBeInTheDocument();
        expect(screen.getByText("Outer radius")).toBeInTheDocument();

        expect(screen.getByText("8 pix")).toBeInTheDocument();
        expect(screen.getByText("16 pix")).toBeInTheDocument();

        expect(screen.getByText("12 Å")).toBeInTheDocument();
        expect(screen.getByText("24 Å")).toBeInTheDocument();

        expect(screen.getByText("Central slice")).toBeInTheDocument();
        expect(screen.getByText("Sampling rate: 1.5 Å/pix")).toBeInTheDocument();
    });

    it("renders preview fallback when previewUrl is not available", () => {
        renderComponent({
            previewUrl: null,
        });

        expect(screen.getByText("Preview not available yet.")).toBeInTheDocument();
    });

    it("renders preview image when previewUrl is provided", () => {
        renderComponent({
            previewUrl: "/mask-radii-preview.png",
        });

        const image = screen.getByAltText("Mask radii preview");
        expect(image).toBeInTheDocument();
        expect(image).toHaveAttribute("src", "/mask-radii-preview.png");
    });

    it("calls onSelectedIndexChange when clicking a particle item", () => {
        const { onSelectedIndexChange } = renderComponent();

        fireEvent.click(screen.getByText("Particle 0"));

        expect(onSelectedIndexChange).toHaveBeenCalledWith(0);
    });

    it("calls onClose and onConfirm from footer buttons", () => {
        const { onClose, onConfirm } = renderComponent();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.click(screen.getByRole("button", { name: "Select" }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("shows missing sampling rate text when samplingRate is not available", () => {
        renderComponent({
            samplingRate: null,
        });

        expect(screen.getByText("Sampling rate not available")).toBeInTheDocument();
    });
});