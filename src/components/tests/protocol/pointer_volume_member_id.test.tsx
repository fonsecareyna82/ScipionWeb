import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import OutputSelectorDialog from "../../protocol/outputSelectorDialog";

// RED 89: the Set's parent row already identifies its protocol. A Volume
// member must not repeat that protocol ID next to its Select button.
// Class members are intentionally unchanged by this Volume-specific UX fix.
const volumeSet = {
  parentId: 20,
  protocolId: "20",
  key: "outputVolumes",
  protocol: "Volume set producer",
  pointerClass: "SetOfVolumes",
  pointerClassHierarchy: ["SetOfVolumes", "EMSet", "Set", "Object"],
  itemClassName: "Volume",
  itemClassHierarchy: ["Volume", "EMObject", "Object"],
  value: "20.outputVolumes",
  info: "2 volumes",
};
const volume = {
  selectionKind: "set-item",
  parentId: "20",
  protocolId: "20",
  key: "outputVolumes",
  itemClassName: "Volume",
  pointerClass: "Volume",
  name: "Volume 34",
  scipionItemId: 34,
  enabled: true,
  selectable: true,
  value: "native-volume-reference-34",
};
const classesSet = {
  parentId: 58,
  protocolId: "58",
  key: "outputClasses",
  protocol: "3D classification",
  pointerClass: "SetOfClasses3D",
  pointerClassHierarchy: ["SetOfClasses3D", "SetOfClasses", "EMSet", "Set", "Object"],
  itemClassName: "Class3D",
  itemClassHierarchy: ["Class3D", "SetOfParticles", "SetOfImages", "EMSet", "Set", "Object"],
  value: "58.outputClasses",
  info: "3D classes",
};
const class3d = {
  selectionKind: "set-item",
  parentId: "58",
  protocolId: "58",
  key: "outputClasses",
  itemClassName: "Class3D",
  pointerClass: "Class3D",
  name: "Class3D 1",
  scipionItemId: 1,
  enabled: true,
  selectable: true,
  value: "native-class-reference-1",
  itemsCount: 1234,
  samplingRate: 2.056,
};

function show(parent: any, item: any, expectedClass: string, multiSelect: boolean) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const loadSetItems = vi.fn().mockResolvedValue({ items: [item], nextCursor: null });
  render(
    <OutputSelectorDialog
      open
      onClose={onClose}
      onSelect={onSelect}
      expectedClass={expectedClass}
      allOutputs={[parent]}
      multiSelect={multiSelect}
      loadSetItems={loadSetItems}
    />,
  );
  return { onSelect, onClose, loadSetItems };
}

async function browse(outputName: string, name: string): Promise<HTMLTableRowElement> {
  fireEvent.click(screen.getByRole("button", { name: `Browse items in ${outputName}` }));
  const label = await screen.findByText(name);
  const row = label.closest("tr");
  expect(row).not.toBeNull();
  return row as HTMLTableRowElement;
}

function columns(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.querySelectorAll(":scope > td"));
}

describe("RED 89: Volume members should not duplicate the protocol ID", () => {
  it("baseline: preserves current Class3D presentation and member metadata", async () => {
    show(classesSet, class3d, "SetOfParticles", true);
    const row = await browse("outputClasses", "Class3D 1");
    const cells = columns(row);
    expect(cells).toHaveLength(4);
    expect(within(cells[1]).getByText("58")).toBeInTheDocument();
    expect(within(cells[2]).getByText("Class3D 1")).toBeInTheDocument();
    expect(within(cells[3]).getByText("1.234 particles")).toBeInTheDocument();
    expect(within(cells[3]).getByText("2,06 Å/px")).toBeInTheDocument();
  });

  it("single PointerParam: keeps protocol ID only on the Volume Set parent row", async () => {
    const { onSelect, onClose } = show(volumeSet, volume, "Volume", false);
    const parentRow = screen.getByText("Volume set producer").closest("tr")!;
    expect(within(parentRow).getByText("20")).toBeInTheDocument();
    const row = await browse("outputVolumes", "Volume 34");
    const cells = columns(row);
    expect(cells).toHaveLength(4);
    expect(within(cells[0]).queryByText("20")).not.toBeInTheDocument();
    expect(within(cells[1]).getByText("Volume 34")).toBeInTheDocument();
    fireEvent.click(within(cells[3]).getByRole("button", { name: "Select item Volume 34" }));
    expect(onSelect).toHaveBeenCalledWith(volume);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("MultiPointerParam: keeps Volume selection in Pick without repeating producer ID", async () => {
    const { onSelect, onClose } = show(volumeSet, volume, "Volume", true);
    const parentRow = screen.getByText("Volume set producer").closest("tr")!;
    expect(within(parentRow).getByText("20")).toBeInTheDocument();
    const row = await browse("outputVolumes", "Volume 34");
    const cells = columns(row);
    expect(cells).toHaveLength(4);
    expect(within(cells[1]).queryByText("20")).not.toBeInTheDocument();
    expect(within(cells[2]).getByText("Volume 34")).toBeInTheDocument();
    fireEvent.click(within(cells[0]).getByRole("button", { name: "Select item Volume 34" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm (1)" }));
    expect(onSelect).toHaveBeenCalledWith([volume]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
