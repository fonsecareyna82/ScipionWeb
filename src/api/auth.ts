// api/auth.ts

import { BASE_URL } from "@/config";

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

export async function register(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

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
