import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebPickingSessions from "@/components/picking/WebPickingSessions";

const fetchOpenPickingSessions = vi.fn();
const closePickingSession = vi.fn();
const service = { fetchOpenPickingSessions, closePickingSession };
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => service }));
vi.mock("@/components/analyze/analyze-output-dialog", () => ({
  default: (props: { protocolId: number; displayName?: string; onClose: () => void }) => (
    <div data-testid="picker">
      {`${props.protocolId}|${props.displayName}`}
      <button onClick={props.onClose}>Close picker</button>
    </div>
  ),
}));

const session = { protocolId: 116, sessionId: "900-a1", kind: "xmipp-picking", label: "manual picking" };

describe("pickers of launched picking protocols", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closePickingSession.mockResolvedValue(undefined);
  });

  it("does not ask while no protocol is running", () => {
    render(<WebPickingSessions projectId={7} active={false} />);
    expect(fetchOpenPickingSessions).not.toHaveBeenCalled();
  });

  it("opens the picker the running protocol waits for and ends its step on close", async () => {
    fetchOpenPickingSessions.mockResolvedValue([session]);
    render(<WebPickingSessions projectId={7} active />);
    expect(await screen.findByTestId("picker")).toHaveTextContent("116|Particle picking");
    fireEvent.click(screen.getByRole("button", { name: "Close picker" }));
    expect(closePickingSession).toHaveBeenCalledWith("7", 116);
    expect(screen.queryByTestId("picker")).not.toBeInTheDocument();
  });

  it("does not reopen a closed picker while its step ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchOpenPickingSessions.mockResolvedValue([session]);
      render(<WebPickingSessions projectId={7} active />);
      fireEvent.click(await screen.findByRole("button", { name: "Close picker" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      expect(screen.queryByTestId("picker")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens again when the protocol is relaunched after closing the picker", async () => {
    fetchOpenPickingSessions.mockResolvedValue([session]);
    const view = render(<WebPickingSessions projectId={7} active />);
    fireEvent.click(await screen.findByRole("button", { name: "Close picker" }));
    // The step ends: nothing runs, so the page stops asking.
    view.rerender(<WebPickingSessions projectId={7} active={false} />);
    // Launch again: a new session of the same protocol.
    fetchOpenPickingSessions.mockResolvedValue([{ ...session, sessionId: "901-b2" }]);
    view.rerender(<WebPickingSessions projectId={7} active />);
    await waitFor(() => expect(screen.getByTestId("picker")).toHaveTextContent("116|Particle picking"));
  });
});
