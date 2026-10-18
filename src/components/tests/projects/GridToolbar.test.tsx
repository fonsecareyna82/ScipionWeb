import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GridToolbar from "@/components/projects/GridToolbar";

vi.mock("reactflow", () => ({ Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

describe("grid toolbar", () => {
  it("toggles the status filters, lineage and following running protocols", () => {
    const props = {
      counts: { running: 2, failed: 1, finished: 7, saved: 0 },
      statusFilter: new Set<any>(["failed"]),
      onToggleStatus: vi.fn(), onClearStatus: vi.fn(),
      lineage: false, onToggleLineage: vi.fn(),
      followRunning: true, onToggleFollowRunning: vi.fn(),
    };
    render(<GridToolbar {...props} />);
    const failed = screen.getByRole("button", { name: /Failed/ });
    expect(failed).toHaveAttribute("aria-pressed", "true");
    expect(failed).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: /Running/ }));
    expect(props.onToggleStatus).toHaveBeenCalledWith("running");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(props.onClearStatus).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lineage" }));
    expect(props.onToggleLineage).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Follow running" })).toHaveAttribute("aria-pressed", "true");
  });
});
