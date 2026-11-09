import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({ saveNodeScratch: vi.fn() }));
vi.mock("@/api/settings", () => settingsMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import NodeScratch from "./NodeScratch";

const GB = 1024 ** 3;

describe("A machine's scratch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says when there is none", () => {
    render(<NodeScratch hostname="pc01" scratch={{ path: null }} canEdit={false} />);

    expect(screen.getByText(/None: the protocols' temporary files stay in the project/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change the scratch/ })).not.toBeInTheDocument();
  });

  it("shows its free space, or why it cannot be used, as that machine sees it", () => {
    const { rerender } = render(<NodeScratch hostname="gpu01" canEdit={false}
                                             scratch={{ path: "/ssd/scipion", exists: true, writable: true, freeBytes: 400 * GB, totalBytes: 900 * GB }} />);
    expect(screen.getByText(/400 GB free of 900 GB/)).toBeInTheDocument();

    rerender(<NodeScratch hostname="gpu01" canEdit={false}
                          scratch={{ path: "/ssd/scipion", exists: false, error: "The folder does not exist on this machine" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("/ssd/scipion: The folder does not exist on this machine");
  });

  it("is set by who manages the settings, and the list reloads", async () => {
    settingsMocks.saveNodeScratch.mockResolvedValue({ path: "/scratch", file: ".env", node: false });
    const onSaved = vi.fn();
    render(<NodeScratch hostname="pc01" scratch={{ path: null }} canEdit onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Change the scratch of pc01" }));
    fireEvent.change(await screen.findByLabelText("Folder"), { target: { value: " /scratch " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(settingsMocks.saveNodeScratch).toHaveBeenCalledWith("pc01", "/scratch"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
