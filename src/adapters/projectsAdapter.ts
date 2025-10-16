// src/adapters/projectsAdapter.ts
import * as api from "@/api/projects";
import type { ProjectService, ProjectPayload } from "@/services/ProjectService";

/**
 * Small helper to normalize IDs so callers can pass string or number interchangeably.
 */
const toId = (id: string | number): string => String(id);

/**
 * defaultService: adapts the current API layer (fetchProjects, fetchProject, ...)
 * to the ProjectService interface. If the underlying API changes, update ONLY here.
 */
const defaultService: ProjectService = {
  // --- Reads ---
  fetchList: () => api.fetchProjects(),

  fetchProject: (id: string | number) => api.fetchProject(toId(id)),

  fetchProtocolDetails: (projectId: string | number, protocolId: string | number) =>
    api.fetchProtocolDetails(toId(projectId), toId(protocolId)),

  fetchNewProtocolDetails: (projectId: string | number, protocolClass: string) =>
    api.fetchNewProtocolDetails(toId(projectId), protocolClass),

  // --- Mutations ---
  createProject: (payload: ProjectPayload) =>
    api.createProject(payload.name, (payload.description ?? "").trim()),

  renameProject: (id: string | number, newName: string, newDescription?: string) =>
    api.renameProject(toId(id), newName, (newDescription ?? "").trim()),

  deleteProject: (id: string | number) => api.deleteProject(toId(id)),

  // --- Protocol lifecycle ---
  loadProtocols: (projectId: string | number) =>
    // original signature was (projectId: number); normalize and keep backward-compat
    api.loadProtocols(Number(projectId)),

  
  // --- Protocol actions
    executeProtocol: (
    protocolId: string | number,
    protocolClassName: string,
    params: Record<string, unknown>
  ) => api.executeProtocol(toId(protocolId), protocolClassName, params),

  saveProtocol: (
    protocolId: string | number,
    protocolClassName: string,
    params: Record<string, unknown>
  ) => api.saveProtocol(toId(protocolId), protocolClassName, params),

  renameProtocol: (
    projectId: string,
    protocolId: string,
    newName: string
  ) => api.renameProtocol(toId(projectId), toId(protocolId), newName),

  duplicateProtocol: (
    projectId: string,
    protocolId: string,
    newName: string
  ) => api.duplicateProtocol(toId(projectId), toId(protocolId), newName),

  deleteProtocol: (
    projectId: string,
    protocolId: string,
  ) => api.deleteProtocol(toId(projectId), toId(protocolId)),

  restartAll: (
    projectId: string,
    protocolId: string,
  ) => api.restartAll(toId(projectId), toId(protocolId)),

  continueAll: (
    projectId: string,
    protocolId: string,
  ) => api.continueAll(toId(projectId), toId(protocolId)),

  resetFrom: (
    projectId: string,
    protocolId: string,
  ) => api.resetFrom(toId(projectId), toId(protocolId)),


};

export default defaultService;
