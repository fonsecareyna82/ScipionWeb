import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MultiParamRow from "@/components/protocol/MultiParamRow";

const mockUseDrag = vi.fn();
const mockOutputSelectorDialog = vi.fn();

vi.mock("@/components/protocol/DragContext", () => ({
  useDrag: () => mockUseDrag(),
}));

vi.mock("@/components/protocol/outputSelectorDialog", () => ({
  default: (props: any) => mockOutputSelectorDialog(props),
}));

vi.mock("@/icons", () => ({
  TrashBinIcon: (props: any) => <svg data-testid="trash-icon" {...props} />,
  EyeIcon: (props: any) => <svg data-testid="eye-icon" {...props} />,
  FindIcon: (props: any) => <svg data-testid="find-icon" {...props} />,
}));

function createOutputSelectorMock() {
  mockOutputSelectorDialog.mockImplementation(
    ({ open, onSelect, expectedClass, allOutputs }: any) =>
      open ? (
        <div data-testid="output-selector">
          <div data-testid="expected-class">
            {Array.isArray(expectedClass) ? expectedClass.join(", ") : String(expectedClass ?? "")}
          </div>
          <div data-testid="available-outputs">{String(allOutputs?.length ?? 0)}</div>
          <button
            type="button"
            onClick={() =>
              onSelect([
                { value: "picked-1", info: "Picked output 1" },
                { value: "picked-2", info: "Picked output 2" },
              ])
            }
          >
            Confirm pick
          </button>
        </div>
      ) : null,
  );
}

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof MultiParamRow>> = {},
) {
  mockUseDrag.mockReturnValue({
    currentDraggedOutput: null,
  });
  createOutputSelectorMock();

  const onRowClear = vi.fn();
  const onRowDrop = vi.fn();
  const setDragOverKey = vi.fn();
  const getAvailableOutputs = vi.fn(() => [
    { value: "out-1", pointerClass: "SetOfParticles" },
    { value: "out-2", pointerClass: "SetOfParticles" },
    { value: "filled-object", pointerClass: "SetOfParticles" },
  ]);
  const onPickForRow = vi.fn();
  const onRowEdit = vi.fn();

  render(
    <MultiParamRow
      label="Input set"
      items={[{ object: "filled-object", info: "Filled info" }]}
      onRowClear={onRowClear}
      onRowDrop={onRowDrop}
      dragOverKey={null}
      setDragOverKey={setDragOverKey}
      paramKey="inputSet"
      def={{ pointerClass: "SetOfParticles" }}
      getAvailableOutputs={getAvailableOutputs}
      onPickForRow={onPickForRow}
      onRowEdit={onRowEdit}
      {...overrides}
    />,
  );

  return {
    onRowClear,
    onRowDrop,
    setDragOverKey,
    getAvailableOutputs,
    onPickForRow,
    onRowEdit,
  };
}

describe("MultiParamRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders existing rows and appends one empty row", () => {
    renderComponent();

    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes).toHaveLength(4);

    expect(screen.getByDisplayValue("filled-object")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Filled info")).toBeInTheDocument();

    const findButtons = screen.getAllByRole("button");
    expect(findButtons.length).toBeGreaterThan(0);
  });

  it("calls onRowEdit when editing object and info fields", () => {
    const { onRowEdit } = renderComponent();

    const textboxes = screen.getAllByRole("textbox");
    const objectInput = textboxes[0];
    const infoInput = textboxes[1];

    fireEvent.change(objectInput, { target: { value: "edited-object" } });
    fireEvent.change(infoInput, { target: { value: "edited-info" } });

    expect(onRowEdit).toHaveBeenCalledWith(0, { object: "edited-object" });
    expect(onRowEdit).toHaveBeenCalledWith(0, { info: "edited-info" });
  });

  it("does not call onRowEdit when readOnly is true", () => {
    const { onRowEdit } = renderComponent({
      readOnly: true,
    });

    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(textboxes[0], { target: { value: "edited-object" } });
    fireEvent.change(textboxes[1], { target: { value: "edited-info" } });

    expect(onRowEdit).not.toHaveBeenCalled();
  });

  it("calls onRowClear for non-empty rows", () => {
    const { onRowClear } = renderComponent();

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);

    expect(onRowClear).toHaveBeenCalledWith(0);
  });

  it("opens the selector for an empty row and maps selected outputs to consecutive rows", () => {
    const { onPickForRow } = renderComponent();

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);

    expect(screen.getByTestId("output-selector")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm pick" }));

    expect(onPickForRow).toHaveBeenCalledWith(1, {
      value: "picked-1",
      info: "Picked output 1",
    });
    expect(onPickForRow).toHaveBeenCalledWith(2, {
      value: "picked-2",
      info: "Picked output 2",
    });
  });

  it("filters available outputs already used in the table before passing them to the selector", () => {
    renderComponent();

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);

    expect(screen.getByTestId("available-outputs")).toHaveTextContent("2");
    expect(screen.getByTestId("expected-class")).toHaveTextContent("SetOfParticles");
  });

  it("calls onRowDrop with parsed dragged output when dropping a new value", () => {
    const { onRowDrop, setDragOverKey } = renderComponent();

    const rows = screen.getAllByRole("row");
    const targetRow = rows[2];

    fireEvent.drop(targetRow, {
      dataTransfer: {
        getData: (type: string) =>
          type === "application/scipion-output"
            ? JSON.stringify({
                value: "new-output",
                info: "Dragged output",
                pointerClass: "SetOfParticles",
              })
            : "",
      },
    });

    expect(setDragOverKey).toHaveBeenCalledWith(null);
    expect(onRowDrop).toHaveBeenCalledWith(1, {
      value: "new-output",
      info: "Dragged output",
      pointerClass: "SetOfParticles",
    });
  });

  it("does not call onRowDrop when the dropped output is already present", () => {
    const { onRowDrop } = renderComponent();

    const rows = screen.getAllByRole("row");
    const targetRow = rows[2];

    fireEvent.drop(targetRow, {
      dataTransfer: {
        getData: (type: string) =>
          type === "application/scipion-output"
            ? JSON.stringify({
                value: "filled-object",
                info: "Already used",
                pointerClass: "SetOfParticles",
              })
            : "",
      },
    });

    expect(onRowDrop).not.toHaveBeenCalled();
  });
});