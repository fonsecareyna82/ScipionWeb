import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import TagsPanel from "@/pages/Settings/TagsPanel";
import { createProjectServiceMock, renderWithProviders } from "../test-utils";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// The svg icons do not load in tests
vi.mock("../../../icons", () => ({
  TrashBinIcon: () => <svg />,
  HelpIcon: () => <svg />,
  CloseIcon: () => <svg />,
}));

const alpha = { id: "alpha", title: "Alpha", description: "First tag", color: "#ff0000" };
const beta = { id: "beta", title: "Beta", color: "#00ff00" };

function setup() {
  const service = createProjectServiceMock({
    fetchList: vi.fn().mockResolvedValue([{ id: 7, name: "Apoferritin" }, { id: 9, name: "Ribosome" }]),
    listProjectTags: vi.fn(async (pid: number) => (pid === 7 ? [alpha, beta] : [])),
    createProjectTag: vi.fn(async (_pid: unknown, payload: Record<string, unknown>) => ({ id: "new", ...payload })),
    deleteProjectTag: vi.fn().mockResolvedValue({ success: true }),
  } as never);
  renderWithProviders(<TagsPanel />, { service });
  return service as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe("Settings: tags", () => {
  it("shows the tags of the first project and of the one chosen", async () => {
    const service = setup();

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("First tag")).toBeInTheDocument();
    expect(screen.getByText("2 tags")).toBeInTheDocument();
    expect(service.listProjectTags).toHaveBeenCalledWith(7);
    // The project whose tags are shown is the one in the field
    expect(screen.getByRole("combobox")).toHaveValue("Apoferritin");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Ribosome" }));
    expect(await screen.findByText("No tags in this project yet.")).toBeInTheDocument();
    expect(service.listProjectTags).toHaveBeenLastCalledWith(9);
    expect(screen.getByRole("combobox")).toHaveValue("Ribosome");
  });

  it("creates a tag in the project chosen", async () => {
    const service = setup();
    await screen.findByText("Alpha");

    fireEvent.click(screen.getByRole("button", { name: "New tag" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Gamma" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create|save/i }));

    await waitFor(() => expect(service.createProjectTag).toHaveBeenCalledWith(7, expect.objectContaining({ title: "Gamma" })));
    expect(await screen.findByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText("3 tags")).toBeInTheDocument();
  });

  it("asks before deleting a tag", async () => {
    const service = setup();
    await screen.findByText("Alpha");

    fireEvent.click(screen.getByRole("button", { name: "Delete tag Alpha" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/removed from every protocol/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(service.deleteProjectTag).toHaveBeenCalledWith(7, "alpha"));
    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument());
  });
});
