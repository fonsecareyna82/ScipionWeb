import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ProjectActions from "../../projects/ProjectActions";

vi.mock("@/icons", () => ({
  OpenFolderIcon: (props: any) => <svg data-testid="open-folder-icon" {...props} />,
  RenameIcon: (props: any) => <svg data-testid="rename-icon" {...props} />,
  TrashBinIcon: (props: any) => <svg data-testid="trash-icon" {...props} />,
  HorizontaLDots: (props: any) => <svg data-testid="dots-icon" {...props} />,
}));

describe("ProjectActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the menu on trigger click and shows all actions", async () => {
    render(<ProjectActions />);

    const trigger = screen.getByRole("button", { expanded: false });
    fireEvent.click(trigger);

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
  });

  it("calls onOpen and closes the menu when Open is clicked", async () => {
    const onOpen = vi.fn();

    render(<ProjectActions onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    const openItem = await screen.findByRole("menuitem", { name: "Open" });
    fireEvent.click(openItem);

    expect(onOpen).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("calls onShare and onRemove when those actions are clicked", async () => {
    const onShare = vi.fn();
    const onRemove = vi.fn();

    render(<ProjectActions onShare={onShare} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    fireEvent.click(await screen.findByRole("menuitem", { name: "Share" }));
    expect(onShare).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("marks actions as disabled when handlers are missing", async () => {
    render(<ProjectActions onOpen={() => {}} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(await screen.findByRole("menuitem", { name: "Open" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Share" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Remove" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("opens from keyboard and closes with Escape", async () => {
    render(<ProjectActions onOpen={() => {}} />);

    const trigger = screen.getByRole("button", { expanded: false });

    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("closes when clicking outside", async () => {
    render(
      <div>
        <ProjectActions onOpen={() => {}} />
        <button type="button">Outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});