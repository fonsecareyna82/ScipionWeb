import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pluginMocks = vi.hoisted(() => ({ installPluginsBatch: vi.fn() }));
const permissionMocks = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/api/plugins", () => pluginMocks);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ loaded: true, user: null, can: (name: string) => permissionMocks.permissions.includes(name) }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import WorkflowRequirements from "@/components/workflows/WorkflowRequirements";

const missing = [{ name: "relion", pipName: "scipion-em-relion" }, { name: "xmipp3", pipName: "scipion-em-xmipp" }];

function renderIt(props: any) {
  return render(<MemoryRouter><WorkflowRequirements {...props} /></MemoryRouter>);
}

describe("What a workflow needs before it loads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMocks.permissions = [];
  });

  it("installs the missing plugins for who manages plugins", async () => {
    permissionMocks.permissions = ["plugins.manage"];
    pluginMocks.installPluginsBatch.mockResolvedValue({ taskId: "t1", status: "queued" });
    const onInstalling = vi.fn();
    renderIt({ missingPlugins: missing, onInstalling });

    expect(screen.getByText("relion, xmipp3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Install missing plugins" }));

    await waitFor(() => expect(pluginMocks.installPluginsBatch).toHaveBeenCalledWith(
      { plugins: ["scipion-em-relion", "scipion-em-xmipp"] }));
    await waitFor(() => expect(onInstalling).toHaveBeenCalled());
  });

  it("tells who cannot install them to ask an administrator", () => {
    renderIt({ missingPlugins: missing });

    expect(screen.queryByRole("button", { name: "Install missing plugins" })).not.toBeInTheDocument();
    expect(screen.getByText("Ask an administrator to install them.")).toBeInTheDocument();
  });

  it("says when its protocols are unknown and it does not say which plugin they need, and warns to migrate it", () => {
    renderIt({ unknownProtocolClasses: ["ProtRelionClassify2D"],
               designWarning: "It does not say which plugins it needs: export it again from Scipion or ScipionWeb to migrate it." });

    expect(screen.getByText("ProtRelionClassify2D")).toBeInTheDocument();
    expect(screen.getByText(/export it again/)).toBeInTheDocument();
  });

  it("shows nothing for a workflow that is fine", () => {
    renderIt({ missingPlugins: [], unknownProtocolClasses: [], designWarning: "" });

    expect(screen.queryByTestId("workflow-requirements")).not.toBeInTheDocument();
  });
});
