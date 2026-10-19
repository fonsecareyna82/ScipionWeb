import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import RemoteFileDialog from "../../files/RemoteFileDialog";
import { TablePreview } from "../../files/remote-preview-parts";

const authMocks = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }));
vi.mock("@/api/auth", () => authMocks);

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
      expect(previewRemoteEntry).toHaveBeenCalledWith("notes.txt", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });
  });

  it("selects a file and calls onPick on Select", async () => {
    const fileEntry = { name: "file.txt", path: "file.txt", isDir: false };

    listRemoteDirectory.mockResolvedValue([fileEntry]);

    renderDialog();

    expect(await screen.findByText("file.txt")).toBeInTheDocument();

    fireEvent.click(screen.getByText("file.txt"));

    await waitFor(() => {
      expect(previewRemoteEntry).toHaveBeenCalledWith("file.txt", expect.anything());
    });

    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    // The root-relative path, and where it is for callers that need it.
    expect(onPick).toHaveBeenCalledWith("file.txt", fileEntry, undefined,
      { absPath: "/root/file.txt", rootAbs: "/root", projectRootAbs: null });
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

  it("goes to the folder above with Enter on '..', not to the root", async () => {
    resolveBrowserPaths.mockResolvedValue({ rootAbs: "/root", startPath: "a/b" });
    listRemoteDirectory.mockResolvedValue([{ name: "x.txt", path: "a/b/x.txt", isDir: false }]);
    renderDialog();
    expect(await screen.findByText("x.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByText(".."));
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Files" }), { key: "Enter" });
    await waitFor(() => expect(listRemoteDirectory).toHaveBeenLastCalledWith("a"));
  });

  it("hides hidden files until asked, and sorts by size and date with folders first", async () => {
    listRemoteDirectory.mockResolvedValue([
      { name: "big.mrc", path: "big.mrc", isDir: false, size: 5000, mtime: 100 },
      { name: ".thumbnail_cache", path: ".thumbnail_cache", isDir: true },
      { name: "small.txt", path: "small.txt", isDir: false, size: 10, mtime: 300 },
      { name: "Runs", path: "Runs", isDir: true, isLink: true },
    ]);
    renderDialog();
    expect(await screen.findByText("Runs")).toBeInTheDocument();
    expect(screen.queryByText(".thumbnail_cache")).not.toBeInTheDocument();
    const names = () => within(screen.getByRole("listbox", { name: "Files" }))
      .getAllByRole("option").map((option) => option.querySelector("span")?.textContent);
    expect(names()).toEqual(["Runs", "big.mrc", "small.txt"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by size" }));
    expect(names()).toEqual(["Runs", "big.mrc", "small.txt"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by modified" }));
    expect(names()).toEqual(["Runs", "small.txt", "big.mrc"]);
    fireEvent.click(screen.getByRole("button", { name: "Show hidden files" }));
    expect(screen.getByText(".thumbnail_cache")).toBeInTheDocument();
    expect(screen.getByTitle("Runs (link)")).toBeInTheDocument();
  });

  it("does not preview a big file on its own, only when asked", async () => {
    listRemoteDirectory.mockResolvedValue([
      { name: "movie.mrc", path: "movie.mrc", isDir: false, size: 900 * 1024 * 1024 },
    ]);
    renderDialog();
    expect(await screen.findByText("Preview it")).toBeInTheDocument();
    expect(previewRemoteEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Preview it"));
    await waitFor(() => expect(previewRemoteEntry).toHaveBeenCalledWith("movie.mrc", expect.anything()));
  });

  it("cancels the previews of entries passed over with the arrow keys", async () => {
    listRemoteDirectory.mockResolvedValue(
      ["a.txt", "b.txt", "c.txt"].map((name) => ({ name, path: name, isDir: false, size: 10 })),
    );
    const signals: AbortSignal[] = [];
    previewRemoteEntry.mockImplementation((_path: string, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      return new Promise(() => undefined);
    });
    renderDialog();
    await waitFor(() => expect(previewRemoteEntry).toHaveBeenCalledWith("a.txt", expect.anything()));
    const list = screen.getByRole("listbox", { name: "Files" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    await waitFor(() => expect(previewRemoteEntry).toHaveBeenLastCalledWith("c.txt", expect.anything()));
    // b.txt was passed over before its preview started; a.txt's request was cancelled.
    expect(previewRemoteEntry.mock.calls.map((call) => call[0])).toEqual(["a.txt", "c.txt"]);
    expect(signals[0].aborted).toBe(true);
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("c.txt");
  });

  it("draws only the rows of a big folder that are in view", async () => {
    listRemoteDirectory.mockResolvedValue(
      Array.from({ length: 5000 }, (_, i) => ({ name: `img_${String(i).padStart(5, "0")}.mrc`, path: `img_${i}.mrc`, isDir: false, size: 1 })),
    );
    renderDialog();
    expect(await screen.findByText("img_00000.mrc")).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeLessThan(100);
    // Typing a name jumps to it.
    const list = screen.getByRole("listbox", { name: "Files" });
    for (const key of "img_04999") fireEvent.keyDown(list, { key });
    expect(await screen.findByRole("option", { selected: true })).toHaveTextContent("img_04999.mrc");
  });

  it("downloads the selected file with the session's credentials", async () => {
    listRemoteDirectory.mockResolvedValue([{ name: "run.log", path: "logs/run.log", isDir: false, size: 3 }]);
    buildDownloadUrl.mockReturnValue("http://api/download?path=logs/run.log");
    authMocks.fetchWithAuth.mockResolvedValue(new Response("log"));
    const createUrl = vi.fn().mockReturnValue("blob:download");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderDialog();
    expect(await screen.findByText("run.log")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    });
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(buildDownloadUrl).toHaveBeenCalledWith("logs/run.log", false);
    expect(authMocks.fetchWithAuth).toHaveBeenCalledWith("http://api/download?path=logs/run.log");
    click.mockRestore();
  });

  it("shows the data blocks of a metadata file as tabs", () => {
    render(
      <TablePreview
        format="star"
        blocks={[
          { name: "optics", kind: "loop", columns: ["rlnOpticsGroup"], rows: [["1"]], totalRows: 1 },
          { name: "particles", kind: "loop", columns: ["rlnCoordinateX", "rlnCoordinateY"], rows: [["10", "20"]], totalRows: 5000 },
        ]}
      />,
    );
    // The biggest block first, with how many rows it has.
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("particles · 5000");
    expect(screen.getByText("1 of 5000 rows")).toBeInTheDocument();
    expect(screen.getByText("rlnCoordinateX")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /optics/ }));
    expect(screen.getByText("rlnOpticsGroup")).toBeInTheDocument();
    expect(screen.getByText("1 rows")).toBeInTheDocument();
  });
});
