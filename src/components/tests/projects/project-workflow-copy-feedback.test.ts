import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/Dashboard/projects/ProjectPage.tsx", "utf8");
const copySource = source.split("  const copyWorkflowProtocols =", 2)[1]?.split("  const handleCopyWorkflow =", 1)[0] ?? "";

describe("Copy workflow busy feedback", () => {
  it("guards against concurrent copy requests", () => {
    expect(source).toContain("const copyWorkflowBusyRef = useRef(false);");
    expect(copySource).toContain("if (copyWorkflowBusyRef.current) return;");
    expect(copySource).toContain("copyWorkflowBusyRef.current = true;");
    expect(copySource).toContain("copyWorkflowBusyRef.current = false;");
  });

  it("shows loading feedback until the request finishes", () => {
    expect(copySource).toContain('toast.loading("Copying workflow...")');
    expect(copySource).toContain("toast.dismiss(copyToastId);");
  });
});
