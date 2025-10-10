import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

// React Query v5
import {
  QueryClient as QueryClientV5,
  QueryClientProvider as QueryClientProviderV5,
} from "@tanstack/react-query";

// React Query v3 (legacy)
import {
  QueryClient as QueryClientV3,
  QueryClientProvider as QueryClientProviderV3,
} from "react-query";

import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { HelmetProvider } from "react-helmet-async";

import { ProjectServiceProvider } from "./ProjectServiceContext";
import { DragProvider } from "./components/protocol/DragContext";
import type { ProjectService } from "./services/ProjectService";
import type { WidgetGlobal } from "./types/global-widget";
import ProjectPage from "./pages/Dashboard/projects/ProjectPage";

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
    console.error("[ProjectPageWidget] error:", err, info);
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
        ProjectPageWidget error:
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

/** Normalize external service into ProjectService contract */
function normalizeServiceAPI(srv: any): ProjectService {
  if (!srv || typeof srv !== "object") {
    throw new Error("ProjectPageWidget: invalid service object");
  }
  const normalized: any = { ...srv };
  const mapFn = (to: string, ...cands: string[]) => {
    if (typeof normalized[to] === "function") return;
    for (const c of cands) {
      if (typeof normalized[c] === "function") {
        normalized[to] = normalized[c].bind(normalized);
        if (process.env.NODE_ENV !== "production") {
          console.log(`normalizeServiceAPI: mapped ${c} → ${to}`);
        }
        return;
      }
    }
  };
  // projects
  mapFn("fetchList", "listProjects", "list", "fetch");
  mapFn("fetchProject", "getProject", "fetchOne", "get");
  mapFn("createProject", "create", "newProject");
  mapFn("renameProject", "rename", "updateProject");
  mapFn("deleteProject", "delete", "remove", "removeProject");
  // protocols
  mapFn("fetchProtocolDetails", "getProtocol", "getProtocolDetails");
  mapFn("fetchNewProtocolDetails", "getNewProtocol", "newProtocol");
  mapFn("loadProtocols", "listProtocols", "fetchProtocols", "getProtocols");
  mapFn("executeProtocol", "runProtocol", "launchProtocol", "execute");
  mapFn("saveProtocol", "persistProtocol", "storeProtocol", "save");
  return normalized as ProjectService;
}

/** Default minimal mock service (fallback) */
const defaultMockService: ProjectService = {
  async fetchList() {
    return [{ id: "demo", name: "Demo project", createdAt: new Date().toISOString(), status: "idle" }];
  },
  async fetchProject(id: string) {
    return {
      id,
      name: `Demo Project ${id}`,
      shortName: `demo-${id}`,
      createdAt: new Date().toISOString(),
      status: "idle",
      protocols: [],
    } as any;
  },
  async fetchProtocolDetails(_projectId: string, protocolId: string) {
    return { id: protocolId, protocolClassName: "DemoProtocol", params: {} } as any;
  },
  async fetchNewProtocolDetails(_projectId: string, protocolClass: string) {
    return { id: "new", protocolClassName: protocolClass, params: {} } as any;
  },
  async createProject(payload) {
    return { id: "created", name: payload.name, description: payload.description ?? "", status: "idle" } as any;
  },
  async renameProject() { return { success: true } as any; },
  async deleteProject() { return { success: true } as any; },
  async loadProtocols() { return [] as any; },
  async executeProtocol() { return { success: true } as any; },
  async saveProtocol() { return { success: true } as any; },
};

/** Optional initial props passed by the host page (e.g., Flask) */
type InitialProps = {
  /** Preload the current project */
  initialProject?: any;
  /** Preload protocols of the current project (array) */
  initialProtocols?: any[];
  /** Also pass the original map to serve fetchProtocolDetails by id */
  initialProtocolsMap?: Record<string, any>;
  /** Cache aliases to seed multiple keys */
  cacheAliases?: { byId?: string; byShortName?: string; byName?: string };
  [k: string]: any;
};

/** Wrap service to serve initial project/protocols once, then delegate */
function withInitialProjectOnce(service: ProjectService, props?: InitialProps, projectKey?: string): ProjectService {
  if (!props) return service;
  let servedProject = false;
  let servedProtocols = false;
  const project = props.initialProject;
  const protocols = props.initialProtocols;
  const protocolsMap = props.initialProtocolsMap || {};

  const keyMatches = (k: any) => {
    const asStr = String(k ?? "");
    const id = String(props.cacheAliases?.byId ?? project?.id ?? "");
    const shortName = String(props.cacheAliases?.byShortName ?? project?.shortName ?? "");
    const name = String(props.cacheAliases?.byName ?? project?.name ?? "");
    return (
      asStr === id ||
      asStr === shortName ||
      asStr === name ||
      asStr === projectKey
    );
  };

  return {
    ...service,
    async fetchProject(projectId: string) {
      if (!servedProject && project && keyMatches(projectId)) {
        servedProject = true;
        console.log("[svc.hit] fetchProject -> initialProject");
        return project;
      }
      console.log("[svc.net] fetchProject(", projectId, ")");
      return service.fetchProject(projectId);
    },
    async loadProtocols(projectId: number | string) {
      if (!servedProtocols && Array.isArray(protocols) && keyMatches(projectId)) {
        servedProtocols = true;
        console.log("[svc.hit] loadProtocols -> initialProtocols");
        return protocols;
      }
      console.log("[svc.net] loadProtocols(", projectId, ")");
      return service.loadProtocols(projectId as number);
    },
    async fetchProtocolDetails(projectIdLike: string, protocolId: string) {
      if (keyMatches(projectIdLike) && protocolId && protocolsMap[protocolId]) {
        console.log("[svc.hit] fetchProtocolDetails -> initialProtocolsMap[", protocolId, "]");
        return protocolsMap[protocolId];
      }
      console.log("[svc.net] fetchProtocolDetails(", projectIdLike, ",", protocolId, ")");
      return service.fetchProtocolDetails(projectIdLike, protocolId);
    },
  };
}

/** Public mount function */
export function mountProjectPageWidget({
  container,
  service,
  projectName,
  props,
}: {
  container: string | HTMLElement;
  service?: ProjectService;
  projectName: string;                 // what ProjectPage expects in useParams()
  props?: InitialProps;
}) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error(`ProjectPageWidget: container '${container}' not found`);

  ensureDomRoots();

  // normalize & wrap the service
  const base = normalizeServiceAPI(service ?? defaultMockService);

  // React Query clients
  const qcV5 = new QueryClientV5({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const qcV3 = new QueryClientV3();

  // Preload caches using multiple alias keys so the Page finds them
  const idKey = String(props?.cacheAliases?.byId ?? props?.initialProject?.id ?? projectName);
  const shortKey = String(props?.cacheAliases?.byShortName ?? props?.initialProject?.shortName ?? "");
  const nameKey = String(props?.cacheAliases?.byName ?? props?.initialProject?.name ?? "");

  const seed = (key: any[]) => {
    try { qcV5.setQueryData(key, props?.initialProject); } catch {}
    try { (qcV3 as any).setQueryData(key, props?.initialProject); } catch {}
  };
  if (props?.initialProject) {
    seed(["project", idKey]);
    if (shortKey) seed(["project", shortKey]);
    if (nameKey) seed(["project", nameKey]);
  }
  if (props?.initialProtocols && Array.isArray(props.initialProtocols)) {
    const put = (key: any[]) => {
      try { qcV5.setQueryData(key, props.initialProtocols); } catch {}
      try { (qcV3 as any).setQueryData(key, props.initialProtocols); } catch {}
    };
    put(["protocols", idKey]);
    if (shortKey) put(["protocols", shortKey]);
    if (nameKey) put(["protocols", nameKey]);
  }

  const svcWrapped = withInitialProjectOnce(base, props, idKey);

  // Emotion cache renders styles into host <head>
  const emotionCache = createCache({ key: "mpw", container: document.head, prepend: false });

  // Align URL to the route ProjectPage uses and render with <Routes>
  try {
    const desired = `/project/load/${encodeURIComponent(projectName)}`;
    if (typeof window !== "undefined" && window.location && window.history) {
      if (window.location.pathname !== desired) {
        window.history.replaceState(null, "", desired);
      }
    }
  } catch {}

  const root = ReactDOM.createRoot(target as HTMLElement);
  root.render(
    <ProjectServiceProvider service={svcWrapped}>
      <QueryClientProviderV3 client={qcV3}>
        <QueryClientProviderV5 client={qcV5}>
          <CacheProvider value={emotionCache}>
            <BrowserRouter>
              <HelmetProvider>
                <WidgetErrorBoundary>
                  <DragProvider>
                    <Routes>
                      {/* exact route expected by ProjectPage (so useParams() works) */}
                      <Route path="/project/load/:projectName" element={<ProjectPage />} />
                      {/* on first paint, ensure we are on the expected URL */}
                      <Route path="*" element={<Navigate to={`/project/load/${encodeURIComponent(projectName)}`} replace />} />
                    </Routes>
                  </DragProvider>
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
    root,
  };
}

/** Attach to window for UMD usage (no default export) */
if (typeof window !== "undefined") {
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;
  (window as any).MyProjectsWidget = {
    ...(prev || {}),
    mountProjectPageWidget,
  };
  // eslint-disable-next-line no-console
  console.log("ProjectPageWidget: ready under window.MyProjectsWidget");
}
