import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { ProtocolTag } from "../../tags/tagTypes";

import TagManager from "../../tags/TagManager";
import { createProjectServiceMock, renderWithProviders } from "../test-utils";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../icons", () => ({
  TrashBinIcon: (props: any) => <svg data-testid="trash-icon" {...props} />,
  HelpIcon: (props: any) => <svg data-testid="help-icon" {...props} />,
  CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
}));

const storeSetTags = vi.fn();
const storeDeleteTag = vi.fn();

vi.mock("@/stores/tag_store", () => ({
  useTagStore: () => ({
    tags: [],
    setTags: storeSetTags,
    deleteTag: storeDeleteTag,
  }),
}));

function ControlledHarness({ initialTags }: { initialTags: ProtocolTag[] }) {
  const [tags, setTags] = useState<ProtocolTag[]>(initialTags);

  return (
    <TagManager
      title="Protocol tags"
      tags={tags}
      onTagsChange={setTags}
    />
  );
}

describe("TagManager", () => {
  it("renders the provided title and existing tags", () => {
    renderWithProviders(
      <ControlledHarness
        initialTags={[
          {
            id: "alpha",
            title: "Alpha",
            description: "First tag",
            color: "#ff0000",
          },
        ]}
      />,
      { service: createProjectServiceMock() },
    );

    expect(screen.getByText("Protocol tags")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("First tag")).toBeInTheDocument();
  });

  it("creates a new tag in controlled mode", async () => {
    renderWithProviders(
      <ControlledHarness initialTags={[]} />,
      { service: createProjectServiceMock() },
    );

    fireEvent.click(screen.getByRole("button", { name: "New tag" }));

    const dialog = await screen.findByRole("dialog");
    const textboxes = within(dialog).getAllByRole("textbox");

    fireEvent.change(textboxes[0], {
      target: { value: "Urgent" },
    });

    fireEvent.change(textboxes[1], {
      target: { value: "Needs attention" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
      expect(screen.getByText("Needs attention")).toBeInTheDocument();
    });
  });

  it("shows a validation error when creating a duplicate tag title", async () => {
    renderWithProviders(
      <ControlledHarness
        initialTags={[
          {
            id: "alpha",
            title: "Urgent",
            description: "Existing tag",
            color: "#ff0000",
          },
        ]}
      />,
      { service: createProjectServiceMock() },
    );

    fireEvent.click(screen.getByRole("button", { name: "New tag" }));

    const dialog = await screen.findByRole("dialog");
    const textboxes = within(dialog).getAllByRole("textbox");

    fireEvent.change(textboxes[0], {
      target: { value: "Urgent" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("A tag with the same title already exists."),
    ).toBeInTheDocument();
  });

  it("edits an existing tag in controlled mode", async () => {
    renderWithProviders(
      <ControlledHarness
        initialTags={[
          {
            id: "alpha",
            title: "Alpha",
            description: "Original description",
            color: "#ff0000",
          },
        ]}
      />,
      { service: createProjectServiceMock() },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    const textboxes = within(dialog).getAllByRole("textbox");

    fireEvent.change(textboxes[0], {
      target: { value: "Alpha updated" },
    });

    fireEvent.change(textboxes[1], {
      target: { value: "Updated description" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Alpha updated")).toBeInTheDocument();
      expect(screen.getByText("Updated description")).toBeInTheDocument();
    });
  });

  it("shows the empty state when there are no tags", () => {
    renderWithProviders(
      <ControlledHarness initialTags={[]} />,
      { service: createProjectServiceMock() },
    );

    expect(screen.getByText("No tags yet.")).toBeInTheDocument();
  });
});