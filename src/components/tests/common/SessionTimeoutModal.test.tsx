import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import SessionTimeoutModal from "../../common/SessionTimeoutModal";

vi.mock("../../ui/modal", () => ({
  Modal: ({
    isOpen,
    onClose,
    children,
    className,
  }: {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
  }) =>
    isOpen ? (
      <div data-testid="mock-modal" className={className}>
        <button type="button" onClick={onClose}>
          Mock close
        </button>
        {children}
      </div>
    ) : null,
}));

describe("SessionTimeoutModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not render when not visible", () => {
    render(
      <SessionTimeoutModal
        isVisible={false}
        onStayConnected={() => {}}
        countdownStart={65}
      />,
    );

    expect(screen.queryByTestId("mock-modal")).not.toBeInTheDocument();
    expect(screen.queryByText("Session about to expire")).not.toBeInTheDocument();
  });

  it("renders the initial formatted countdown when visible", () => {
    render(
      <SessionTimeoutModal
        isVisible={true}
        onStayConnected={() => {}}
        countdownStart={65}
      />,
    );

    expect(screen.getByText("Session about to expire")).toBeInTheDocument();
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("counts down every second", () => {
    render(
      <SessionTimeoutModal
        isVisible={true}
        onStayConnected={() => {}}
        countdownStart={65}
      />,
    );

    expect(screen.getByText("01:05")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("01:04")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("01:00")).toBeInTheDocument();
  });

  it("resets the countdown when reopened", () => {
    const { rerender } = render(
      <SessionTimeoutModal
        isVisible={true}
        onStayConnected={() => {}}
        countdownStart={10}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("00:07")).toBeInTheDocument();

    rerender(
      <SessionTimeoutModal
        isVisible={false}
        onStayConnected={() => {}}
        countdownStart={10}
      />,
    );

    rerender(
      <SessionTimeoutModal
        isVisible={true}
        onStayConnected={() => {}}
        countdownStart={10}
      />,
    );

    expect(screen.getByText("00:10")).toBeInTheDocument();
  });

  it("calls onStayConnected when the modal requests close", () => {
    const onStayConnected = vi.fn();

    render(
      <SessionTimeoutModal
        isVisible={true}
        onStayConnected={onStayConnected}
        countdownStart={30}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock close" }));

    expect(onStayConnected).toHaveBeenCalledTimes(1);
  });
});