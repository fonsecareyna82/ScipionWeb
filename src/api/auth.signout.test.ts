import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeSignInCode, login, logout } from "./auth";

function answer(body: unknown) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
}

describe("signing out of an institution", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it("answers the institution's sign-out address after signing in with it, once", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(() => answer({ accessToken: "a", refreshToken: "r",
            signOutUrl: "https://login.example.org/logout?id_token_hint=x" }));
        await exchangeSignInCode("one-time");
        expect(logout()).toBe("https://login.example.org/logout?id_token_hint=x");
        expect(localStorage.getItem("accessToken")).toBeNull();
        expect(logout()).toBeNull();
    });

    it("has nothing to sign out of after a password sign-in", async () => {
        localStorage.setItem("signOutUrl", "https://login.example.org/logout?old");
        vi.spyOn(globalThis, "fetch").mockImplementation(() => answer({ accessToken: "a", refreshToken: "r" }));
        await login("ana@example.org", "secret");
        expect(logout()).toBeNull();
    });
});
