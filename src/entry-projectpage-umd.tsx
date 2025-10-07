// src/entry-projectpage-umd.tsx
import "./index.css"; // Tailwind and global styles
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ProjectPage from "./pages/Dashboard/projects/ProjectPage";
import { ProjectServiceProvider } from "./ProjectServiceContext";
import { DragProvider } from "./components/protocol/DragContext";
import type { ProjectService } from "./services/ProjectService";

/**
 * Normalize service API — ensures compatibility if an external service
 * uses different method names but same semantics.
 */
function normalizeServiceAPI(srv: any): ProjectService {
  if (!srv || typeof srv !== "object") {
    throw new Error("ProjectPageWidget: invalid service object");
  }

  const normalized: any = { ...srv };

  if (typeof normalized.fetchProject !== "function") {
    if (typeof normalized.getProject === "function")
      normalized.fetchProject = normalized.getProject.bind(normalized);
  }

  if (typeof normalized.fetchProtocolDetails !== "function") {
    if (typeof normalized.getProtocolDetails === "function")
      normalized.fetchProtocolDetails = normalized.getProtocolDetails.bind(normalized);
  }

  if (typeof normalized.fetchNewProtocolDetails !== "function") {
    if (typeof normalized.getNewProtocolDetails === "function")
      normalized.fetchNewProtocolDetails = normalized.getNewProtocolDetails.bind(normalized);
  }

  if (typeof normalized.executeProtocol !== "function" && typeof normalized.execute === "function") {
    normalized.executeProtocol = normalized.execute.bind(normalized);
  }

  if (typeof normalized.saveProtocol !== "function" && typeof normalized.save === "function") {
    normalized.saveProtocol = normalized.save.bind(normalized);
  }

  if (typeof normalized.loadProtocols !== "function" && typeof normalized.getProtocols === "function") {
    normalized.loadProtocols = normalized.getProtocols.bind(normalized);
  }

  if (typeof normalized.createProject !== "function" && typeof normalized.create === "function") {
    normalized.createProject = normalized.create.bind(normalized);
  }

  if (typeof normalized.renameProject !== "function" && typeof normalized.rename === "function") {
    normalized.renameProject = normalized.rename.bind(normalized);
  }

  if (typeof normalized.deleteProject !== "function" && typeof normalized.remove === "function") {
    normalized.deleteProject = normalized.remove.bind(normalized);
  }

  return normalized;
}

/**
 * Default minimal mock service for local testing or demos.
 */
const defaultMockService: ProjectService = {
  async fetchList() {
    return [{ id: "demo", name: "Demo project", createdAt: new Date(), status: "idle" }];
  },
  async fetchProject(id: string) {
    return {
      id,
      name: `Demo Project ${id}`,
      shortName: `demo-${id}`,
      createdAt: new Date(),
      status: "idle",
      protocols: {},
    };
  },
  async fetchProtocolDetails(projectId: string, protocolId: string) {
    return {
      id: protocolId,
      protocolClassName: "DemoProtocol",
      params: {},
    };
  },
  async fetchNewProtocolDetails(projectId: string, protocolClass: string) {
    return {
      id: "new",
      protocolClassName: protocolClass,
      params: {},
    };
  },
  async createProject(payload) {
    return { id: "created", name: payload.name, description: payload.description ?? "", status: "idle" };
  },
  async renameProject() {
    return { success: true };
  },
  async deleteProject() {
    return { success: true };
  },
  async loadProtocols() {
    return [];
  },
  async executeProtocol() {
    return { success: true };
  },
  async saveProtocol() {
    return { success: true };
  },
};

/**
 * Mounts the ProjectPage component into a container element.
 */
export function mountProjectPageWidget({
  container,
  service,
  projectName,
}: {
  container: string | HTMLElement;
  service?: ProjectService;
  projectName: string;
}) {
  const target =
    typeof container === "string" ? document.querySelector(container) : container;

  if (!target)
    throw new Error(`ProjectPageWidget: container '${container}' not found`);

  const resolvedService = normalizeServiceAPI(service ?? defaultMockService);

  const root = ReactDOM.createRoot(target as HTMLElement);
  root.render(
    <BrowserRouter>
      <DragProvider>
        <ProjectServiceProvider service={resolvedService}>
          <ProjectPage key={projectName} />
        </ProjectServiceProvider>
      </DragProvider>
    </BrowserRouter>
  );

  return root;
}

/**
 * Expose globally when loaded via <script>.
 */
if (typeof window !== "undefined") {
  (window as any).MyProjectsWidget = {
    ...(window as any).MyProjectsWidget,
    mountProjectPageWidget,
  };
  console.log("ProjectPageWidget: ready under window.MyProjectsWidget");
}
