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
  const endIndex = source.indexOf(
    end,
    startIndex + start.length,
  );

  expect(
    startIndex,
    `Missing start marker: ${start}`,
  ).toBeGreaterThanOrEqual(0);

  expect(
    endIndex,
    `Missing end marker: ${end}`,
  ).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe(
  "ProjectPage protocol form identity regression",
  () => {
    it(
      "rejects mismatched protocol details before graph sync or form open",
      () => {
        expect(source).toContain(
          "function protocolDetailsMatchRequestedId(",
        );

        const openBlock = sourceSlice(
          "const openFormForNode = useCallback(",
          "const handleNodeDoubleClick = useCallback(",
        );

        expect(openBlock).toContain(
          "protocolDetailsMatchRequestedId(id, details)",
        );

        expect(openBlock).toContain(
          "Protocol identity mismatch",
        );

        const guardIndex = openBlock.indexOf(
          "protocolDetailsMatchRequestedId(id, details)",
        );

        const graphSyncIndex = openBlock.indexOf(
          "syncProtocolDetailsToGraph(",
        );

        const openFormIndex = openBlock.indexOf(
          "setOpenForms((prev) => [",
        );

        expect(guardIndex).toBeGreaterThanOrEqual(0);
        expect(graphSyncIndex).toBeGreaterThan(guardIndex);
        expect(openFormIndex).toBeGreaterThan(guardIndex);
      },
    );

    it(
      "ignores mismatched details during background form refresh",
      () => {
        const refreshBlock = sourceSlice(
          "const refreshOpenFormsDetails = useCallback(",
          "// --- Smooth dock animations (FLIP) ---",
        );

        expect(refreshBlock).toContain(
          "protocolDetailsMatchRequestedId(result.value.id, result.value.details)",
        );
      },
    );
  },
);
