import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import MaskRadiusDialog from "@/components/protocol/wizards/MaskRadiusDialog";

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
    overrides: Partial<React.ComponentProps<typeof MaskRadiusDialog>> = {},
) {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const onRadiusChange = vi.fn();
    const onRadiusCommit = vi.fn();
    const onSelectedIndexChange = vi.fn();

    render(
        <MaskRadiusDialog
            open={true}
            title="Mask radius"
            radius={10}
            min={0}
            max={20}
            step={2}
            radiusAngstrom={15}
            samplingRate={1.5}
            selectedIndex={1}
            items={[
                { id: "p0", index: 0, label: "Particle 0" },
                { id: "p1", index: 1, label: "Particle 1" },
            ]}
            message="Adjust the radius"
            previewUrl={null}
            previewCaption="Central slice"
            previewSourceWidth={100}
            previewSourceHeight={100}
            onClose={onClose}
            onConfirm={onConfirm}
            onRadiusChange={onRadiusChange}
            onRadiusCommit={onRadiusCommit}
            onSelectedIndexChange={onSelectedIndexChange}
            {...overrides}
        />,
    );

    return {
        onClose,
        onConfirm,
        onRadiusChange,
        onRadiusCommit,
        onSelectedIndexChange,
    };
}

describe("MaskRadiusDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render content when closed", () => {
        renderComponent({
            open: false,
        });

        expect(screen.queryByText("Mask radius")).not.toBeInTheDocument();
    });

    it("renders title, message, particle list and radius info", () => {
        renderComponent();

        expect(screen.getByText("Mask radius")).toBeInTheDocument();
        expect(screen.getByText("Adjust the radius")).toBeInTheDocument();
        expect(screen.getByText("Particles")).toBeInTheDocument();
        expect(screen.getByText("Particle 0")).toBeInTheDocument();
        expect(screen.getByText("Particle 1")).toBeInTheDocument();
        expect(screen.getByText("10 pix")).toBeInTheDocument();
        expect(screen.getByText("15 Å")).toBeInTheDocument();
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
            previewUrl: "/mask-preview.png",
        });

        const image = screen.getByAltText("Mask radius preview");
        expect(image).toBeInTheDocument();
        expect(image).toHaveAttribute("src", "/mask-preview.png");
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