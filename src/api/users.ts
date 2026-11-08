import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";

export type AdminUser = {
  id: number;
  email: string;
  firstName: string;
  lastName?: string | null;
  institution?: string | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  roleIds: number[];
  groupIds: number[];
};

export type AdminUserPatch = {
  isActive?: boolean;
  roleIds?: number[];
  groupIds?: number[];
};

export async function readPayload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function buildApiError(response: Response, fallback: string): Promise<Error> {
  const data = await readPayload(response);
  const message =
    (typeof data?.detail === "string" && data.detail) ||
    (typeof data?.message === "string" && data.message) ||
    fallback;

  return Object.assign(new Error(message), {
    status: response.status,
    data,
  });
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await fetchWithAuth(`${BASE_URL}/users/admin`, {
    method: "GET",
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to load users");
  }

  return readPayload(response);
}

export async function updateAdminUser(
  userId: number,
  patch: AdminUserPatch,
): Promise<AdminUser> {
  const response = await fetchWithAuth(`${BASE_URL}/users/admin/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to update user");
  }

  return readPayload(response);
}
// Deleting an account: what goes with it (its projects) and what stops it
export type UserDeletionPreview = {
  user: { id: number; email: string; firstName?: string | null; lastName?: string | null };
  projects: { id: number; name: string; bytes: number | null; shares: number; running: number }[];
  // What stays in the facility without the account
  facility: { sessions: number; bookings: number; samples: number };
  // Why it cannot go now (none: it can)
  blockers: string[];
  deleting: boolean;
};
export type UserDeletionResult = {
  user: UserDeletionPreview["user"];
  deleted: { id: number; name: string }[];
  failed: { id: number; name: string; detail: string }[];
  deletingInBackground: boolean;
};

export async function previewUserDeletion(userId: number): Promise<UserDeletionPreview> {
  const response = await fetchWithAuth(`${BASE_URL}/users/admin/${userId}/deletion`, { method: "GET" });
  if (!response.ok) throw await buildApiError(response, "Failed to read what deleting the account takes");
  return readPayload(response);
}

/** Delete the account and every project it owns; confirmEmail is its address, typed to confirm. */
export async function deleteAdminUser(userId: number, confirmEmail: string): Promise<UserDeletionResult> {
  const response = await fetchWithAuth(
    `${BASE_URL}/users/admin/${userId}?confirmEmail=${encodeURIComponent(confirmEmail)}`, { method: "DELETE" });
  if (!response.ok) throw await buildApiError(response, "Failed to delete the account");
  return readPayload(response);
}
