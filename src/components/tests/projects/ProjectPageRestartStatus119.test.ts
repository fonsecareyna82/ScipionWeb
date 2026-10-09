import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildGraphElements } from "@/utils/graph_utils";

// Exercise the existing production merge functions without refactoring them
// in the RED. TypeScript type annotations are removed by the TS compiler.
const pageSource = fs.readFileSync(path.resolve(process.cwd(), "src/pages/Dashboard/projects/ProjectPage.tsx"), "utf8");
const start = pageSource.indexOf('// "launched" is intentionally excluded');
const end = pageSource.indexOf("interface ContextMenuState", start);
if (start < 0 || end <= start) throw new Error("Could not locate current elapsed merge functions in ProjectPage.tsx");
const compiled = ts.transpileModule(pageSource.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const merges = new Function(`${compiled}\nreturn { mergeNodeElapsedTick, mergeTableElapsedTick };`)() as {
  mergeNodeElapsedTick: (fresh: any, current: any) => any;
  mergeTableElapsedTick: (fresh: any, current: any) => any;
};

const node = (status: string, tick: number, session: string) => ({
  id: "25", position: { x: 0, y: 0 },
  data: { status, tick, elapsedTime: String(tick), elapsedSessionId: session },
});

const row = (status: string, tick: number, session: string) => ({
  id: "25", status, tick, elapsedTime: String(tick), elapsedSessionId: session,
});

describe("#119 restart snapshot consistency RED", () => {
  it("does not visually regress running to scheduled within one elapsed session (graph)", () => {
    const fresh = node("scheduled", 5, "current-run");
    const current = node("running", 6, "current-run");
    const merged = merges.mergeNodeElapsedTick(fresh, current);
    expect(merged.data.status).toBe("running");
    expect(merged.data.tick).toBe(6);
  });

  it("does not visually regress running to scheduled within one elapsed session (table)", () => {
    const merged = merges.mergeTableElapsedTick(row("scheduled", 5, "current-run"), row("running", 6, "current-run"));
    expect(merged.status).toBe("running");
    expect(merged.tick).toBe(6);
  });

  it("does accept scheduled for a distinct new restart session", () => {
    const current = node("running", 6, "old-run");
    const fresh = node("scheduled", 0, "new-run");
    const merged = merges.mergeNodeElapsedTick(fresh, current);
    expect(merged.data.status).toBe("scheduled");
    expect(merged.data.tick).toBe(0);
  });

  it("preserves the backend elapsed session identity in table graph projection", () => {
    const protocols: any = {
      PROJECT: { label: "PROJECT", children: ["25"], parents: [] },
      "25": { protocolId: "25", label: "ProtUnionSet", children: [], parents: [], status: "running", elapsedTime: "6", elapsedSessionId: "run-119" },
    };
    const projected = buildGraphElements("test-project", protocols, "table");
    expect(projected.table?.find((p: any) => p.id === "25")?.elapsedSessionId).toBe("run-119");
  });
});
