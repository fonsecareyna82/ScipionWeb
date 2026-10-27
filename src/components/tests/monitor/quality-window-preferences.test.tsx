import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QUALITY_WINDOW_STORAGE_KEY, readQualityWindows, useQualityWindows } from "@/components/monitor/quality-window-preferences";

function Windows() {
  const { sizes, setSize } = useQualityWindows();
  return <>
    <output aria-label="SPA window">{sizes.spa}</output>
    <output aria-label="Tomo window">{sizes.tomo}</output>
    <button onClick={() => setSize("spa", 25)}>SPA 25</button>
    <button onClick={() => setSize("tomo", 10)}>Tomo 10</button>
  </>;
}

afterEach(() => localStorage.clear());

describe("Quality window preferences", () => {
  it("defaults each invalid saved size independently", () => {
    localStorage.setItem(QUALITY_WINDOW_STORAGE_KEY, "invalid");
    expect(readQualityWindows(QUALITY_WINDOW_STORAGE_KEY)).toEqual({ spa: 100, tomo: 20 });
    localStorage.setItem(QUALITY_WINDOW_STORAGE_KEY, JSON.stringify({ spa: 25, tomo: 2.5 }));
    expect(readQualityWindows(QUALITY_WINDOW_STORAGE_KEY)).toEqual({ spa: 25, tomo: 20 });
    localStorage.setItem(QUALITY_WINDOW_STORAGE_KEY, JSON.stringify({ spa: 0, tomo: -1 }));
    expect(readQualityWindows(QUALITY_WINDOW_STORAGE_KEY)).toEqual({ spa: 100, tomo: 20 });
  });

  it("persists independent SPA and tomography sizes across mounts", () => {
    const first = render(<Windows />);
    fireEvent.click(screen.getByRole("button", { name: "SPA 25" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomo 10" }));
    first.unmount();
    render(<Windows />);
    expect(screen.getByLabelText("SPA window")).toHaveTextContent("25");
    expect(screen.getByLabelText("Tomo window")).toHaveTextContent("10");
  });

  it("keeps each account's sizes separate", () => {
    const token = (sub: string) => `${btoa("{}")}.${btoa(JSON.stringify({ sub }))}.signature`;
    localStorage.setItem("accessToken", token("alice@example.org"));
    const first = render(<Windows />);
    fireEvent.click(screen.getByRole("button", { name: "SPA 25" }));
    first.unmount();
    localStorage.setItem("accessToken", token("bob@example.org"));
    render(<Windows />);
    expect(screen.getByLabelText("SPA window")).toHaveTextContent("100");
  });
});
