import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import UserPreferencesPanel from "./UserPreferencesPanel";
import type { UserSettings } from "@/services/ProjectService";

vi.mock("@/icons", () => ({ TreeIcon: () => <svg /> }));

const colors = { border: "#ddd", text: "#111", muted: "#666", card: "#fff", hover: "#eee", menu: "#fff",
    primary: "#2563eb" };

const initial: UserSettings = {
    theme: "light", uiDensity: "comfortable", fontScale: 1, language: "en", timeZone: "Europe/Madrid",
    workflowViewMode: "treeTb", graphMiniMapEnabled: true, graphFocusModeEnabled: false,
    protocolOutputThumbnailsEnabled: true, workflowsAutoRefreshSec: 5,
} as UserSettings;

let latest: UserSettings = initial;

function Harness() {
    const [value, setValue] = useState<UserSettings>(initial);
    latest = value;
    return (
        <UserPreferencesPanel value={value} onChange={(update) => setValue((prev) => update(prev))}
                              timeZoneOptions={["Europe/Madrid", "UTC"]} colors={colors} isDarkMode={false}
                              fieldSx={{}} menuPaperSx={{}} />
    );
}

describe("UserPreferencesPanel", () => {
    it("changes each preference from its own control", () => {
        render(<Harness />);

        fireEvent.click(screen.getByRole("button", { name: /Dark/ }));
        expect(latest.theme).toBe("dark");

        fireEvent.click(screen.getByRole("button", { name: "Large" }));
        expect(latest.fontScale).toBe(1.1);

        fireEvent.click(screen.getByRole("button", { name: /Compact/ }));
        expect(latest.uiDensity).toBe("compact");

        fireEvent.click(screen.getByRole("button", { name: /Grid/ }));
        expect(latest.workflowViewMode).toBe("grid");

        fireEvent.click(screen.getByLabelText("Focus mode"));
        expect(latest.graphFocusModeEnabled).toBe(true);
    });

    it("turns auto-refresh off and back on at 5 seconds", () => {
        render(<Harness />);
        expect(screen.getByText("Every 5 seconds")).toBeTruthy();

        fireEvent.click(screen.getByLabelText("Auto-refresh"));
        expect(latest.workflowsAutoRefreshSec).toBe(0);
        expect(screen.queryByText(/^Every /)).toBeNull();

        fireEvent.click(screen.getByLabelText("Auto-refresh"));
        expect(latest.workflowsAutoRefreshSec).toBe(5);
    });

    it("offers this computer's time zone when another one is chosen", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: /Use this computer's/ }));
        expect(latest.timeZone).toBe("");
        expect(screen.queryByRole("button", { name: /Use this computer's/ })).toBeNull();
    });
});
