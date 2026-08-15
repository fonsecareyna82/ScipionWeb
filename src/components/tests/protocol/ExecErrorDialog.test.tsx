import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExecErrorDialog from "@/components/protocol/ExecErrorDialog";

function renderComponent(overrides: Partial<React.ComponentProps<typeof ExecErrorDialog>> = {}) {
  const onClose = vi.fn();

  render(
    <ExecErrorDialog
      open={true}
      onClose={onClose}
      title="Execution Error"
      message="Something went wrong while executing the protocol."
      {...overrides}
    />,
  );

  return { onClose };
}

describe("ExecErrorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render dialog content when closed", () => {
    renderComponent({
      open: false,
    });

    expect(screen.queryByText("Execution Error")).not.toBeInTheDocument();
    expect(screen.queryByText("Something went wrong while executing the protocol.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("renders title, message and close button when open", () => {
    renderComponent();

    expect(screen.getByText("Execution Error")).toBeInTheDocument();
    expect(
      screen.getByText("Something went wrong while executing the protocol."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("calls onClose when clicking the close button", () => {
    const { onClose } = renderComponent();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders multiline messages correctly", () => {
    renderComponent({
      message: "First line\nSecond line\nThird line",
    });

    expect(screen.getByText(/First line/)).toBeInTheDocument();
    expect(screen.getByText(/Second line/)).toBeInTheDocument();
    expect(screen.getByText(/Third line/)).toBeInTheDocument();
  });

  it("renders custom titles", () => {
    renderComponent({
      title: "Protocol Launch Failed",
    });

    expect(screen.getByText("Protocol Launch Failed")).toBeInTheDocument();
  });
});