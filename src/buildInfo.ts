declare const __WIDGET_BUILD_TIMESTAMP__: string | undefined;
declare const __APP_VERSION__: string | undefined;

const rawTimestamp =
  typeof __WIDGET_BUILD_TIMESTAMP__ !== "undefined" ? __WIDGET_BUILD_TIMESTAMP__ : "";

const rawVersion =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";

/** ISO timestamp injected at widget build time; empty in the full web app. */
export const WIDGET_BUILD_TIMESTAMP = rawTimestamp.trim() || null;

/** Package version injected at widget build time; empty in the full web app. */
export const APP_VERSION = rawVersion.trim() || null;

export function formatWidgetBuildTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function hasWidgetBuildInfo(): boolean {
  return Boolean(WIDGET_BUILD_TIMESTAMP || APP_VERSION);
}
