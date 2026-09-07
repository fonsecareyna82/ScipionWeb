import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";

export type AdminUserRole = "user" | "admin";

export type AdminUser = {
  id: number;
  email: string;
  firstName: string;
  lastName?: string | null;
  institution?: string | null;
  role: AdminUserRole;
  isActive: boolean;
  isVerified: boolean;
};

export type AdminUserPatch = {
  role?: AdminUserRole;
  isActive?: boolean;
};

async function readPayload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function buildApiError(response: Response, fallback: string): Promise<Error> {
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