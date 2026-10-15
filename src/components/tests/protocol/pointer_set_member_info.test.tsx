import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import OutputSelectorDialog from "../../protocol/outputSelectorDialog";

// RED 87: the expanded Set member must occupy real table columns, with
// persisted metadata in Info rather than below the member name.
const class3dSet = {
  parentId: 58,
  protocolId: "58",
  key: "outputClasses",
  protocol: "3D classification",
  pointerClass: "SetOfClasses3D",
  pointerClassHierarchy: ["SetOfClasses3D", "SetOfClasses", "EMSet", "Set", "Object"],
  itemClassName: "Class3D",
  itemClassHierarchy: ["Class3D", "SetOfParticles", "SetOfImages", "EMSet", "Set", "Object"],
  value: "58.outputClasses",
  info: "Persisted classes",
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
  value: "opaque-native-class3d-1",
};

function show(member: any, multiSelect: boolean, parent: any = class3dSet) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const loadSetItems = vi.fn().mockResolvedValue({ items: [member], nextCursor: null });
  render(
    <OutputSelectorDialog
      open
      expectedClass="SetOfParticles"
      allOutputs={[parent]}
      multiSelect={multiSelect}
      loadSetItems={loadSetItems}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  return { onSelect, onClose, loadSetItems };
}

async function expandAndFindRow(name: string): Promise<HTMLTableRowElement> {
  fireEvent.click(screen.getByRole("button", { name: "Browse items in outputClasses" }));
  const label = await screen.findByText(name);
  const row = label.closest("tr");
  expect(row).not.toBeNull();
  return row as HTMLTableRowElement;
}

function cells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children).filter((node) => node.tagName === "TD") as HTMLTableCellElement[];
}

describe("RED 87: compatible output Set member information in the Info column", () => {
  it("baseline: keeps native member selection and does not request items until expanded", async () => {
    const { onSelect, onClose, loadSetItems } = show(class3d, true);
    expect(loadSetItems).not.toHaveBeenCalled();
    await expandAndFindRow("Class3D 1");
    expect(loadSetItems).toHaveBeenCalledWith(class3dSet, { cursor: null, limit: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Select item Class3D 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm (1)" }));
    expect(onSelect).toHaveBeenCalledWith([class3d]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("multi-select: puts the count and two-decimal Spanish-formatted sampling in Info", async () => {
    show({ ...class3d, itemsCount: 1234, samplingRate: 2.056 }, true);
    const row = await expandAndFindRow("Class3D 1");
    const columns = cells(row);
    expect(columns).toHaveLength(4);
    expect(within(columns[2]).getByText("Class3D 1")).toBeInTheDocument();
    expect(within(columns[3]).getByText("1.234 particles")).toBeInTheDocument();
    expect(within(columns[3]).getByText("2,06 Å/px")).toBeInTheDocument();
    expect(within(columns[3]).queryByText("Class3D 1")).not.toBeInTheDocument();
  });

  it("single-select: preserves the Action column and displays exact two decimals", async () => {
    const parent = {
      ...class3dSet,
      pointerClass: "SetOfClasses2D",
      pointerClassHierarchy: ["SetOfClasses2D", "SetOfClasses", "EMSet", "Set", "Object"],
      itemClassName: "Class2D",
      itemClassHierarchy: ["Class2D", "SetOfParticles", "SetOfImages", "EMSet", "Set", "Object"],
    };
    const member = {
      ...class3d,
      itemClassName: "Class2D",
      pointerClass: "Class2D",
      name: "Class2D 1",
      value: "opaque-native-class2d-1",
      itemsCount: 0,
      samplingRate: 1,
    };
    const { onSelect, onClose } = show(member, false, parent);
    const row = await expandAndFindRow("Class2D 1");
    const columns = cells(row);
    expect(columns).toHaveLength(4);
    expect(within(columns[1]).getByText("Class2D 1")).toBeInTheDocument();
    expect(within(columns[2]).getByText("0 particles")).toBeInTheDocument();
    expect(within(columns[2]).getByText("1,00 Å/px")).toBeInTheDocument();
    fireEvent.click(within(columns[3]).getByRole("button", { name: "Select item Class2D 1" }));
    expect(onSelect).toHaveBeenCalledWith(member);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits invalid or missing metadata and preserves disabled native members", async () => {
    const member = {
      ...class3d,
      name: "Class3D disabled",
      scipionItemId: 11,
      value: "opaque-native-class3d-11",
      selectable: false,
      samplingRate: -3,
    };
    const { onSelect } = show(member, true);
    const row = await expandAndFindRow("Class3D disabled");
    const columns = cells(row);
    expect(columns).toHaveLength(4);
    expect(within(columns[3]).queryByText(/Å\/px|particles|items/)).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Select item Class3D disabled" })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
