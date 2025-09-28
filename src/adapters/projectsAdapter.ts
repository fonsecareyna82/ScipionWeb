// src/adapters/projectsAdapter.ts
import * as api from "@/api/projects";
import type { ProjectService, ProjectPayload } from "@/services/ProjectService";

/**
 * defaultService: adapta tu lib actual (fetchProjects, fetchProject, ...) a la interfaz ProjectService.
 * Si cambias la API interna, sólo actualiza este fichero.
 */
const defaultService: ProjectService = {
  fetchList: () => api.fetchProjects(),
  fetchProject: (id: string) => api.fetchProject(id),
  fetchProtocolDetails: (projectId: string, protocolId: string) => api.fetchProtocolDetails(projectId, protocolId),
  fetchNewProtocolDetails: (projectId: string, protocolClass: string) => api.fetchNewProtocolDetails(projectId, protocolClass),

  createProject: (payload: ProjectPayload) => api.createProject(payload.name, payload.description ?? ""),
  renameProject: (id: string, newName: string, newDescription?: string) => api.renameProject(id, newName, newDescription ?? ""),
  deleteProject: (id: string) => api.deleteProject(id),

  loadProtocols: (projectId: number) => api.loadProtocols(projectId),

  executeProtocol: (protocolId: string, protocolClassName: string, params: Record<string, any>) =>
    api.executeProtocol(protocolId, protocolClassName, params),

  saveProtocol: (protocolId: string, protocolClassName: string, params: Record<string, any>) =>
    api.saveProtocol(protocolId, protocolClassName, params),
};

export default defaultService;
