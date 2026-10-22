import { describe, expect, it } from "vitest";

import { markMirroredStylesDirty, mirrorDocumentStyles } from "@/components/ui/external-window/ExternalWindowPortal";

// A source page whose stylesheets count how often a rule is turned into text.
let textReads = 0;

function rule(cssText: string) {
  return { get cssText() { textReads += 1; return cssText; } };
}

function sheet(rules: string[]) {
  const element = document.createElement("style");
  return { ownerNode: element, cssRules: rules.map(rule) };
}

function source(sheets: Array<ReturnType<typeof sheet>>) {
  return { styleSheets: sheets } as unknown as Document;
}

function mirrored(target: Document) {
  return Array.from(target.head.querySelectorAll("[data-scipion-external-style]")).map((node) => node.textContent);
}

// A document with a window of its own, as a popup's, so its <style> elements get their stylesheets.
function newTarget() {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  return frame.contentDocument!;
}

describe("mirrorDocumentStyles", () => {
  it("copies each stylesheet once and does not turn unchanged ones into text again", () => {
    const sheets = [sheet([".a { color: red; }"]), sheet([".b { color: blue; }", ".c { color: green; }"])];
    const target = newTarget();
    mirrorDocumentStyles(source(sheets), target);
    expect(mirrored(target)).toEqual([".a { color: red; }", ".b { color: blue; }\n.c { color: green; }"]);

    textReads = 0;
    mirrorDocumentStyles(source(sheets), target);
    mirrorDocumentStyles(source(sheets), target);

    expect(textReads).toBe(0);
  });

  it("copies only the new rules of a sheet that grew at its end", () => {
    const grown = sheet([".a { color: red; }"]);
    const target = newTarget();
    mirrorDocumentStyles(source([grown]), target);

    grown.cssRules.push(rule(".b { color: blue; }"));
    textReads = 0;
    mirrorDocumentStyles(source([grown]), target);

    expect(textReads).toBe(1);
    const copy = target.head.querySelector("style") as HTMLStyleElement;
    expect(Array.from(copy.sheet!.cssRules).map((r) => r.cssText.replace(/\s/g, ""))).toEqual([
      ".a{color:red;}", ".b{color:blue;}"]);
  });

  it("copies a stylesheet again when its element changed", () => {
    const changed = sheet([".a { color: red; }"]);
    const target = newTarget();
    mirrorDocumentStyles(source([changed]), target);

    changed.cssRules = [rule(".a { color: green; }")];
    markMirroredStylesDirty(target, [{ target: changed.ownerNode } as unknown as MutationRecord]);
    mirrorDocumentStyles(source([changed]), target);

    expect(mirrored(target)).toEqual([".a { color: green; }"]);
  });

  it("follows the source order and drops the stylesheets that are gone", () => {
    const first = sheet([".a { color: red; }"]);
    const second = sheet([".b { color: blue; }"]);
    const target = newTarget();
    mirrorDocumentStyles(source([first, second]), target);

    const inserted = sheet([".c { color: green; }"]);
    mirrorDocumentStyles(source([first, inserted, second]), target);
    expect(mirrored(target)).toEqual([".a { color: red; }", ".c { color: green; }", ".b { color: blue; }"]);

    mirrorDocumentStyles(source([inserted, second]), target);
    expect(mirrored(target)).toEqual([".c { color: green; }", ".b { color: blue; }"]);
  });
});
