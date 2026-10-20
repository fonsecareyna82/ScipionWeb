import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

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

const alpha = { id: "alpha", title: "Alpha", description: "First tag", color: "#ff0000" };

function setup(overrides: Record<string, any> = {}, props: Record<string, any> = {}) {
  const service = createProjectServiceMock({
    listProjectTags: vi.fn().mockResolvedValue([alpha]),
    createProjectTag: vi.fn(async (_pid: any, payload: any) => ({ id: "new", ...payload })),
    updateProjectTag: vi.fn(async (_pid: any, id: string, payload: any) => ({ id, ...payload })),
    deleteProjectTag: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } as any);
  const onTagsChange = vi.fn();
  const onTagDeleted = vi.fn();
  renderWithProviders(
    <TagManager title="Protocol tags" projectId={7} onTagsChange={onTagsChange} onTagDeleted={onTagDeleted} {...props} />,
    { service },
  );
  return { service: service as any, onTagsChange, onTagDeleted };
}

async function openCreateDialog() {
  fireEvent.click(screen.getByRole("button", { name: "New tag" }));
  return screen.findByRole("dialog");
}

describe("TagManager", () => {
  it("loads and lists the project's tags", async () => {
    const { service, onTagsChange } = setup();

    expect(screen.getByText("Protocol tags")).toBeInTheDocument();
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("First tag")).toBeInTheDocument();
    expect(service.listProjectTags).toHaveBeenCalledWith(7);
    expect(onTagsChange).toHaveBeenCalledWith([expect.objectContaining({ id: "alpha" })]);
  });

  it("creates a tag on the server", async () => {
    const { service } = setup();
    await screen.findByText("Alpha");

    const dialog = await openCreateDialog();
    const [title, description] = within(dialog).getAllByRole("textbox");
    fireEvent.change(title, { target: { value: "Urgent" } });
    fireEvent.change(description, { target: { value: "Needs attention" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Urgent")).toBeInTheDocument());
    expect(service.createProjectTag).toHaveBeenCalledWith(7, { title: "Urgent", description: "Needs attention", color: "#3b82f6" });
  });

  it("checks the title length, duplicates and the hex colour before sending", async () => {
    const { service } = setup();
    await screen.findByText("Alpha");
    const dialog = await openCreateDialog();
    const save = within(dialog).getByRole("button", { name: "Save" });

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "x".repeat(81) } });
    fireEvent.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("at most 80 characters");

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "alpha" } });
    fireEvent.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("A tag with the same title already exists.");

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Beta" } });
    fireEvent.change(within(dialog).getByLabelText("Hex color"), { target: { value: "blue" } });
    fireEvent.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("hex value");

    expect(service.createProjectTag).not.toHaveBeenCalled();
  });

  it("keeps the native colour input and the hex field in hex", async () => {
    setup();
    await screen.findByText("Alpha");
    const dialog = await openCreateDialog();

    fireEvent.change(within(dialog).getByLabelText("Hex color"), { target: { value: "#abc" } });
    expect(within(dialog).getByLabelText("Pick custom color")).toHaveValue("#aabbcc");

    fireEvent.change(within(dialog).getByLabelText("Pick custom color"), { target: { value: "#112233" } });
    expect(within(dialog).getByLabelText("Hex color")).toHaveValue("#112233");
  });

  it("shows the server's message for a duplicate title", async () => {
    const conflict = Object.assign(new Error("Failed to create tag"), {
      status: 409,
      data: { detail: "A tag titled 'Beta' already exists in this project." },
    });
    setup({ createProjectTag: vi.fn().mockRejectedValue(conflict) });
    await screen.findByText("Alpha");
    const dialog = await openCreateDialog();

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Beta" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A tag titled 'Beta' already exists in this project.");
  });

  it("edits a tag", async () => {
    const { service } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Edit tag Alpha" }));
    const dialog = await screen.findByRole("dialog");
    const [title, description] = within(dialog).getAllByRole("textbox");
    fireEvent.change(title, { target: { value: "Alpha updated" } });
    fireEvent.change(description, { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Alpha updated")).toBeInTheDocument());
    // An empty description is sent as null, which clears it.
    expect(service.updateProjectTag).toHaveBeenCalledWith(7, "alpha", { title: "Alpha updated", description: null, color: "#ff0000" });
  });

  it("asks before deleting, saying how many protocols use the tag", async () => {
    const { service, onTagDeleted } = setup({}, { getUsageCount: () => 3 });

    fireEvent.click(await screen.findByRole("button", { name: "Delete tag Alpha" }));
    const confirm = await screen.findByRole("dialog", { name: /Delete tag/ });
    expect(confirm).toHaveTextContent("It is used by 3 protocols");
    expect(service.deleteProjectTag).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(service.deleteProjectTag).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Delete tag/ })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete tag Alpha" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: /Delete tag/ })).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(service.deleteProjectTag).toHaveBeenCalledWith(7, "alpha"));
    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument());
    expect(onTagDeleted).toHaveBeenCalledWith("alpha");
  });

  it("shows the empty state when there are no tags", async () => {
    setup({ listProjectTags: vi.fn().mockResolvedValue([]) });

    expect(await screen.findByText("No tags yet.")).toBeInTheDocument();
  });
});
