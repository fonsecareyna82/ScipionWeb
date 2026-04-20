import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ParamRow from "@/components/protocol/ParamRow";

vi.mock("@/icons", () => ({
    CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
    FindIcon: (props: any) => <svg data-testid="find-icon" {...props} />,
    HelpIcon: (props: any) => <svg data-testid="help-icon" {...props} />,
    TrashBinIcon: (props: any) => <svg data-testid="trash-icon" {...props} />,
}));

vi.mock("lucide-react", () => ({
    FolderOpen: (props: any) => <svg data-testid="folder-icon" {...props} />,
    Wand2: (props: any) => <svg data-testid="wizard-icon" {...props} />,
}));

function renderComponent(
    overrides: Partial<React.ComponentProps<typeof ParamRow>> = {},
) {
    render(
        <ParamRow
            label="Input particles"
            control={<input aria-label="param-control" value="value" readOnly />}
            rowIndex={0}
            {...overrides}
        />,
    );
}

describe("ParamRow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the label and control", () => {
        renderComponent();

        expect(screen.getByText("Input particles")).toBeInTheDocument();
        expect(screen.getByLabelText("param-control")).toBeInTheDocument();
    });

    it("calls onClear when the clear action is clicked", () => {
        const onClear = vi.fn();

        renderComponent({
            onClear,
        });

        fireEvent.click(screen.getByRole("button"));

        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("calls onOpenFind for pointer params when provided", () => {
        const onOpenFind = vi.fn();

        renderComponent({
            isPointerParam: true,
            onOpenFind,
        });

        fireEvent.click(screen.getByRole("button"));

        expect(onOpenFind).toHaveBeenCalledTimes(1);
    });

    it("opens the fallback selector dialog for pointer params when onOpenFind is not provided", () => {
        renderComponent({
            isPointerParam: true,
        });

        fireEvent.click(screen.getByRole("button"));

        expect(screen.getByText("Select output")).toBeInTheDocument();
        expect(
            screen.getByText("No selector implemented here. Use onOpenFind/onBrowsePath from the parent."),
        ).toBeInTheDocument();
    });

    it("calls onBrowsePath for path params", () => {
        const onBrowsePath = vi.fn();

        renderComponent({
            isPathParam: true,
            onBrowsePath,
        });

        fireEvent.click(screen.getByRole("button"));

        expect(onBrowsePath).toHaveBeenCalledTimes(1);
    });

    it("calls onOpenWizard when wizard action is available", () => {
        const onOpenWizard = vi.fn();

        renderComponent({
            hasWizard: true,
            onOpenWizard,
        });

        fireEvent.click(screen.getByRole("button"));

        expect(onOpenWizard).toHaveBeenCalledTimes(1);
    });

    it("opens the help dialog and renders formatted help content", () => {
        renderComponent({
            helpText: "Read *this* and visit [[example.com][guide]].",
        });

        fireEvent.click(screen.getByRole("button"));

        expect(screen.getByText("Help")).toBeInTheDocument();
        expect(screen.getByText("this")).toBeInTheDocument();

        const guideLink = screen.getByRole("link", { name: "guide" });
        expect(guideLink).toBeInTheDocument();
        expect(guideLink).toHaveAttribute("href", "https://example.com");
    });

    it("closes the fallback selector dialog from the footer button", async () => {
        renderComponent({
            isPointerParam: true,
        });

        fireEvent.click(screen.getByRole("button"));
        expect(screen.getByText("Select output")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        await waitFor(() => {
            expect(screen.queryByText("Select output")).not.toBeInTheDocument();
        });
    });

    it("closes the help dialog from the footer button", async () => {
        renderComponent({
            helpText: "Some help text",
        });

        fireEvent.click(screen.getByRole("button"));
        expect(screen.getByText("Help")).toBeInTheDocument();

        const closeButtons = screen.getAllByRole("button", { name: /close/i });
        fireEvent.click(closeButtons[1]);

        await waitFor(() => {
            expect(screen.queryByText("Help")).not.toBeInTheDocument();
        });
    });

    it("renders without the control area in fullWidth layout", () => {
        renderComponent({
            layoutVariant: "fullWidth",
        });

        expect(screen.getByText("Input particles")).toBeInTheDocument();
        expect(screen.queryByLabelText("param-control")).not.toBeInTheDocument();
    });
});