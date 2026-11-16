import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const plugins = vi.hoisted(() => [
  { name: "Alpha", pipName: "scipion-em-alpha", installed: true, pipVersion: "1.0", latestRelease: "1.0",
    categories: [{ id: "spa", title: "SPA" }] },
  { name: "Beta", pipName: "scipion-em-beta", installed: false, latestRelease: "2.0",
    categories: [{ id: "tomo", title: "Tomography" }] },
  { name: "Gamma", pipName: "scipion-em-gamma", installed: false, latestRelease: "3.0",
    categories: [{ id: "spa", title: "SPA" }] },
]);

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/common/PageMeta", () => ({ default: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/usePlugins", () => ({
  usePlugins: () => ({ data: plugins, isLoading: false, isError: false, refetch: vi.fn(), dataUpdatedAt: 0 }),
}));
vi.mock("@/hooks/useProcessingPlugins", () => ({
  useProcessingPlugins: () => ({ tasks: [], installing: [], removing: [], registerTask: vi.fn(), refreshTasks: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock("@/components/plugin/PluginsCard", () => ({
  default: (plugin: { name: string }) => <div data-testid="plugin-card">{plugin.name}</div>,
}));
vi.mock("@/pages/Dashboard/plugins/PluginTaskCenter", () => ({ default: () => <div>Task center</div> }));
vi.mock("@/pages/Dashboard/plugins/InstallDevelPluginDialog", () => ({ default: () => null }));

import Plugins from "@/pages/Dashboard/plugins/Plugins";

const cards = () => screen.queryAllByTestId("plugin-card").map((card) => card.textContent);

describe("Plugins page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the available plugins first, and the installed ones in their tab", () => {
    render(<Plugins />);
    const tabs = screen.getByRole("tablist", { name: "Plugins sections" });
    expect(within(tabs).getByRole("tab", { name: /Available\s*2/ })).toHaveAttribute("aria-selected", "true");
    expect(cards()).toEqual(["Beta", "Gamma"]);

    fireEvent.click(within(tabs).getByRole("tab", { name: /Installed\s*1/ }));
    expect(cards()).toEqual(["Alpha"]);
  });

  it("narrows by category and by search", () => {
    render(<Plugins />);
    const categories = screen.getByRole("group", { name: "Plugin categories" });
    fireEvent.click(within(categories).getByRole("button", { name: /Tomography\s*1/ }));
    expect(cards()).toEqual(["Beta"]);

    fireEvent.click(within(categories).getByRole("button", { name: /All\s*2/ }));
    fireEvent.change(screen.getByLabelText("Search plugins"), { target: { value: "gam" } });
    expect(cards()).toEqual(["Gamma"]);
  });

  it("opens the tasks", () => {
    render(<Plugins />);
    fireEvent.click(screen.getByRole("tab", { name: /Tasks/ }));
    expect(screen.getByText("Task center")).toBeInTheDocument();
  });
});
