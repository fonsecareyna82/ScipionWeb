import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync("src/pages/Dashboard/projects/ProjectPage.css", "utf8");
const page = fs.readFileSync("src/pages/Dashboard/projects/ProjectPage.tsx", "utf8");

const lightSelector = /\.projectpage-widget-root \.pp-flowControlBtn\[aria-pressed="true"\],\s*\.projectpage-widget-root \.pp-chipBtn\.pp-logsToggle\[aria-pressed="true"\]\s*\{([^}]*)\}/;
const darkSelector = /\.projectpage-widget-root\.dark \.pp-flowControlBtn\[aria-pressed="true"\],\s*\.projectpage-widget-root\.dark \.pp-chipBtn\.pp-logsToggle\[aria-pressed="true"\]\s*\{([^}]*)\}/;

describe("Workflow pressed control colors", () => {
  it("preserves Logs, Mini Map, and Focus state bindings", () => {
    const start = page.indexOf('<div className="pp-flowControls">');
    const end = page.indexOf("<ReactFlowProvider>", start);
    const controls = page.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(controls).toContain('className="pp-flowControlBtn pp-logsToggle"');
    expect(controls).toContain("aria-pressed={workflowLogsOpen}");
    expect(controls).toContain("aria-pressed={miniMapEnabled}");
    expect(controls).toContain("aria-pressed={focusModeEnabled}");
    expect(page).toContain('className="pp-chipBtn pp-logsToggle"');
  });

  it("uses one darker neutral pressed background for all three controls and Table Logs", () => {
    const light = css.match(lightSelector);
    expect(light, "Use one shared active state instead of a blue Logs-only rule").not.toBeNull();
    expect(light![1]).toMatch(/background-color:\s*rgba\(71,\s*85,\s*105,\s*0\.22\)\s*!important/);
    expect(light![1]).toMatch(/border-color:\s*rgba\(71,\s*85,\s*105,\s*0\.40\)\s*!important/);
    expect(light![1]).toMatch(/color:\s*var\(--ppInk\)\s*!important/);
  });

  it("uses a visibly darker pressed surface in dark mode", () => {
    const dark = css.match(darkSelector);
    expect(dark, "Dark mode must not inherit the light-mode pressed background").not.toBeNull();
    expect(dark![1]).toMatch(/background-color:\s*rgba\(2,\s*6,\s*23,\s*0\.38\)\s*!important/);
    expect(dark![1]).toMatch(/border-color:\s*rgba\(148,\s*163,\s*184,\s*0\.45\)\s*!important/);
  });

  it("keeps selected hover neutral and removes the blue Logs override", () => {
    expect(css).not.toMatch(/\.projectpage-widget-root \.pp-logsToggle\[aria-pressed="true"\]\s*\{/);
    expect(css).toMatch(/\.pp-flowControlBtn\[aria-pressed="true"\]:hover:not\(:disabled\)/);
    expect(css).toMatch(/\.pp-chipBtn\.pp-logsToggle\[aria-pressed="true"\]:hover:not\(:disabled\)/);
  });
});
