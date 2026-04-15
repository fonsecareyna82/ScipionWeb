import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import OutputSelectorDialog from "../../protocol/outputSelectorDialog";

type Output = {
  paramClass?: string;
  pointerClass?: string;
  _expectedClass?: string;
  value?: string;
  info?: string;
  parentId?: string | number;
  protocol?: string;
  key?: string;
};

const outputs: Output[] = [
  {
    parentId: 10,
    protocol: "Import particles",
    pointerClass: "SetOfParticles",
    info: "Particles from run 10",
    key: "particles-10",
  },
  {
    parentId: 20,
    protocol: "Import volumes",
    pointerClass: "SetOfVolumes",
    info: "Volumes from run 20",
    key: "volumes-20",
  },
  {
    parentId: 30,
    protocol: "Refine particles",
    pointerClass: "SetOfParticles",
    info: "Particles from run 30",
    key: "particles-30",
  },
];

describe("OutputSelectorDialog", () => {
  it("does not render when closed", () => {
    render(
      <OutputSelectorDialog
        open={false}
        onClose={() => {}}
        allOutputs={outputs}
        onSelect={() => {}}
      />,
    );

    expect(
      screen.queryByText("Select compatible output"),
    ).not.toBeInTheDocument();
  });

  it("filters outputs by expected class", () => {
    render(
      <OutputSelectorDialog
        open={true}
        onClose={() => {}}
        expectedClass="SetOfParticles"
        allOutputs={outputs}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Import particles")).toBeInTheDocument();
    expect(screen.getByText("Refine particles")).toBeInTheDocument();
    expect(screen.queryByText("Import volumes")).not.toBeInTheDocument();
    expect(screen.getByText("2 results")).toBeInTheDocument();
  });

  it("allows selecting one output in single-select mode and confirms it", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <OutputSelectorDialog
        open={true}
        onClose={onClose}
        expectedClass="SetOfParticles"
        allOutputs={outputs}
        onSelect={onSelect}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeDisabled();

    const rowText = screen.getByText("Refine particles");
    const row = rowText.closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(row!);

    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(outputs[2]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters by search text and can clear the filter", () => {
    render(
      <OutputSelectorDialog
        open={true}
        onClose={() => {}}
        allOutputs={outputs}
        onSelect={() => {}}
      />,
    );

    const filterInput = screen.getByLabelText("Filter output");

    fireEvent.change(filterInput, {
      target: { value: "volumes" },
    });

    expect(screen.getByText("Import volumes")).toBeInTheDocument();
    expect(screen.queryByText("Import particles")).not.toBeInTheDocument();
    expect(screen.queryByText("Refine particles")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(screen.getByDisplayValue("")).toBeInTheDocument();
    expect(screen.getByText("Import volumes")).toBeInTheDocument();
    expect(screen.getByText("Import particles")).toBeInTheDocument();
    expect(screen.getByText("Refine particles")).toBeInTheDocument();
  });

  it("supports multi-select and confirms all selected outputs", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <OutputSelectorDialog
        open={true}
        onClose={onClose}
        expectedClass="all"
        allOutputs={outputs}
        onSelect={onSelect}
        multiSelect={true}
      />,
    );

    fireEvent.click(screen.getByText("Import particles"));
    fireEvent.click(screen.getByText("Refine particles"));

    expect(screen.getByText("Selected outputs: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm (2)" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith([outputs[2], outputs[0]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets selection and filter when reopened", () => {
    const { rerender } = render(
      <OutputSelectorDialog
        open={true}
        onClose={() => {}}
        allOutputs={outputs}
        onSelect={() => {}}
        multiSelect={true}
      />,
    );

    fireEvent.change(screen.getByLabelText("Filter output"), {
      target: { value: "particles" },
    });

    fireEvent.click(screen.getByText("Refine particles"));

    expect(screen.getByText("Selected outputs: 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("particles")).toBeInTheDocument();

    rerender(
      <OutputSelectorDialog
        open={false}
        onClose={() => {}}
        allOutputs={outputs}
        onSelect={() => {}}
        multiSelect={true}
      />,
    );

    rerender(
      <OutputSelectorDialog
        open={true}
        onClose={() => {}}
        allOutputs={outputs}
        onSelect={() => {}}
        multiSelect={true}
      />,
    );

    expect(screen.getByDisplayValue("")).toBeInTheDocument();
    expect(screen.getByText("Selected outputs: 0")).toBeInTheDocument();
    expect(screen.getByText("Showing 3")).toBeInTheDocument();
  });
});