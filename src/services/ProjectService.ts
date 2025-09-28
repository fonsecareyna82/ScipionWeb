// src/services/ProjectService.ts
export type ProjectPayload = { name: string; description?: string };

export interface ProjectService {
  // lista de proyectos (puede devolver array o objeto paginado; los componentes lo normalizan)
  fetchList(): Promise<any>;

  // obtener proyecto por id/name
  fetchProject(projectId: string): Promise<any>;

  // detalles de protocolo (por id)
  fetchProtocolDetails(projectId: string, protocolId: string): Promise<any>;

  // detalles de nuevo protocolo por clase
  fetchNewProtocolDetails(projectId: string, protocolClass: string): Promise<any>;

  // crear / renombrar / borrar
  createProject(payload: ProjectPayload): Promise<any>;
  renameProject(id: string, newName: string, newDescription?: string): Promise<any>;
  deleteProject(id: string): Promise<any>;

  // protocolos (lista/guardar/ejecutar)
  loadProtocols(projectId: number): Promise<any>;
  executeProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>): Promise<any>;
  saveProtocol(protocolId: string, protocolClassName: string, params: Record<string, any>): Promise<any>;
}
