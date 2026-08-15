import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach, vi } from "vitest";
import SignInForm from "@/components/auth/SignInForm";
import { login } from "@/api/auth";

const mockNavigate = vi.fn();

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
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
  default: ({ checked, onChange }: any) => (
    <input
      aria-label="Keep me logged in"
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/button/Button", () => ({
  default: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

function renderComponent() {
  return render(
    <MemoryRouter>
      <SignInForm />
    </MemoryRouter>,
  );
}

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form fields and links", () => {
    renderComponent();

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("info@gmail.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/reset-password");
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup");
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

  it("submits credentials and navigates on successful login", async () => {
    vi.mocked(login).mockResolvedValue(undefined as any);

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("user@example.com", "secret123");
    });

    expect(mockNavigate).toHaveBeenCalledWith("/home");
  });

  it("shows a friendly message for invalid credentials", async () => {
    vi.mocked(login).mockRejectedValue(new Error("Invalid credentials"));

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "wrong-password" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Invalid credentials. Check your email and password."),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a friendly message when email is not verified", async () => {
    vi.mocked(login).mockRejectedValue(new Error("Email not verified"));

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("You must verify your email before logging in."),
    ).toBeInTheDocument();
  });

  it("shows the original error message for other Error instances", async () => {
    vi.mocked(login).mockRejectedValue(new Error("Backend temporarily unavailable"));

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Backend temporarily unavailable"),
    ).toBeInTheDocument();
  });

  it("shows a generic message for non-Error rejections", async () => {
    vi.mocked(login).mockRejectedValue("random failure");

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Unexpected error during login"),
    ).toBeInTheDocument();
  });
});