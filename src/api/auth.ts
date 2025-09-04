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

  

export async function login(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.detail || "Login failed");
    }

    localStorage.setItem("accessToken", data.accessToken);
    return data;
}

export async function register(userData: UserCreatePayload) {
    const res = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(userData)
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
  
  

export function getAccessToken(): string | null {
    return localStorage.getItem("accessToken");
}

export async function getCurrentUser() {
    const token = getAccessToken();
    if (!token) throw new Error("No token found");

    const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.detail || "Failed to fetch user");
    }

    return data;
}

export function logout() {
    localStorage.removeItem("accessToken");
}


export async function verifyEmail(code: string) {
    const res = await fetch(`${BASE_URL}/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });
  
    const data = await res.json();
  
    if (!res.ok) {
      throw new Error(data.detail || "Verification failed");
    }
  
    return data;
  }

  export async function resendVerificationCode(email: string) {
    const res = await fetch(`${BASE_URL}/auth/resend-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
  
    const data = await res.json();
  
    if (!res.ok) {
      throw new Error(data.detail || "Failed to resend verification code");
    }
  
    return data;
  }

  export async function getUserProfile() {
    const token = localStorage.getItem("accessToken");
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  
    if (!res.ok) {
      throw new Error("Failed to fetch user profile");
    }
  
    return await res.json();
  }
  

  export async function updateUserProfile(data: Partial<UserProfile>) {
    const token = localStorage.getItem("accessToken");
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