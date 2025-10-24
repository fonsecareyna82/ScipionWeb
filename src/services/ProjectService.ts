// src/services/ProjectService.ts

/** Common ID type to accept either string or number seamlessly. */
export type Id = string | number;

/** Payload for creating a project. */
export type ProjectPayload = { name: string; description?: string };

/**
 * Optional generics to let consumers specify concrete return shapes.
 * - TProject: shape of a single project
 * - TProjectList: shape of the projects list (array or paginated object)
 * - TProtocol: shape of a single protocol / protocol details
 */
export interface ProjectService<
  TProject = any,
  TProjectList = any,
  TProtocol = any
> {
  /**
   * List projects. It can return an array or a paginated object.
   * Components should normalize the result.
   */
  fetchList(): Promise<TProjectList>;

  /** Get project by id or name. */
  fetchProject(projectId: Id): Promise<TProject>;

  /** Get protocol details by project/protocol ids. */
  fetchProtocolDetails(projectId: Id, protocolId: Id): Promise<TProtocol>;

  /** Get "new protocol" details by class within a project. */
  fetchNewProtocolDetails(projectId: Id, protocolClass: string): Promise<TProtocol>;

  /** Create / rename / delete project. */
  createProject(payload: ProjectPayload): Promise<TProject>;
  renameProject(id: Id, newName: string, newDescription?: string): Promise<TProject>;
  deleteProject(id: Id): Promise<void | { success: boolean }>;

  /** Protocol lifecycle: list / save / execute. */
  loadProtocols(projectId: Id): Promise<TProtocol[] | any>;
  executeProtocol(
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>
  ): Promise<TProtocol>;
  saveProtocol(
    protocolId: Id,
    protocolClassName: string,
    params: Record<string, unknown>
  ): Promise<TProtocol>;

  /** Protocol actions */
  renameProtocol(projectId: Id, protocolId: Id, newName: string): Promise<TProtocol>
  duplicateProtocol(projectId: Id, items: { id: string; name?: string }[],): Promise<TProtocol>
  deleteProtocol(projectId: Id, ids: string[]): Promise<TProtocol>
  restartAll(projectId: Id, protocolId: Id): Promise<TProject>
  continueAll(projectId: Id, protocolId: Id): Promise<TProject>
  resetFrom(projectId: Id, protocolId: Id): Promise<TProject>
  stopProtocol(projectId: Id, ids: string[]): Promise<TProject>
  resolveProtocolStartPath(projectId: Id, pid: string): Promise<TProject>
  listRemoteDirectory(projectId: Id, protocolId: Id, path: string): Promise<TProject>
  previewProtocolText(projectId: Id, id: string, path: string): Promise<TProject>
  buildProtocolDownloadUrl(projectId: string, protocolId: string, path: string, inline: boolean): string
}

