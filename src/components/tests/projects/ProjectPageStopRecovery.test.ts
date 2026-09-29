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

  return source.slice(
    startIndex,
    endIndex,
  );
}

describe(
  "ProjectPage Stop recovery regression",
  () => {
    it(
      "warns when Stop recovers a protocol whose process was already gone",
      () => {
        const stopHandler = sourceSlice(
          "const res = await svc.stopProtocol(projectName, ids);",
          "clearAllSelectionHard();",
        );

        expect(stopHandler).toContain(
          "getStopRecoveryNotice(res)",
        );

        expect(stopHandler).toContain(
          "toast(recoveryNotice",
        );

        expect(source).toContain(
          "The protocol process was no longer running. ",
        );

        expect(source).toContain(
          "The protocol has been marked as aborted.",
        );
      },
    );
  },
);
