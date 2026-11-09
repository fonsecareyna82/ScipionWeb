import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PageErrorBoundary from "@/components/common/PageErrorBoundary";

let failing = true;
function Fragile({ message = "Tooltip is not defined" }: { message?: string }) {
  if (failing) throw new Error(message);
  return <p>Users list</p>;
}

describe("An error inside a part of the web", () => {
  beforeEach(() => {
    failing = true;
    // React logs what it caught; the test only looks at what is shown
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows what went wrong and a way out instead of a blank web, and can be tried again", () => {
    render(<PageErrorBoundary><Fragile /></PageErrorBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("This page ran into a problem");
    expect(screen.getByText("Tooltip is not defined")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/home");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Users list")).toBeInTheDocument();
  });

  it("starts clean on another page", () => {
    const { rerender } = render(<PageErrorBoundary resetKey="/settings"><Fragile /></PageErrorBoundary>);
    expect(screen.getByTestId("page-error")).toBeInTheDocument();

    failing = false;
    rerender(<PageErrorBoundary resetKey="/projects"><Fragile /></PageErrorBoundary>);

    expect(screen.getByText("Users list")).toBeInTheDocument();
  });

  it("hides a broken part of the frame and leaves the rest", () => {
    render(<div><PageErrorBoundary silent><Fragile /></PageErrorBoundary><p>The page</p></div>);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("The page")).toBeInTheDocument();
  });

  it("asks to reload when the web was updated while open", () => {
    render(<PageErrorBoundary><Fragile message="Failed to fetch dynamically imported module: /assets/Settings-1a2b.js" /></PageErrorBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("ScipionWeb was updated");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  });
});
