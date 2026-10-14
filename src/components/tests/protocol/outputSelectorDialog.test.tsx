import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import OutputSelectorDialog from "../../protocol/outputSelectorDialog";
import { makeOutputSelectorOutput, resetFactories } from "../factories";

const outputs = [
  makeOutputSelectorOutput({
    parentId: 10,
    protocol: "Import particles",
    pointerClass: "SetOfParticles",
    info: "Particles from run 10",
    key: "particles-10",
  }),
  makeOutputSelectorOutput({
    parentId: 20,
    protocol: "Import volumes",
    pointerClass: "SetOfVolumes",
    info: "Volumes from run 20",
    key: "volumes-20",
  }),
  makeOutputSelectorOutput({
    parentId: 30,
    protocol: "Refine particles",
    pointerClass: "SetOfParticles",
    info: "Particles from run 30",
    key: "particles-30",
  }),
];

describe("OutputSelectorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFactories();
  });

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

  it("includes subclass outputs when expected class is a base class", () => {
    const inheritedOutputs = [
      makeOutputSelectorOutput({
        parentId: 10,
        protocol: "Import micrographs",
        pointerClass: "SetOfMicrographs",
        pointerClassHierarchy: [
          "SetOfMicrographs",
          "SetOfMicrographsBase",
          "SetOfImages",
          "EMSet",
          "Set",
          "EMObject",
          "Object",
        ],
        info: "Micrographs",
        key: "micrographs-10",
      }),
      makeOutputSelectorOutput({
        parentId: 20,
        protocol: "CTF estimation",
        pointerClass: "SetOfCTF",
        pointerClassHierarchy: [
          "SetOfCTF",
          "EMSet",
          "Set",
          "EMObject",
          "Object",
        ],
        info: "CTFs",
        key: "ctf-20",
      }),
    ];

    render(
      <OutputSelectorDialog
        open={true}
        onClose={() => {}}
        expectedClass="SetOfImages"
        allOutputs={inheritedOutputs}
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByText("Import micrographs")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("CTF estimation")
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("1 result")
    ).toBeInTheDocument();
  });
});


// RED 49: a compatible Scipion set is a BROWSABLE container, never a
// selectable substitute for one of its elements. This component contract
// deliberately injects a generic paged loader: no Volume-specific endpoint,
// item-id inference or unverified pointer syntax is required by the UI.
describe("OutputSelectorDialog nested items (RED 49)", () => {
  const direct = makeOutputSelectorOutput({
    parentId: 10,
    protocol: "Single volume producer",
    key: "outputVolume",
    value: "10.outputVolume",
    pointerClass: "Volume",
    pointerClassHierarchy: ["Volume", "EMObject", "Object"],
  });

  const compatibleSet = {
    ...makeOutputSelectorOutput({
      parentId: 20,
      protocol: "Volume set producer",
      key: "outputVolumes",
      value: "20.outputVolumes",
      pointerClass: "SetOfVolumes",
      pointerClassHierarchy: ["SetOfVolumes", "EMSet", "Set", "Object"],
    }),
    itemClassName: "Volume",
    itemClassHierarchy: ["Volume", "EMObject", "Object"],
  };

  const incompatibleSet = {
    ...makeOutputSelectorOutput({
      parentId: 30,
      protocol: "Particle set producer",
      key: "outputParticles",
      value: "30.outputParticles",
      pointerClass: "SetOfParticles",
      pointerClassHierarchy: ["SetOfParticles", "SetOfImages", "EMSet", "Set"],
    }),
    itemClassName: "Particle",
    itemClassHierarchy: ["Particle", "Image", "Object"],
  };

  // The value belongs to the API-provided item record. The dialog must NEVER
  // generate it by joining a set name to an index or scipionItemId.
  const item34 = {
    selectionKind: "set-item",
    name: "Volume 34",
    scipionItemId: 34,
    enabled: true,
    selectable: true,
    value: "opaque-persisted-item-reference-34",
    pointerClass: "Volume",
    pointerClassHierarchy: ["Volume", "EMObject", "Object"],
    parentId: 20,
    key: "outputVolumes",
  };
  const item35 = {
    ...item34,
    name: "Volume 35",
    scipionItemId: 35,
    value: "opaque-persisted-item-reference-35",
  };

  function show(
    loadSetItems: any,
    onSelect = vi.fn(),
    onClose = vi.fn(),
  ) {
    render(
      <OutputSelectorDialog
        open={true}
        expectedClass="Volume"
        allOutputs={[direct, compatibleSet, incompatibleSet]}
        onSelect={onSelect}
        onClose={onClose}
        {...({ loadSetItems } as any)}
      />,
    );
    return { onSelect, onClose };
  }

  it("keeps a directly compatible Volume selectable (baseline)", () => {
    const loader = vi.fn();
    const { onSelect, onClose } = show(loader);

    fireEvent.click(screen.getByText("Single volume producer"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(direct);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(loader).not.toHaveBeenCalled();
  });

  it("shows matching sets as containers but rejects incompatible sets", () => {
    show(vi.fn());

    expect(screen.getByText("Single volume producer")).toBeInTheDocument();
    expect(screen.getByText("Volume set producer")).toBeInTheDocument();
    expect(screen.queryByText("Particle set producer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "Browse items in outputVolumes",
    })).toBeInTheDocument();
    expect(screen.getByText("2 results")).toBeInTheDocument();
  });

  it("never confirms the set by click, double-click or the row action", () => {
    const { onSelect, onClose } = show(
      vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    );

    const setRow = screen.getByText("Volume set producer").closest("tr");
    expect(setRow).not.toBeNull();
    fireEvent.click(setRow!);
    fireEvent.doubleClick(setRow!);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(setRow!).queryByRole("button", {
      name: "Confirm output",
    })).not.toBeInTheDocument();
  });

  it("loads set items lazily, only when expanded, using cursor pagination", async () => {
    const loadSetItems = vi.fn().mockResolvedValue({
      items: [item34],
      nextCursor: null,
    });
    show(loadSetItems);

    expect(loadSetItems).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {
      name: "Browse items in outputVolumes",
    }));

    await waitFor(() => expect(loadSetItems).toHaveBeenCalledTimes(1));
    expect(loadSetItems).toHaveBeenCalledWith(
      compatibleSet,
      { cursor: null, limit: 50 },
    );
    expect(await screen.findByText("Volume 34")).toBeInTheDocument();
  });

  it("RED 72: never selects a disabled member even if a value exists", async () => {
    const disabled = { ...item34, name: "Disabled volume", enabled: false, selectable: true };
    const { onSelect, onClose } = show(
      vi.fn().mockResolvedValue({ items: [disabled], nextCursor: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse items in outputVolumes" }));
    const button = await screen.findByRole("button", { name: "Select item Disabled volume" });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("RED 72: never selects an explicitly unselectable member with a value", async () => {
    const rejected = { ...item34, name: "Rejected volume", enabled: true, selectable: false };
    const { onSelect, onClose } = show(
      vi.fn().mockResolvedValue({ items: [rejected], nextCursor: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse items in outputVolumes" }));
    const button = await screen.findByRole("button", { name: "Select item Rejected volume" });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("RED 72: requires explicit enabled and selectable flags to trust a member", async () => {
    const missingFlags: any = { ...item34, name: "Unverified volume" };
    delete missingFlags.enabled;
    delete missingFlags.selectable;
    const { onSelect, onClose } = show(
      vi.fn().mockResolvedValue({ items: [missingFlags], nextCursor: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse items in outputVolumes" }));
    const button = await screen.findByRole("button", { name: "Select item Unverified volume" });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("selects the actual member identity, never its SetOfVolumes parent", async () => {
    const { onSelect, onClose } = show(
      vi.fn().mockResolvedValue({ items: [item34], nextCursor: null }),
    );
    fireEvent.click(screen.getByRole("button", {
      name: "Browse items in outputVolumes",
    }));

    fireEvent.click(await screen.findByRole("button", {
      name: "Select item Volume 34",
    }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(item34);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalledWith(compatibleSet);
  });

  it("loads a second page without losing prior members or item identities", async () => {
    const loadSetItems = vi.fn().mockImplementation(
      async (_set: unknown, options: { cursor: string | null; limit: number }) =>
        options.cursor === null
          ? { items: [item34], nextCursor: "after-volume-34" }
          : { items: [item35], nextCursor: null },
    );
    show(loadSetItems);

    fireEvent.click(screen.getByRole("button", {
      name: "Browse items in outputVolumes",
    }));
    expect(await screen.findByText("Volume 34")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Load more items from outputVolumes",
    }));

    expect(await screen.findByText("Volume 35")).toBeInTheDocument();
    expect(screen.getByText("Volume 34")).toBeInTheDocument();
    expect(loadSetItems).toHaveBeenNthCalledWith(
      2,
      compatibleSet,
      { cursor: "after-volume-34", limit: 50 },
    );
  });
});
