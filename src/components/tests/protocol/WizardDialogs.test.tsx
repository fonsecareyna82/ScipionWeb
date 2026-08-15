import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    WizardInputDialog,
    WizardOptionsDialog,
} from "@/components/protocol/WizardDialogs";

vi.mock("@/icons", () => ({
    CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

describe("WizardOptionsDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render content when closed", () => {
        render(
            <WizardOptionsDialog
                open={false}
                title="Select mode"
                paramName="mode"
                options={[
                    { label: "Fast", value: "fast" },
                    { label: "Accurate", value: "accurate" },
                ]}
                selectedValue="fast"
                message="Choose execution mode"
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onSelectedValueChange={vi.fn()}
            />,
        );

        expect(screen.queryByText("Select mode")).not.toBeInTheDocument();
    });

    it("renders title, message and selected option", () => {
        render(
            <WizardOptionsDialog
                open={true}
                title="Select mode"
                paramName="mode"
                options={[
                    { label: "Fast", value: "fast" },
                    { label: "Accurate", value: "accurate" },
                ]}
                selectedValue="fast"
                message="Choose execution mode"
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onSelectedValueChange={vi.fn()}
            />,
        );
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByText("Choose execution mode")).toBeInTheDocument();
        expect(screen.getByText("Choose execution mode")).toBeInTheDocument();
        expect(screen.getByRole("combobox")).toHaveTextContent("Fast");
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
        expect(screen.getByTestId("close-icon")).toBeInTheDocument();
    });

    it("calls onSelectedValueChange when a different option is selected", () => {
        const onSelectedValueChange = vi.fn();

        render(
            <WizardOptionsDialog
                open={true}
                title="Select mode"
                paramName="mode"
                options={[
                    { label: "Fast", value: "fast" },
                    { label: "Accurate", value: "accurate" },
                ]}
                selectedValue="fast"
                message="Choose execution mode"
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onSelectedValueChange={onSelectedValueChange}
            />,
        );

        fireEvent.mouseDown(screen.getByRole("combobox"));
        fireEvent.click(screen.getByRole("option", { name: "Accurate" }));

        expect(onSelectedValueChange).toHaveBeenCalledWith("accurate");
    });

    it("calls onClose and onConfirm from the footer buttons", () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();

        render(
            <WizardOptionsDialog
                open={true}
                title="Select mode"
                paramName="mode"
                options={[{ label: "Fast", value: "fast" }]}
                selectedValue="fast"
                message="Choose execution mode"
                onClose={onClose}
                onConfirm={onConfirm}
                onSelectedValueChange={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("does not render the message when it is empty", () => {
        render(
            <WizardOptionsDialog
                open={true}
                title="Select mode"
                paramName="mode"
                options={[{ label: "Fast", value: "fast" }]}
                selectedValue="fast"
                message=""
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onSelectedValueChange={vi.fn()}
            />,
        );

        expect(screen.queryByText("Choose execution mode")).not.toBeInTheDocument();
    });
});

describe("WizardInputDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render content when closed", () => {
        render(
            <WizardInputDialog
                open={false}
                title="Wizard input"
                fields={[]}
                values={{}}
                message="Fill values"
                previewImageUrl=""
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onValueChange={vi.fn()}
            />,
        );

        expect(screen.queryByText("Wizard input")).not.toBeInTheDocument();
    });

    it("renders title, message and preview image when provided", () => {
        render(
            <WizardInputDialog
                open={true}
                title="Wizard input"
                fields={[]}
                values={{}}
                message="Fill values"
                previewImageUrl="/preview.png"
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onValueChange={vi.fn()}
            />,
        );

        expect(screen.getByText("Wizard input")).toBeInTheDocument();
        expect(screen.getByText("Fill values")).toBeInTheDocument();
        expect(screen.getByAltText("Wizard preview")).toBeInTheDocument();
    });

    it("renders text, number and select fields", () => {
        render(
            <WizardInputDialog
                open={true}
                title="Wizard input"
                fields={[
                    { name: "label", label: "Label", kind: "text" },
                    { name: "radius", label: "Radius", kind: "number", min: 1, max: 10, step: 1 },
                    {
                        name: "mode",
                        label: "Mode",
                        kind: "select",
                        options: [
                            { label: "Fast", value: "fast" },
                            { label: "Accurate", value: "accurate" },
                        ],
                    },
                ]}
                values={{
                    label: "My label",
                    radius: "5",
                    mode: "fast",
                }}
                message="Fill values"
                previewImageUrl=""
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onValueChange={vi.fn()}
            />,
        );

        expect(screen.getByDisplayValue("My label")).toBeInTheDocument();
        expect(screen.getByDisplayValue("5")).toBeInTheDocument();
        expect(screen.getByRole("combobox")).toHaveTextContent("Fast");
    });

    it("calls onValueChange for text and number fields", () => {
        const onValueChange = vi.fn();

        render(
            <WizardInputDialog
                open={true}
                title="Wizard input"
                fields={[
                    { name: "label", label: "Label", kind: "text" },
                    { name: "radius", label: "Radius", kind: "number", min: 1, max: 10, step: 1 },
                ]}
                values={{
                    label: "My label",
                    radius: "5",
                }}
                message="Fill values"
                previewImageUrl=""
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onValueChange={onValueChange}
            />,
        );

        fireEvent.change(screen.getByLabelText("Label"), {
            target: { value: "New label" },
        });
        fireEvent.change(screen.getByLabelText("Radius"), {
            target: { value: "7" },
        });

        expect(onValueChange).toHaveBeenCalledWith("label", "New label");
        expect(onValueChange).toHaveBeenCalledWith("radius", "7");
    });

    it("calls onValueChange for select fields", () => {
        const onValueChange = vi.fn();

        render(
            <WizardInputDialog
                open={true}
                title="Wizard input"
                fields={[
                    {
                        name: "mode",
                        label: "Mode",
                        kind: "select",
                        options: [
                            { label: "Fast", value: "fast" },
                            { label: "Accurate", value: "accurate" },
                        ],
                    },
                ]}
                values={{
                    mode: "fast",
                }}
                message="Fill values"
                previewImageUrl=""
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                onValueChange={onValueChange}
            />,
        );

        fireEvent.mouseDown(screen.getByRole("combobox"));
        fireEvent.click(screen.getByRole("option", { name: "Accurate" }));

        expect(onValueChange).toHaveBeenCalledWith("mode", "accurate");
    });

    it("calls onClose and onConfirm from the footer buttons", () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();

        render(
            <WizardInputDialog
                open={true}
                title="Wizard input"
                fields={[]}
                values={{}}
                message="Fill values"
                previewImageUrl=""
                onClose={onClose}
                onConfirm={onConfirm}
                onValueChange={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});