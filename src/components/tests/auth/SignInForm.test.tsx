import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock("../../../api/auth", () => ({
  login: mockLogin,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children, ...rest }: any) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

import SignInForm from "../../auth/SignInForm";

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sign in form fields and actions", () => {
    render(<SignInForm />);

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("info@gmail.com")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter your password"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Forgot password?")).toHaveAttribute(
      "href",
      "/reset-password",
    );
    expect(screen.getByText("Sign Up")).toHaveAttribute("href", "/signup");
  });

  it("submits credentials and navigates to home on successful login", async () => {
    mockLogin.mockResolvedValue({ accessToken: "token" });

    render(<SignInForm />);

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("user@example.com", "secret123");
    });

    expect(mockNavigate).toHaveBeenCalledWith("/home");
  });

  it("shows a friendly message for invalid credentials", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid credentials"));

    render(<SignInForm />);

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "wrong-password" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText(
        "Invalid credentials. Check your email and password.",
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a friendly message when the email is not verified", async () => {
    mockLogin.mockRejectedValue(new Error("Email not verified"));

    render(<SignInForm />);

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText(
        "You must verify your email before logging in.",
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows the backend error message for unexpected login failures", async () => {
    mockLogin.mockRejectedValue(new Error("Backend unavailable"));

    render(<SignInForm />);

    fireEvent.change(screen.getByPlaceholderText("info@gmail.com"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Backend unavailable")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});