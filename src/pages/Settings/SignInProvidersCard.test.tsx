import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SignInProvidersCard from "./SignInProvidersCard";
import { listSignInProviderSetups, removeSignInProvider, saveSignInProvider } from "@/api/settings";

vi.mock("@/api/settings", () => ({
    listSignInProviderSetups: vi.fn(),
    saveSignInProvider: vi.fn(),
    removeSignInProvider: vi.fn(),
    testSignInProvider: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const colors = { border: "#ddd", text: "#111", muted: "#666" };
const esrf = { id: 3, key: "esrf", label: "ESRF", issuer: "https://login.esrf.fr/realms/users", clientId: "scipionweb",
    scopes: "openid email profile", newAccounts: "active" as const, enabled: true, signOutAtProvider: true,
    hasSecret: true, accounts: 2,
    callbackUrl: "https://scipion.example.org/api/auth/oidc/esrf/callback" };

function renderCard() {
    return render(<SignInProvidersCard cardSx={{}} cardHeaderSx={{}} fieldSx={{}} colors={colors} />);
}

describe("SignInProvidersCard", () => {
    beforeEach(() => {
        vi.mocked(listSignInProviderSetups).mockReset().mockResolvedValue([esrf]);
        vi.mocked(saveSignInProvider).mockReset().mockResolvedValue(esrf);
        vi.mocked(removeSignInProvider).mockReset().mockResolvedValue({ removed: 3 });
    });

    it("lists each institution with the address to register there", async () => {
        renderCard();
        const row = await screen.findByTestId("sign-in-provider-esrf");
        expect(row).toHaveTextContent("Sign in with ESRF");
        expect(row).toHaveTextContent("2 accounts");
        expect(row).toHaveTextContent("https://scipion.example.org/api/auth/oidc/esrf/callback");
        expect(row).toHaveTextContent(`Address to register for after signing out: ${window.location.origin}/signin`);
    });

    it("says there is none by default", async () => {
        vi.mocked(listSignInProviderSetups).mockResolvedValue([]);
        renderCard();
        expect(await screen.findByText(/no institution is set up/)).toBeInTheDocument();
    });

    it("keeps the secret when changing a provider without typing one", async () => {
        renderCard();
        await screen.findByTestId("sign-in-provider-esrf");
        fireEvent.click(screen.getByRole("button", { name: "Change" }));
        fireEvent.change(screen.getByLabelText("Button name"), { target: { value: "ESRF users" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saveSignInProvider).toHaveBeenCalled());
        const [payload, id] = vi.mocked(saveSignInProvider).mock.calls[0];
        expect(id).toBe(3);
        expect(payload.label).toBe("ESRF users");
        expect("clientSecret" in payload).toBe(false);
    });

    it("asks before removing one", async () => {
        renderCard();
        await screen.findByTestId("sign-in-provider-esrf");
        fireEvent.click(screen.getByRole("button", { name: "Remove" }));
        expect(removeSignInProvider).not.toHaveBeenCalled();
        const buttons = screen.getAllByRole("button", { name: "Remove" });
        fireEvent.click(buttons[buttons.length - 1]);
        await waitFor(() => expect(removeSignInProvider).toHaveBeenCalledWith(3));
    });
});
