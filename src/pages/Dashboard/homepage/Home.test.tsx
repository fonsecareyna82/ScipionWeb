import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./Home";

const mockNavigate = vi.fn();

const mockProjectService = {
  fetchList: vi.fn(),
  fetchSystemUpdateCheck: vi.fn(),
};

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: () => mockProjectService,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<
    typeof import("react-router-dom")
  >("react-router-dom");

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/components/common/PageMeta", () => ({
  default: () => null,
}));

vi.mock("@/icons", () => ({
  TreeIcon: (props: any) => (
    <svg
      data-testid="tree-icon"
      {...props}
    />
  ),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockProjectService.fetchSystemUpdateCheck.mockResolvedValue({
      checkOk: true,
      updateAvailable: false,
    });
  });

  it("opens the most recently modified project", async () => {
    localStorage.setItem(
      "scipion.home.lastOpenedProjectId.v1",
      "1",
    );

    mockProjectService.fetchList.mockResolvedValue([
      {
        id: 1,
        name: "Old project",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-02T10:00:00Z",
      },
      {
        id: 2,
        name: "Newest modified project",
        createdAt: "2026-02-01T10:00:00Z",
        updatedAt: "2026-09-15T10:00:00Z",
      },
      {
        id: 3,
        name: "Middle project",
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-08-01T10:00:00Z",
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    const button = await screen.findByRole(
      "button",
      {
        name: "Open last project",
      },
    );

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/project/load/2",
      );
    });
  });
});