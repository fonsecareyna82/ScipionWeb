import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import RemoteFileDialog from "../../files/RemoteFileDialog";

vi.mock("@/components/ui/dialog/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div data-testid="mock-dialog">{children}</div> : null),
  DialogContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("RemoteFileDialog", () => {
  const onClose = vi.fn();
  const onPick = vi.fn();
  const resolveBrowserPaths = vi.fn();
  const listRemoteDirectory = vi.fn();
  const previewRemoteEntry = vi.fn();
  const buildDownloadUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resolveBrowserPaths.mockResolvedValue({
      rootAbs: "/root",
      startPath: "",
    });
    previewRemoteEntry.mockResolvedValue(null);
    buildDownloadUrl.mockReturnValue("");
  });

  function renderDialog(
    props: Partial<React.ComponentProps<typeof RemoteFileDialog>> = {},
  ) {
    return render(
      <RemoteFileDialog
        open={true}
        onClose={onClose}
        title="Browse files"
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
        onPick={onPick}
        {...props}
      />,
    );
  }

  it("loads and renders directory entries on open", async () => {
    listRemoteDirectory.mockResolvedValue([
      { name: "folderA", path: "folderA", isDir: true },
      { name: "file.txt", path: "file.txt", isDir: false, size: 120 },
    ]);

    renderDialog();

    expect(await screen.findByText("folderA")).toBeInTheDocument();
    expect(screen.getByText("file.txt")).toBeInTheDocument();
    expect(listRemoteDirectory).toHaveBeenCalledWith("");
  });

  it("filters visible entries by search text", async () => {
    listRemoteDirectory.mockResolvedValue([
      { name: "folderA", path: "folderA", isDir: true },
      { name: "notes.txt", path: "notes.txt", isDir: false },
    ]);

    renderDialog();

    expect(await screen.findByText("folderA")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter file names"), {
      target: { value: "notes" },
    });

    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.queryByText("folderA")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(previewRemoteEntry).toHaveBeenCalledWith("notes.txt");
    });
  });

  it("selects a file and calls onPick on Select", async () => {
    const fileEntry = { name: "file.txt", path: "file.txt", isDir: false };

    listRemoteDirectory.mockResolvedValue([fileEntry]);

    renderDialog();

    expect(await screen.findByText("file.txt")).toBeInTheDocument();

    fireEvent.click(screen.getByText("file.txt"));

    await waitFor(() => {
      expect(previewRemoteEntry).toHaveBeenCalledWith("file.txt");
    });

    fireEvent.click(screen.getByRole("button", { name: "Select" }));

   expect(onPick).toHaveBeenCalledWith("file.txt", fileEntry);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("enters a folder on double click and refreshes listing", async () => {
    listRemoteDirectory
      .mockResolvedValueOnce([
        { name: "folderA", path: "folderA", isDir: true },
      ])
      .mockResolvedValueOnce([
        { name: "inside.txt", path: "folderA/inside.txt", isDir: false },
      ]);

    renderDialog();

    const folderButton = await screen.findByText("folderA");

    fireEvent.doubleClick(folderButton);

    await waitFor(() => {
      expect(listRemoteDirectory).toHaveBeenCalledWith("folderA");
    });

    expect(await screen.findByText("inside.txt")).toBeInTheDocument();
  });

  it("supports save mode and passes filename to onPick", async () => {
    listRemoteDirectory.mockResolvedValue([]);

    renderDialog({
      mode: "save",
      defaultFilename: "export.json",
      confirmLabel: "Save file",
    });

    await waitFor(() => {
      expect(listRemoteDirectory).toHaveBeenCalledWith("");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save file" }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe("/root");
    expect(onPick.mock.calls[0][2]).toBe("export.json");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("updates the location when going up from a nested directory", async () => {
    resolveBrowserPaths.mockResolvedValue({
      rootAbs: "/root",
      startPath: "folderA/sub",
    });

    listRemoteDirectory
      .mockResolvedValueOnce([
        { name: "file-in-sub.txt", path: "folderA/sub/file-in-sub.txt", isDir: false },
      ])
      .mockResolvedValueOnce([
        { name: "file-in-folderA.txt", path: "folderA/file-in-folderA.txt", isDir: false },
      ]);

    renderDialog();

    expect(await screen.findByText("file-in-sub.txt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Up/i }));

    await waitFor(() => {
      expect(listRemoteDirectory).toHaveBeenCalledWith("folderA");
    });

    expect(await screen.findByText("file-in-folderA.txt")).toBeInTheDocument();
  });
});