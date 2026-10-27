import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomizeMonitorView from "@/components/monitor/CustomizeMonitorView";

// A monitor can be moved to another document without remounting its contents.
describe("CustomizeMonitorView", () => {
  it("opens in the trigger's document and stays open for multiple choices", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const popupDocument = frame.contentDocument!;
    const container = popupDocument.createElement("div");
    popupDocument.body.appendChild(container);
    const onChange = vi.fn();
    const view = render(<CustomizeMonitorView mode="spa" visibility={{}} onChange={onChange} onRestore={vi.fn()} />,
      { container, baseElement: popupDocument.body });
    try {
      fireEvent.click(within(popupDocument.body).getByRole("button", { name: "Customize view" }));
      const picker = within(popupDocument.body).getByRole("dialog", { name: "Customize monitor view" });
      expect(picker.ownerDocument).toBe(popupDocument);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      fireEvent.click(within(picker).getByRole("checkbox", { name: "Drift" }));
      fireEvent.click(within(picker).getByRole("checkbox", { name: "Astigmatism" }));
      expect(onChange.mock.calls).toEqual([["drift", false], ["astigmatism", false]]);
      expect(picker).toBeInTheDocument();
      fireEvent.keyDown(picker, { key: "Escape" });
      expect(within(popupDocument.body).getByRole("button", { name: "Customize view" })).toHaveAttribute("aria-expanded", "false");
    } finally {
      view.unmount();
      frame.remove();
    }
  });
});
