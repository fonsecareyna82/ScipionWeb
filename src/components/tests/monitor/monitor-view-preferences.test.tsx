import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  VIEW_STORAGE_KEY, monitorViewStorageKey, readMonitorViewPreferences, useMonitorViewPreferences,
} from "@/components/monitor/monitor-view-preferences";

function Preferences() {
  const { preferences, setVisible, restore } = useMonitorViewPreferences();
  return <>
    <output aria-label="SPA drift">{String(preferences.spa.drift !== false)}</output>
    <output aria-label="Tomo defocus">{String(preferences.tomo.defocus !== false)}</output>
    <button onClick={() => setVisible("spa", "drift", false)}>Hide drift</button>
    <button onClick={() => setVisible("tomo", "defocus", false)}>Hide tomo defocus</button>
    <button onClick={() => restore("spa")}>Restore SPA</button>
  </>;
}

function token(subject: string) {
  return `${btoa("{}")}.${btoa(JSON.stringify({ sub: subject }))}.signature`;
}

afterEach(() => localStorage.clear());

describe("Monitor view preferences", () => {
  it("validates saved values and falls back safely on malformed storage", () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "invalid JSON");
    expect(readMonitorViewPreferences(VIEW_STORAGE_KEY)).toEqual({ spa: {}, tomo: {} });
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ spa: { drift: false, defocus: "no", unknown: false }, tomo: { defocus: false } }));
    expect(readMonitorViewPreferences(VIEW_STORAGE_KEY)).toEqual({ spa: { drift: false }, tomo: { defocus: false } });
  });

  it("persists selections across mounts and restores only the current mode", () => {
    const first = render(<Preferences />);
    fireEvent.click(screen.getByRole("button", { name: "Hide drift" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide tomo defocus" }));
    first.unmount();
    render(<Preferences />);
    expect(screen.getByLabelText("SPA drift")).toHaveTextContent("false");
    expect(screen.getByLabelText("Tomo defocus")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Restore SPA" }));
    expect(screen.getByLabelText("SPA drift")).toHaveTextContent("true");
    expect(screen.getByLabelText("Tomo defocus")).toHaveTextContent("false");
  });

  it("keeps different users' views separate and survives token refresh", () => {
    localStorage.setItem("accessToken", token("alice@example.org"));
    const first = render(<Preferences />);
    fireEvent.click(screen.getByRole("button", { name: "Hide drift" }));
    const aliceKey = monitorViewStorageKey();
    first.unmount();
    localStorage.setItem("accessToken", token("bob@example.org"));
    const second = render(<Preferences />);
    expect(screen.getByLabelText("SPA drift")).toHaveTextContent("true");
    expect(monitorViewStorageKey()).not.toBe(aliceKey);
    second.unmount();
    localStorage.setItem("accessToken", `${btoa("{}")}.${btoa(JSON.stringify({ sub: "alice@example.org", exp: 9999999999 }))}.signature`);
    render(<Preferences />);
    expect(monitorViewStorageKey()).toBe(aliceKey);
    expect(screen.getByLabelText("SPA drift")).toHaveTextContent("false");
  });
});
