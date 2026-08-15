// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SmokeHarness } from "@/test/SmokeHarness";

describe("test infrastructure", () => {
  it("renders a component through the alias path", () => {
    render(<SmokeHarness />);

    expect(
      screen.getByRole("heading", { name: "ScipionWeb test harness" }),
    ).toBeInTheDocument();
  });
});