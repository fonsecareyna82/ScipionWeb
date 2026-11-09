import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ forgotPassword: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/api/auth", () => authMocks);
vi.mock("../../api/auth", () => authMocks);
vi.mock("@/pages/AuthPages/AuthPageLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/common/PageMeta", () => ({ default: () => null }));

import ForgotPassword from "@/pages/AuthPages/ForgotPassword";
import ResetPassword from "@/pages/AuthPages/ResetPassword";

describe("A forgotten password", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is asked for with the account's address, and says what comes next whatever the address", async () => {
    authMocks.forgotPassword.mockResolvedValue({ message: "If the address has an active account, a mail is on its way." });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: " ana@example.org " } });
    fireEvent.click(screen.getByRole("button", { name: "Mail me a link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("If the address has an active account");
    expect(authMocks.forgotPassword).toHaveBeenCalledWith("ana@example.org");
  });

  it("is chosen again with the link's token, both times the same", async () => {
    authMocks.resetPassword.mockResolvedValue({ message: "Your new password is set: sign in with it." });
    render(<MemoryRouter initialEntries={["/reset-password?token=abc123"]}><ResetPassword /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "n3wPassword" } });
    fireEvent.change(screen.getByLabelText(/Repeat it/), { target: { value: "n3wPasswor" } });
    expect(screen.getByText("The two passwords are not the same.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set the new password" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Repeat it/), { target: { value: "n3wPassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Set the new password" }));

    await waitFor(() => expect(authMocks.resetPassword).toHaveBeenCalledWith("abc123", "n3wPassword"));
    expect(await screen.findByRole("status")).toHaveTextContent("Your new password is set");
  });

  it("says a used or expired link no longer works, and offers a new one", async () => {
    authMocks.resetPassword.mockRejectedValue(new Error("This link no longer works: ask for a new one."));
    render(<MemoryRouter initialEntries={["/reset-password?token=old"]}><ResetPassword /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "n3wPassword" } });
    fireEvent.change(screen.getByLabelText(/Repeat it/), { target: { value: "n3wPassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Set the new password" }));

    expect(await screen.findByText(/This link no longer works/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("without a token, sends to ask for a link", () => {
    render(<MemoryRouter initialEntries={["/reset-password"]}><ResetPassword /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Ask for one" })).toHaveAttribute("href", "/forgot-password");
  });
});
