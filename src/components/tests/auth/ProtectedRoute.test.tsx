import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ProtectedRoute from "../../auth/ProtectedRoute";
import { jwtDecode } from "jwt-decode";

vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => <div>Redirect to {to}</div>,
}));

function renderProtectedRoute() {
  return render(
    <ProtectedRoute>
      <div>Protected content</div>
    </ProtectedRoute>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("redirects to root when there is no token", () => {
    renderProtectedRoute();

    expect(screen.getByText("Redirect to /")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when the token is valid and not expired", () => {
    localStorage.setItem("accessToken", "valid-token");

    (jwtDecode as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    renderProtectedRoute();

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText("Redirect to /")).not.toBeInTheDocument();
  });

  it("removes the token and redirects when the token is expired", () => {
    localStorage.setItem("accessToken", "expired-token");

    (jwtDecode as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    renderProtectedRoute();

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(screen.getByText("Redirect to /")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("removes the token and redirects when decoding fails", () => {
    localStorage.setItem("accessToken", "bad-token");

    (jwtDecode as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Invalid token");
    });

    renderProtectedRoute();

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(screen.getByText("Redirect to /")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});