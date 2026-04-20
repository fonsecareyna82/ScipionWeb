import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import VerifyEmailForm from "@/components/auth/VerifyEmailForm";
import { resendVerificationCode, verifyEmail } from "@/api/auth";

const mockNavigate = vi.fn();

vi.mock("@/api/auth", () => ({
    verifyEmail: vi.fn(),
    resendVerificationCode: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderComponent() {
    return render(
        <MemoryRouter>
            <VerifyEmailForm />
        </MemoryRouter>,
    );
}

describe("VerifyEmailForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders verify and resend sections", () => {
        renderComponent();

        expect(screen.getByText("Verify Your Email")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter verification code")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Verify Email" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter your email to resend code")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Resend Verification Code" })).toBeInTheDocument();
    });

    it("verifies the email successfully and navigates after 2 seconds", async () => {
        const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
        vi.mocked(verifyEmail).mockResolvedValue({ ok: true } as any);

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter verification code"), {
            target: { value: "123456" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Verify Email" }));

        expect(
            await screen.findByText("Email verified successfully!"),
        ).toBeInTheDocument();

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

        const navigateTimerCall = setTimeoutSpy.mock.calls.find(
            ([, delay]) => delay === 2000,
        );

        expect(navigateTimerCall).toBeDefined();

        const navigateCallback = navigateTimerCall?.[0] as () => void;
        navigateCallback();

        expect(mockNavigate).toHaveBeenCalledWith("/signin");
    });

    it("shows an unexpected error when verifyEmail returns a falsy value", async () => {
        vi.mocked(verifyEmail).mockResolvedValue(null as any);

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter verification code"), {
            target: { value: "123456" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Verify Email" }));

        expect(await screen.findByText("Unexpected error")).toBeInTheDocument();
    });

    it("shows the API error message when verification fails", async () => {
        vi.mocked(verifyEmail).mockRejectedValue(new Error("Invalid verification code"));

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter verification code"), {
            target: { value: "bad-code" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Verify Email" }));

        expect(
            await screen.findByText("Invalid verification code"),
        ).toBeInTheDocument();
    });

    it("shows a generic error when verification fails with a non-Error", async () => {
        vi.mocked(verifyEmail).mockRejectedValue("boom");

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter verification code"), {
            target: { value: "bad-code" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Verify Email" }));

        expect(await screen.findByText("Unexpected error")).toBeInTheDocument();
    });

    it("resends the verification code successfully", async () => {
        vi.mocked(resendVerificationCode).mockResolvedValue({ ok: true } as any);

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter your email to resend code"), {
            target: { value: "yun@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Resend Verification Code" }));

        await waitFor(() => {
            expect(resendVerificationCode).toHaveBeenCalledWith("yun@example.com");
        });

        expect(
            await screen.findByText("Verification code resent to your email."),
        ).toBeInTheDocument();
    });

    it("shows a fallback resend error when resendVerificationCode returns falsy", async () => {
        vi.mocked(resendVerificationCode).mockResolvedValue(null as any);

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter your email to resend code"), {
            target: { value: "yun@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Resend Verification Code" }));

        expect(await screen.findByText("Failed to resend code")).toBeInTheDocument();
    });

    it("shows the API resend error message when resend fails", async () => {
        vi.mocked(resendVerificationCode).mockRejectedValue(new Error("Email not found"));

        renderComponent();

        fireEvent.change(screen.getByPlaceholderText("Enter your email to resend code"), {
            target: { value: "missing@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Resend Verification Code" }));

        expect(await screen.findByText("Email not found")).toBeInTheDocument();
    });
});