import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SignInReturn from "./SignInReturn";
import { exchangeSignInCode } from "../../api/auth";

vi.mock("../../api/auth", () => ({ exchangeSignInCode: vi.fn() }));
vi.mock("./AuthPageLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/auth/sso" element={<SignInReturn />} />
                <Route path="/home" element={<p>Home page</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("SignInReturn", () => {
    beforeEach(() => {
        vi.mocked(exchangeSignInCode).mockReset();
    });

    it("turns the one-time code into the session and goes home", async () => {
        vi.mocked(exchangeSignInCode).mockResolvedValue({ accessToken: "a" });
        renderAt("/auth/sso?code=one-time");
        expect(await screen.findByText("Home page")).toBeInTheDocument();
        expect(exchangeSignInCode).toHaveBeenCalledWith("one-time");
    });

    it("tells why the institution's sign-in did not work", async () => {
        renderAt("/auth/sso?error=Your%20account%20waits%20for%20an%20administrator%20to%20activate%20it.");
        expect(await screen.findByRole("alert")).toHaveTextContent("Your account waits for an administrator");
        expect(exchangeSignInCode).not.toHaveBeenCalled();
    });

    it("tells when the code cannot be used", async () => {
        vi.mocked(exchangeSignInCode).mockRejectedValue(new Error("This sign-in expired; sign in again."));
        renderAt("/auth/sso?code=old");
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This sign-in expired"));
    });
});
