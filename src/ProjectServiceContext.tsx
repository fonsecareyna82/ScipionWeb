// src/ProjectServiceContext.tsx
import React, { createContext, useContext, useMemo } from "react";
import type { ProjectService } from "./services/ProjectService";
import defaultService from "./adapters/projectsAdapter";

// Allow partial overrides (e.g., in tests or embedding scenarios)
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Merge a (possibly partial) override into the base service.
function mergeServices<T extends object>(base: T, override?: DeepPartial<T>): T {
  if (!override) return base;
  const out: any = { ...base };
  for (const k of Object.keys(override) as (keyof T)[]) {
    const v = override[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

const ProjectServiceContext = createContext<ProjectService | null>(null);

let warnedFallbackOnce = false;

type ProviderProps = {
  /** You can pass a full service or a partial override (merged over defaultService). */
  service?: ProjectService | DeepPartial<ProjectService>;
  children: React.ReactNode;
};

export const ProjectServiceProvider: React.FC<ProviderProps> = ({ service, children }) => {
  // If a partial service is provided, merge it over the default one.
  const svc = useMemo<ProjectService>(() => {
    // If it "looks" like a full service (has fetchList), accept as-is; otherwise merge.
    const looksComplete = !!(service as ProjectService)?.fetchList;
    return looksComplete
      ? (service as ProjectService)
      : mergeServices(defaultService, service as DeepPartial<ProjectService>);
  }, [service]);

  return <ProjectServiceContext.Provider value={svc}>{children}</ProjectServiceContext.Provider>;
};

/**
 * Get the ProjectService instance.
 * If no provider is mounted, returns the defaultService (dev-only warning once).
 *
 * You can optionally parameterize the expected shapes:
 *   const svc = useProjectService<MyProject, MyProjectList, MyProtocol>();
 */
export function useProjectService<
  TProject = any,
  TProjectList = any,
  TProtocol = any
>(): ProjectService<TProject, TProjectList, TProtocol> {
  const ctx = useContext(ProjectServiceContext) as ProjectService<TProject, TProjectList, TProtocol> | null;
  if (!ctx) {
    if (process.env.NODE_ENV !== "production" && !warnedFallbackOnce) {
      // Warn once in dev if provider is missing
      // eslint-disable-next-line no-console
      console.warn("[ProjectServiceContext] No provider found. Falling back to defaultService.");
      warnedFallbackOnce = true;
    }
    return defaultService as unknown as ProjectService<TProject, TProjectList, TProtocol>;
  }
  return ctx;
}

/**
 * Select a specific slice of the service to minimize re-renders in consumers.
 * Example:
 *   const rename = useProjectServiceSelector(s => s.renameProject);
 */
export function useProjectServiceSelector<T>(
  selector: (svc: ProjectService) => T
): T {
  const svc = useProjectService();
  // Service instance is stable via Provider/useMemo; selector runs on render
  return useMemo(() => selector(svc), [svc, selector]);
}
