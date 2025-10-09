// src/entry-umd.tsx
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// React Query v5 (@tanstack)
import { QueryClient as QueryClientV5, QueryClientProvider as QueryClientProviderV5 } from "@tanstack/react-query";
// React Query v3 (react-query)
import { QueryClient as QueryClientV3, QueryClientProvider as QueryClientProviderV3 } from "react-query";

import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

import { ProjectServiceProvider } from "./ProjectServiceContext";
import type { ProjectService } from "./services/ProjectService";
import Projects from "./pages/Dashboard/projects/Projects";
import { HelmetProvider } from "react-helmet-async";

/** Error boundary to render readable errors inside the host page */
class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any }
> {
  state = { err: null as any };

  static getDerivedStateFromError(err: any) {
    return { err };
  }

  componentDidCatch(err: any, info: any) {
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

/** Ensure common portal roots exist so overlays/toasts won't crash */
function ensureDomRoots() {
  const ids = ["modal-root", "drawer-root", "toast-root", "portal-root", "app", "root"];
  ids.forEach((id) => {
    if (!document.getElementById(id)) {
      const d = document.createElement("div");
      d.id = id;
      document.body.appendChild(d);
    }
  });
}

/** Normalize any external service to the ProjectService contract */
function normalizeServiceAPI(srv: any) {
  if (!srv || typeof srv !== "object") return srv;
  const normalized: any = { ...srv };
  const mock: any = defaultMockService;

  const ensure = (key: string, candidates: string[]) => {
    if (typeof normalized[key] === "function") return;
    for (const c of candidates) {
      if (typeof normalized[c] === "function") {
        normalized[key] = normalized[c].bind(normalized);
        if (process.env.NODE_ENV !== "production") {
          console.log(`normalizeServiceAPI: mapped ${c} → ${key}`);
        }
        return;
      }
    }
    if (typeof mock[key] === "function") {
      console.warn(`Service missing ${key}(), using mock fallback.`);
      normalized[key] = mock[key].bind(mock);
    } else {
      console.error(`Service missing ${key}() and no mock fallback found.`);
    }
  };

  // Projects
  ensure("fetchList", ["listProjects", "list", "fetch"]);
  ensure("fetchProject", ["getProject", "fetchOne", "get"]);
  ensure("createProject", ["create", "newProject"]);
  ensure("renameProject", ["rename", "updateProject"]);
  ensure("deleteProject", ["delete", "removeProject"]);
  // Protocols
  ensure("fetchProtocolDetails", ["getProtocol", "getProtocolDetails"]);
  ensure("fetchNewProtocolDetails", ["getNewProtocol", "newProtocol"]);
  ensure("loadProtocols", ["listProtocols", "fetchProtocols"]);
  ensure("executeProtocol", ["runProtocol", "launchProtocol"]);
  ensure("saveProtocol", ["persistProtocol", "storeProtocol"]);

  return normalized;
}

/** Default mock service (keeps the widget functional without a backend) */
const defaultMockService: ProjectService = {
  async fetchList() {
    return [
      { id: "demo-1", name: "Demo Project 1", description: "Example project", createdAt: new Date().toISOString(), status: "idle" } as any,
      { id: "demo-2", name: "Demo Project 2", description: "Example project", createdAt: new Date().toISOString(), status: "running" } as any,
    ];
  },
  async fetchProject(projectId: string) {
    return { id: projectId, name: `Demo Project ${projectId}`, description: "This is a mock project", createdAt: new Date().toISOString(), status: "idle" } as any;
  },
  async createProject(payload: { name: string; description?: string }) {
    return { id: `mock-${Date.now()}`, name: payload.name, description: payload.description ?? "", createdAt: new Date().toISOString(), status: "idle" } as any;
  },
  async renameProject(id: string, newName: string, newDescription?: string) {
    console.warn("Mock renameProject called");
    return { id, name: newName, description: newDescription ?? "", updatedAt: new Date().toISOString(), status: "idle" } as any;
  },
  async deleteProject(_id: string) {
    console.warn("Mock deleteProject called");
    return { ok: true } as any;
  },
  async fetchProtocolDetails(projectId: string, protocolId: string) {
    console.warn("Mock fetchProtocolDetails called");
    return { id: protocolId, projectId, name: "Mock Protocol", status: "idle", params: {} } as any;
  },
  async fetchNewProtocolDetails(projectId: string, protocolClass: string) {
    console.warn("Mock fetchNewProtocolDetails called");
    return { id: `mock-${protocolClass}`, projectId, className: protocolClass, status: "idle", params: {} } as any;
  },
  async loadProtocols(_projectId: number) {
    console.warn("Mock loadProtocols called");
    return [
      { id: 1, label: "Mock Protocol A", status: "done" },
      { id: 2, label: "Mock Protocol B", status: "running" },
    ] as any;
  },
  async executeProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>) {
    console.warn("Mock executeProtocol called");
    return { success: true, message: `Executed mock protocol ${protocolId}`, protocolClassName, params } as any;
  },
  async saveProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>) {
    console.warn("Mock saveProtocol called");
    return { saved: true, protocolId, protocolClassName, params } as any;
  },
};

/** Public mount options */
export type MountOptions = {
  container: string | HTMLElement;
  service?: ProjectService;
  props?: Record<string, any>;
};

/** Public named export: robust mount with both React Query providers + Emotion cache */
export function mountProjectsWidget({ container, service, props }: MountOptions) {
  const doMount = () => {
    const target = typeof container === "string" ? document.querySelector(container) : container;
    if (!target) throw new Error(`ProjectsWidget: container '${container}' not found`);

    ensureDomRoots();

    const resolvedService = normalizeServiceAPI(service ?? defaultMockService);

    // React Query v5 client
    const queryClientV5 = new QueryClientV5({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    });

    // React Query v3 client
    const queryClientV3 = new QueryClientV3();

    // Emotion cache pointing to the host document head
    const emotionCache = createCache({
      key: "mpw",
      container: document.head,
      prepend: false,
    });

    const root = ReactDOM.createRoot(target as HTMLElement);
    root.render(
  <ProjectServiceProvider service={resolvedService}>
    <QueryClientProviderV3 client={queryClientV3}>
      <QueryClientProviderV5 client={queryClientV5}>
        <CacheProvider value={emotionCache}>
          <BrowserRouter>
            <HelmetProvider>
              <WidgetErrorBoundary>
                <Projects {...(props || {})} />
              </WidgetErrorBoundary>
            </HelmetProvider>
          </BrowserRouter>
        </CacheProvider>
      </QueryClientProviderV5>
    </QueryClientProviderV3>
  </ProjectServiceProvider>
);

    return { unmount: () => root.unmount(), root };
  };

  if (typeof document !== "undefined" && document.readyState === "loading") {
    const handle = () => {
      document.removeEventListener("DOMContentLoaded", handle);
      doMount();
    };
    document.addEventListener("DOMContentLoaded", handle);
    return { unmount() {}, root: null as any };
  }

  return doMount();
}

/** Optional alias export */
export { mountProjectsWidget as mount };

/** Attach to window for UMD usage (no default export) */
declare global {
  interface Window {
    MyProjectsWidget?: { mount: typeof mountProjectsWidget; mountProjectsWidget: typeof mountProjectsWidget };
  }
}

if (typeof window !== "undefined") {
  window.MyProjectsWidget = { mount: mountProjectsWidget, mountProjectsWidget };
  console.log("ProjectsWidget: entry-umd ready — window.MyProjectsWidget");
}
