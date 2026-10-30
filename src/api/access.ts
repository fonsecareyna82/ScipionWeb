import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

export type Permission = { name: string; description: string };

export type Role = {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  isDefault: boolean;
  permissions: string[];
  usersCount: number;
  groupsCount: number;
};

export type RolePayload = { name: string; description: string; isDefault: boolean; permissions: string[] };

export type GroupMember = {
  userId: number;
  groupRole: "member" | "pi";
  email?: string;
  firstName?: string;
  lastName?: string;
};

// What a group's PIs may do in the projects its members own
export type PiAccess = "none" | "view" | "work" | "manage";

export type Group = {
  id: number;
  name: string;
  description: string;
  roleIds: number[];
  members: GroupMember[];
  piAccess: PiAccess;
};

export type GroupPayload = {
  name: string;
  description: string;
  roleIds: number[];
  members: { userId: number; groupRole: "member" | "pi" }[];
  piAccess: PiAccess;
};

export type AuditEvent = {
  id: number;
  createdAt: string;
  userId: number | null;
  userEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
  clientAddress: string | null;
};

export type AuditPage = { events: AuditEvent[]; nextBefore: number | null };

export type AuditQuery = { action?: string; text?: string; since?: string; until?: string; before?: number | null };

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

export const listPermissions = () => request<Permission[]>("/access/permissions", "Failed to load permissions");
export const listRoles = () => request<Role[]>("/access/roles", "Failed to load roles");
export const createRole = (payload: RolePayload) =>
  request<Role>("/access/roles", "Failed to create the role", { method: "POST", body: JSON.stringify(payload) });
export const updateRole = (roleId: number, payload: RolePayload) =>
  request<Role>(`/access/roles/${roleId}`, "Failed to save the role", { method: "PUT", body: JSON.stringify(payload) });
export const deleteRole = (roleId: number) =>
  request<null>(`/access/roles/${roleId}`, "Failed to delete the role", { method: "DELETE" });

export const listGroups = () => request<Group[]>("/access/groups", "Failed to load groups");
export const listGroupNames = () => request<{ id: number; name: string }[]>("/access/groups/names", "Failed to load groups");
export const createGroup = (payload: GroupPayload) =>
  request<Group>("/access/groups", "Failed to create the group", { method: "POST", body: JSON.stringify(payload) });
export const updateGroup = (groupId: number, payload: GroupPayload) =>
  request<Group>(`/access/groups/${groupId}`, "Failed to save the group", { method: "PUT", body: JSON.stringify(payload) });
export const deleteGroup = (groupId: number) =>
  request<null>(`/access/groups/${groupId}`, "Failed to delete the group", { method: "DELETE" });

export const listAuditCategories = () =>
  request<{ name: string; description: string }[]>("/access/audit/categories", "Failed to load the audit categories");
export const listAuditEvents = (query: AuditQuery = {}, limit = 100) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.action) params.set("action", query.action);
  if (query.text?.trim()) params.set("text", query.text.trim());
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.before != null) params.set("before", String(query.before));
  return request<AuditPage>(`/access/audit?${params}`, "Failed to load the audit log");
};
