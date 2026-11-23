import { afterEach, describe, expect, it } from "vitest";

import {
  formatInTimeZone, getDisplayPreferences, scaledFontSize, setDisplayPreferences, zonedParts,
} from "./displayPreferences";
import { createAppTheme } from "./muiTheme";

afterEach(() => setDisplayPreferences({ fontScale: 1, density: "comfortable", timeZone: undefined }));

describe("display preferences", () => {
  it("sets the text size and density on the page, and remembers them", () => {
    setDisplayPreferences({ fontScale: 1.25, density: "compact" });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--sw-font-scale")).toBe("1.25");
    expect(root.dataset.density).toBe("compact");
    expect(JSON.parse(localStorage.getItem("scipion.display")!)).toMatchObject({ fontScale: 1.25, density: "compact" });

    setDisplayPreferences({ fontScale: 1 });
    expect(root.style.getPropertyValue("--sw-font-scale")).toBe("");
  });

  it("keeps the text size within its limits and ignores unknown time zones", () => {
    setDisplayPreferences({ fontScale: 3, timeZone: "Mars/Olympus" });
    expect(getDisplayPreferences()).toMatchObject({ fontScale: 1.25, timeZone: undefined });
  });

  it("scales the font sizes given in pixels or rem, and nothing else", () => {
    expect(scaledFontSize(14)).toBe("calc(14px * var(--sw-font-scale, 1))");
    expect(scaledFontSize("0.875rem")).toBe("calc(0.875rem * var(--sw-font-scale, 1))");
    expect(scaledFontSize("inherit")).toBe("inherit");
    expect(scaledFontSize("1.2em")).toBe("1.2em");
  });

  it("writes dates in the chosen time zone, also through Date's own methods", () => {
    const instant = new Date(Date.UTC(2026, 10, 23, 23, 30));
    setDisplayPreferences({ timeZone: "Asia/Tokyo" });
    expect(zonedParts(instant)).toMatchObject({ year: 2026, month: 11, day: 24, hour: 8, minute: 30 });
    expect(instant.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })).toBe("08:30");
    expect(formatInTimeZone(instant, { day: "numeric" }, "en-GB")).toBe("24");

    setDisplayPreferences({ timeZone: "America/New_York" });
    expect(instant.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })).toBe("18:30");
    // A zone given by the caller wins
    expect(instant.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }))
      .toBe("23:30");
  });

  it("gives MUI a smaller spacing when compact and a bigger font when larger", () => {
    expect(createAppTheme("light").spacing(2)).toBe("16px");
    setDisplayPreferences({ density: "compact", fontScale: 1.25 });
    const theme = createAppTheme("light");
    expect(theme.spacing(2)).toBe("12px");
    expect(theme.typography.fontSize).toBeCloseTo(17.5);
  });
});
