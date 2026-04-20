import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach, vi } from "vitest";
import SignUpForm from "@/components/auth/SignUpForm";
import { register } from "@/api/auth";

const mockNavigate = vi.fn();

vi.mock("@/api/auth", () => ({
    register: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        Link: ({ to, children, ...props }: any) => (
            <a href={to} {...props}>
                {children}
            </a>
        ),
    };
});

vi.mock("@/icons", () => ({
    EyeIcon: (props: any) => <svg data-testid="eye-open-icon" {...props} />,
    EyeCloseIcon: (props: any) => <svg data-testid="eye-close-icon" {...props} />,
}));

vi.mock("@/components/form/Label", () => ({
    default: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("@/components/form/input/InputField", () => ({
    default: ({ value, onChange, ...props }: any) => (
        <input value={value} onChange={onChange} {...props} />
    ),
}));

vi.mock("@/components/form/input/Checkbox", () => ({
    default: ({ checked, onChange, ...props }: any) => (
        <input
            {...props}
            aria-label="Accept terms"
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
        />
    ),
}));

function renderComponent() {
    return render(
        <MemoryRouter>
            <SignUpForm />
        </MemoryRouter>,
    );
}

function fillForm() {
    fireEvent.change(screen.getByPlaceholderText("Enter your first name"), {
        target: { value: "Yun" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your last name"), {
        target: { value: "Fonseca" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your institution"), {
        target: { value: "CNB-CSIC" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
        target: { value: "yun@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
        target: { value: "secret123" },
    });
}

describe("SignUpForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders all signup fields and links", () => {
        renderComponent();

        expect(screen.getByRole("heading", { name: "Sign Up" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter your first name")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter your last name")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter your institution")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeDisabled();
        expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/signin");
    });

    it("toggles password visibility", () => {
        renderComponent();

        const passwordInput = screen.getByPlaceholderText("Enter your password") as HTMLInputElement;
        expect(passwordInput.type).toBe("password");

        fireEvent.click(screen.getByTestId("eye-close-icon").parentElement!);
        expect(passwordInput.type).toBe("text");

        fireEvent.click(screen.getByTestId("eye-open-icon").parentElement!);
        expect(passwordInput.type).toBe("password");
    });

    it("enables the submit button when terms are accepted and there are no errors", () => {
        renderComponent();

        fillForm();

        const submitButton = screen.getByRole("button", { name: "Sign Up" });
        expect(submitButton).toBeDisabled();

        fireEvent.click(screen.getByLabelText("Accept terms"));
        expect(submitButton).toBeEnabled();
    });

    it("submits user data and navigates to verify-email on success", async () => {
        vi.mocked(register).mockResolvedValue(undefined as any);

        renderComponent();
        fillForm();
        fireEvent.click(screen.getByLabelText("Accept terms"));
        fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

        await waitFor(() => {
            expect(register).toHaveBeenCalledWith({
                email: "yun@example.com",
                password: "secret123",
                firstName: "Yun",
                lastName: "Fonseca",
                institution: "CNB-CSIC",
            });
        });

        expect(mockNavigate).toHaveBeenCalledWith("/verify-email", {
            state: { email: "yun@example.com" },
        });
    });

    it("shows an inline email error when the email is already registered", async () => {
        vi.mocked(register).mockRejectedValue(new Error("Email already registered"));

        renderComponent();
        fillForm();
        fireEvent.click(screen.getByLabelText("Accept terms"));
        fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

        expect(
            await screen.findByText("This email is already registered"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Sign Up" })).toBeDisabled();
    });

    it("clears the email error when the email field changes", async () => {
        vi.mocked(register).mockRejectedValueOnce(new Error("Email already registered"));

        renderComponent();
        fillForm();
        fireEvent.click(screen.getByLabelText("Accept terms"));
        fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

        expect(
            await screen.findByText("This email is already registered"),
        ).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
            target: { value: "new@example.com" },
        });

        await waitFor(() => {
            expect(screen.queryByText("This email is already registered")).not.toBeInTheDocument();
        });
    });

    it("shows a general error for other Error instances", async () => {
        vi.mocked(register).mockRejectedValue(new Error("Signup failed on backend"));

        renderComponent();
        fillForm();
        fireEvent.click(screen.getByLabelText("Accept terms"));
        fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

        expect(
            await screen.findByText("Signup failed on backend"),
        ).toBeInTheDocument();
    });

    it("shows a generic error for non-Error rejections", async () => {
        vi.mocked(register).mockRejectedValue({});

        renderComponent();
        fillForm();
        fireEvent.click(screen.getByLabelText("Accept terms"));
        fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

        expect(
            await screen.findByText("Unexpected error during signup"),
        ).toBeInTheDocument();
    });

    it("shows the terms error when the form is submitted without accepting terms", async () => {
        renderComponent();
        fillForm();

        const form = screen.getByRole("button", { name: "Sign Up" }).closest("form");
        expect(form).not.toBeNull();

        fireEvent.submit(form!);

        expect(
            await screen.findByText("You must accept the Terms and Conditions"),
        ).toBeInTheDocument();
        expect(register).not.toHaveBeenCalled();
    });
});