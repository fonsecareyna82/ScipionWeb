import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import OutputSelectorDialog from "@/components/protocol/outputSelectorDialog";

// These parent/member fixtures mirror the real native-reference API shape.
// Only the optional itemsCount/samplingRate attributes are proposed additions.
const parent = {
  outputName: "outputClasses",
  key: "outputClasses",
  parentId: 58,
  protocolId: "58",
  protocol: "Xmipp classes producer",
  paramClass: "PointerParam",
  pointerClass: "SetOfClasses2D",
  pointerClassHierarchy: ["SetOfClasses2D", "SetOfClasses", "EMSet", "Set"],
  itemClassName: "Class2D",
  itemClassHierarchy: ["Class2D", "SetOfParticles", "SetOfImages", "EMSet"],
  info: "SetOfClasses2D (42 items, 2.05 Å/px)",
  value: "58.outputClasses",
};

const member = (id: number, props: Record<string, unknown> = {}) => ({
  scipionItemId: id,
  name: "outputSet", // The current API repeats this name for all class members.
  enabled: true,
  selectable: true,
  itemClassName: "Class2D",
  pointerClass: "Class2D",
  selectionKind: "set-item",
  value: `58.outputClasses.${id}`,
  parentId: "58",
  protocolId: "58",
  key: "outputClasses",
  ...props,
});

function renderSelector(items = [member(1), member(2)]) {
  const onSelect = vi.fn();
  const loader = vi.fn().mockResolvedValue({ items, nextCursor: null });
  render(
    <OutputSelectorDialog
      open={true}
      onClose={() => {}}
      expectedClass="SetOfParticles"
      allOutputs={[parent]}
      onSelect={onSelect}
      {...({ loadSetItems: loader } as any)}
    />,
  );
  return { loader, onSelect };
}

function getParentRow() {
  const label = screen.getByText("Xmipp classes producer");
  const row = label.closest("tr");
  expect(row).not.toBeNull();
  return row!;
}

function findDisclosure(row: HTMLElement): HTMLButtonElement {
  const buttons = within(row).queryAllByRole("button") as HTMLButtonElement[];
  const disclosure = buttons.find((button) => /expand|collapse|show.*(items|members)|hide.*(items|members)/i.test(
    `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""}`,
  ));
  expect(disclosure, "The Set disclosure must be an accessible, labeled button").toBeDefined();
  return disclosure!;
}

describe("RED 76: Set rows with left-hand disclosure and truthful object metadata", () => {
  it("keeps the parent visible as expandable when a member inherits SetOfParticles (baseline)", () => {
    renderSelector();
    expect(screen.getByText("Xmipp classes producer")).toBeInTheDocument();
  });

  it("preserves the persisted parent description instead of inventing item details (baseline)", () => {
    renderSelector();
    expect(screen.getByText(/42 items, 2\.05 Å\/px/)).toBeInTheDocument();
  });

  it("renders the disclosure control to the LEFT of the Set row label", () => {
    renderSelector();
    const row = getParentRow();
    const disclosure = findDisclosure(row);
    const label = within(row).getByText("Xmipp classes producer");
    // DOM order is appropriate for the disclosure's visual flow and keyboard navigation.
    expect(disclosure.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not eagerly load members until the user explicitly expands the Set", async () => {
    const { loader } = renderSelector();
    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(findDisclosure(getParentRow()));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
  });

  it("distinguishes different members using their persistent IDs, not repeated name=outputSet", async () => {
    renderSelector();
    fireEvent.click(findDisclosure(getParentRow()));
    expect(await screen.findByText(/Class2D\s*[#·-]\s*1/i)).toBeInTheDocument();
    expect(screen.getByText(/Class2D\s*[#·-]\s*2/i)).toBeInTheDocument();
  });

  it("shows optional per-member count and sampling rate when actually supplied", async () => {
    renderSelector([member(1, { itemsCount: 173, samplingRate: 2.05 })]);
    fireEvent.click(findDisclosure(getParentRow()));
    await screen.findByText(/Class2D\s*[#·-]\s*1/i);
    expect(screen.getByText(/173\s*(items|particles)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2\.05\s*Å\/px/i).length).toBeGreaterThanOrEqual(2);
  });
});
