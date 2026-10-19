// Paths, sizes and dates of the remote file browser. Pure functions, so they can be tested alone.

export type RemoteEntry = {
  name: string;
  path: string; // relative path to root (preferred); old backend may still send only basename
  absPath?: string; // absolute filesystem path, used when selecting an entry
  isDir: boolean;
  size?: number | null;
  mime?: string;
  /** Last modification, seconds since the epoch. */
  mtime?: number | null;
  /** A symbolic link (Scipion links the inputs of its protocols). */
  isLink?: boolean;
};

export function normalizePosixPath(p: string): string {
  return (p || "").replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

export function isAbsolutePath(p: string): boolean {
  const raw = normalizePosixPath(p || "");
  if (!raw) return false;
  return raw.startsWith("/") || /^[A-Za-z]:\//.test(raw);
}

/** A path relative to the browser root; ".." never goes above the root. */
export function normalizeRelPath(p: string): string {
  const raw = normalizePosixPath(p || "").replace(/^\/+/g, "");
  if (!raw) return "";
  const out: string[] = [];
  for (const part of raw.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

export function joinRelPaths(baseRel: string, leaf: string): string {
  const b = normalizeRelPath(baseRel || "");
  const l = normalizeRelPath(leaf || "");
  if (!b) return l;
  if (!l) return b;
  return normalizeRelPath(`${b}/${l}`);
}

/** The parent folder, "" for the root's children, null at the root itself. */
export function getParentRelPath(relPath: string): string | null {
  const r = normalizeRelPath(relPath || "");
  if (!r) return null;
  const parts = r.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export function absoluteToRelPath(absPath: string, rootAbs: string): string {
  const abs = normalizePosixPath(absPath || "").replace(/\/+$/g, "");
  const root = normalizePosixPath(rootAbs || "").replace(/\/+$/g, "");
  if (!abs || (!root && rootAbs !== "/")) return "";
  if (abs === root) return "";
  if (root === "" && abs.startsWith("/")) return normalizeRelPath(abs);
  if (abs.startsWith(`${root}/`)) return normalizeRelPath(abs.slice(root.length + 1));
  return "";
}

/** The parent entry shown at the top of every folder but the root. */
export const PARENT_ENTRY: RemoteEntry = { name: "..", path: "..", isDir: true };

export function isParentEntry(entry: RemoteEntry | null | undefined): boolean {
  return entry === PARENT_ENTRY || (!!entry && entry.name === ".." && entry.path === "..");
}

/** The entry's path relative to the browser root. */
export function buildRelPathForEntry(entry: RemoteEntry, cwdRel: string, rootAbs: string): string {
  if (isParentEntry(entry)) return getParentRelPath(cwdRel) ?? "";
  const rawPath = normalizePosixPath(entry?.path || "");
  const entryName = normalizeRelPath(entry?.name || "");

  if (rawPath) {
    if (isAbsolutePath(rawPath)) {
      const relFromAbs = absoluteToRelPath(rawPath, rootAbs);
      if (relFromAbs) return relFromAbs;
      const leaf = rawPath.split("/").filter(Boolean).pop() || entryName;
      return joinRelPaths(cwdRel, leaf);
    }
    const safeRel = normalizeRelPath(rawPath);
    if (!safeRel) return "";
    // Old backend contract: only the basename in entry.path.
    if (safeRel === entryName) return joinRelPaths(cwdRel, safeRel);
    return safeRel;
  }
  return joinRelPaths(cwdRel, entryName);
}

/** The entry's absolute path (when the root is known). */
export function buildAbsPathForEntry(entry: RemoteEntry, cwdRel: string, rootAbs: string): string {
  if (!isParentEntry(entry)) {
    const absPath = normalizePosixPath(entry?.absPath || "");
    if (absPath && isAbsolutePath(absPath)) return absPath;
    const rawPath = normalizePosixPath(entry?.path || "");
    if (rawPath && isAbsolutePath(rawPath)) return rawPath;
  }
  return joinAbs(rootAbs, buildRelPathForEntry(entry, cwdRel, rootAbs));
}

export function joinAbs(rootAbs: string, relPath: string): string {
  const root = normalizePosixPath(rootAbs || "").replace(/\/+$/g, "");
  if (!rootAbs) return relPath;
  if (!relPath) return root || "/";
  return `${root}/${relPath}`;
}

/**
 * The value a protocol form keeps for a picked path: relative to the project
 * when it is inside it (as Scipion resolves them), absolute otherwise (data on
 * other disks, for imports).
 */
export function pathForProtocolParam(absPath: string, projectRootAbs: string | null | undefined): string {
  const abs = normalizePosixPath(absPath || "");
  if (!projectRootAbs) return abs;
  return absoluteToRelPath(abs, projectRootAbs) || abs;
}

export function sameEntry(a: RemoteEntry | null | undefined, b: RemoteEntry | null | undefined): boolean {
  if (!a || !b) return false;
  const aAbs = normalizePosixPath(a.absPath || "");
  const bAbs = normalizePosixPath(b.absPath || "");
  if (aAbs || bAbs) return aAbs === bAbs;
  return normalizePosixPath(a.path || "") === normalizePosixPath(b.path || "")
    && a.name === b.name && a.isDir === b.isDir;
}

export function entryKey(entry: RemoteEntry): string {
  return `${entry.absPath ?? entry.path}-${entry.name}-${entry.isDir ? "d" : "f"}`;
}

export function getEntryExtension(entry: RemoteEntry | null): string {
  const name = (entry?.name || "").trim();
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1).toLowerCase();
}

export function isHiddenEntry(entry: RemoteEntry): boolean {
  return entry.name.startsWith(".") && entry.name !== "..";
}

export function humanBytes(n?: number | null): string | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  const abs = Math.abs(n);
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  const tb = gb * 1024;
  const fmt = (value: number, unit: string) => `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
  if (abs < kb) return `${Math.round(n)} B`;
  if (abs < mb) return fmt(n / kb, "KB");
  if (abs < gb) return fmt(n / mb, "MB");
  if (abs < tb) return fmt(n / gb, "GB");
  return fmt(n / tb, "TB");
}

/** A modification date: the time today, the day this year, the full date otherwise. */
export function formatModified(mtime: number | null | undefined, now: Date = new Date()): string {
  if (mtime == null || !Number.isFinite(mtime)) return "";
  const date = new Date(mtime * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (date.toDateString() === now.toDateString()) return time;
  if (date.getFullYear() === now.getFullYear()) return `${day.slice(5)} ${time}`;
  return day;
}

export type SortKey = "name" | "size" | "mtime";
export type SortDir = "asc" | "desc";

/** Folders first, then by the chosen column (name as tie-break). */
export function sortEntries(entries: RemoteEntry[], key: SortKey, dir: SortDir): RemoteEntry[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: RemoteEntry, b: RemoteEntry) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (key !== "name") {
      const va = Number((key === "size" ? a.size : a.mtime) ?? -Infinity);
      const vb = Number((key === "size" ? b.size : b.mtime) ?? -Infinity);
      if (va !== vb) return va < vb ? -sign : sign;
      return byName(a, b);
    }
    return sign * byName(a, b);
  });
}

export function normalizeMimeValue(v: string): string {
  const raw = (v || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.split(";")[0].trim();
}

export function base64ToBlob(dataBase64OrDataUrl: string, mime: string): Blob {
  let base64 = (dataBase64OrDataUrl || "").trim();
  if (base64.startsWith("data:")) {
    const commaIndex = base64.indexOf(",");
    if (commaIndex >= 0) base64 = base64.slice(commaIndex + 1);
  }
  base64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  const mod = base64.length % 4;
  if (mod === 2) base64 += "==";
  else if (mod === 3) base64 += "=";
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}
