// src/adapters/flaskAdapter.ts
import type { ProjectService, ProjectPayload } from "@/services/ProjectService";

export function createFlaskAdapter(baseUrl = "/api"): ProjectService {
  const json = async (r: Response) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({ detail: r.statusText }))).detail || r.statusText);
    return r.json();
  };

  return {
    fetchList: () => fetch(`${baseUrl}/projects`).then(json),
    fetchProject: (id: string) => fetch(`${baseUrl}/projects/${encodeURIComponent(id)}`).then(json),
    fetchProtocolDetails: (projectId: string, protocolId: string) =>
      fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/protocols/${encodeURIComponent(protocolId)}`).then(json),
    fetchNewProtocolDetails: (projectId: string, protocolClass: string) =>
      fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/protclass/${encodeURIComponent(protocolClass)}`).then(json),

    createProject: (payload: ProjectPayload) =>
      fetch(`${baseUrl}/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(json),

    renameProject: (id: string, newName: string, newDescription?: string) =>
      fetch(`${baseUrl}/projects/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription ?? "" }),
      }).then(json),

    deleteProject: (id: string) => fetch(`${baseUrl}/projects/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(`Delete failed: ${r.statusText}`);
      return;
    }),

    loadProtocols: (projectId: number) => fetch(`${baseUrl}/projects/${projectId}/protocols`).then(json),

    executeProtocol: (protocolId: string, protocolClassName: string, params: Record<string, any>) =>
      fetch(`${baseUrl}/projects/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolId, protocolClassName, params }),
      }).then(json),

    saveProtocol: (protocolId: string, protocolClassName: string, params: Record<string, any>) =>
      fetch(`${baseUrl}/projects/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolId, protocolClassName, params }),
      }).then(json),
  };
}

export default createFlaskAdapter();
