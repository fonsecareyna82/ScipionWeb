import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard/projects/ProjectPage.tsx"), "utf8");
const pasteHandler = source.split("  const handlePasteWorkflow = async () => {")[1]?.split("  const getNodeLabelById =")[0];

describe("Paste workflow in-flight feedback contract", () => {
  it("provides a synchronous in-flight guard against repeated paste requests", () => {
    expect(pasteHandler).toBeDefined();
    expect(pasteHandler).toMatch(/if \(pasteBusyRef\.current\) return;/);
    expect(pasteHandler).toContain("pasteBusyRef.current = true;");
    expect(pasteHandler).toContain("pasteBusyRef.current = false;");
  });

  it("shows a loading toast that is replaced on success or error", () => {
    expect(pasteHandler).toBeDefined();
    expect(pasteHandler).toMatch(/toast\.loading\("Pasting workflow\.\.\."\)/);
    expect(pasteHandler).toContain("{ id: pasteToastId }");
  });
});
