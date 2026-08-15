import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ImportProjectDialog from "../../projects/ImportProjectDialog";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/files/RemoteFileDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onClose,
    onPick,
  }: {
    open: boolean;
    onClose: () => void;
    onPick: (relativePath: string) => void;
  }) =>
    open ? (
      <div data-testid="mock-remote-file-dialog">
        <button
          type="button"
          data-testid="mock-pick-remote-path"
          onClick={() => onPick("/remote/project-path")}
        >
          Pick remote path
        </button>
        <button
          type="button"
          data-testid="mock-close-remote-browser"
          onClick={onClose}
        >
          Close remote browser
        </button>
      </div>
    ) : null,
}));

describe("ImportProjectDialog", () => {
  const onClose = vi.fn();
  const onImport = vi.fn();
  const resolveBrowserPaths = vi.fn();
  const listRemoteDirectory = vi.fn();
  const previewRemoteEntry = vi.fn();
  const buildDownloadUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dialog title when open", () => {
    render(
      <ImportProjectDialog
        open={true}
        onClose={onClose}
        onImport={onImport}
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
      />,
    );

    expect(screen.getByText("Import project")).toBeInTheDocument();
    expect(screen.getByText("Project location")).toBeInTheDocument();
    expect(screen.getByText("Project name (Optional)")).toBeInTheDocument();
  });

  it("keeps the import button disabled until a project location is provided", () => {
    render(
      <ImportProjectDialog
        open={true}
        onClose={onClose}
        onImport={onImport}
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
      />,
    );

    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/tmp/project" },
    });

    expect(importButton).toBeEnabled();
  });

  it("calls onImport with trimmed values and closes on success", async () => {
    onImport.mockResolvedValue(undefined);

    render(
      <ImportProjectDialog
        open={true}
        onClose={onClose}
        onImport={onImport}
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "  /tmp/project  " },
    });

    fireEvent.change(screen.getByPlaceholderText("Imported project name"), {
      target: { value: "  Imported Alpha  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith({
        projectLocation: "/tmp/project",
        projectName: "Imported Alpha",
      });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("passes undefined projectName when the optional name is blank", async () => {
    onImport.mockResolvedValue(undefined);

    render(
      <ImportProjectDialog
        open={true}
        onClose={onClose}
        onImport={onImport}
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/tmp/project" },
    });

    fireEvent.change(screen.getByPlaceholderText("Imported project name"), {
      target: { value: "   " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith({
        projectLocation: "/tmp/project",
        projectName: undefined,
      });
    });
  });

  it("shows an error toast when import fails", async () => {
    onImport.mockRejectedValue(new Error("Import failed badly"));

    render(
      <ImportProjectDialog
        open={true}
        onClose={onClose}
        onImport={onImport}
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/tmp/project" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Import failed badly");
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the remote browser and uses the picked path", async () => {
    render(
      <ImportProjectDialog
        open={true}
        onClose={onClose}
        onImport={onImport}
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Browse project location" }),
    );

    expect(
      await screen.findByTestId("mock-remote-file-dialog"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mock-pick-remote-path"));

    expect(
      screen.getByDisplayValue("/remote/project-path"),
    ).toBeInTheDocument();

    expect(
      screen.queryByTestId("mock-remote-file-dialog"),
    ).not.toBeInTheDocument();
  });
});