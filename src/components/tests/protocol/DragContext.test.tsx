import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DragProvider, useDrag } from "@/components/protocol/DragContext";

function TestConsumer() {
  const { currentDraggedOutput, setCurrentDraggedOutput } = useDrag();

  return (
    <div>
      <div data-testid="drag-value">
        {currentDraggedOutput ? JSON.stringify(currentDraggedOutput) : "null"}
      </div>

      <button
        type="button"
        onClick={() =>
          setCurrentDraggedOutput({
            pointerClass: "SetOfParticles",
            value: "particles.sqlite",
          })
        }
      >
        Set dragged output
      </button>

      <button type="button" onClick={() => setCurrentDraggedOutput(null)}>
        Clear dragged output
      </button>
    </div>
  );
}

describe("DragContext", () => {
  it("provides null as the default dragged output", () => {
    render(
      <DragProvider>
        <TestConsumer />
      </DragProvider>,
    );

    expect(screen.getByTestId("drag-value")).toHaveTextContent("null");
  });

  it("updates currentDraggedOutput through the provider setter", () => {
    render(
      <DragProvider>
        <TestConsumer />
      </DragProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set dragged output" }));

    expect(screen.getByTestId("drag-value")).toHaveTextContent(
      JSON.stringify({
        pointerClass: "SetOfParticles",
        value: "particles.sqlite",
      }),
    );
  });

  it("clears currentDraggedOutput when setting it back to null", () => {
    render(
      <DragProvider>
        <TestConsumer />
      </DragProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set dragged output" }));
    expect(screen.getByTestId("drag-value")).not.toHaveTextContent("null");

    fireEvent.click(screen.getByRole("button", { name: "Clear dragged output" }));

    expect(screen.getByTestId("drag-value")).toHaveTextContent("null");
  });
});