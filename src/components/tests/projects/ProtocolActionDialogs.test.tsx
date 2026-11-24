import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProtocolActionDialog, ProtocolBox } from "@/components/projects/ProtocolActionDialogs";

const protocols = Array.from({ length: 8 }, (_, index) => ({ id: String(10 + index), label: `ctffind ${index}`, status: "finished" }));

describe("The graph's protocol dialogs", () => {
  it("cannot be closed while the action is under way", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ProtocolActionDialog title="Stop protocol?" icon={null} confirmLabel="Stop protocol" busy={false}
                            onConfirm={vi.fn()} onClose={onClose}>
        <div>body</div>
      </ProtocolActionDialog>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ProtocolActionDialog title="Stop protocol?" icon={null} confirmLabel="Stop protocol" busyLabel="Stopping…" busy
                            onConfirm={vi.fn()} onClose={onClose}>
        <div>body</div>
      </ProtocolActionDialog>,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stopping…" })).toBeDisabled();
  });

  it("shows the protocols an action reaches, folded, and all of them on asking", () => {
    render(<ProtocolBox collapsible title="8 protocols after it restart too" band="#d97706" protocols={protocols} />);
    const box = screen.getByRole("group", { name: "8 protocols after it restart too" });
    expect(within(box).queryByText("ctffind 0")).not.toBeInTheDocument();

    fireEvent.click(within(box).getByText("8 protocols after it restart too"));
    expect(within(box).getByText("ctffind 5")).toBeInTheDocument();
    expect(within(box).queryByText("ctffind 7")).not.toBeInTheDocument();
    fireEvent.click(within(box).getByRole("button", { name: "Show all 8" }));
    expect(within(box).getByText("ctffind 7")).toBeInTheDocument();
    expect(within(box).getAllByText("finished")).toHaveLength(8);
  });
});
