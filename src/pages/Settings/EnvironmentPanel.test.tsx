import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EnvironmentPanel, { type EnvironmentRow } from "./EnvironmentPanel";

const saved: EnvironmentRow[] = [
    { name: "CUDA_LIB", value: "/usr/local/cuda/lib64", isOverride: false, default: "/usr/local/cuda/lib64",
      description: "Where the CUDA libraries are." },
    { name: "SCIPION_SCRATCH", value: "/scratch", isOverride: true, default: "", description: "Fast disk for temporary files." },
];

function renderPanel(rows: EnvironmentRow[] = saved) {
    const handlers = { onChange: vi.fn(), onAdd: vi.fn(), onBackToDefault: vi.fn() };
    render(<EnvironmentPanel rows={rows} savedRows={saved} loading={false} error={null} {...handlers} />);
    return handlers;
}

describe("Settings: environment", () => {
    it("shows what each variable is for, its default and whether it was changed here", () => {
        renderPanel();
        const cuda = screen.getByTestId("variable-CUDA_LIB");
        expect(within(cuda).getByText("Where the CUDA libraries are.")).toBeInTheDocument();
        expect(within(cuda).getByText(/^Default:/)).toHaveTextContent("Default: /usr/local/cuda/lib64");
        expect(within(cuda).queryByText("Changed here")).not.toBeInTheDocument();
        const scratch = screen.getByTestId("variable-SCIPION_SCRATCH");
        expect(within(scratch).getByText("Changed here")).toBeInTheDocument();
    });

    it("edits a value, marks it not saved and can undo it", () => {
        const { onChange } = renderPanel([{ ...saved[0], value: "/opt/cuda/lib64" }, saved[1]]);
        fireEvent.change(screen.getByLabelText("Value of SCIPION_SCRATCH"), { target: { value: "/ssd" } });
        expect(onChange).toHaveBeenCalledWith("SCIPION_SCRATCH", "/ssd");

        const cuda = screen.getByTestId("variable-CUDA_LIB");
        expect(within(cuda).getByText("Not saved")).toBeInTheDocument();
        fireEvent.click(within(cuda).getByRole("button", { name: "Undo" }));
        expect(onChange).toHaveBeenLastCalledWith("CUDA_LIB", "/usr/local/cuda/lib64");
        // Going back to the original waits until the other changes are saved
        expect(within(screen.getByTestId("variable-SCIPION_SCRATCH")).getByRole("button", { name: "Back to the original" }))
            .toBeDisabled();

        fireEvent.click(screen.getByRole("button", { name: /Not saved · 1/ }));
        expect(screen.queryByTestId("variable-SCIPION_SCRATCH")).not.toBeInTheDocument();
    });

    it("goes back to the original value of a variable changed here", () => {
        const { onBackToDefault } = renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Back to the original" }));
        expect(onBackToDefault).toHaveBeenCalledWith("SCIPION_SCRATCH");
    });

    it("adds a variable with a valid name that is not in the list", () => {
        const { onAdd } = renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
        const name = screen.getByLabelText("Name");
        fireEvent.change(name, { target: { value: "CUDA_LIB" } });
        expect(screen.getByText("It is already in the list.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

        fireEvent.change(name, { target: { value: "MY_TOOL_HOME" } });
        fireEvent.change(screen.getByLabelText("Value"), { target: { value: "/opt/tool" } });
        fireEvent.click(screen.getByRole("button", { name: "Add" }));
        expect(onAdd).toHaveBeenCalledWith("MY_TOOL_HOME", "/opt/tool");
    });
});
