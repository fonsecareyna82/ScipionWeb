import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WizardLoadingDialog from "@/components/protocol/wizards/WizardLoadingDialog";

describe("WizardLoadingDialog", () => {
  it("does not render dialog content when closed", () => {
    render(<WizardLoadingDialog open={false} />);

    expect(screen.queryByText("Opening wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Preparing preview...")).not.toBeInTheDocument();
  });

  it("renders default title and message when open", () => {
    render(<WizardLoadingDialog open={true} />);

    expect(screen.getByText("Opening wizard")).toBeInTheDocument();
    expect(screen.getByText("Preparing preview...")).toBeInTheDocument();
    expect(
      screen.getByText("This may take a few seconds the first time."),
    ).toBeInTheDocument();
  });

  it("renders custom title and message when provided", () => {
    render(
      <WizardLoadingDialog
        open={true}
        title="Loading CTF preview"
        message="Fetching PSD and fitting rings..."
      />,
    );

    expect(screen.getByText("Loading CTF preview")).toBeInTheDocument();
    expect(screen.getByText("Fetching PSD and fitting rings...")).toBeInTheDocument();
    expect(
      screen.getByText("This may take a few seconds the first time."),
    ).toBeInTheDocument();
  });

  it("renders a progress indicator when open", () => {
    render(<WizardLoadingDialog open={true} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});