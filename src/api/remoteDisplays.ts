import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";

/** A desktop program running on the server, whose window the browser shows (its own page). */
export type RemoteDisplay = {
  id: string;
  title: string;
  projectId?: number | null;
  createdAt?: number | null;
  /** Relative to the API, with its key: open `${BASE_URL}/${path}`. */
  path: string;
};

let availability: Promise<boolean> | null = null;

/** Whether this server can show desktop programs in the browser; asked once per session. */
export function remoteDisplaysAvailable(): Promise<boolean> {
  availability ??= fetchWithAuth(`${BASE_URL}/remote-displays/available`)
    .then(async (response) => (response.ok ? Boolean((await response.json())?.available) : false))
    .catch(() => false);
  return availability;
}

export function remoteDisplayUrl(display: Pick<RemoteDisplay, "path">): string {
  return `${BASE_URL}/${display.path}`;
}

/** Closes the program on the server (the window of the web is closed by its caller). */
export async function closeRemoteDisplay(id: string): Promise<void> {
  try {
    await fetchWithAuth(`${BASE_URL}/remote-displays/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // Gone already, or the server will close it when nobody looks at it
  }
}

// The programs shown in windows of the web, over every page (RemoteDisplayHost draws them)
let openDisplays: RemoteDisplay[] = [];
const listeners = new Set<() => void>();

function changed(next: RemoteDisplay[]) {
  openDisplays = next;
  listeners.forEach((listener) => listener());
}

export function showRemoteDisplay(display: RemoteDisplay) {
  changed([...openDisplays.filter((item) => item.id !== display.id), display]);
}

export function forgetRemoteDisplay(id: string) {
  changed(openDisplays.filter((item) => item.id !== id));
}

export function subscribeRemoteDisplays(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRemoteDisplays(): RemoteDisplay[] {
  return openDisplays;
}

let restored = false;

/** Shows again the programs the user left open on the server (after a reload, or signing in again). Once per page. */
export async function restoreRemoteDisplays(): Promise<void> {
  if (restored) return;
  restored = true;
  try {
    if (!(await remoteDisplaysAvailable())) return;
    const response = await fetchWithAuth(`${BASE_URL}/remote-displays`);
    if (!response.ok) return;
    const sessions = await response.json();
    if (!Array.isArray(sessions)) return;
    for (const session of sessions) {
      if (session && typeof session.id === "string" && typeof session.path === "string"
          && !openDisplays.some((item) => item.id === session.id)) {
        showRemoteDisplay(session as RemoteDisplay);
      }
    }
  } catch {
    // Nothing to show again: they close by themselves when nobody looks at them
  }
}

/** For tests: forget what the server said. */
export function resetRemoteDisplaysAvailability() {
  availability = null;
  restored = false;
}
