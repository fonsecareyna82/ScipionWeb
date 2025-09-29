import "./index.css"; // import Tailwind styles

import React from "react";
import ReactDOM from "react-dom/client";
import type { ProjectService } from "./services/ProjectService";
import Projects from "./pages/Dashboard/projects/Projects";

// --- normalize service API ---
function normalizeServiceAPI(srv: any) {
  if (!srv || typeof srv !== "object") return srv;
  const normalized: any = { ...srv };

  // fetchList
  if (typeof normalized.fetchList !== "function") {
    if (typeof normalized.listProjects === "function") normalized.fetchList = normalized.listProjects.bind(normalized);
    else if (typeof normalized.list === "function") normalized.fetchList = normalized.list.bind(normalized);
    else if (typeof normalized.fetch === "function") normalized.fetchList = normalized.fetch.bind(normalized);
  }

  // getProject
  if (typeof normalized.getProject !== "function") {
    if (typeof normalized.fetchOne === "function") normalized.getProject = normalized.fetchOne.bind(normalized);
    else if (typeof normalized.get === "function") normalized.getProject = normalized.get.bind(normalized);
  }

  // createProject
  if (typeof normalized.createProject !== "function" && typeof normalized.create === "function") {
    normalized.createProject = normalized.create.bind(normalized);
  }

  return normalized;
}

// --- default mock service ---
const defaultMockService: ProjectService = {
  async fetchList() {
    return [
      { id: "demo-1", name: "Demo Project 1", createdAt: new Date(), status: "idle" },
      { id: "demo-2", name: "Demo Project 2", createdAt: new Date(), status: "running" },
    ];
  },
  async fetchProject(id: string) {
    return { id, name: `Demo Project ${id}`, createdAt: new Date(), status: "idle" };
  },
  async createProject(payload: { name: string; description: string }) {
    return { id: `created-${Date.now()}`, name: payload.name, description: payload.description, createdAt: new Date(), status: "idle" };
  },
};

// --- mount function ---
export function mountProjectsWidget({ container, service }: { container: string | HTMLElement; service?: ProjectService }) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error(`ProjectsWidget: container '${container}' not found`);

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
  console.log("ProjectsWidget: entry-projects-umd executed — window.MyProjectsWidget ready (with Tailwind)");
}
