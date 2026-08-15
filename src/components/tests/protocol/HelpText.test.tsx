import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import renderRichHelpText from "@/components/protocol/HelpText";

describe("HelpText", () => {
  it("renders plain text", () => {
    render(renderRichHelpText("Simple help text"));

    expect(screen.getByText("Simple help text")).toBeInTheDocument();
  });

  it("renders escaped newlines as separate lines", () => {
    render(renderRichHelpText("First line\\nSecond line"));

    expect(screen.getByText("First line")).toBeInTheDocument();
    expect(screen.getByText("Second line")).toBeInTheDocument();
  });

  it("renders bold segments wrapped in asterisks", () => {
    render(renderRichHelpText("Use *important* parameter"));

    const boldNode = screen.getByText("important");
    expect(boldNode).toBeInTheDocument();
    expect(boldNode.tagName.toLowerCase()).toBe("strong");
  });

  it("renders plain https links", () => {
    render(renderRichHelpText("Visit https://scipion.i2pc.es for details"));

    const link = screen.getByRole("link", { name: "https://scipion.i2pc.es" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://scipion.i2pc.es");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders www links with https in href", () => {
    render(renderRichHelpText("Open www.example.com now"));

    const link = screen.getByRole("link", { name: "www.example.com" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://www.example.com");
  });

  it("keeps trailing punctuation in display text but trims it from href", () => {
    render(renderRichHelpText("Read more at https://example.com/docs."));

    const link = screen.getByRole("link", { name: "https://example.com/docs." });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/docs");
  });

  it("renders org-style links with explicit label", () => {
    render(renderRichHelpText("[[https://example.com][Open docs]]"));

    const link = screen.getByRole("link", { name: "Open docs" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders org-style links without label using the url as label", () => {
    render(renderRichHelpText("[[https://example.com]]"));

    const link = screen.getByRole("link", { name: "https://example.com" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders bold text inside org-style link labels", () => {
    render(renderRichHelpText("[[https://example.com][Open *Docs*]]"));

    const link = screen.getByRole("link", { name: "Open Docs" });
    expect(link).toBeInTheDocument();

    const boldNode = screen.getByText("Docs");
    expect(boldNode.tagName.toLowerCase()).toBe("strong");
    expect(link).toContainElement(boldNode);
  });
});