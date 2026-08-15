import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import TagsDialog from "../../tags/TagsDialog";
import { renderWithProviders } from "../test-utils";

describe("TagsDialog", () => {
  it("renders the default title and children when open", () => {
    renderWithProviders(
      <TagsDialog open={true} onClose={() => {}}>
        <div>Dialog content</div>
      </TagsDialog>,
    );

    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders a custom title when provided", () => {
    renderWithProviders(
      <TagsDialog open={true} onClose={() => {}} title="Manage tags">
        <div>Dialog content</div>
      </TagsDialog>,
    );

    expect(screen.getByText("Manage tags")).toBeInTheDocument();
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn();

    renderWithProviders(
      <TagsDialog open={true} onClose={onClose}>
        <div>Dialog content</div>
      </TagsDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render content when closed", () => {
    renderWithProviders(
      <TagsDialog open={false} onClose={() => {}}>
        <div>Dialog content</div>
      </TagsDialog>,
    );

    expect(screen.queryByText("Dialog content")).not.toBeInTheDocument();
  });
});
