import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard/projects/ProjectPage.tsx"), "utf8");
const handler = source.split("  const submitRename = async () => {")[1]?.split("  /* ------------------------ Controls")[0];
const dialog = source.split("          open={dlgRename.open}")[1]?.split("          open={dlgResetFrom.open}")[0];

describe("Protocol annotation in-flight contract", () => {
  it("keeps the dialog open until the API completes and preserves it on errors", () => {
    expect(handler).toBeDefined();
    expect(handler).toMatch(/await svc\.renameProtocol[\s\S]*setDlgRename\(emptyRenameDialog\)/);
    expect(handler).toMatch(/if \(renameBusyRef\.current\) return;/);
    expect(handler).toMatch(/finally \{[\s\S]*renameBusyRef\.current = false;/);
  });

  it("disables dialog controls and shows Saving while a request is in flight", () => {
    expect(dialog).toBeDefined();
    expect(dialog).toContain('if (!open && !renameBusy) setDlgRename(emptyRenameDialog);');
    expect(dialog).toContain('disabled={renameBusy}');
    expect(dialog).toContain('disabled={!dlgRename.id || renameBusy}');
    expect(dialog).toContain('{renameBusy ? "Saving..." : "Save annotation"}');
  });
});
