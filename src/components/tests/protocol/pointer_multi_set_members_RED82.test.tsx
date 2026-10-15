import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OutputSelectorDialog from "../../protocol/outputSelectorDialog";
import MultiParamRow from "../../protocol/MultiParamRow";

// MultiParamRow only needs the drag context to render its own input table.
vi.mock("../../protocol/DragContext", () => ({
  useDrag: () => ({ currentDraggedOutput: null }),
}));

// FIX84: MultiParamRow imports SVG icons; mock them in this component test.
// The dialog uses real Lucide icons, so its behavior is still exercised.
vi.mock("@/icons", () => ({
  TrashBinIcon: (props: any) => <svg data-testid="trash-icon" {...props} />,
  FindIcon: (props: any) => <svg data-testid="find-icon" {...props} />,
}));

// RED 82: Class3D is a SetOfParticles via its persisted class hierarchy.
// The parent Set is a browsing container, NOT a valid replacement for one member.
const parent = {
  paramClass: "PointerParam",
  protocol: "3D classes producer",
  protocolId: "58",
  parentId: 58,
  outputName: "outputClasses",
  key: "outputClasses",
  pointerClass: "SetOfClasses3D",
  pointerClassHierarchy: ["SetOfClasses3D", "SetOfClasses", "EMSet", "Set", "Object"],
  itemClassName: "Class3D",
  itemClassHierarchy: ["Class3D", "SetOfParticles", "SetOfImages", "EMSet", "Set", "Object"],
  value: "58.outputClasses",
  info: "SetOfClasses3D (2 items)",
};

const standalone = {
  paramClass: "PointerParam",
  protocol: "Direct particles producer",
  parentId: 12,
  protocolId: "12",
  key: "outputParticles",
  value: "12.outputParticles",
  pointerClass: "SetOfParticles",
  pointerClassHierarchy: ["SetOfParticles", "SetOfImages", "EMSet", "Set", "Object"],
  info: "SetOfParticles (100 items)",
};

const first = {
  selectionKind: "set-item",
  protocolId: "58",
  parentId: "58",
  key: "outputClasses",
  name: "Class3D 1",
  itemClassName: "Class3D",
  pointerClass: "Class3D",
  scipionItemId: 1,
  value: "opaque-native-class3d-reference-A",
  enabled: true,
  selectable: true,
};
const second = {
  ...first,
  name: "Class3D 2",
  scipionItemId: 2,
  value: "opaque-native-class3d-reference-B",
};

function show(loadSetItems: any, outputs: any[] = [parent, standalone]) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <OutputSelectorDialog
      open
      expectedClass="SetOfParticles"
      allOutputs={outputs}
      loadSetItems={loadSetItems}
      multiSelect
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  return { onSelect, onClose };
}

async function expand() {
  fireEvent.click(screen.getByRole("button", { name: "Browse items in outputClasses" }));
  expect(await screen.findByText("Class3D 1")).toBeInTheDocument();
}

describe("RED 82: MultiPointerParam can browse native Set members", () => {
  it("baseline: existing multi-selection of direct outputs continues to work", () => {
    const loader = vi.fn();
    const { onSelect, onClose } = show(loader, [standalone]);
    fireEvent.click(screen.getByText("Direct particles producer").closest("tr")!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm (1)" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith([standalone]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(loader).not.toHaveBeenCalled();
  });

  it("shows compatible Sets in multi mode, only loading on explicit expansion", async () => {
    const loader = vi.fn().mockResolvedValue({ items: [first], nextCursor: null });
    const { onSelect } = show(loader);
    expect(screen.getByText("3D classes producer")).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Browse items in outputClasses" }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    expect(loader).toHaveBeenCalledWith(parent, { cursor: null, limit: 50 });
    expect(await screen.findByText("Class3D 1")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects two individual Class3D members and confirms their unchanged native references together", async () => {
    const loader = vi.fn().mockResolvedValue({ items: [first, second], nextCursor: null });
    const { onSelect, onClose } = show(loader, [parent]);
    await expand();
    fireEvent.click(screen.getByRole("button", { name: "Select item Class3D 1" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Select item Class3D 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm (2)" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith([first, second]);
    expect(onSelect).not.toHaveBeenCalledWith([parent]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never permits disabled, unapproved, or reference-less native members", async () => {
    const invalid = [
      { ...first, name: "Disabled Class3D", scipionItemId: 2, enabled: false },
      { ...first, name: "Rejected Class3D", scipionItemId: 3, selectable: false },
      { ...first, name: "Missing reference Class3D", scipionItemId: 4, value: "" },
      { ...first, name: "Missing identity Class3D", scipionItemId: null },
    ];
    const loader = vi.fn().mockResolvedValue({ items: [first, ...invalid], nextCursor: null });
    const { onSelect } = show(loader, [parent]);
    await expand();
    for (const name of invalid.map((item) => item.name)) {
      expect(screen.getByRole("button", { name: `Select item ${name}` })).toBeDisabled();
    }
    // No item was selected: multi-mode's confirmation must stay disabled.
    const confirm = screen.getByRole("button", { name: "Confirm (0)" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps selected native items when paging and does not select their parent", async () => {
    const loader = vi.fn().mockImplementation(async (_parent: unknown, options: { cursor: string | null; limit: number }) =>
      options.cursor === null
        ? { items: [first], nextCursor: "after-first" }
        : { items: [second], nextCursor: null },
    );
    const { onSelect } = show(loader, [parent]);
    await expand();
    fireEvent.click(screen.getByRole("button", { name: "Select item Class3D 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more items from outputClasses" }));
    expect(await screen.findByText("Class3D 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select item Class3D 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm (2)" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith([first, second]);
    expect(loader).toHaveBeenNthCalledWith(2, parent, { cursor: "after-first", limit: 50 });
  });

  it("wires MultiParamRow's own selector to the same paged Set loader", async () => {
    const loader = vi.fn().mockResolvedValue({ items: [first], nextCursor: null });
    const onPickForRow = vi.fn();
    render(
      <MultiParamRow
        label="Input particles"
        items={[]}
        paramKey="0_inputParticles"
        def={{ paramClass: "MultiPointerParam", pointerClass: "SetOfParticles" }}
        onRowClear={vi.fn()}
        getAvailableOutputs={() => [parent]}
        onPickForRow={onPickForRow}
        {...({ loadSetItems: loader } as any)}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("3D classes producer")).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Browse items in outputClasses" }));
    expect(await screen.findByText("Class3D 1")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(onPickForRow).not.toHaveBeenCalled();
  });
});
