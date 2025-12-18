// src/entry-projectpage-umd.tsx
import "./projectpage.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";

import {
  QueryClient as QueryClientV5,
  QueryClientProvider as QueryClientProviderV5,
} from "@tanstack/react-query";

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

function createWidgetShell(target: HTMLElement) {
  const shell = document.createElement("div");
  shell.className = "projectpage-widget-root";
  shell.style.display = "flex";
  shell.style.flexDirection = "column";
  shell.style.height = "100%";
  shell.style.minHeight = "0";

  const portals = document.createElement("div");
  portals.style.display = "contents";

  const ensurePortal = (id: string) => {
    if (document.getElementById(id)) return;
    const el = document.createElement("div");
    el.id = id;
    portals.appendChild(el);
  };

  // createPortalsInsideShell
  ensurePortal("portal-root");
  ensurePortal("modal-root");
  ensurePortal("drawer-root");
  ensurePortal("toast-root");

  const mountPoint = document.createElement("div");
  mountPoint.style.flex = "1";
  mountPoint.style.minHeight = "0";
  mountPoint.style.display = "flex";
  mountPoint.style.flexDirection = "column";

  shell.appendChild(portals);
  shell.appendChild(mountPoint);

  target.appendChild(shell);

  return { shell, mountPoint };
}

/** Tiny helper to produce a mock data URL slice image */
const mockSliceDataUrl = (sliceIndex: number) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="100%" height="100%" fill="#eeeeee"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
          font-size="18" fill="#333333">Slice ${sliceIndex}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

function createMissingServiceMethodError(methodName: string) {
  return new Error(`ProjectPageWidget: service is missing required method '${methodName}'`);
}

// normalizeServiceAPI: keepYourExistingImplementationHere
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
        return;
      }
    }
  };

  const ensureFn = (name: string, impl: (...args: any[]) => any) => {
    if (typeof normalized[name] !== "function") {
      normalized[name] = impl;
    }
  };

  mapFn("fetchList", "listProjects", "list", "fetch");
  mapFn("fetchProject", "getProject", "fetchOne", "get");
  mapFn("createProject", "createProject", "create", "newProject");
  mapFn("renameProject", "renameProject", "rename", "updateProject");
  mapFn("deleteProject", "deleteProject", "delete", "remove", "removeProject");

  mapFn("fetchProjectWorkflows", "listProjectWorkflows", "listWorkflows", "fetchWorkflows");
  mapFn("applyWorkflowToProject", "applyWorkflow", "applyTemplateToProject", "runWorkflowOnProject");

  mapFn("fetchProtocolDetails", "getProtocol", "getProtocolDetails");
  mapFn("fetchNewProtocolDetails", "getNewProtocol", "newProtocol");
  mapFn("loadProtocols", "listProtocols", "fetchProtocols", "getProtocols");

  mapFn("executeProtocol", "runProtocol", "launchProtocol", "execute");
  mapFn("saveProtocol", "persistProtocol", "storeProtocol", "save");

  mapFn("renameProtocol", "renameProtocol");
  mapFn("duplicateProtocol", "duplicateProtocol");
  mapFn("deleteProtocol", "deleteProtocol");
  mapFn("restartAll", "restartAll");
  mapFn("continueAll", "continueAll");
  mapFn("resetFrom", "resetFrom");
  mapFn("stopProtocol", "stopProtocol");

  mapFn("resolveProtocolStartPath", "resolveProtocolStartPath");
  mapFn("listRemoteDirectory", "listRemoteDirectory");
  mapFn("previewProtocolText", "previewProtocolText");
  mapFn("buildProtocolDownloadUrl", "buildProtocolDownloadUrl");
  mapFn("fetchProtocolInlinePreviewBlob", "previewInlineBlob", "getInlinePreviewBlob");

  mapFn("fetchOutputPreview", "previewOutput", "getOutputPreview");

  const rawExecute = typeof normalized.executeProtocol === "function" ? normalized.executeProtocol : null;
  const rawSave = typeof normalized.saveProtocol === "function" ? normalized.saveProtocol : null;

  ensureFn("executeProtocol", async () => {
    throw createMissingServiceMethodError("executeProtocol");
  });
  ensureFn("saveProtocol", async () => {
    throw createMissingServiceMethodError("saveProtocol");
  });

  normalized.executeProtocol = async (projectId: any, protocolId: any, protocolClassName: string, params: any) => {
    const fn = rawExecute ?? normalized.executeProtocol;
    try {
      return await fn.call(normalized, projectId, protocolId, protocolClassName, params);
    } catch (err) {
      return await fn.call(normalized, protocolId, protocolClassName, params);
    }
  };

  normalized.saveProtocol = async (projectId: any, protocolId: any, protocolClassName: string, params: any) => {
    const fn = rawSave ?? normalized.saveProtocol;
    try {
      return await fn.call(normalized, projectId, protocolId, protocolClassName, params);
    } catch (err) {
      return await fn.call(normalized, protocolId, protocolClassName, params);
    }
  };

  // safeDefaultsForNonCoreFeatures
  ensureFn("fetchProjectWorkflows", async () => []);
  ensureFn("applyWorkflowToProject", async () => ({ success: true }));
  ensureFn("fetchCoords3dTomogramSliceObjectUrl", async (_p: any, _pid: any, _o: any, _t: any, sliceIndex: number) => ({
    url: mockSliceDataUrl(sliceIndex),
    revoke: () => {},
  }));

  return normalized as ProjectService;
}

const defaultMockService: ProjectService = {
  async fetchList() {
    return [{ id: "demo", name: "Demo project", createdAt: new Date().toISOString(), status: "idle" }] as any;
  },
  async fetchProject(id: any) {
    return {
      id,
      name: `Demo Project ${String(id)}`,
      shortName: `demo-${String(id)}`,
      createdAt: new Date().toISOString(),
      status: "idle",
      protocols: [],
    } as any;
  },
  async fetchProtocolDetails(_projectId: any, protocolId: any) {
    return { id: protocolId, protocolClassName: "DemoProtocol", params: {} } as any;
  },
  async fetchNewProtocolDetails(_projectId: any, protocolClass: string) {
    return { id: "new", protocolClassName: protocolClass, params: {} } as any;
  },
} as any;

export type InitialProps = {
  initialProject?: any;
  initialProtocols?: any[];
  initialProtocolsMap?: Record<string, any>;
  cacheAliases?: { byId?: string; byShortName?: string; byName?: string };
  [k: string]: any;
};

export type ProjectPageMountOptions = {
  container: string | HTMLElement;
  service?: ProjectService;
  projectName: string;
  props?: InitialProps;
};

export function mountProjectPageWidget({ container, service, projectName }: ProjectPageMountOptions) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error(`ProjectPageWidget: container '${container}' not found`);

  const { mountPoint } = createWidgetShell(target as HTMLElement);

  const svc = normalizeServiceAPI(service ?? defaultMockService);

  const qcV5 = new QueryClientV5({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const qcV3 = new QueryClientV3();

  const emotionCache = createCache({ key: "mpw", container: document.head, prepend: false });

  const initialPath = `/project/load/${encodeURIComponent(projectName)}`;

  const root = ReactDOM.createRoot(mountPoint);
  root.render(
    <ProjectServiceProvider service={svc}>
      <QueryClientProviderV3 client={qcV3}>
        <QueryClientProviderV5 client={qcV5}>
          <CacheProvider value={emotionCache}>
            <MemoryRouter initialEntries={[initialPath]}>
              <HelmetProvider>
                <WidgetErrorBoundary>
                  <DragProvider>
                    <Routes>
                      <Route path="/project/load/:projectName" element={<ProjectPage />} />
                      <Route path="*" element={<Navigate to={initialPath} replace />} />
                    </Routes>
                  </DragProvider>
                </WidgetErrorBoundary>
              </HelmetProvider>
            </MemoryRouter>
          </CacheProvider>
        </QueryClientProviderV5>
      </QueryClientProviderV3>
    </ProjectServiceProvider>,
  );

  return {
    unmount() {
      root.unmount();
      try {
        (target as HTMLElement).removeChild(mountPoint.parentElement as HTMLElement);
      } catch {
        // noOp
      }
    },
    root,
  };
}

if (typeof window !== "undefined") {
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;
  (window as any).MyProjectsWidget = { ...(prev || {}), mountProjectPageWidget };
  // eslint-disable-next-line no-console
  console.log("ProjectPageWidget: ready under window.MyProjectsWidget");
}
