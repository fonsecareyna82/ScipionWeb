import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ValidationErrorsDialog from "@/components/protocol/ValidationErrorsDialog";

function renderComponent(overrides: Partial<React.ComponentProps<typeof ValidationErrorsDialog>> = {}) {
  const onClose = vi.fn();

  render(
    <ValidationErrorsDialog
      open={true}
      onClose={onClose}
      errors={["First error", "Second error"]}
      {...overrides}
    />,
  );

  return { onClose };
}

describe("ValidationErrorsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render dialog content when closed", () => {
    renderComponent({
      open: false,
    });

    expect(screen.queryByText("Validation Errors")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("renders the title, errors and close button when open", () => {
    renderComponent();

    expect(screen.getByText("Validation Errors")).toBeInTheDocument();
    expect(screen.getByText("First error")).toBeInTheDocument();
    expect(screen.getByText("Second error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("calls onClose when clicking the close button", () => {
    const { onClose } = renderComponent();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the fallback message when there are no errors", () => {
    renderComponent({
      errors: [],
    });

    expect(screen.getByText("No validation details provided.")).toBeInTheDocument();
  });

  it("renders markdown-like bold segments inside errors", () => {
    renderComponent({
      errors: ["Field **inputParticles** is required"],
    });

    expect(screen.getByText("Field", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("inputParticles")).toBeInTheDocument();

    const strongText = screen.getByText("inputParticles");
    expect(strongText.tagName.toLowerCase()).toBe("strong");
  });

  it("renders multiple formatted errors correctly", () => {
    renderComponent({
      errors: [
        "Missing **paramA** value",
        "Invalid **paramB** configuration",
      ],
    });

    expect(screen.getByText("paramA")).toBeInTheDocument();
    expect(screen.getByText("paramB")).toBeInTheDocument();
    expect(screen.getByText("Missing", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Invalid", { exact: false })).toBeInTheDocument();
  });
});