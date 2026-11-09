import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({ saveNodeScratch: vi.fn(), cleanNodeScratch: vi.fn() }));
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

describe("Cleaning a machine's scratch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows what the last cleaning did", () => {
    render(<NodeScratch hostname="gpu01" canEdit={false} scratch={{
      path: "/ssd/scipion", exists: true, writable: true, freeBytes: 400 * GB, totalBytes: 900 * GB,
      lastCleanup: { at: new Date(Date.now() - 20 * 60000).toISOString(), freedBytes: 120 * GB, kept: 2, errors: [],
                     removed: [{ name: "P_000013_ProtX", reason: "its protocol is gone", bytes: 120 * GB }] },
    }} />);

    expect(screen.getByTestId("scratch-last-gpu01")).toHaveTextContent("Cleaned 20 min ago: 1 folder removed, 120 GB freed");
  });

  it("is asked for now by who manages the jobs", async () => {
    (settingsMocks as any).cleanNodeScratch = vi.fn().mockResolvedValue({ requested: true });
    render(<NodeScratch hostname="gpu01" canEdit={false} canClean scratch={{ path: "/ssd/scipion", exists: true }} />);

    fireEvent.click(screen.getByRole("button", { name: "Clean the scratch of gpu01 now" }));

    await waitFor(() => expect((settingsMocks as any).cleanNodeScratch).toHaveBeenCalledWith("gpu01"));
  });
});
