// src/entry-umd.tsx
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// React Query v5 (@tanstack)
import {
  QueryClient as QueryClientV5,
  QueryClientProvider as QueryClientProviderV5,
} from "@tanstack/react-query";

// React Query v3 (react-query)
import {
  QueryClient as QueryClientV3,
  QueryClientProvider as QueryClientProviderV3,
} from "react-query";

import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { HelmetProvider } from "react-helmet-async";

import Projects from "./pages/Dashboard/projects/Projects";
import { ProjectServiceProvider } from "./ProjectServiceContext";
import type { ProjectService } from "./services/ProjectService";
import type { WidgetGlobal } from "./types/global-widget";

/** Error boundary so we can see readable errors inside the host page */
class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any }
> {
  state = { err: null as any };

  static getDerivedStateFromError(err: any) {
    return { err };
  }

  componentDidCatch(err: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("[ProjectsWidget] error:", err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <pre
        style={{
          color: "#b91c1c",
          background: "#fee2e2",
          padding: 12,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          lineHeight: 1.35,
          fontSize: 13,
        }}
      >
        ProjectsWidget error:
        {"\n"}
        {String(this.state.err?.stack || this.state.err)}
      </pre>
    );
  }
}

/** Tiny helper to produce a mock data URL slice image (for Analyze Results) */
const mockSliceDataUrl = (sliceIndex: number) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="100%" height="100%" fill="#eeeeee"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
          font-size="18" fill="#333333">Slice ${sliceIndex}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/** Default mock service that satisfies the full ProjectService interface */
const defaultMockService: ProjectService = {
  // ---- projects ----
  async fetchList() {
    return [
      {
        id: "demo-1",
        name: "Demo Project 1",
        description: "Example",
        createdAt: new Date().toISOString(),
        status: "idle",
      },
    ];
  },
  async fetchProject(projectId) {
    return {
      id: projectId,
      name: `Demo ${projectId}`,
      description: "",
      createdAt: new Date().toISOString(),
      status: "idle",
    } as any;
  },
  async createProject(payload) {
    return {
      id: `mock-${Date.now()}`,
      name: payload.name,
      description: payload.description ?? "",
      createdAt: new Date().toISOString(),
      status: "idle",
    } as any;
  },
  async renameProject(id, newName, newDescription) {
    return { id, name: newName, description: newDescription ?? "" } as any;
  },
  async deleteProject(_id) {
    return { success: true } as any; // also valid to return void
  },

  // ---- protocols (core) ----
  async fetchProtocolDetails(_projectId, protocolId) {
    return { id: protocolId, protocolClassName: "DemoProtocol", params: {} } as any;
  },
  async fetchNewProtocolDetails(_projectId, protocolClass) {
    return { id: "new", protocolClassName: protocolClass, params: {} } as any;
  },
  async loadProtocols(_projectId) {
    return [] as any;
  },
  async executeProtocol(_protocolId, _protocolClassName, _params) {
    return { success: true } as any;
  },
  async saveProtocol(_protocolId, _protocolClassName, _params) {
    return { success: true } as any;
  },

  // ---- protocol actions ----
  async renameProtocol(_projectId, protocolId, newName) {
    return { id: protocolId, name: newName } as any;
  },
  async duplicateProtocol(_projectId, items) {
    return { duplicated: items.map((i: any) => ({ ...i, id: `${i.id}-copy` })) } as any;
  },
  async deleteProtocol(_projectId, _ids) {
    return { success: true } as any;
  },
  async restartAll(projectId, protocolId) {
    return { id: projectId, action: "restartAll", from: protocolId } as any;
  },
  async continueAll(projectId, protocolId) {
    return { id: projectId, action: "continueAll", from: protocolId } as any;
  },
  async resetFrom(projectId, protocolId) {
    return { id: projectId, action: "resetFrom", from: protocolId } as any;
  },
  async stopProtocol(projectId, ids) {
    return { id: projectId, action: "stopProtocol", stopped: ids } as any;
  },
  async resolveProtocolStartPath(projectId, pid) {
    return { id: projectId, action: "resolveProtocolStartPath", startPid: pid } as any;
  },
  async listRemoteDirectory(projectId, protocolId, path) {
    return { id: projectId, protocolId, path, entries: [] } as any;
  },
  async previewProtocolText(projectId, id, path) {
    return {
      id: projectId,
      action: "previewProtocolText",
      protocolId: id,
      path,
      content: "Mock preview...",
    } as any;
  },
  buildProtocolDownloadUrl(projectId, protocolId, path, inline) {
    return `/download/${encodeURIComponent(String(projectId))}/${encodeURIComponent(
      String(protocolId)
    )}?path=${encodeURIComponent(path)}&inline=${inline ? 1 : 0}`;
  },

  async fetchProtocolInlinePreviewBlob(_projectId, _protocolId, _relPath) {
    const blob = new Blob([`Mock inline preview for ${_relPath}`], { type: "text/plain" });
    const meta = {
      mime: "text/plain",
      width: undefined,
      height: undefined,
      depth: undefined,
      sizeBytes: blob.size,
      voxelSize: undefined,
      note: "mock",
    };
    return { blob, meta };
  },
  async fetchOutputPreview(_projectId, _protocolId, outputName) {
    return { success: true, outputName };
  },

  // ───────── Analyze Results — Volumes (mock implementations) ─────────
  async listOutputVolumes(_projectId, _protocolId, _outputName) {
    return [{ id: "vol-1", name: "Demo volume" }];
  },
  async getVolumeInfo(_projectId, _protocolId, _outputName, _volumeId) {
    return { slices: 64, shape: [64, 256, 256], voxelSize: [1, 1, 1], dtype: "float32" };
  },
  async buildVolumeSliceUrl(_projectId, _protocolId, _outputName, _volumeId, sliceIndex) {
    return mockSliceDataUrl(Number(sliceIndex));
  },
  async fetchVolumeSliceObjectUrl(_projectId, _protocolId, _outputName, _volumeId, sliceIndex) {
    const url = mockSliceDataUrl(Number(sliceIndex));
    return { url, revoke: () => {} };
  },
};

/** Light normalization (extend if you need aliasing) */
function normalizeServiceAPI(srv?: ProjectService): ProjectService {
  return srv ?? defaultMockService;
}

/** Public mount options for the list widget */
export type MountOptions = {
  container: string | HTMLElement;
  service?: ProjectService;
  props?: Record<string, any>;
};

/** Ensure common portal roots exist (safety net for overlays/toasts) */
function ensureDomRoots() {
  ["modal-root", "drawer-root", "toast-root", "portal-root", "app", "root"].forEach((id) => {
    if (!document.getElementById(id)) {
      const d = document.createElement("div");
      d.id = id;
      document.body.appendChild(d);
    }
  });
}

/** Public mount (projects list widget) */
export function mount({ container, service, props }: MountOptions) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error(`ProjectsWidget: container '${container}' not found`);

  ensureDomRoots();

  const resolvedService = normalizeServiceAPI(service);

  // React Query clients
  const queryClientV5 = new QueryClientV5({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const queryClientV3 = new QueryClientV3();

  // Emotion cache for styles
  const emotionCache = createCache({ key: "mpw", container: document.head, prepend: false });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[ProjectsWidget] mount props:", props);
  }

  const root = ReactDOM.createRoot(target as HTMLElement);
  root.render(
    <ProjectServiceProvider service={resolvedService}>
      <QueryClientProviderV3 client={queryClientV3}>
        <QueryClientProviderV5 client={queryClientV5}>
          <CacheProvider value={emotionCache}>
            {/* IMPORTANT: Use BrowserRouter so navigate('/project/load/:id') updates the real URL.
               The host page can observe path changes and mount the ProjectPage widget. */}
            <BrowserRouter>
              <HelmetProvider>
                <WidgetErrorBoundary>
                  <Projects />
                </WidgetErrorBoundary>
              </HelmetProvider>
            </BrowserRouter>
          </CacheProvider>
        </QueryClientProviderV5>
      </QueryClientProviderV3>
    </ProjectServiceProvider>
  );

  return {
    unmount() {
      root.unmount();
    },
  };
}

/** Attach to window using the shared WidgetGlobal type */
declare global {
  interface Window {
    MyProjectsWidget?: WidgetGlobal;
  }
}

if (typeof window !== "undefined") {
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;
  const next: WidgetGlobal = {
    ...(prev || {}),
    mount: mount,
    mountProjectsWidget: mount,
    // keep any previously-attached functions like mountProjectPageWidget
  };
  (window as any).MyProjectsWidget = next;
  // eslint-disable-next-line no-console
  console.log("ProjectsWidget: entry-umd ready — window.MyProjectsWidget");
}
