import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StreamingMonitorThresholdsDialog from "@/components/monitor/StreamingMonitorThresholdsDialog";
import type { StreamingMonitorThresholds } from "@/services/ProjectService";

const thresholds = { maxResolution: 5 } as StreamingMonitorThresholds;

describe("Summary window in the thresholds dialog", () => {
  it.each(["0", "-1", "1.5", "", "5001"])("rejects invalid window %s before saving any project settings", async (value) => {
    const onSave = vi.fn();
    render(<StreamingMonitorThresholdsDialog thresholds={thresholds} names={["maxResolution"]}
      summaryWindowSize={100} summaryUnit="micrographs" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Quality summary window"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("positive whole number");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the window separate from the server threshold fields", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StreamingMonitorThresholdsDialog thresholds={thresholds} names={["maxResolution"]}
      summaryWindowSize={20} summaryUnit="tilt series" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Quality summary window"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ maxResolution: 5 }, 10));
  });
});
