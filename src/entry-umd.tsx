// File: src/entry-umd.tsx
import "./index.css"; // import Tailwind styles

import React from "react";
import ReactDOM from "react-dom/client";
import type { ProjectService } from "./services/ProjectService";
import Projects from "./pages/Dashboard/projects/Projects";

// --- normalize service API for backward compatibility ---
function normalizeServiceAPI(srv: any) {
  if (!srv || typeof srv !== "object") return srv;
  const normalized: any = { ...srv };

  const mock: any = defaultMockService; // fallback automático si algo falta

  const ensure = (key: string, candidates: string[]) => {
    if (typeof normalized[key] === "function") return; // ya está implementado

    for (const c of candidates) {
      if (typeof normalized[c] === "function") {
        normalized[key] = normalized[c].bind(normalized);
        console.log(`normalizeServiceAPI: mapped ${c} → ${key}`);
        return;
      }
    }

    // fallback al mock con warning
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

// --- default mock service ---
const defaultMockService: ProjectService = {
  async fetchList() {
    return [
      {
        id: "demo-1",
        name: "Demo Project 1",
        description: "Example project",
        createdAt: new Date(),
        status: "idle",
      },
      {
        id: "demo-2",
        name: "Demo Project 2",
        description: "Example project",
        createdAt: new Date(),
        status: "running",
      },
    ];
  },

  async fetchProject(projectId: string) {
    return {
      id: projectId,
      name: `Demo Project ${projectId}`,
      description: "This is a mock project",
      createdAt: new Date(),
      status: "idle",
    };
  },

  async createProject(payload: { name: string; description?: string }) {
    return {
      id: `mock-${Date.now()}`,
      name: payload.name,
      description: payload.description ?? "",
      createdAt: new Date(),
      status: "idle",
    };
  },

  async renameProject(id: string, newName: string, newDescription?: string) {
    console.warn("Mock renameProject called");
    return {
      id,
      name: newName,
      description: newDescription ?? "",
      updatedAt: new Date(),
      status: "idle",
    };
  },

  async deleteProject(id: string) {
    console.warn("Mock deleteProject called");
    return { message: `Mock project ${id} deleted` };
  },

  async fetchProtocolDetails(projectId: string, protocolId: string) {
    console.warn("Mock fetchProtocolDetails called");
    return {
      id: protocolId,
      projectId,
      name: "Mock Protocol",
      status: "idle",
      params: {},
    };
  },

  async fetchNewProtocolDetails(projectId: string, protocolClass: string) {
    console.warn("Mock fetchNewProtocolDetails called");
    return {
      id: `mock-${protocolClass}`,
      projectId,
      className: protocolClass,
      status: "idle",
      params: {},
    };
  },

  async loadProtocols(projectId: number) {
    console.warn("Mock loadProtocols called");
    return [
      { id: 1, label: "Mock Protocol A", status: "done" },
      { id: 2, label: "Mock Protocol B", status: "running" },
    ];
  },

  async executeProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>) {
    console.warn("Mock executeProtocol called");
    return {
      success: true,
      message: `Executed mock protocol ${protocolId}`,
      protocolClassName,
      params,
    };
  },

  async saveProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>) {
    console.warn("Mock saveProtocol called");
    return {
      saved: true,
      protocolId,
      protocolClassName,
      params,
    };
  },
};

// --- mount function ---
export function mountProjectsWidget({
  container,
  service,
}: {
  container: string | HTMLElement;
  service?: ProjectService;
}) {
  const target =
    typeof container === "string"
      ? document.querySelector(container)
      : container;
  if (!target)
    throw new Error(`ProjectsWidget: container '${container}' not found`);

  const resolvedService = normalizeServiceAPI(service ?? defaultMockService);

  const root = ReactDOM.createRoot(target as HTMLElement);
  root.render(<Projects service={resolvedService} />);
  return root;
}

// --- expose globally ---
if (typeof window !== "undefined") {
  (window as any).MyProjectsWidget = {
    mountProjectsWidget,
  };
  console.log(
    "ProjectsWidget: entry-umd executed — window.MyProjectsWidget ready (with Tailwind)"
  );
}
