// Applies the signed-in user's saved text size, density and time zone once the app opens. Until they arrive the
// ones of the last visit on this browser are used (displayPreferences keeps them), so the page does not jump.
import { useEffect } from "react";

import { fetchUserSettings } from "@/api/settings";
import { setDisplayPreferences } from "./displayPreferences";

export default function DisplayPreferencesSync() {
  useEffect(() => {
    let cancelled = false;
    fetchUserSettings()
      .then((settings: any) => {
        if (cancelled || !settings) return;
        setDisplayPreferences({
          fontScale: settings.fontScale,
          density: settings.uiDensity,
          timeZone: settings.timeZone || undefined,
        });
      })
      .catch(() => {
        // Without them the app keeps the last ones (or the defaults)
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
