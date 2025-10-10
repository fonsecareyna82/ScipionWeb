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
    // Render-friendly error on host page + console diagnostic
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

/** Minimal mock to keep the widget usable without a host service */
const defaultMockService: ProjectService = {
  async fetchList() {
    // eslint-disable-next-line no-console
    console.log("[mock] fetchList()");
    return [
      { id: "demo-1", name: "Demo Project 1", description: "Example", createdAt: new Date().toISOString(), status: "idle" },
    ];
  },
  async fetchProject(projectId: string) {
    // eslint-disable-next-line no-console
    console.log("[mock] fetchProject()", projectId);
    return { id: projectId, name: `Demo ${projectId}`, description: "", createdAt: new Date().toISOString(), status: "idle" } as any;
  },
  async fetchProtocolDetails() { return { id: "p1", params: {} } as any; },
  async fetchNewProtocolDetails() { return { id: "new", params: {} } as any; },
  async createProject(payload) { return { id: `mock-${Date.now()}`, name: payload.name, description: payload.description ?? "" } as any; },
  async renameProject(id, name, description) { return { id, name, description } as any; },
  async deleteProject(_id) { return { ok: true } as any; },
  async loadProtocols() { return []; },
  async executeProtocol() { return { ok: true } as any; },
  async saveProtocol() { return { ok: true } as any; },
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
  ["modal-root","drawer-root","toast-root","portal-root","app","root"].forEach((id) => {
    if (!document.getElementById(id)) {
      const d = document.createElement("div");
      d.id = id; document.body.appendChild(d);
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
    unmount() { root.unmount(); },
    root,
  };
}

/** Attach to window using the shared WidgetGlobal type */

// Keep the global type consistent with your d.ts
declare global {
  interface Window { MyProjectsWidget?: WidgetGlobal }
}

if (typeof window !== "undefined") {
  // Get previous global (typed)
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;

  // Build next object by merging previous keys and adding the list mounts
  const next: WidgetGlobal = {
    ...(prev || {}),
    mount: mount,
    mountProjectsWidget: mount,
    // do NOT touch mountProjectPageWidget here; preserve it if prev had it
  };

  (window as any).MyProjectsWidget = next;
  // eslint-disable-next-line no-console
  console.log("ProjectsWidget: entry-umd ready — window.MyProjectsWidget");
}


