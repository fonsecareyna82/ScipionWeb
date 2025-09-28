// src/ProjectServiceContext.tsx
import React, { createContext, useContext } from "react";
import type { ProjectService } from "./services/ProjectService";
import defaultService from "./adapters/projectsAdapter";

const ProjectServiceContext = createContext<ProjectService | null>(null);

export const ProjectServiceProvider: React.FC<{ service?: ProjectService; children: React.ReactNode }> = ({ service, children }) => {
  const svc = service ?? defaultService;
  return <ProjectServiceContext.Provider value={svc}>{children}</ProjectServiceContext.Provider>;
};

export function useProjectService(): ProjectService {
  const ctx = useContext(ProjectServiceContext);
  if (!ctx) {
    // devolver default para casos donde Provider no se haya usado (comodidad)
    return defaultService;
  }
  return ctx;
}
