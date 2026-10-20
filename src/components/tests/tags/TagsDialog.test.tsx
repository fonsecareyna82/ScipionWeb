import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

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

  it("moves focus into the dialog and is named by its title", async () => {
    renderWithProviders(
      <TagsDialog open={true} onClose={() => {}} title="Manage tags">
        <div>Dialog content</div>
      </TagsDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Manage tags" });
    // Focus goes to the modal (its container or something inside it), not left on the page.
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active).not.toBe(document.body);
      expect(active.contains(dialog) || dialog.contains(active)).toBe(true);
    });
  });
});
