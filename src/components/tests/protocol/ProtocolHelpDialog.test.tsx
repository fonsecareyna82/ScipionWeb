import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolHelpDialog from "@/components/protocol/ProtocolHelpDialog";

const mockRenderRichHelpText = vi.fn((text: string) => (
  <div data-testid="rich-help">{text}</div>
));

vi.mock("@/components/protocol/HelpText", () => ({
  default: (text: string) => mockRenderRichHelpText(text),
}));

vi.mock("@/icons", () => ({
  CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof ProtocolHelpDialog>> = {},
) {
  const onClose = vi.fn();

  render(
    <ProtocolHelpDialog
      open={true}
      onClose={onClose}
      text="This is the help text"
      {...overrides}
    />,
  );

  return { onClose };
}

describe("ProtocolHelpDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render dialog content when closed", () => {
    renderComponent({
      open: false,
    });

    expect(screen.queryByText("Help")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rich-help")).not.toBeInTheDocument();
  });

  it("renders the default title when no custom title is provided", () => {
    renderComponent();

    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByTestId("rich-help")).toBeInTheDocument();
    expect(screen.getByText("This is the help text")).toBeInTheDocument();
  });

  it("renders a custom title when provided", () => {
    renderComponent({
      title: "Protocol Details",
    });

    expect(screen.getByText("Protocol Details")).toBeInTheDocument();
  });

  it("delegates rich text rendering to HelpText", () => {
    renderComponent({
      text: "Custom **formatted** help",
    });

    expect(mockRenderRichHelpText).toHaveBeenCalledWith("Custom **formatted** help");
    expect(screen.getByTestId("rich-help")).toBeInTheDocument();
  });

  it("calls onClose when clicking the icon close button", () => {
    const { onClose } = renderComponent();

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    fireEvent.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the footer close button", () => {
    const { onClose } = renderComponent();

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    fireEvent.click(closeButtons[1]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the close icon button", () => {
    renderComponent();

    expect(screen.getByTestId("close-icon")).toBeInTheDocument();
  });
});