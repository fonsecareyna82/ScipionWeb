// The projects a user pinned (on the dashboard or the projects page), kept in this browser.
export const PIN_STORAGE_KEY = "scipion.home.pins.v1";
export const MAX_PINNED_PROJECTS = 12;

export function readPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x)).filter((x) => x.trim().length > 0);
  } catch {
    return [];
  }
}

export function writePinnedIds(ids: string[]): void {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // only a convenience: the pins are lost, nothing else
  }
}

/** Pins the project, or unpins it when it was pinned; the newest pin goes first. */
export function togglePinnedId(ids: string[], projectId: string | number): string[] {
  const id = String(projectId);
  if (ids.some((x) => String(x) === id)) return ids.filter((x) => String(x) !== id);
  return [id, ...ids].slice(0, MAX_PINNED_PROJECTS);
}
