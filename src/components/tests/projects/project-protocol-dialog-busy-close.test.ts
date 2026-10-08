import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/Dashboard/projects/ProjectPage.tsx", "utf8");

const dialogs = [
  { name: "Delete", open: "dlgDelete.open", busy: "deleteBusy", reset: "setDeleteBusy(false)" },
  { name: "Restart", open: "dlgRestartAll.open", busy: "restartAllBusy", reset: "setRestartAllBusy(false)" },
  { name: "Continue", open: "dlgContinueAll.open", busy: "continueAllBusy", reset: "setContinueAllBusy(false)" },
  { name: "Stop", open: "dlgStop.open", busy: "stopBusy", reset: "setStopBusy(false)" },
];

describe("Protocol confirmation dialogs during pending actions", () => {
  for (const dialog of dialogs) {
    it(`${dialog.name} rejects accidental closing while busy`, () => {
      const start = source.indexOf(`open={${dialog.open}}`);
      expect(start).toBeGreaterThan(-1);
      const section = source.slice(start, source.indexOf("<DialogContent", start));
      expect(section).toContain(`if (!open && !${dialog.busy})`);
      expect(section).not.toContain(dialog.reset);
    });
  }
});
