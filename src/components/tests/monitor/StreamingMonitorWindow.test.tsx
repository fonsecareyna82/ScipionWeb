import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StreamingMonitorWindow from "@/components/monitor/StreamingMonitorWindow";
import { createProjectServiceMock, renderWithProviders } from "@/components/tests/test-utils";

const popup = { closed: false, close: vi.fn(), focus: vi.fn() };

vi.mock("react-plotly.js", () => ({ default: () => <div data-testid="mock-plotly" /> }));

vi.mock("@/components/ui/external-window/ExternalWindowPortal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/external-window/ExternalWindowPortal")>();
  return {
    ...actual,
    openExternalWindow: vi.fn(() => popup),
    default: ({ onReturn, onClose, onWindowClosed }: { onReturn: () => void; onClose: () => void; onWindowClosed: () => void }) => (
      <div data-testid="external-window">
        <button type="button" onClick={onReturn}>Return</button>
        <button type="button" onClick={onClose}>Close external</button>
        <button type="button" onClick={onWindowClosed}>User closed it</button>
      </div>
    ),
  };
});

function monitorAnswer() {
  return {
    now: "", streaming: false, stages: [], ctfOutputs: [], thresholds: {},
    series: { setId: null, kind: null, reset: false, lastRowId: null, more: false, points: [] },
    classes: null,
    picking: { setId: null, reset: false, lastRowId: null, complete: true, counts: {} },
  };
}

function renderWindow(onClose = vi.fn()) {
  renderWithProviders(<StreamingMonitorWindow open projectId={7} projectLabel="Project X" onClose={onClose} />, {
    service: createProjectServiceMock({ fetchStreamingMonitor: vi.fn().mockResolvedValue(monitorAnswer()) }),
  });
  return onClose;
}

describe("StreamingMonitorWindow", () => {
  it("shows the monitor in a floating window over the project, without a way back to it", async () => {
    renderWindow();

    expect(await screen.findByTestId("streaming-monitor")).toBeInTheDocument();
    expect(screen.getByText("Project: Project X")).toBeInTheDocument();
    expect(screen.queryByText("Back to the project")).not.toBeInTheDocument();
  });

  it("moves to a window of its own and back, keeping the monitor open", async () => {
    const onClose = renderWindow();
    await screen.findByTestId("streaming-monitor");

    fireEvent.click(screen.getByRole("button", { name: "Open the monitor in its own window" }));
    expect(screen.getByTestId("external-window")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    expect(screen.queryByTestId("external-window")).not.toBeInTheDocument();
    expect(popup.close).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when its own window is closed by the user", async () => {
    const onClose = renderWindow();
    await screen.findByTestId("streaming-monitor");

    fireEvent.click(screen.getByRole("button", { name: "Open the monitor in its own window" }));
    fireEvent.click(screen.getByRole("button", { name: "User closed it" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
