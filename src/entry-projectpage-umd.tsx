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
import { ThemeProvider } from "./context/ThemeContext";
import type { ProjectService } from "./services/ProjectService";
import type { WidgetGlobal } from "./types/global-widget";
import { WIDGET_BUILD_TIMESTAMP } from "./buildInfo";
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

function getHostIsDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function createAutoUnmountGuard(containerEl: HTMLElement, onCleanup: () => void) {
  let isDisposed = false;

  const dispose = () => {
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
    if (!document.contains(containerEl)) dispose();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("beforeunload", dispose, true);

  return { dispose };
}

function ensureExplicitWidgetCssLink(cssHref?: string): () => void {
  if (!cssHref) return () => { };

  const linkId = "projectpage-widget-css";
  const existing = document.getElementById(linkId);
  if (existing) return () => { };

  const linkEl = document.createElement("link");
  linkEl.id = linkId;
  linkEl.rel = "stylesheet";
  linkEl.href = cssHref;
  linkEl.setAttribute("data-inserted-by-widget", "1");
  document.head.appendChild(linkEl);

  return () => {
    try {
      linkEl.parentNode?.removeChild(linkEl);
    } catch {
      // noOp
    }
  };
}

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

  const callWithFallbackArgs = async <T,>(
    fn: (...args: any[]) => Promise<T>,
    primaryArgs: any[],
    fallbackArgs?: any[],
  ): Promise<T> => {
    try {
      return await fn.apply(normalized, primaryArgs);
    } catch (err) {
      if (!fallbackArgs) throw err;
      try {
        return await fn.apply(normalized, fallbackArgs);
      } catch {
        throw err;
      }
    }
  };

  mapFn("resolveBackendUrl", "resolveBackendUrl");
  mapFn("fetchJsonUrl", "fetchJsonUrl");
  mapFn("fetchBlobObjectUrl", "fetchBlobObjectUrl");

  mapFn("fetchList", "listProjects", "list", "fetch");
  mapFn("fetchProject", "getProject", "fetchOne", "get");
  mapFn("createProject", "createProject", "create", "newProject");
  mapFn("importProject", "importProject");
  mapFn("renameProject", "renameProject", "rename", "updateProject");
  mapFn("deleteProject", "deleteProject", "delete", "remove", "removeProject");

  mapFn("fetchProjectThumbnailItems", "fetchProjectThumbnailItems", "listProjectThumbnailItems");
  mapFn(
    "fetchProjectThumbnailObjectUrl",
    "fetchProjectThumbnailObjectUrl",
    "fetchProjectThumbnail",
    "getProjectThumbnailObjectUrl",
  );

  mapFn("fetchWorkflows", "listProjectWorkflows", "listWorkflows", "fetchWorkflows");
  mapFn("loadWorkflow", "applyWorkflow", "applyTemplateToProject", "runWorkflowOnProject");

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

  mapFn("fetchInstanceSettings", "fetchInstanceSettings", "getInstanceSettings");
  mapFn("updateInstanceSettings", "updateInstanceSettings", "patchInstanceSettings");
  mapFn("putInstanceSettings", "putInstanceSettings", "updateInstanceSettings");
  mapFn("patchInstanceSettings", "patchInstanceSettings");
  mapFn("fetchUserSettings", "fetchUserSettings", "getUserSettings");
  mapFn("putUserSettings", "putUserSettings", "updateUserSettings");
  mapFn("patchUserSettings", "patchUserSettings");
  mapFn("fetchEnvironmentVariables", "fetchEnvironmentVariables", "getEnvironmentVariables");
  mapFn("patchEnvironmentVariables", "patchEnvironmentVariables", "updateEnvironmentVariables");
  mapFn("fetchHostSettings", "fetchHostSettings", "getHostSettings");
  mapFn("putHostSettings", "putHostSettings", "updateHostSettings");
  mapFn("patchHostSettings", "patchHostSettings");
  mapFn("fetchProjectEffectiveSettings", "fetchProjectEffectiveSettings", "getProjectEffectiveSettings");

  mapFn("listProjectTags", "listProjectTags", "getProjectTags", "fetchProjectTags", "listTags", "getTags");
  mapFn("createProjectTag", "createProjectTag", "addProjectTag", "createTag", "postProjectTag");
  mapFn("updateProjectTag", "updateProjectTag", "editProjectTag", "patchProjectTag", "updateTag");
  mapFn("deleteProjectTag", "deleteProjectTag", "removeProjectTag", "deleteTag", "removeTag");
  mapFn("listProtocolTagIds", "listProtocolTagIds", "getProtocolTagIds", "fetchProtocolTagIds");
  mapFn("setProtocolTagIds", "setProtocolTagIds", "setProtocolTags", "updateProtocolTagIds", "saveProtocolTagIds");

  mapFn("getNextProtocolSuggestions", "nextProtocolSuggestions");
  mapFn("getContextMenuVisibilityPolicy", "contextMenuVisibilityPolicy");

  mapFn("resolveBrowserPaths", "resolveBrowserPaths", "resolveProtocolStartPath");
  mapFn("listRemoteDirectory", "listRemoteDirectory");
  mapFn("previewProtocolText", "previewProtocolText");
  mapFn("previewRemoteEntry", "previewRemoteEntry");
  mapFn("buildProtocolDownloadUrl", "buildProtocolDownloadUrl");
  mapFn("fetchProtocolInlinePreviewBlob", "previewInlineBlob", "getInlinePreviewBlob", "downloadInlinePreviewBlob");
  mapFn("fetchOutputPreview", "previewOutput", "getOutputPreview");

  mapFn("fetchProtocolLogChannels", "fetchProtocolLogChannels", "getProtocolLogChannels");
  mapFn("fetchProtocolLogsChunk", "fetchProtocolLogsChunk", "getProtocolLogsChunk");

  mapFn("fetchFscRows", "fetchFscRows", "getFscRows");
  mapFn("listOutputVolumes", "listOutputVolumes");
  mapFn("getVolumeInfo", "getVolumeInfo");
  mapFn("getVolumeHistogram", "getVolumeHistogram");
  mapFn("buildVolumeSliceUrl", "buildVolumeSliceUrl");
  mapFn("fetchVolumeSliceObjectUrl", "fetchVolumeSliceObjectUrl");
  mapFn("getVolumeData3d", "getVolumeData3d");

  mapFn("listCoords3dTomograms", "listCoords3dTomograms");
  mapFn("fetchCoords3dForTomogram", "fetchCoords3dForTomogram");
  mapFn("fetchCoords3dTomogramSliceObjectUrl", "fetchCoords3dTomogramSliceObjectUrl");
  mapFn("createCoords3dOutputFromPoints", "createCoords3dOutputFromPoints");

  mapFn("fetchOutputMetadataTables", "fetchOutputMetadataTables");
  mapFn("fetchMetadataTableSchema", "fetchMetadataTableSchema");
  mapFn("fetchMetadataTablePage", "fetchMetadataTablePage");
  mapFn("exportMetadataTable", "exportMetadataTable");
  mapFn("fetchMetadataTableWindow", "fetchMetadataTableWindow");
  mapFn("fetchMetadataImageCellObjectUrl", "fetchMetadataImageCellObjectUrl");
  mapFn("getMetadataImageCellUrl", "getMetadataImageCellUrl");
  mapFn("runMetadataTableAction", "runMetadataTableAction");

  mapFn("resolveTableViewPane", "resolveTableViewPane", "getTableViewPane");
  mapFn("createTableViewSubset", "createTableViewSubset");

  mapFn("listOutputTiltSeries", "listOutputTiltSeries");
  mapFn("fetchTiltSeriesFrames", "fetchTiltSeriesFrames");
  mapFn("fetchTiltSeriesViewImageObjectUrl", "fetchTiltSeriesViewImageObjectUrl");
  mapFn("createNewSetOfTiltSeries", "createNewSetOfTiltSeries");

  mapFn("listOutputCTFTomoSeries", "listOutputCTFTomoSeries");
  mapFn("fetchCTFTomoSeriesViews", "fetchCTFTomoSeriesViews");
  mapFn("createNewSetOfCTFTomoSeries", "createNewSetOfCTFTomoSeries");
  mapFn("fetchCTFPsdImage", "fetchCTFPsdImage");

  mapFn("listUsers", "listUsers");
  mapFn("shareProject", "shareProject");
  mapFn("listProjectShares", "listProjectShares");
  mapFn("revokeProjectShare", "revokeProjectShare");
  mapFn("executeProtocolWizard", "executeProtocolWizard");
  mapFn("exportProtocols", "exportProtocols");
  mapFn("writeRemoteFile", "writeRemoteFile");
  mapFn(
    "resolveAnalyzeViewer",
    "resolveAnalyzeViewer",
    "resolveAnalyzeOutputViewer",
    "resolveAnalyzeViewerDecision",
    "analyzeViewerResolve",
  );

  const rawExecute = typeof normalized.executeProtocol === "function" ? normalized.executeProtocol : null;
  const rawSave = typeof normalized.saveProtocol === "function" ? normalized.saveProtocol : null;
  const rawListProjectTags = typeof normalized.listProjectTags === "function" ? normalized.listProjectTags : null;
  const rawCreateProjectTag = typeof normalized.createProjectTag === "function" ? normalized.createProjectTag : null;
  const rawUpdateProjectTag = typeof normalized.updateProjectTag === "function" ? normalized.updateProjectTag : null;
  const rawDeleteProjectTag = typeof normalized.deleteProjectTag === "function" ? normalized.deleteProjectTag : null;
  const rawListProtocolTagIds = typeof normalized.listProtocolTagIds === "function" ? normalized.listProtocolTagIds : null;
  const rawSetProtocolTagIds = typeof normalized.setProtocolTagIds === "function" ? normalized.setProtocolTagIds : null;
  const rawGetNextProtocolSuggestions = typeof normalized.getNextProtocolSuggestions === "function" ? normalized.getNextProtocolSuggestions : null;

  ensureFn("fetchList", async () => []);
  ensureFn("fetchProject", async (id: any) => ({
    id,
    name: `Demo Project ${String(id)}`,
    shortName: `demo-${String(id)}`,
    createdAt: new Date().toISOString(),
    status: "idle",
    protocols: [],
  }));
  ensureFn("fetchProtocolDetails", async (_projectId: any, protocolId: any) => ({
    id: protocolId,
    protocolClassName: "DemoProtocol",
    params: {},
  }));
  ensureFn("fetchNewProtocolDetails", async (_projectId: any, protocolClass: string) => ({
    id: "new",
    protocolClassName: protocolClass,
    params: {},
  }));

  ensureFn("loadProtocols", async () => []);
  ensureFn("fetchWorkflows", async () => []);
  ensureFn("loadWorkflow", async () => ({ success: true }));
  ensureFn("listProjectTags", async () => []);
  ensureFn("listProtocolTagIds", async () => []);
  ensureFn("createProjectTag", async () => { throw createMissingServiceMethodError("createProjectTag"); });
  ensureFn("updateProjectTag", async () => { throw createMissingServiceMethodError("updateProjectTag"); });
  ensureFn("deleteProjectTag", async () => { throw createMissingServiceMethodError("deleteProjectTag"); });
  ensureFn("setProtocolTagIds", async () => { throw createMissingServiceMethodError("setProtocolTagIds"); });
  ensureFn("executeProtocol", async () => { throw createMissingServiceMethodError("executeProtocol"); });
  ensureFn("saveProtocol", async () => { throw createMissingServiceMethodError("saveProtocol"); });
  ensureFn("resolveAnalyzeViewer", async () => ({ handled: false } as any));
  ensureFn("getNextProtocolSuggestions", async () => []);
  ensureFn("getContextMenuVisibilityPolicy", async () => ({}));
  ensureFn("fetchProjectThumbnailItems", async () => []);
  ensureFn("fetchWorkflows", async () => []);
  ensureFn("fetchProtocolLogChannels", async () => ({ channels: [] }));
  ensureFn("fetchProtocolLogsChunk", async () => ({ chunks: [] }));
  ensureFn("fetchFscRows", async () => []);
  ensureFn("listOutputVolumes", async () => []);
  ensureFn("listCoords3dTomograms", async () => []);
  ensureFn("fetchCoords3dForTomogram", async () => []);
  ensureFn("fetchCoords3dTomogramSliceObjectUrl", async (_p: any, _pid: any, _o: any, _t: any, sliceIndex: number) => ({
    url: mockSliceDataUrl(sliceIndex),
    revoke: () => { },
  }));
  ensureFn("fetchOutputMetadataTables", async () => []);
  ensureFn("listOutputTiltSeries", async () => []);
  ensureFn("listOutputCTFTomoSeries", async () => []);
  ensureFn("listUsers", async () => []);
  ensureFn("listProjectShares", async () => []);
  ensureFn("resolveTableViewPane", async () => ({
    kind: "empty",
    message: "No viewer configured.",
  }));
  ensureFn("createTableViewSubset", async (request: { subsetItems?: string[] }) => ({
    success: true,
    count: request?.subsetItems?.length ?? 0,
    message: `Demo: received ${request?.subsetItems?.length ?? 0} item(s). Subset creation is not implemented yet.`,
  }));

  if (rawListProjectTags) {
    normalized.listProjectTags = async (projectId: any) => {
      return await callWithFallbackArgs(rawListProjectTags, [projectId], []);
    };
  }

  if (rawCreateProjectTag) {
    normalized.createProjectTag = async (projectId: any, payload: any) => {
      return await callWithFallbackArgs(rawCreateProjectTag, [projectId, payload], [payload]);
    };
  }

  if (rawUpdateProjectTag) {
    normalized.updateProjectTag = async (projectId: any, tagId: string, payload: any) => {
      return await callWithFallbackArgs(rawUpdateProjectTag, [projectId, tagId, payload], [tagId, payload]);
    };
  }

  if (rawDeleteProjectTag) {
    normalized.deleteProjectTag = async (projectId: any, tagId: string) => {
      return await callWithFallbackArgs(rawDeleteProjectTag, [projectId, tagId], [tagId]);
    };
  }

  if (rawListProtocolTagIds) {
    normalized.listProtocolTagIds = async (projectId: any, protocolId: any) => {
      return await callWithFallbackArgs(rawListProtocolTagIds, [projectId, protocolId], [protocolId]);
    };
  }

  if (rawSetProtocolTagIds) {
    normalized.setProtocolTagIds = async (projectId: any, protocolId: any, tagIds: any) => {
      return await callWithFallbackArgs(rawSetProtocolTagIds, [projectId, protocolId, tagIds], [protocolId, tagIds]);
    };
  }

  if (rawGetNextProtocolSuggestions) {
    normalized.getNextProtocolSuggestions = async (projectId: any, protocolId: any) => {
      return await callWithFallbackArgs(rawGetNextProtocolSuggestions, [projectId, protocolId], [protocolId]);
    };
  }

  normalized.executeProtocol = async (
    projectId: any,
    protocolId: any,
    protocolClassName: string,
    params: any,
    mode: string,
  ) => {
    const fn = rawExecute ?? normalized.executeProtocol;
    try {
      return await fn.call(normalized, projectId, protocolId, protocolClassName, params, mode);
    } catch {
      return await fn.call(normalized, protocolId, protocolClassName, params, mode);
    }
  };

  normalized.saveProtocol = async (
    projectId: any,
    protocolId: any,
    protocolClassName: string,
    params: any,
  ) => {
    const fn = rawSave ?? normalized.saveProtocol;
    try {
      return await fn.call(normalized, projectId, protocolId, protocolClassName, params);
    } catch {
      return await fn.call(normalized, protocolId, protocolClassName, params);
    }
  };

  return normalized as ProjectService;
}

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
  theme?: "light" | "dark";
  cssHref?: string;
  props?: InitialProps;
};

export function mountProjectPageWidget({
  container,
  service,
  projectName,
  theme = "light",
  cssHref,
}: ProjectPageMountOptions) {
  const target =
    typeof container === "string" ? document.querySelector(container) : container;

  if (!target) {
    throw new Error(`ProjectPageWidget: container '${container}' not found`);
  }

  const { shell, mountPoint } = createWidgetShell(target as HTMLElement);
  shell.classList.toggle("dark", theme === "dark");

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
  let cleanupCssLink = ensureExplicitWidgetCssLink(cssHref);
  const cleanupDarkSync = syncShellDarkMode(shell);

  const doUnmount = () => {
    if (didUnmount) return;
    didUnmount = true;

    try {
      root.unmount();
    } catch {
      // noOp
    }

    try {
      cleanupDarkSync();
    } catch {
      // noOp
    }

    try {
      cleanupCssLink();
    } catch {
      // noOp
    }

    cleanupCssLink = () => { };

    try {
      (target as HTMLElement).removeChild(shell);
    } catch {
      // noOp
    }
  };

  const guard = createAutoUnmountGuard(shell, doUnmount);

  root.render(
    <ProjectServiceProvider service={svc}>
      <QueryClientProviderV3 client={qcV3}>
        <QueryClientProviderV5 client={qcV5}>
          <CacheProvider value={emotionCache}>
            <ThemeProvider>
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
            </ThemeProvider>
          </CacheProvider>
        </QueryClientProviderV5>
      </QueryClientProviderV3>
    </ProjectServiceProvider>,
  );

  return {
    unmount() {
      guard.dispose();
    },
    root,
  };
}

if (typeof window !== "undefined") {
  const prev = (window as any).MyProjectsWidget as WidgetGlobal | undefined;
  (window as any).MyProjectsWidget = { ...(prev || {}), mountProjectPageWidget };
  // eslint-disable-next-line no-console
  console.log(
    "ProjectPageWidget: ready under window.MyProjectsWidget",
    WIDGET_BUILD_TIMESTAMP ? `(built ${WIDGET_BUILD_TIMESTAMP})` : "",
  );
}
