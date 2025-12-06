// api/auth.ts
import { BASE_URL } from "@/config";
import { UserProfile } from "@/types/user";

export interface UserCreatePayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  institution: string;
}

/**
 * User login - stores access and refresh tokens
 */
export async function login(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Login failed");
  }

  localStorage.setItem("accessToken", data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem("refreshToken", data.refreshToken);
  }

  return data;
}

/**
 * User registration
 */
export async function register(userData: UserCreatePayload) {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Server returned invalid response");
  }

  if (!res.ok) {
    throw new Error(data.detail || "Registration failed");
  }

  return data;
}

/**
 * Get stored access token
 */
export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

/**
 * Get stored refresh token
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: refreshToken }),
  });

  if (!res.ok) {
    logout(); // clear session if refresh fails
    return null;
  }

  const data = await res.json();
  if (data.accessToken) {
    localStorage.setItem("accessToken", data.accessToken);
    return data.accessToken;
  }

  return null;
}

/**
 * Get current user profile from backend
 */
export async function getCurrentUser() {
  const token = getAccessToken();
  if (!token) throw new Error("No token found");

  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to fetch user");
  }

  return data;
}

/**
 * Logout - clear tokens
 */
export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

/**
 * Email verification
 */
export async function verifyEmail(code: string) {
  const res = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Verification failed");
  }

  return data;
}

/**
 * Resend verification code
 */
export async function resendVerificationCode(email: string) {
  const res = await fetch(`${BASE_URL}/auth/resend-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || "Failed to resend verification code");
  }

  return data;
}

/**
 * Get user profile
 */
export async function getUserProfile() {
  const token = getAccessToken();
  if (!token) throw new Error("No token found");

  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch user profile");
  }

  return await res.json();
}

/**
 * Update user profile
 */
export async function updateUserProfile(data: Partial<UserProfile>) {
  const token = getAccessToken();
  if (!token) throw new Error("No token found");

  const res = await fetch(`${BASE_URL}/auth/me`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("Failed to update profile");
  }

  return await res.json();
}


/**
 * Wrapper for fetch that automatically refreshes tokens on 401
 */
export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers || {});
  const method = (init.method || "GET").toUpperCase();
  const hasBody = !!init.body && method !== "GET" && method !== "HEAD";

  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (hasBody && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Accept")) headers.set("Accept", "*/*");

  const req: RequestInit = { ...init, headers, credentials: "include", mode: "cors", cache: "no-store", redirect: "follow" };

  let res = await fetch(input, req);
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) { logout(); throw new Error("Session expired. Please login again."); }
    headers.set("Authorization", `Bearer ${newToken}`);
    res = await fetch(input, { ...req, headers });
  }
  return res;
}
