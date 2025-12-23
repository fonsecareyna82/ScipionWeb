// src/entry-projectpage-umd.tsx
import "./pages/Dashboard/projects/ProjectPage.css";

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

/** Returns whether the host document is currently in dark mode */
function getHostIsDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function createAutoUnmountGuard(containerEl: HTMLElement, onCleanup: () => void) {
  // createAutoUnmountGuard
  let isDisposed = false;

  const dispose = () => {
    // disposeAutoUnmountGuard
    if (isDisposed) return;
    isDisposed = true;

    try {
      onCleanup();
    } catch {
      // noOp
    }

    try {
      observer.disconnect();
    } catch {
      // noOp
    }

    try {
      window.removeEventListener("beforeunload", dispose, true);
    } catch {
      // noOp
    }
  };

  const observer = new MutationObserver(() => {
    // autoUnmountWhenDetached
    if (!document.contains(containerEl)) dispose();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("beforeunload", dispose, true);

  return { dispose };
}


function inferWidgetCssHref(): string | null {
  // inferWidgetCssHref
  const scripts = Array.from(document.getElementsByTagName("script"));
  const widgetScript = scripts.find((s) => {
    const src = s.getAttribute("src") || "";
    return src.includes("projectpage-widget.js");
  });

  if (!widgetScript) return null;

  const src = widgetScript.getAttribute("src") || "";
  return src.replace(/projectpage-widget\.js(\?.*)?$/, "projectpage-widget.css$1");
}

function ensureWidgetCssLink(): { insertedByWidget: boolean } {
  // ensureWidgetCssLink
  const linkId = "projectpage-widget-css";
  const existing = document.getElementById(linkId) as HTMLLinkElement | null;
  if (existing) return { insertedByWidget: false };

  const href = inferWidgetCssHref();
  if (!href) return { insertedByWidget: false };

  const linkEl = document.createElement("link");
  linkEl.id = linkId;
  linkEl.rel = "stylesheet";
  linkEl.href = href;
  linkEl.setAttribute("data-inserted-by-widget", "1");
  document.head.appendChild(linkEl);

  return { insertedByWidget: true };
}

function removeWidgetCssLinkIfInserted() {
  // removeWidgetCssLinkIfInserted
  const linkEl = document.getElementById("projectpage-widget-css") as HTMLLinkElement | null;
  if (!linkEl) return;

  const inserted = linkEl.getAttribute("data-inserted-by-widget") === "1";
  if (!inserted) return;

  try {
    linkEl.parentNode?.removeChild(linkEl);
  } catch {
    // noOp
  }
}


/** Keeps widget shell's dark class in sync with the host document */
function syncShellDarkMode(shell: HTMLElement) {
  const apply = () => {
    shell.classList.toggle("dark", getHostIsDark());
  };

  apply();

  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}

/** Creates an isolated widget shell with a scoped root class */
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
    // If the host already provides a portal root, do not duplicate it.
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
  return new Error(
    `ProjectPageWidget: service is missing required method '${methodName}'`,
  );
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
        return;
      }
    }
  };

  const ensureFn = (name: string, impl: (...args: any[]) => any) => {
    if (typeof normalized[name] !== "function") {
      normalized[name] = impl;
    }
  };

  // projects
  mapFn("fetchList", "listProjects", "list", "fetch");
  mapFn("fetchProject", "getProject", "fetchOne", "get");
  mapFn("createProject", "createProject", "create", "newProject");
  mapFn("renameProject", "renameProject", "rename", "updateProject");
  mapFn("deleteProject", "deleteProject", "delete", "remove", "removeProject");

  // workflows
  mapFn(
    "fetchProjectWorkflows",
    "listProjectWorkflows",
    "listWorkflows",
    "fetchWorkflows",
  );
  mapFn(
    "applyWorkflowToProject",
    "applyWorkflow",
    "applyTemplateToProject",
    "runWorkflowOnProject",
  );

  // protocols
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

  // file / previews
  mapFn("resolveProtocolStartPath", "resolveProtocolStartPath");
  mapFn("listRemoteDirectory", "listRemoteDirectory");
  mapFn("previewProtocolText", "previewProtocolText");
  mapFn("buildProtocolDownloadUrl", "buildProtocolDownloadUrl");
  mapFn(
    "fetchProtocolInlinePreviewBlob",
    "previewInlineBlob",
    "getInlinePreviewBlob",
  );
  mapFn("fetchOutputPreview", "previewOutput", "getOutputPreview");

  const rawExecute =
    typeof normalized.executeProtocol === "function"
      ? normalized.executeProtocol
      : null;
  const rawSave =
    typeof normalized.saveProtocol === "function"
      ? normalized.saveProtocol
      : null;

  ensureFn("executeProtocol", async () => {
    throw createMissingServiceMethodError("executeProtocol");
  });

  ensureFn("saveProtocol", async () => {
    throw createMissingServiceMethodError("saveProtocol");
  });

  // Support both standard and legacy execute signatures
  normalized.executeProtocol = async (
    projectId: any,
    protocolId: any,
    protocolClassName: string,
    params: any,
  ) => {
    const fn = rawExecute ?? normalized.executeProtocol;
    try {
      return await fn.call(
        normalized,
        projectId,
        protocolId,
        protocolClassName,
        params,
      );
    } catch (err) {
      return await fn.call(normalized, protocolId, protocolClassName, params);
    }
  };

  // Support both standard and legacy save signatures
  normalized.saveProtocol = async (
    projectId: any,
    protocolId: any,
    protocolClassName: string,
    params: any,
  ) => {
    const fn = rawSave ?? normalized.saveProtocol;
    try {
      return await fn.call(
        normalized,
        projectId,
        protocolId,
        protocolClassName,
        params,
      );
    } catch (err) {
      return await fn.call(normalized, protocolId, protocolClassName, params);
    }
  };

  // Safe defaults for non-core features (avoid hard crashes in embedded contexts)
  ensureFn("fetchProjectWorkflows", async () => []);
  ensureFn("applyWorkflowToProject", async () => ({ success: true }));
  ensureFn(
    "fetchCoords3dTomogramSliceObjectUrl",
    async (
      _p: any,
      _pid: any,
      _o: any,
      _t: any,
      sliceIndex: number,
    ) => ({
      url: mockSliceDataUrl(sliceIndex),
      revoke: () => { },
    }),
  );

  return normalized as ProjectService;
}

/** Default minimal mock service (fallback) */
const defaultMockService: ProjectService = {
  async fetchList() {
    return [
      {
        id: "demo",
        name: "Demo project",
        createdAt: new Date().toISOString(),
        status: "idle",
      },
    ] as any;
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

/** Public mount function */
export function mountProjectPageWidget({
  container,
  service,
  projectName,
}: ProjectPageMountOptions) {
  const target =
    typeof container === "string" ? document.querySelector(container) : container;

  if (!target) {
    throw new Error(`ProjectPageWidget: container '${container}' not found`);
  }

  const { shell, mountPoint } = createWidgetShell(target as HTMLElement);
  const stopSyncDarkMode = syncShellDarkMode(shell);

  const svc = normalizeServiceAPI(service ?? defaultMockService);

  const qcV5 = new QueryClientV5({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const qcV3 = new QueryClientV3();

  const emotionCache = createCache({
    key: "mpw",
    container: shell,
    prepend: false,
  });

  const initialPath = `/project/load/${encodeURIComponent(projectName)}`;

  const root = ReactDOM.createRoot(mountPoint);

  let didUnmount = false;

  const doUnmount = () => {
    // doUnmount
    if (didUnmount) return;
    didUnmount = true;

    try {
      root.unmount();
    } catch {
      // noOp
    }

    try {
      stopSyncDarkMode();
    } catch {
      // noOp
    }

    try {
      (target as HTMLElement).removeChild(shell);
    } catch {
      // noOp
    }
  };

  const guard = createAutoUnmountGuard(shell, doUnmount);
  const { insertedByWidget } = ensureWidgetCssLink();

  try {
    if (insertedByWidget) removeWidgetCssLinkIfInserted();
  } catch {
    // noOp
  }

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
      guard.dispose(); // triggers doUnmount once
    },
    root,
  };
}


/** Attach to window for UMD usage (no default export) */
if (typeof window !== "undefined") {
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;
  (window as any).MyProjectsWidget = { ...(prev || {}), mountProjectPageWidget };
  // eslint-disable-next-line no-console
  console.log("ProjectPageWidget: ready under window.MyProjectsWidget");
}
