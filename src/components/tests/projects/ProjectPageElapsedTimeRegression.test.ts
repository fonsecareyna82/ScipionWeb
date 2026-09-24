import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectPagePath = path.resolve(
  process.cwd(),
  "src/pages/Dashboard/projects/ProjectPage.tsx",
);

const source = fs.readFileSync(projectPagePath, "utf8");

function sourceSlice(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("ProjectPage protocol elapsed-time regression", () => {
  it("snaps terminal protocols to the authoritative final elapsed value", () => {
    const mergeNodeBlock = sourceSlice(
      "function mergeNodeElapsedTick(",
      "function mergeTableElapsedTick(",
    );

    const nodeTerminalMatch = mergeNodeBlock.match(
      /if\s*\(\s*!isElapsedTimerStatus\(\s*freshStatus\s*\)\s*\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*const continuesActiveSession/,
    );

    expect(nodeTerminalMatch).not.toBeNull();

    const terminalNodeBranch = nodeTerminalMatch?.[1] ?? "";

    expect(terminalNodeBranch).toContain("tick: backendElapsed");
    expect(terminalNodeBranch).not.toContain("Math.min(");

    const mergeTableBlock = sourceSlice(
      "function mergeTableElapsedTick(",
      "interface ContextMenuState",
    );

    const tableTerminalMatch = mergeTableBlock.match(
      /if\s*\(\s*!isElapsedTimerStatus\(\s*freshRow\?\.status\s*,?\s*\)\s*\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*const continuesActiveSession/,
    );

    expect(tableTerminalMatch).not.toBeNull();

    const terminalTableBranch = tableTerminalMatch?.[1] ?? "";

    expect(terminalTableBranch).toContain("tick: backendElapsed");
    expect(terminalTableBranch).not.toContain("Math.min(");
  });

  it("ticks only active protocols and does not wait for a stale backend target", () => {
    const tickerBlock = sourceSlice(
      "/* ------------------------ Ticks updater ------------------------ */",
      "/* ------------------------ Layout change effect ------------------------ */",
    );

    expect(tickerBlock).toMatch(
      /!isElapsedTimerStatus\(\s*node\.data\?\.status\s*\)/,
    );

    expect(tickerBlock).toMatch(
      /!isElapsedTimerStatus\(\s*row\.status\s*\)/,
    );

    expect(tickerBlock).not.toContain("targetElapsed");

    const localTickUpdates =
      tickerBlock.match(/tick:\s*currentElapsed\s*\+\s*1/g) ?? [];

    expect(localTickUpdates).toHaveLength(2);
  });
});
