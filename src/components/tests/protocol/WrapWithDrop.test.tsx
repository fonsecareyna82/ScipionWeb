import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WrapWithDrop from "@/components/protocol/WrapWithDrop";

const mockUseDrag = vi.fn();

vi.mock("@/components/protocol/DragContext", () => ({
  useDrag: () => mockUseDrag(),
}));

type DraggedOutput = {
  pointerClass?: string;
  value?: string;
  info?: string;
  parentId?: string | number | null;
};

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof WrapWithDrop>> = {},
  draggedOutput: DraggedOutput | null = null,
) {
  mockUseDrag.mockReturnValue({
    currentDraggedOutput: draggedOutput,
  });

  const setProtocolDetails = vi.fn();
  const setDragOverKey = vi.fn();

  render(
    <WrapWithDrop
      control={<div>Drop target control</div>}
      def={{ pointerClass: "SetOfParticles" }}
      paramKey="inputParticles"
      setProtocolDetails={setProtocolDetails}
      setDragOverKey={setDragOverKey}
      dragOverKey={null}
      {...overrides}
    />,
  );

  const wrapper = screen.getByText("Drop target control").parentElement as HTMLElement;

  return {
    wrapper,
    setProtocolDetails,
    setDragOverKey,
  };
}

describe("WrapWithDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the wrapped control", () => {
    renderComponent();

    expect(screen.getByText("Drop target control")).toBeInTheDocument();
  });

  it("sets dragOverKey on dragOver", () => {
    const { wrapper, setDragOverKey } = renderComponent();

    fireEvent.dragOver(wrapper);

    expect(setDragOverKey).toHaveBeenCalledWith("inputParticles");
  });

  it("clears dragOverKey on dragLeave", () => {
    const { wrapper, setDragOverKey } = renderComponent();

    fireEvent.dragLeave(wrapper);

    expect(setDragOverKey).toHaveBeenCalledWith(null);
  });

  it("updates protocol details on drop when dragged output matches expected class", () => {
    const draggedOutput = {
      pointerClass: "SetOfParticles",
      value: "particles.sqlite",
      info: "Particles output",
      parentId: 42,
    };

    const { wrapper, setProtocolDetails, setDragOverKey } = renderComponent(
      {},
      draggedOutput,
    );

    fireEvent.drop(wrapper);

    expect(setDragOverKey).toHaveBeenCalledWith(null);
    expect(setProtocolDetails).toHaveBeenCalledTimes(1);

    const updater = setProtocolDetails.mock.calls[0][0];
    const prev = {
      params: {
        inputParticles: {
          editableValue: "",
          value: "",
          info: "",
          parentId: null,
        },
      },
    };

    expect(updater(prev)).toEqual({
      params: {
        inputParticles: {
          editableValue: "particles.sqlite",
          value: "particles.sqlite",
          info: "Particles output",
          parentId: 42,
        },
      },
    });
  });

  it("does not update protocol details on drop when dragged output does not match expected class", () => {
    const draggedOutput = {
      pointerClass: "SetOfMicrographs",
      value: "micrographs.sqlite",
      info: "Micrographs output",
      parentId: 99,
    };

    const { wrapper, setProtocolDetails, setDragOverKey } = renderComponent(
      {},
      draggedOutput,
    );

    fireEvent.drop(wrapper);

    expect(setDragOverKey).toHaveBeenCalledWith(null);
    expect(setProtocolDetails).not.toHaveBeenCalled();
  });

  it("accepts any dragged output when there is no expected class", () => {
    const draggedOutput = {
      pointerClass: "Anything",
      value: "some-output",
      info: "Some output",
      parentId: 7,
    };

    const { wrapper, setProtocolDetails } = renderComponent(
      {
        def: {},
      },
      draggedOutput,
    );

    fireEvent.drop(wrapper);

    expect(setProtocolDetails).toHaveBeenCalledTimes(1);
  });
});