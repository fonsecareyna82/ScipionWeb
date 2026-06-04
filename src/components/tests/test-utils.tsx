import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { ProjectServiceProvider } from "@/ProjectServiceContext";
import { ThemeProvider } from "@/context/ThemeContext";
import type { ProjectService } from "@/services/ProjectService";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  route?: string;
  service?: DeepPartial<ProjectService>;
};

export function createProjectServiceMock(
  overrides: DeepPartial<ProjectService> = {},
): DeepPartial<ProjectService> {
  return {
    fetchList: vi.fn(),
    createProject: vi.fn(),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
    listUsers: vi.fn(),
    listProjectShares: vi.fn(),
    shareProject: vi.fn(),
    revokeProjectShare: vi.fn(),
    resolveBackendUrl: vi.fn((url: string) => url),
    fetchBlobObjectUrl: vi.fn(),
    fetchProjectThumbnailItems: vi.fn(),
    resolveBrowserPaths: vi.fn(),
    listRemoteDirectory: vi.fn(),
    previewRemoteEntry: vi.fn(),
    buildProtocolDownloadUrl: vi.fn(),
    importProject: vi.fn(),
    ...overrides,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const { route = "/", service, ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider>
          <ProjectServiceProvider service={service}>
            {children}
          </ProjectServiceProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  }

  return render(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  });
}
