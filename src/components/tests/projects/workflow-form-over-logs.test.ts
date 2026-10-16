import fs from "node:fs";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync("src/pages/Dashboard/projects/ProjectPage.tsx", "utf8");
const css = fs.readFileSync("src/pages/Dashboard/projects/ProjectPage.css", "utf8");
const logsDock = fs.readFileSync("src/components/projects/WorkflowLogsDock.tsx", "utf8");
const formDock = page.split("{/* ===== Multi-Form Dock (right side) ===== */}")[1]?.split("{workflowLogsOpen && (")[0] ?? "";

describe("Workflow logs coexist with full-height protocol forms", () => {
  it("keeps the protocol form dock at full content height with the logs panel open", () => {
    expect(formDock).not.toBe("");
    expect(formDock).toMatch(/className="dock-wrapper"\s*style=\{\{[\s\S]*?bottom:\s*0\s*,/);
  });

  it("never subtracts logs height from the protocol form dock", () => {
    expect(formDock).not.toContain("--ppLogsDockHeight");
  });

  it("still reserves the logs area below the graph and Table view", () => {
    expect(page).toContain('style={{ bottom: "var(--ppLogsDockHeight, 0px)" }}');
    expect(page).toContain('"--ppLogsDockHeight": workflowLogsOpen ?');
    expect(css).toMatch(/\.projectpage-widget-root \.pp-workflowContent > \.ppt-root\s*\{\s*bottom:\s*var\(--ppLogsDockHeight, 0px\);/);
    expect(logsDock).toContain('height: "var(--ppLogsDockHeight, 0px)"');
  });

  it("layers the protocol forms above logs without obstructing the empty canvas", () => {
    expect(formDock).toMatch(/zIndex:\s*60/);
    expect(logsDock).toMatch(/zIndex:\s*55/);
    expect(css).toMatch(/\.projectpage-widget-root \.dock-wrapper\s*\{[^}]*pointer-events:\s*none;/);
    expect(css).toMatch(/\.projectpage-widget-root \.dock-scroll\s*\{[^}]*pointer-events:\s*auto;/);
  });

  it("preserves docked and floating modes and full-height form layout", () => {
    expect(css).toMatch(/\.projectpage-widget-root \.dock-wrapper\s*\{[^}]*inset-block:\s*0;/);
    expect(css).toMatch(/\.projectpage-widget-root \.dock-panel\s*\{[^}]*height:\s*100%;/);
    expect(formDock).toContain('"dock-panel-host-floating"');
    expect(formDock).toContain('"dock-panel"');
    expect(formDock).toContain('<ProtocolForm');
  });
});
