import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OutputSelectorDialog from "@/components/protocol/outputSelectorDialog";

// RED 80: JSdom cannot calculate layout/scrollHeight reliably. Test the CSS
// scroll contract on the real rendered MUI TableContainer, not pixel metrics.
function getTableScroller(): HTMLElement {
  const table = screen.getByRole("table");
  const scroller = table.closest(".MuiTableContainer-root") as HTMLElement | null;
  expect(scroller, "Expected the TableContainer to own scrolling").not.toBeNull();
  return scroller!;
}

function expectVerticalScroll(scroller: HTMLElement) {
  const style = window.getComputedStyle(scroller);
  const verticalOverflow = style.overflowY || style.overflow;
  expect(["auto", "scroll"], `Vertical overflow must be scrollable, received: ${verticalOverflow}`).toContain(verticalOverflow);
  expect(style.maxHeight, "The table must have a bounded height for overflow to scroll").toBeTruthy();
  expect(style.maxHeight).not.toBe("none");
}

const directOutputs = Array.from({ length: 40 }, (_, index) => ({
  parentId: index + 100,
  key: `outputVolume${index + 1}`,
  protocol: `Volume producer ${index + 1}`,
  info: `Volume ${index + 1}`,
  paramClass: "PointerParam",
  pointerClass: "Volume",
  value: `${index + 100}.outputVolume`,
}));

const parent = {
  parentId: 58,
  protocolId: "58",
  key: "outputClasses",
  outputName: "outputClasses",
  protocol: "Xmipp classes producer",
  paramClass: "PointerParam",
  pointerClass: "SetOfClasses2D",
  pointerClassHierarchy: ["SetOfClasses2D", "SetOfClasses", "EMSet", "Set"],
  itemClassName: "Class2D",
  itemClassHierarchy: ["Class2D", "SetOfParticles", "SetOfImages", "EMSet"],
  info: "SetOfClasses2D (42 items, 2.05 Å/px)",
  value: "58.outputClasses",
};

const member = (id: number) => ({
  scipionItemId: id,
  name: "outputSet",
  enabled: true,
  selectable: true,
  itemClassName: "Class2D",
  pointerClass: "Class2D",
  selectionKind: "set-item",
  value: `58.outputClasses.${id}`,
  parentId: "58",
  protocolId: "58",
  key: "outputClasses",
});

describe("RED 80: vertically scrollable output selector without losing sticky headers", () => {
  it("keeps table headers sticky (existing contract)", () => {
    render(
      <OutputSelectorDialog open onClose={() => {}} allOutputs={directOutputs} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("table")).toHaveClass("MuiTable-stickyHeader");
    expect(screen.getByRole("columnheader", { name: "Protocol" })).toBeInTheDocument();
  });

  it("makes the bounded table vertically scrollable when there are many protocols", () => {
    render(
      <OutputSelectorDialog open onClose={() => {}} allOutputs={directOutputs} onSelect={vi.fn()} />,
    );
    expect(screen.getAllByRole("row").length).toBeGreaterThan(30);
    expectVerticalScroll(getTableScroller());
  });

  it("retains the same vertical scroll area when an expandable Set reveals many members", async () => {
    const loader = vi.fn().mockResolvedValue({
      items: Array.from({ length: 42 }, (_, index) => member(index + 1)),
      nextCursor: null,
    });
    render(
      <OutputSelectorDialog
        open
        onClose={() => {}}
        expectedClass="SetOfParticles"
        allOutputs={[parent]}
        onSelect={vi.fn()}
        {...({ loadSetItems: loader } as any)}
      />,
    );
    const scroller = getTableScroller();
    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Browse items in outputClasses" }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Class2D #42")).toBeInTheDocument();
    expect(getTableScroller()).toBe(scroller);
    expectVerticalScroll(scroller);
  });
});
